<?php
// Server-side collector that polls Lightstreamer and persists urine tank increases.
// Intended to be run periodically via cron/CLI or via an HTTP call on the server.

declare(strict_types=1);

const HISTORY_WINDOW_MS = 86400 * 1000; // 24 hours

require_once __DIR__ . '/lightstreamer.php';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');

$storageDir = __DIR__ . '/storage';
$storageFile = $storageDir . '/last-urine.json';

ensureStorageDirectory($storageDir);

$result = UrineTelemetry::collect();
if ($result['status'] !== 'collected') {
    // The collector ran, but the public feed supplied no usable observation.
    // A 2xx keeps cron-job.org retrying after feed outages instead of disabling it.
    // Never persist an old/zero value or advance history when nothing was collected.
    error_log('ISS urine collector: ' . json_encode($result));
    respondJson($result + ['collected' => false, 'checkedAt' => currentTimeMillis()]);
    exit;
}

$snapshot = persistCollectorSnapshot($storageFile, $result['value']);
respondJson($snapshot + ['status' => 'collected', 'collected' => true]);

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
