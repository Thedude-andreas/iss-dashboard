<?php
// Shared timestamp + history persistence endpoint for urine tank increases.
// Supports GET (retrieve snapshot) and POST (append new increase) with file locking.

declare(strict_types=1);

const HISTORY_WINDOW_MS = 86400 * 1000; // 24 hours

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: ' . ($_SERVER['HTTP_ORIGIN'] ?? '*'));
header('Vary: Origin');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

$storageDir = __DIR__ . '/storage';
$storageFile = $storageDir . '/last-urine.json';

ensureStorageDirectory($storageDir);

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

switch ($method) {
    case 'GET':
        respondJson(readSnapshot($storageFile));
        break;

    case 'POST':
        $payload = json_decode(file_get_contents('php://input') ?: 'null', true);
        if (!is_array($payload) || !array_key_exists('timestamp', $payload)) {
            respondError(400, 'Missing "timestamp" in request body.');
        }
        $incoming = filterTimestamp($payload['timestamp']);
        if ($incoming === null) {
            respondError(400, 'Invalid timestamp value.');
        }
        $delta = array_key_exists('delta', $payload) ? filterDelta($payload['delta']) : null;
        $snapshot = persistSnapshot($storageFile, $incoming, $delta);
        respondJson($snapshot);
        break;

    case 'OPTIONS':
        header('Allow: GET, POST, OPTIONS');
        http_response_code(204);
        exit;

    default:
        header('Allow: GET, POST, OPTIONS', true, 405);
        respondError(405, 'Method not allowed.');
        break;
}

function ensureStorageDirectory(string $dir): void
{
    if (is_dir($dir)) {
        return;
    }
    if (!mkdir($dir, 0775, true) && !is_dir($dir)) {
        respondError(500, 'Unable to prepare storage directory.');
    }
}

function readSnapshot(string $file): array
{
    if (!file_exists($file)) {
        initializeStorageFile($file);
    }
    $contents = file_get_contents($file);
    if ($contents === false) {
        respondError(500, 'Unable to read snapshot.');
    }
    $decoded = json_decode($contents, true);
    $timestamp = 0;
    $history = [];
    $lastValue = null;
    if (is_array($decoded)) {
        if (isset($decoded['timestamp']) && is_numeric($decoded['timestamp'])) {
            $timestamp = max(0, (int) $decoded['timestamp']);
        }
        if (isset($decoded['history']) && is_array($decoded['history'])) {
            $history = sanitizeHistory($decoded['history'], currentTimeMillis());
        }
        if (isset($decoded['lastValue']) && is_numeric($decoded['lastValue'])) {
            $lastValue = (float) $decoded['lastValue'];
        }
    }
    return [
        'timestamp' => $timestamp,
        'history' => $history,
        'lastValue' => $lastValue,
    ];
}

function persistSnapshot(string $file, int $incoming, ?float $delta): array
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
        $existingTimestamp = 0;
        $history = [];
        $lastValue = null;
        $now = currentTimeMillis();

        if (is_array($decoded)) {
            if (isset($decoded['timestamp']) && is_numeric($decoded['timestamp'])) {
                $existingTimestamp = max(0, (int) $decoded['timestamp']);
            }
            if (isset($decoded['history']) && is_array($decoded['history'])) {
                $history = sanitizeHistory($decoded['history'], $now);
            }
            if (isset($decoded['lastValue']) && is_numeric($decoded['lastValue'])) {
                $lastValue = (float) $decoded['lastValue'];
            }
        }

        if ($delta !== null) {
            $history[] = [
                'timestamp' => $incoming,
                'delta' => $delta,
            ];
        }

        $history = pruneHistory($history, $now);
        $nextTimestamp = max($existingTimestamp, $incoming);
        $payloadArray = [
            'timestamp' => $nextTimestamp,
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

function initializeStorageFile(string $file): void
{
    $default = json_encode(['timestamp' => 0, 'history' => [], 'lastValue' => null]);
    if ($default === false || file_put_contents($file, $default, LOCK_EX) === false) {
        respondError(500, 'Unable to initialize storage file.');
    }
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
