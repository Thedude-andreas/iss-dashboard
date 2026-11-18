<?php
declare(strict_types=1);

// Exercise the real HTTP handler in an isolated directory with controlled feed results.
$dir = sys_get_temp_dir() . '/iss-collector-test-' . bin2hex(random_bytes(6));
mkdir($dir . '/storage', 0775, true);
copy(__DIR__ . '/../public/api/collect-urine.php', $dir . '/collect-urine.php');
file_put_contents($dir . '/lightstreamer.php', '<?php final class UrineTelemetry {
    public static function collect(): array {
        return json_decode(file_get_contents(__DIR__ . "/result.json"), true);
    }
}');
file_put_contents($dir . '/run.php', '<?php
ini_set("display_errors", "0");
ob_start();
register_shutdown_function(static function () {
    $body = ob_get_clean();
    echo json_encode(["status" => http_response_code() ?: 200, "body" => json_decode($body, true)]);
});
require __DIR__ . "/collect-urine.php";
');

$assertions = 0;
function verify(bool $condition, string $message): void
{
    global $assertions;
    $assertions++;
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function runEndpoint(string $dir, array $result): array
{
    file_put_contents($dir . '/result.json', json_encode($result));
    $pipes = [];
    $process = proc_open([PHP_BINARY, '-n', $dir . '/run.php'], [
        0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w'],
    ], $pipes);
    fclose($pipes[0]);
    $output = stream_get_contents($pipes[1]);
    $errors = stream_get_contents($pipes[2]);
    fclose($pipes[1]);
    fclose($pipes[2]);
    verify(proc_close($process) === 0, 'Endpoint crashed: ' . $errors);
    $response = json_decode($output, true);
    verify(is_array($response), 'Invalid JSON: ' . $output);
    return $response;
}

try {
    $file = $dir . '/storage/last-urine.json';
    $now = (int) floor(microtime(true) * 1000);
    $original = json_encode(['timestamp' => $now, 'history' => [['timestamp' => $now, 'delta' => 5]], 'lastValue' => 57]);
    file_put_contents($file, $original);

    foreach (['no_telemetry', 'upstream_unavailable'] as $reason) {
        $response = runEndpoint($dir, ['status' => 'skipped', 'reason' => $reason, 'stage' => 'poll']);
        verify($response['status'] === 200 && $response['body']['collected'] === false, 'Keep scheduler running without claiming fresh telemetry');
        verify($response['body']['reason'] === $reason, 'Expose the skipped reason');
        verify(file_get_contents($file) === $original, 'Skipped calls must leave stored history byte-for-byte unchanged');
    }

    $response = runEndpoint($dir, ['status' => 'collected', 'value' => 60.0]);
    verify($response['status'] === 200 && $response['body']['collected'] === true, 'Report real collection');
    $snapshot = json_decode(file_get_contents($file), true);
    verify($snapshot['lastValue'] === 60 && count($snapshot['history']) === 2, 'Persist an increase and retain existing history');
    verify($snapshot['history'][1]['delta'] === 3, 'Persist the actual increase');

    $response = runEndpoint($dir, ['status' => 'collected', 'value' => 60.0]);
    verify(count($response['body']['history']) === 2, 'Repeated observations must not duplicate events');
    $response = runEndpoint($dir, ['status' => 'collected', 'value' => 0.0]);
    verify($response['body']['lastValue'] === 0 && count($response['body']['history']) === 2, 'A genuine zero updates the baseline without adding an increase');

    unlink($file);
    mkdir($file);
    $response = runEndpoint($dir, ['status' => 'collected', 'value' => 60.0]);
    verify($response['status'] === 500, 'Storage errors must not be reported as successful skipped runs');
    rmdir($file);
    echo "Passed $assertions endpoint assertions.\n";
} finally {
    foreach (glob($dir . '/storage/*') as $path) {
        is_dir($path) ? rmdir($path) : unlink($path);
    }
    rmdir($dir . '/storage');
    foreach (glob($dir . '/*') as $path) {
        unlink($path);
    }
    rmdir($dir);
}
