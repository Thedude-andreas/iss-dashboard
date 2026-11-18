<?php
declare(strict_types=1);

/** Bounded HTTP polling of the public ISSLive feed. No stored values are fabricated. */
final class UrineTelemetry
{
    private const SERVER = 'https://push.lightstreamer.com/lightstreamer/';
    private const PROTOCOL = 'TLCP-2.5.0';
    private const SCHEMA = 'TimeStamp Value Status.Class Status.Indicator Status.Color CalibratedData';

    /** The injected transport and clock allow protocol regressions to be tested offline. */
    public static function collect(?callable $post = null, ?callable $clock = null): array
    {
        $post ??= self::post(...);
        $clock ??= static fn(): float => microtime(true);
        $deadline = $clock() + 22;
        $session = null;
        $stage = 'create_session';
        $request = static function (string $path, array $params, float $limit = 8) use ($post, $clock, $deadline): string {
            $timeout = min($limit, $deadline - $clock());
            if ($timeout <= 0) {
                throw new RuntimeException('deadline_exceeded');
            }
            $body = $post(self::SERVER . $path . '.txt?LS_protocol=' . self::PROTOCOL, $params, $timeout);
            foreach (preg_split('/\r?\n/', $body) as $line) {
                if (preg_match('/^(CONERR|REQERR|ERROR|END|SUBERR),/', $line)) {
                    // Preserve protocol error codes, not arbitrary upstream response text.
                    $parts = explode(',', $line);
                    throw new RuntimeException($parts[0] . ':' . implode(':', array_filter(
                        array_slice($parts, 1, 2), static fn($part) => preg_match('/^-?\d+$/', $part)
                    )));
                }
            }
            return $body;
        };

        try {
            $body = $request('create_session', [
                'LS_polling' => 'true', 'LS_polling_millis' => '0', 'LS_idle_millis' => '0',
                'LS_adapter_set' => 'ISSLIVE', 'LS_cid' => 'mgQkwtwdysogQz2BJ4Ji kOj2Bg',
                'LS_supported_diffs' => '',
            ]);
            if (!preg_match('/^CONOK,([^,\r\n]+),/m', $body, $match)) {
                throw new RuntimeException('missing_session');
            }
            $session = $match[1];
            $stage = 'subscribe';
            $body = $request('control', [
                'LS_session' => $session, 'LS_reqId' => '1', 'LS_op' => 'add',
                'LS_subId' => '1', 'LS_mode' => 'MERGE', 'LS_group' => 'NODE3000005',
                'LS_schema' => self::SCHEMA, 'LS_snapshot' => 'true',
            ]);
            if (!preg_match('/^REQOK,1\r?$/m', $body)) {
                throw new RuntimeException('subscription_not_acknowledged');
            }

            $stage = 'poll';
            $fields = array_fill(0, 6, null);
            // SUBOK and CONF can arrive before the asynchronous snapshot. Keep binding.
            for ($attempt = 0; $attempt < 6 && $clock() < $deadline; $attempt++) {
                $body = $request('bind_session', [
                    'LS_session' => $session, 'LS_polling' => 'true',
                    'LS_polling_millis' => '0', 'LS_idle_millis' => '3000',
                ]);
                if (!str_contains($body, 'CONOK,')) {
                    throw new RuntimeException('invalid_poll_response');
                }
                $value = self::parseValue($body, $fields);
                if ($value !== null) {
                    return ['status' => 'collected', 'value' => $value];
                }
            }
            return ['status' => 'skipped', 'reason' => 'no_telemetry', 'stage' => $stage];
        } catch (RuntimeException $exception) {
            return ['status' => 'skipped', 'reason' => 'upstream_unavailable',
                'stage' => $stage, 'detail' => $exception->getMessage()];
        } finally {
            if ($session !== null) {
                try {
                    $post(self::SERVER . 'control.txt?LS_protocol=' . self::PROTOCOL,
                        ['LS_session' => $session, 'LS_reqId' => '2', 'LS_op' => 'destroy'], 1);
                } catch (RuntimeException) {
                    // Cleanup must never discard a successfully collected value.
                }
            }
        }
    }

    public static function parseValue(string $body, array &$fields): ?float
    {
        $value = null;
        foreach (preg_split('/\r?\n/', $body) as $line) {
            if (!str_starts_with($line, 'U,1,1,')) {
                continue;
            }
            $index = 0;
            foreach (explode('|', substr($line, 6)) as $field) {
                if (preg_match('/^\^(\d+)$/', $field, $count)) {
                    $index += (int) $count[1];
                    continue;
                }
                if ($index >= 6) {
                    break;
                }
                if ($field !== '') {
                    $fields[$index] = match ($field) {
                        '#' => null, '$' => '', default => rawurldecode($field),
                    };
                }
                $index++;
            }
            $value = self::numeric($fields[5] ?? null) ?? self::numeric($fields[1] ?? null);
        }
        return $value;
    }

    private static function numeric(?string $value): ?float
    {
        if ($value === null || !is_numeric($value)) {
            return null;
        }
        $number = (float) $value;
        return is_finite($number) && $number >= 0 && $number <= 100 ? $number : null;
    }

    private static function post(string $url, array $params, float $timeout): string
    {
        $payload = http_build_query($params);
        if (function_exists('curl_init')) {
            $curl = curl_init($url);
            curl_setopt_array($curl, [
                CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload,
                CURLOPT_HTTPHEADER => ['Content-Type: application/x-www-form-urlencoded'],
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CONNECTTIMEOUT_MS => min(5000, max(1, (int) ($timeout * 1000))),
                CURLOPT_TIMEOUT_MS => max(1, (int) ($timeout * 1000)),
            ]);
            $body = curl_exec($curl);
            $status = (int) curl_getinfo($curl, CURLINFO_RESPONSE_CODE);
            $error = curl_errno($curl);
            curl_close($curl);
            if ($body === false) {
                throw new RuntimeException('transport_error:' . $error);
            }
        } else {
            $context = stream_context_create(['http' => [
                'method' => 'POST', 'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
                'content' => $payload, 'timeout' => $timeout, 'ignore_errors' => true,
            ]]);
            $body = @file_get_contents($url, false, $context);
            $status = 0;
            foreach ($http_response_header ?? [] as $header) {
                if (preg_match('/^HTTP\/\S+ (\d{3})/', $header, $match)) {
                    $status = (int) $match[1];
                }
            }
            if ($body === false) {
                throw new RuntimeException('transport_error');
            }
        }
        if ($status !== 200) {
            throw new RuntimeException('http_status:' . $status);
        }
        return $body;
    }
}
