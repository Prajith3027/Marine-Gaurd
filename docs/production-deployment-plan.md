# Marine Guard — Production Deployment Plan & Runbook

## 1. Overview & Architectural Topology

This document defines the deployment plan, architecture, pre-flight safeguards, environment specifications, and operational runbook for deploying the **Marine Guard** marine oil spill monitoring and crisis management platform.

### Architectural Recommendation: Container-Based Stack (Option B)

The verified primary production deployment model is **Option B (Container-Based Stack with Nginx Reverse Proxy)**, orchestrating:
1. **Frontend / Ingress:** Nginx reverse proxy serving the React/Vite SPA and proxying `/api/`, `/health`, and `/uploads/` directly to the backend.
2. **Backend API:** FastAPI application running on Python 3.12-slim under single-worker Uvicorn (`--workers 1` to preserve in-memory process-local brute-force rate limiter state).
3. **Database:** PostgreSQL 15 with PostGIS 3.4 (`postgis/postgis:15-3.4`) isolated within an internal network bridge.
4. **Persistent Volumes:**
   - Database records: Docker volume `pgdata` (`marine_guard_pgdata`).
   - Citizen report media: Docker volume `uploads_data` (`marine_guard_uploads`).
   - PyTorch ML models: Read-only host bind mount `./models:/app/models:ro` exposing verified repository weights (`oil_spill_demo_best.pth` and `model_config.json`).

An alternative **Option A (Render Managed Services)** is documented as a blueprint via `render.yaml` for teams requiring managed platform-as-a-service hosting.

```
[ Client Browser / Mobile Agent ]
               │
               ▼ HTTPS (Port 443 / 80)
┌──────────────────────────────────────────────┐
│  Nginx Web Ingress & SPA Container           │
│  - client_max_body_size: 50M                 │
│  - Static Asset Caching (Vite build chunks)  │
│  - SPA Routing (try_files -> /index.html)    │
│  - Security Headers (nosniff, DENY, etc.)    │
│  - Reverse Proxy:                            │
│      ^~ /api/*    ───► http://backend:8000/api│
│      =  /health   ───► http://backend:8000/health
│      ^~ /uploads/*───► http://backend:8000/uploads
└──────────────────────┬───────────────────────┘
                       │ Internal Docker Network (marine_internal_network)
                       ▼
┌──────────────────────────────────────────────┐
│  FastAPI Backend Service                     │
│  - Python 3.12-slim, non-root `appuser` (1000)
│  - Uvicorn (Single Worker for rate limiter)  │
│  - In-memory sliding rate limiters           │
│  - PyTorch ML Inference Engine               │
├──────────────────────┬───────────────────────┤
│ Mount: /app/uploads  │ Mount: /app/models:ro │
│ (uploads_data vol)   │ (./models bind mount) │
└──────────┬───────────┴───────────────────────┘
           │ Internal Docker Network (marine_internal_network)
           ▼
┌──────────────────────────────────────────────┐
│  PostgreSQL + PostGIS Database Engine        │
│  - Image: postgis/postgis:15-3.4             │
│  - Port 5432: Isolated (No host publishing)  │
│  - Strict password & network isolation       │
├──────────────────────────────────────────────┤
│ Mount: /var/lib/postgresql/data (pgdata vol) │
└──────────────────────────────────────────────┘
```

---

## 2. Environment Variables & Secret Configuration

Production secrets must **NEVER** be committed into Git, baked into container images, or shared insecurely. Secrets must be injected via secure CI/CD pipelines, container orchestration secrets (Docker Secrets / Kubernetes Secrets), or cloud secret managers.

### Actual Variables Consumed by Application Code

The application code (`backend/app/core/config.py`, `backend/app/core/security.py`, `backend/app/database/session.py`) reads the following specific settings:

