# Mantis CRM Application

This repository contains a Fortinet-branded CRM and case-management app for tracking accounts, projects, products, cases, Mantis records, Knock requests, bookmarks, reports, notifications, read state, users, and app feedback.

The app has three connected parts:

- **Frontend** (`Frontend/`): React + Vite single-page app.
- **Backend** (`Backend/`): Python + FastAPI API gateway with domain routers.
- **Database**: MySQL schema and seed scripts in `Backend/sql/`.

For the fuller architecture guide, API catalog, data model, and extension notes, see [SYSTEM_DOCUMENTATION.md](SYSTEM_DOCUMENTATION.md).

For a more explain-it-to-someone walkthrough of frontend functions, backend routes, and database links, see [FUNCTION_FLOW_GUIDE.md](FUNCTION_FLOW_GUIDE.md).

## Runtime Shape

```text
Browser
  -> React/Vite frontend
  -> HTTP /api/*
  -> FastAPI app in Backend/main.py
  -> Service routers from Backend/service_registry.py
  -> Shared MySQL helpers in Backend/database.py
  -> MySQL crm database
```

The frontend API base is controlled by `VITE_API_URL`. If it is not set, the frontend uses `/api`.

- In local Vite development, `/api` is proxied to `http://localhost:4000`.
- In Apache deployment, Apache serves the built frontend and proxies `/api` to the FastAPI backend.

## Main Application Areas

Frontend routes are defined in `Frontend/src/app/routes.tsx`.

- `/login`: public login page.
- `/`: protected home dashboard.
- `/cases` and `/cases/:recordSlug`: case list/detail workflow.
- `/accounts`, `/projects`, `/mantis`, `/knock`, `/product`: entity list/detail workflows.
- `/reports`: visual custom report builder and saved reports.
- `/bookmarked`: saved bookmarks.
- `/backlog`: unread/recent activity style backlog.
- `/feedback`: app feedback submission/review workflow.
- `/profile`: profile, password, and admin user management.

Backend services are registered in `Backend/service_registry.py` and mounted under `/api`:

```text
/api/auth
/api/bookmarks
/api/accounts
/api/products
/api/projects
/api/mantis
/api/cases
/api/knocks
/api/reports
/api/notifications
/api/app-feedback
/api/record-reads
```

## Important Configuration

Backend configuration is read from `Backend/.env` by `Backend/config.py`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DB_HOST` | `localhost` | MySQL host. |
| `DB_PORT` | `3306` | MySQL port. |
| `DB_USER` | `root` | MySQL user. |
| `DB_PASSWORD` | empty | MySQL password. |
| `DB_NAME` | `crm` | MySQL database name. |
| `DB_POOL_SIZE` | `20` | MySQL connection pool size. |
| `HOST` | `0.0.0.0` | FastAPI bind host. |
| `PORT` | `4000` | FastAPI bind port. |
| `CORS_ORIGIN` | `http://localhost:5173` | Primary allowed frontend origin. |
| `ENVIRONMENT` | `development` | Enables local Vite CORS regex in development. |
| `APP_BASE_URL` | `CORS_ORIGIN` or `http://localhost:5173` | Base URL used in case update emails. |

Optional email settings are also in `Backend/config.py`: `EMAIL_NOTIFICATIONS_ENABLED`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`, `SMTP_USE_STARTTLS`, and `SMTP_TIMEOUT_SECONDS`. These settings are used for case update emails and password reset emails.

The SQL schema creates and uses database **`crm`**. The feature named Mantis still uses the `mantis` table and `/api/mantis` routes.

## Quick Start

### 1. Prepare MySQL

From `Backend/`, import schema and seed data.

Windows PowerShell:

```powershell
cd Backend
Get-Content .\sql\schema.sql | mysql -u root -p
Get-Content .\sql\seed.sql | mysql -u root -p crm
```

Linux/macOS shell:

```bash
cd Backend
mysql -u root -p < sql/schema.sql
mysql -u root -p crm < sql/seed.sql
```

Make sure `DB_NAME` points to the same database.

### 2. Start Backend

Windows PowerShell:

```powershell
cd Backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py
```

Linux/macOS shell:

```bash
cd Backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 main.py
```

Expected backend URL:

```text
http://localhost:4000
```

On Windows, `Backend/start_backend.ps1` and `Backend/stop_backend.ps1` are convenience scripts.

### 3. Start Frontend

```bash
cd Frontend
npm install
npm run dev
```

Expected frontend URL:

```text
http://localhost:5173
```

For normal local development, no frontend `.env` is required because Vite proxies `/api` to the backend. If needed, set:

```env
VITE_API_URL=http://localhost:4000/api
```

## Default Development Login

On startup, the backend ensures an admin user exists if no active admin is present:

```text
Email: admin@local
Password: Admin123!
Role: admin
```

## Forgot Password

The login page includes a **Forgot password?** option.

Flow:

```text
User enters account email
  -> POST /api/auth/password-reset/request
  -> backend creates a one-hour reset token in password_reset_tokens
  -> backend emails APP_BASE_URL/login?resetToken=...
  -> user opens the link and sets a new password
  -> POST /api/auth/password-reset/confirm
  -> backend updates the password and revokes existing sessions
```

Email reset requires SMTP to be configured with `EMAIL_NOTIFICATIONS_ENABLED=true` and the SMTP variables listed above. `APP_BASE_URL` must point to the frontend URL users can open from email.

## Health Checks

Useful checks once services are running:

```text
GET http://localhost:4000/
GET http://localhost:4000/health
GET http://localhost:4000/docs
```

Protected `/api/*` endpoints require a bearer token from `/api/auth/login`.

## Folder Roles

- `Frontend/src/main.tsx`: mounts the React app.
- `Frontend/src/app/App.tsx`: wraps the router with auth, record, read-state, bookmark, toast, and search providers.
- `Frontend/src/app/routes.tsx`: route definitions.
- `Frontend/src/app/services/api/http.ts`: shared fetch helper, token attachment, API base URL, and error handling.
- `Frontend/src/app/services/api/`: typed API modules by domain.
- `Frontend/src/app/data/apiClient.ts`: barrel export for API modules and types.
- `Backend/main.py`: FastAPI application entry point.
- `Backend/service_registry.py`: service registration and startup hooks.
- `Backend/*Service/router.py`: domain API routers.
- `Backend/entity_crud.py`: shared CRUD behavior for standard record-backed services.
- `Backend/database.py`: MySQL connection pool and query helpers.
- `Backend/report_builder.py`: safe SQL compiler for custom reports.
- `Backend/sql/schema.sql`: database schema.
- `Backend/sql/seed.sql`: seed data.
- `deploy/apache/crm.conf`: Apache virtual host for serving frontend and proxying backend.
- `deploy/systemd/crm-backend.service`: systemd unit for the FastAPI backend.

## Case Links

Cases support multiple linked accounts, products, Mantis records, and Knock requests through `case_entity_links`.

Projects are linked through the direct `cases.project` field. The case link API accepts `project` as a link type, but project add/remove operations update `cases.project` rather than storing a `project` row in `case_entity_links`.

Legacy case columns such as `account`, `product`, `mantisId`, and `knockId` are backfilled into `case_entity_links` and dropped by the case startup hook.
