<?php
declare(strict_types=1);
require_once __DIR__ . '/../public/api/lightstreamer.php';

$assertions = 0;
function check(bool $condition, string $message): void
{
    global $assertions;
    $assertions++;
    if (!$condition) {
        throw new RuntimeException($message);
    }
}

function scenario(array $replies, ?callable $clock = null): array
{
    $calls = [];
    $post = static function (string $url, array $params, float $timeout) use (&$calls, &$replies): string {
        $calls[] = [$url, $params, $timeout];
        if (($params['LS_op'] ?? '') === 'destroy') {
            return "REQOK,2\r\n";
        }
        check(count($replies) > 0, 'Unexpected additional upstream request');
        $reply = array_shift($replies);
        if ($reply instanceof RuntimeException) {
            throw $reply;
        }
        return $reply;
    };
    return [UrineTelemetry::collect($post, $clock), $calls];
}

$connection = "CONOK,test-session,50000,0,*\r\n";
$ack = "REQOK,1\r\n";
$empty = $connection . "SUBOK,1,1,6\r\nCONF,1,unlimited,filtered\r\nLOOP,0\r\n";
$update = $connection . "U,1,1,123|57|normal|good|green|57.5\r\nLOOP,0\r\n";

// Regression: the old collector gave up after this initial SUBOK-only response.
[$result, $calls] = scenario([$connection, $ack, $empty, $update]);
check($result === ['status' => 'collected', 'value' => 57.5], 'Wait for the asynchronous snapshot');
check($calls[2][1]['LS_idle_millis'] === '3000', 'Poll must wait for telemetry');
check($calls[3][1]['LS_session'] === 'test-session', 'Rebind the same session');
check(end($calls)[1]['LS_op'] === 'destroy', 'Release successful sessions');

[$result, $calls] = scenario(array_merge([$connection, $ack], array_fill(0, 6, $empty)));
check($result['status'] === 'skipped' && $result['reason'] === 'no_telemetry', 'No telemetry is an explicit skipped collection');
check(!array_key_exists('value', $result), 'Never invent a fallback observation');
check(count($calls) === 9, 'No-data retries are bounded and include cleanup');

[$result, $calls] = scenario([$connection, "REQERR,1,17,Bad schema\r\n"]);
check($result['reason'] === 'upstream_unavailable' && $result['stage'] === 'subscribe', 'Report subscription rejection');
check($result['detail'] === 'REQERR:1:17', 'Keep diagnostic codes');
check(end($calls)[1]['LS_op'] === 'destroy', 'Release failed subscriptions');

[$result, $calls] = scenario([new RuntimeException('transport_error:28')]);
check($result['status'] === 'skipped' && $result['stage'] === 'create_session', 'Handle network timeouts');
check(count($calls) === 1, 'Do not destroy a nonexistent session');

[$result] = scenario([$connection, $ack, "CONERR,20,Session not found\r\n"]);
check($result['detail'] === 'CONERR:20', 'Report session expiry without storing data');

$time = 0;
[$result, $calls] = scenario([$connection, $ack], static function () use (&$time): float {
    return ($time++) * 8.0;
});
check($result['status'] === 'skipped', 'Stop at the overall deadline');
check(count($calls) === 3, 'No poll after the deadline, but still clean up');

$fields = array_fill(0, 6, null);
check(UrineTelemetry::parseValue("U,1,1,123|59|ok|ok|green|%36%30.5\r\n", $fields) === 60.5, 'Decode calibrated values');
check(UrineTelemetry::parseValue("U,1,1,124|61|^3|62\r\n", $fields) === 62.0, 'Expand unchanged-field runs');
check(UrineTelemetry::parseValue("U,1,1,125|63|^3|#\r\n", $fields) === 63.0, 'Fall back to raw data when calibrated is null');
check(UrineTelemetry::parseValue("U,1,1,126|0|^3|$\r\n", $fields) === 0.0, 'Zero is a valid tank value');
check(UrineTelemetry::parseValue("U,2,1,126|70|ok|ok|green|70\r\n", $fields) === null, 'Ignore another subscription');
check(UrineTelemetry::parseValue("U,1,2,126|70|ok|ok|green|70\r\n", $fields) === null, 'Ignore another item');
check(UrineTelemetry::parseValue("U,1,1,127|101|ok|ok|green|1e999\r\n", $fields) === null, 'Reject out-of-range and non-finite data');

$post = static function (string $url, array $params) use ($connection, $ack, $update): string {
    if (($params['LS_op'] ?? '') === 'destroy') {
        throw new RuntimeException('cleanup_failed');
    }
    return str_contains($url, 'create_session') ? $connection
        : (str_contains($url, 'bind_session') ? $update : $ack);
};
check(UrineTelemetry::collect($post)['value'] === 57.5, 'Cleanup failure must not discard data');
echo "Passed $assertions assertions.\n";
