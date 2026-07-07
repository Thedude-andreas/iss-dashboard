<?php
// Server-side collector that polls Lightstreamer and persists urine tank increases.
// Intended to be run periodically via cron/CLI or via an HTTP call on the server.

declare(strict_types=1);

const HISTORY_WINDOW_MS = 86400 * 1000; // 24 hours

const LS_PROTOCOL = 'TLCP-2.5.0';
const LS_SERVER = 'https://push.lightstreamer.com';
const LS_ADAPTER_SET = 'ISSLIVE';
const LS_CID = 'mgQkwtwdysogQz2BJ4Ji kOj2Bg';
const LS_ITEM = 'NODE3000005';
const LS_SCHEMA = 'TimeStamp Value Status.Class Status.Indicator Status.Color CalibratedData';

header('Content-Type: application/json; charset=utf-8');

$storageDir = __DIR__ . '/storage';
$storageFile = $storageDir . '/last-urine.json';

ensureStorageDirectory($storageDir);

$currentValue = fetchLightstreamerValue();
if ($currentValue === null) {
    respondError(502, 'Unable to fetch current urine tank value.');
}

$snapshot = persistCollectorSnapshot($storageFile, $currentValue);
respondJson($snapshot);

function ensureStorageDirectory(string $dir): void
{
    if (is_dir($dir)) {
        return;
    }
    if (!mkdir($dir, 0775, true) && !is_dir($dir)) {
        respondError(500, 'Unable to prepare storage directory.');
    }
}

function persistCollectorSnapshot(string $file, float $currentValue): array
{
    $handle = fopen($file, 'c+');
    if ($handle === false) {
        respondError(500, 'Unable to open storage file.');
    }

    if (!flock($handle, LOCK_EX)) {
        fclose($handle);
        respondError(500, 'Unable to secure storage file lock.');
    }

    try {
        rewind($handle);
        $contents = stream_get_contents($handle) ?: '';
        $decoded = json_decode($contents, true);
        $timestamp = 0;
        $history = [];
        $lastValue = null;
        $now = currentTimeMillis();

        if (is_array($decoded)) {
            if (isset($decoded['timestamp']) && is_numeric($decoded['timestamp'])) {
                $timestamp = max(0, (int) $decoded['timestamp']);
            }
            if (isset($decoded['history']) && is_array($decoded['history'])) {
                $history = sanitizeHistory($decoded['history'], $now);
            }
            if (isset($decoded['lastValue']) && is_numeric($decoded['lastValue'])) {
                $lastValue = (float) $decoded['lastValue'];
            }
        }

        if ($lastValue !== null && $currentValue > $lastValue) {
            $delta = $currentValue - $lastValue;
            if ($delta > 0) {
                $history[] = [
                    'timestamp' => $now,
                    'delta' => $delta,
                ];
                $timestamp = $now;
            }
        }

        $lastValue = $currentValue;
        $history = pruneHistory($history, $now);

        $payloadArray = [
            'timestamp' => $timestamp,
            'history' => array_values($history),
            'lastValue' => $lastValue,
        ];
        $payload = json_encode($payloadArray);
        if ($payload === false) {
            throw new RuntimeException('Unable to encode snapshot payload.');
        }
        if (ftruncate($handle, 0) === false || rewind($handle) === false) {
            throw new RuntimeException('Unable to reset storage file.');
        }
        if (fwrite($handle, $payload) === false) {
            throw new RuntimeException('Unable to persist snapshot.');
        }
        fflush($handle);
        flock($handle, LOCK_UN);
        fclose($handle);

        return $payloadArray;
    } catch (Throwable $exception) {
        flock($handle, LOCK_UN);
        fclose($handle);
        respondError(500, $exception->getMessage());
    }
}

