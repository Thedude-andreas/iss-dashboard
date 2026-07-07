# ISS Dashboard

React/Vite dashboard for selected public International Space Station telemetry from NASA ISSLive!/Lightstreamer.

## Routes

- `/` - ISS telemetry dashboard on `https://iss.andreasmartensson.com`
- `/api/last-urine.php` - shared timestamp/history persistence for urine tank increases
- `/api/collect-urine.php` - optional server-side collector endpoint for cron

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
