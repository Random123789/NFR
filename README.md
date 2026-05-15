# Mantis App Integration Overview

This repository has three connected parts:

- **Frontend** (`Frontend/`): React + Vite UI.
- **Backend** (`Backend/`): Python + FastAPI (`main.py`, `service_registry.py`, `*Service/router.py`, `database.py`).
- **Database**: MySQL schema and seed scripts in `Backend/sql/`.

For a fuller system guide covering services, frontend/backend interactions, APIs, database tables, data flows, and extension notes, see [SYSTEM_DOCUMENTATION.md](SYSTEM_DOCUMENTATION.md).

## How They Integrate

1. The frontend calls the backend API using `VITE_API_URL`.
2. If `VITE_API_URL` is not set, the frontend defaults to:
   - `/api`
3. During local Vite development, `/api` is proxied to `http://localhost:4000`.
3. The FastAPI app acts as a local API gateway and mounts Python service modules such as `accountService`, `authService`, `caseService`, and `reportsService`.
4. Each service owns its API routes and uses the shared MySQL connection layer.
5. MySQL stores all records (`accounts`, `cases`, `projects`, `products`, `mantis`, `knocks`, `users`).
6. The backend returns JSON to the frontend for rendering and updates.

## Data Flow (Simple)

```text
Browser (React/Vite)
  -> HTTP /api/*
Backend API Gateway (FastAPI main.py)
  -> Python service routers (*Service/router.py)
  -> SQL
MySQL Database
  -> rows -> JSON response
Frontend UI updates
```

## Important Configuration Notes

- Frontend API base is in `Frontend/src/app/services/api/http.ts` and re-exported through `Frontend/src/app/data/apiClient.ts`.
- Frontend default API URL is `/api`; Vite proxies it to `http://localhost:4000` in development.
- Python backend default port is `4000`.
- Backend services are mounted in `Backend/service_registry.py`.
- Python backend DB env variables use:
  - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- SQL schema currently creates database **`crm`** (`Backend/sql/schema.sql`).
- The Python backend default database name is also **`crm`**. If a local `.env` still refers to the older `mantis` database name, update it or import the SQL into that database intentionally.
- The Mantis application component and its table remain named `mantis`; only the database name/credentials use `crm`.

## Quick Start (Local)

### 1) Prepare MySQL

Create/import schema and seed data:

- Run `Backend/sql/schema.sql`
- Run `Backend/sql/seed.sql`

Make sure your backend database env points to the same DB name created by `schema.sql`.

### 2) Start Backend

From `Backend/`:

Windows (PowerShell):

```bash
cd Backend
.\.venv\Scripts\Activate.ps1
python main.py
```

or from any location:

```bash
Backend\start_backend.ps1
```

Linux/macOS (bash/zsh):

```bash
cd Backend
source .venv/bin/activate
python3 main.py
```

If your virtual environment is not created yet, create/install once:

Windows (PowerShell):

```bash
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Linux/macOS (bash/zsh):

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Expected: backend starts on `http://localhost:4000`.

Stop backend from the same terminal with `Ctrl+C`.

If port `4000` is still occupied (for example after multiple terminal sessions), run:

```bash
cd Backend
.\stop_backend.ps1
```

Then start again with:

```bash
python main.py
```

### 3) Start Frontend

From `Frontend/`:

```bash
npm install
npm run dev
```

Expected: Vite starts on `http://localhost:5173` (or next free port).

If needed, add a `.env` in `Frontend/`:

```env
VITE_API_URL=http://localhost:4000/api
```

This is optional for normal local development because `npm run dev` proxies `/api` to the backend.

### 4) MySQL Import Commands by OS

Use a consistent database name in SQL import and backend env vars (recommended: `crm`).

Windows (PowerShell):

```bash
Get-Content .\sql\schema.sql | mysql -u root -p
Get-Content .\sql\seed.sql | mysql -u root -p crm
```

Linux/macOS (bash/zsh):

```bash
mysql -u root -p < sql/schema.sql
mysql -u root -p crm < sql/seed.sql
```

## API and Health Check

Quick checks once services are up:

- Open frontend in browser.
- Call an API endpoint such as:
  - `GET http://localhost:4000/api/cases`

If the endpoint returns JSON, frontend-backend-database integration is working.

## Folder Roles

- `Frontend/`: pages, routes, API client, UI components.
- `Backend/main.py`: FastAPI gateway entrypoint; run with `python main.py`.
- `Backend/service_registry.py`: service registration and startup hooks.
- `Backend/*Service/router.py`: Python service modules for each domain (`accountService`, `authService`, `caseService`, etc.).
- `Backend/entity_crud.py`: shared Python CRUD helper used by the standard record-backed service routers.
- `Backend/database.py`: MySQL pool and query helpers.
- `Frontend/src/app/services/api/`: frontend API service modules by domain.
- `Frontend/src/app/data/apiClient.ts`: compatibility barrel that re-exports the frontend service modules.
- `Backend/sql/`: schema and initial seed data.

## Case Multi-Link Support

- Cases now support linking multiple entities of each type (accounts, products, projects, Mantis records, knocks).
- Backend stores these in `case_entity_links` (created by schema and ensured at runtime in case routes).
- Direct case reference fields are synced to the newest linked item per type.

## Backend Runtime

```bash
cd Backend
python main.py
```

The backend runtime is Python/FastAPI only.
