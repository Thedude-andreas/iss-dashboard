# ISS Dashboard

React/Vite dashboard for selected public International Space Station telemetry from NASA ISSLive!/Lightstreamer.

## Routes

- `/` - ISS telemetry dashboard on `https://iss.andreasmartensson.com`
- `/api/last-urine.php` - shared timestamp/history persistence for urine tank increases
- `/api/collect-urine.php` - optional server-side collector endpoint for cron

## Collector behavior

The collector waits for the asynchronous Lightstreamer snapshot and rebinds when
an initial poll contains only subscription acknowledgements. Requests are bounded
to about 23 seconds including session cleanup; use a cron timeout of at least
30 seconds. Sessions are explicitly destroyed after each collection.

A successful observation returns `status: "collected"`, `collected: true`, and
the persisted snapshot. If the upstream feed is unavailable or has no usable
value, the endpoint returns HTTP 200 with `status: "skipped"`, `collected: false`,
`reason`, `stage`, and `checkedAt`. It logs the reason to PHP's error log and
leaves history and the last tank value untouched. HTTP 200 means the scheduled
attempt completed, **not** that fresh telemetry was received. Consumers monitoring
data health must check `collected`. This lets cron-job.org continue trying through
long feed outages instead of disabling the job after 26 failed HTTP requests.
Local storage failures still return HTTP 500.

Run backend regression tests with `php tests/collector-test.php` and
`php tests/collector-endpoint-test.php`. Existing disabled
cron-job.org jobs must be re-enabled once after deploying this fix.

## Local Development

```bash
npm install
npm run dev
```

The Vite dev server proxies `/api/*` to `http://127.0.0.1:8787` by default. Set `VITE_API_PROXY_TARGET` if your PHP API runs elsewhere.

## Deploy

GitHub Actions has a manual deploy workflow with two modes:

- `check` verifies secrets and the SFTP target path
- `deploy` builds and publishes the site

Required repository secrets:

```text
DEPLOY_HOST
DEPLOY_PORT
DEPLOY_USER
DEPLOY_PATH
SFTP_PASS
```

For `iss.andreasmartensson.com`, `DEPLOY_PATH` should be:

```text
webroots/28d160d3
```