| Variable Name | Required in Prod | Default Value in Code | Actual Code Consumer & Validation Rules |
| :--- | :---: | :--- | :--- |
| `APP_ENV` | **Yes** | `"development"` | `Settings.app_env`. **Critical:** Must be set to `"production"`. *Note:* Setting `ENVIRONMENT` is ignored by Pydantic. When `APP_ENV=production`, interactive API docs (`/docs`, `/redoc`) are disabled, tracebacks are suppressed, strict security checks activate, and demo seeding is forbidden. |
| `DATABASE_URL` | **Yes** | `postgresql+psycopg://oilspill_user:changeme@localhost:5432/oilspill_db` | `Settings.database_url`. Connection URI. Rewrites `postgresql+psycopg://` to `postgresql+psycopg2://`. Fails fast on connection failure with sanitized `RuntimeError` (`pool_pre_ping=True`) and never falls back to SQLite. |
| `SECRET_KEY` | **Yes** | `"dev_secret_key_change_in_production"` | `Settings.secret_key` & `app.core.security._secret()`. **Critical:** In production, rejected if empty, default, or under 32 bytes (256 bits). Used for HMAC cryptographic operations AND JWT token signing. *Note:* `JWT_SECRET_KEY` is not consumed by the code. |
| `FRONTEND_URL` | **Yes** | `"http://localhost:5173"` | `Settings.frontend_url`. Allowed CORS origin string. In production, also incorporated into backend CSP `connect-src` header. *Note:* `CORS_ORIGINS` (JSON array) is not parsed by the code. |
| `DEBUG` | No | `True` | `Settings.debug`. Set to `"false"` in production to disable verbose SQLAlchemy query echoing. |
| `JWT_ALGORITHM` | No | `"HS256"` | `Settings.jwt_algorithm`. Cryptographic algorithm for JWTs. |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | No | `60` | `Settings.access_token_expire_minutes`. JWT token expiration time in minutes (default is 60 minutes). |
| `INITIAL_ADMIN_EMAIL` | Optional | `None` | `Settings.initial_admin_email`. If configured with password, provisions initial admin during startup. |
| `INITIAL_ADMIN_PASSWORD` | Optional | `None` | `Settings.initial_admin_password`. Must meet password complexity (>= 8 chars, <= 72 bytes, not default). |
| `INITIAL_ADMIN_NAME` | Optional | `"Authorized Administrator"` | `Settings.initial_admin_name`. Display name for initial admin. |
| `OIL_SPILL_MODEL_PATH` | No | `"models/oil_spill_demo_best.pth"` | `real_model.py:23`. Path to PyTorch model weights. Defaults to `models/oil_spill_demo_best.pth`. |

### Hardcoded Application Paths (Not Environment Variables)
- **Upload Storage:** The application hardcodes `UPLOAD_DIR = Path("uploads/reports")` relative to CWD (`/app/uploads/reports` in container). Setting `UPLOAD_DIR` as an environment variable has no effect.
- **Model Config:** Model configuration is loaded from `"models/model_config.json"` relative to CWD. Setting `MODEL_CONFIG_PATH` has no effect.

### Docker & Infrastructure Variables (Used by Compose / Nginx / Vite)

| Variable Name | Used In | Default / Example | Purpose |
| :--- | :--- | :--- | :--- |
| `POSTGRES_USER` | `docker-compose.prod.yml` | `oilspill_user` | Database user for PostGIS container. |
| `POSTGRES_PASSWORD` | `docker-compose.prod.yml` | *(Required, high-entropy)* | Database password. |
| `POSTGRES_DB` | `docker-compose.prod.yml` | `oilspill_db` | Database name. |
| `HOST_HTTP_PORT` | `docker-compose.prod.yml` | `80` | Host port mapped to Nginx ingress. |
| `VITE_API_URL` | `frontend/Dockerfile` | `""` (Empty string) | Build-time API URL. Left empty for same-origin Nginx proxy; set to backend URL if using split domains. |

---

## 3. Startup Schema Behavior & Future Migration Strategy

### Operations Executing During Application Startup (`lifespan`)
When the FastAPI backend boots, the following database operations execute inside `app.main.lifespan`:
1. `Base.metadata.create_all(bind=engine)`: Idempotently creates any missing tables.
2. `ALTER TYPE incident_status_enum ADD VALUE IF NOT EXISTS 'RECOVERY'`: Ensures PostgreSQL enum completeness.
3. `migrate_citizen_reports()`: Checks table columns on `citizen_reports` and executes `ALTER TABLE citizen_reports ADD COLUMN ...` for any missing auth extension columns.
4. `seed_initial_admin(_db)`: If `INITIAL_ADMIN_EMAIL` and `INITIAL_ADMIN_PASSWORD` are provided, idempotently creates the admin user (without seeding demo records).

### Operational Risks of Startup DDL
- **Multi-Worker / Multi-Replica Race Conditions:** If multiple backend container instances boot concurrently, concurrent `ALTER TABLE` or `CREATE TABLE` DDL queries can cause deadlocks or migration race conditions.
- **Permission Restrictions:** Production databases operating under least-privilege security models often forbid application runtime users from having DDL (`ALTER TABLE`, `CREATE TABLE`) privileges.

### Recommended Future Migration Strategy
- In a future phase, decouple database DDL from application startup by migrating to **Alembic**.
- Execute migrations as an isolated pre-deployment step (e.g., a one-off migration container or CI/CD deployment hook) before starting application worker containers.

---

## 4. Pre-Flight Safeguards & Verification Checklist

Before launching production containers, complete the following verification gates:

### Gate 1: Git Release Verification
- [ ] Confirm HEAD is at the verified release commit: `7d55923e215c6b63904f27b78264d3eb685bdbfc` or an approved signed release tag.
- [ ] Confirm no unstaged secrets or debug flags are present.

### Gate 2: Database Compatibility & PostGIS
- [ ] Ensure the target PostgreSQL instance has PostGIS extension enabled:
  ```sql
  CREATE EXTENSION IF NOT EXISTS postgis;
  CREATE EXTENSION IF NOT EXISTS postgis_topology;
  SELECT PostGIS_Full_Version();
  ```
