# Elite Companion Backend

API backend for Elite Dangerous companion telemetry:
- HTTP ingest for `Journal` and `Status` events
- Realtime state distribution over Socket.IO
- Optional PostgreSQL persistence for events, routes, and latest snapshot
- Tenant isolation by API key (`TENANT_MODE=api_key`)
- API key authentication from PostgreSQL (`api_keys` table)

## Run
```bash
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

## PostgreSQL setup
If `DATABASE_URL` is set, the backend persists ingest data and current snapshot.

```bash
npm run db:migrate
```

If `DATABASE_URL` is not set, the app runs in memory-only mode.

## Environment variables
- `PORT` (default: `3000`)
- `API_KEY` (legacy single key, default: `dev-api-key`)
- `API_KEYS` (optional bootstrap keys inserted into DB on startup)
- `API_KEY_LABELS` (optional bootstrap labels `key=label`)
- `API_KEY_PEPPER` (optional pepper added before hashing keys in DB)
- `BOOTSTRAP_API_KEYS` (`true`/`false`, default: `true`)
- `ADMIN_API_KEY` (required for `/api/admin/*` management endpoints)
- `ALLOW_ANY_API_KEY` (`true`/`false`, default: `false`)
- `CORS_ORIGIN` (default: `*`)
- `INGEST_RATE_LIMIT_WINDOW_MS` (default: `10000`)
- `INGEST_RATE_LIMIT_MAX` (default: `200`)
- `DATABASE_URL` (optional; enables persistence)
- `DATABASE_SSL` (`true`/`false`, default: `false`)
- `COMMANDER_NAME` (default: `default`)
- `TENANT_MODE` (`single` or `api_key`, default: `api_key`)

## Endpoints

### Health
- `GET /health`

### State
- `GET /api/state` (requires API key)
- `GET /api/whoami` (requires API key; returns label/fingerprint/tenant info)

### Admin key management (requires `x-admin-key`)
- `GET /api/admin/keys`
- `POST /api/admin/keys`
- `DELETE /api/admin/keys/:id`

### Ingest (requires API key)
- `POST /api/ingest/journal`
- `POST /api/ingest/status`
- `POST /api/ingest/journal/batch`

### Route upload (requires API key)
- `POST /api/route/upload`
  - `multipart/form-data`
  - field: `file`
  - supported: `.csv`, `.xlsx`

## Realtime events
- `ShipUpdated`
- `LocationUpdated`
- `RouteUpdated`
- `StateUpdated`

Socket.IO clients must authenticate with `auth.apiKey` and will only receive events for that API key tenant.