function fetchLightstreamerValue(): ?float
{
    $createResponse = httpPost(
        LS_SERVER . '/lightstreamer/create_session.txt?LS_protocol=' . rawurlencode(LS_PROTOCOL),
        http_build_query([
            'LS_polling' => 'true',
            'LS_polling_millis' => '0',
            'LS_idle_millis' => '0',
            'LS_adapter_set' => LS_ADAPTER_SET,
            'LS_cid' => LS_CID,
        ])
    );

    $sessionId = parseSessionId($createResponse);
    if ($sessionId === null) {
        return null;
    }

    $controlResponse = httpPost(
        LS_SERVER . '/lightstreamer/control.txt?LS_protocol=' . rawurlencode(LS_PROTOCOL) . '&LS_session=' . rawurlencode($sessionId),
        http_build_query([
            'LS_reqId' => '1',
            'LS_op' => 'add',
            'LS_subId' => '1',
            'LS_mode' => 'MERGE',
            'LS_group' => LS_ITEM,
            'LS_schema' => LS_SCHEMA,
            'LS_snapshot' => 'true',
        ])
    );

    if (!str_starts_with(trim($controlResponse), 'REQOK')) {
        return null;
    }

    $bindResponse = httpPost(
        LS_SERVER . '/lightstreamer/bind_session.txt?LS_protocol=' . rawurlencode(LS_PROTOCOL),
        http_build_query([
            'LS_session' => $sessionId,
            'LS_polling' => 'true',
            'LS_polling_millis' => '0',
            'LS_idle_millis' => '0',
        ])
    );

    return parseFirstUpdateValue($bindResponse);
}

function parseSessionId(string $response): ?string
{
    foreach (preg_split("/\\r?\\n/", $response) as $line) {
        if (str_starts_with($line, 'CONOK,')) {
            $parts = explode(',', $line);
            return $parts[1] ?? null;
        }
    }

    return null;
}

function parseFirstUpdateValue(string $response): ?float
{
    foreach (preg_split("/\\r?\\n/", $response) as $line) {
        if (!str_starts_with($line, 'U,')) {
            continue;
        }
        $parts = explode(',', $line, 4);
        if (count($parts) < 4) {
            continue;
        }
        $fields = explode('|', $parts[3]);
        $calibrated = $fields[5] ?? null;
        $value = $fields[1] ?? null;
        $numeric = parseNumericField($calibrated);
        if ($numeric === null) {
            $numeric = parseNumericField($value);
        }
        if ($numeric !== null) {
            return $numeric;
        }
    }

    return null;
}

function parseNumericField(?string $field): ?float
{
    if ($field === null) {
        return null;
    }
    $decoded = rawurldecode($field);
    if ($decoded === '' || $decoded === '#') {
        return null;
    }
    if (!is_numeric($decoded)) {
        return null;
    }
    return (float) $decoded;
}

function sanitizeHistory(array $history, int $now): array
{
    $sanitized = [];
    foreach ($history as $entry) {
        if (!is_array($entry)) {
            continue;
        }
        $timestamp = isset($entry['timestamp']) ? filterTimestamp($entry['timestamp']) : null;
        $delta = isset($entry['delta']) ? filterDelta($entry['delta']) : null;
        if ($timestamp === null || $delta === null) {
            continue;
        }
        $sanitized[] = [
            'timestamp' => $timestamp,
            'delta' => $delta,
        ];
    }

    return pruneHistory($sanitized, $now);
}

function pruneHistory(array $history, int $now): array
{
    $cutoff = max(0, $now - HISTORY_WINDOW_MS);
    return array_values(array_filter($history, static function ($entry) use ($cutoff) {
        return isset($entry['timestamp']) && $entry['timestamp'] >= $cutoff;
    }));
}

function filterTimestamp(mixed $value): ?int
{
    if (!is_numeric($value)) {
        return null;
    }
    $number = (int) $value;
    return $number >= 0 ? $number : null;
}

function filterDelta(mixed $value): ?float
{
    if (!is_numeric($value)) {
        return null;
    }
    $number = (float) $value;
    return $number > 0 ? $number : null;
}

function currentTimeMillis(): int
{
    return (int) floor(microtime(true) * 1000);
}

function httpPost(string $url, string $payload): string
{
    $context = stream_context_create([
        'http' => [
            'method' => 'POST',
            'header' => "Content-Type: application/x-www-form-urlencoded\r\n",
            'content' => $payload,
            'timeout' => 10,
        ],
    ]);
    $response = file_get_contents($url, false, $context);
    return $response === false ? '' : $response;
}

function respondJson(array $payload): void
{
    echo json_encode($payload);
}

function respondError(int $status, string $message): void
{
    http_response_code($status);
    respondJson(['error' => $message]);
    exit;
}