- [ ] Verify database connectivity using `pool_pre_ping=True`.
- [ ] Ensure the production database volume (`marine_guard_pgdata`) is completely isolated from development databases.

### Gate 3: Storage & Model Persistence
- [ ] Verify the PyTorch weights (`oil_spill_demo_best.pth`) and configuration (`model_config.json`) exist in `./models`.
- [ ] Verify `./models:/app/models:ro` is mounted read-only into the backend container.
- [ ] Verify the upload volume has correct POSIX permissions for the unprivileged `appuser` (UID 1000).

### Gate 4: Nginx & Security Headers
- [ ] Verify `frontend/nginx.conf` includes `client_max_body_size 50M;`.
- [ ] Verify `location ^~ /uploads/` uses preferential prefix matching so images and videos are not intercepted by the static asset regex cache.
- [ ] Verify security headers (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`).
- [ ] Verify SPA fallback serves `index.html` with `Cache-Control: no-cache`.

---

## 5. Deployment Step-by-Step Runbook (Option B: Docker Compose Stack)

### Step 1: Provision Host Environment
1. Ensure the host has Docker Engine 24+ and Docker Compose v2 installed.
2. Confirm repository root contains `./models/oil_spill_demo_best.pth` and `./models/model_config.json`.

### Step 2: Configure Production Environment File
Create `/opt/marineguard/.env.production` with secure file permissions (`chmod 600 .env.production`):
```ini
APP_ENV=production
DEBUG=false
POSTGRES_USER=marine_guard_admin
POSTGRES_PASSWORD=<generate_32_char_random_password>
POSTGRES_DB=marine_guard_prod
SECRET_KEY=<generate_64_char_random_hex_key>
FRONTEND_URL=https://marineguard.yourdomain.com
HOST_HTTP_PORT=80
```

### Step 3: Build & Launch Stack
1. Build container images:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production build
   ```
2. Start the database container and wait for healthcheck:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d db
   docker compose -f docker-compose.prod.yml ps db
   ```
3. Start the backend service and verify startup:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d backend
   docker compose -f docker-compose.prod.yml logs backend
   ```
4. Start the frontend ingress:
   ```bash
   docker compose -f docker-compose.prod.yml --env-file .env.production up -d frontend
   ```

### Step 4: Post-Deployment Smoke Tests
1. Test health endpoint:
   ```bash
   curl -I http://localhost/health
   # Expected: HTTP/200 OK {"status":"healthy"}
   ```
2. Test SPA index route:
   ```bash
   curl -I http://localhost/
   # Expected: HTTP/200 OK (with Cache-Control: no-cache)
   ```
3. Test SPA deep-route fallback:
   ```bash
   curl -I http://localhost/dashboard
   # Expected: HTTP/200 OK (served by index.html fallback)
   ```
4. Verify non-root execution inside backend container:
   ```bash
   docker compose -f docker-compose.prod.yml exec backend id
   # Expected: uid=1000(appuser) gid=1000(appgroup)
   ```
5. Verify ML model availability:
   ```bash
   docker compose -f docker-compose.prod.yml exec backend python -c "from app.ml.inference import OilSpillInference; print('Model available:', OilSpillInference.get_instance().is_available())"
   # Expected: Model available: True
   ```

---

## 6. Backup & Disaster Recovery Runbook

### Scheduled Backups
- Execute daily automated PostgreSQL logical backups using `pg_dump`:
  ```bash
  docker compose -f docker-compose.prod.yml exec -T db pg_dump -U marine_guard_admin -Fc marine_guard_prod > /opt/marineguard/backups/marineguard_$(date +%Y%m%d_%H%M%S).dump
  ```
- Sync `/var/lib/docker/volumes/marine_guard_uploads/_data` to offsite encrypted object storage daily.

### Restore Verification Procedure
1. Create a temporary test database:
   ```bash
   docker compose -f docker-compose.prod.yml exec -T db createdb -U marine_guard_admin test_restore_db
   ```
2. Restore the dump into the test database:
   ```bash
   docker compose -f docker-compose.prod.yml exec -i db pg_restore -U marine_guard_admin -d test_restore_db < /opt/marineguard/backups/marineguard_backup.dump
   ```
3. Validate row counts:
   ```bash
   docker compose -f docker-compose.prod.yml exec -T db psql -U marine_guard_admin -d test_restore_db -c "SELECT count(*) FROM incidents; SELECT count(*) FROM citizen_reports;"
   ```
4. Drop the test restore database:
   ```bash
   docker compose -f docker-compose.prod.yml exec -T db dropdb -U marine_guard_admin test_restore_db
   ```

---

## 7. Rollback Plan

If critical defects or deployment failures occur:
1. Stop the current deployment stack:
   ```bash
   docker compose -f docker-compose.prod.yml down
   ```
2. Check out the previous stable release commit.
3. If database changes occurred, restore the pre-deployment database backup using `pg_restore`.
4. Relaunch the previous container stack and verify `/health`.
