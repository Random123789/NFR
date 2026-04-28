# NFR App Integration Overview

This repository has three connected parts:

- **Frontend** (`Frontend/`): React + Vite UI.
- **Backend** (`Backend/`): Python + FastAPI (`main.py`, `routers/`, `database.py`).
- **Database**: MySQL schema and seed scripts in `Backend/sql/`.

## How They Integrate

1. The frontend calls the backend API using `VITE_API_URL`.
2. If `VITE_API_URL` is not set, the frontend defaults to:
   - `http://localhost:4000/api`
3. The backend receives API requests and runs SQL queries through a MySQL connection layer.
4. MySQL stores all records (`accounts`, `cases`, `projects`, `products`, `nfrs`, `knocks`, `users`).
5. The backend returns JSON to the frontend for rendering and updates.

## Data Flow (Simple)

```text
Browser (React/Vite)
  -> HTTP /api/*
Backend API (FastAPI)
  -> SQL
MySQL Database
  -> rows -> JSON response
Frontend UI updates
```

## Important Configuration Notes

- Frontend API base is in `Frontend/src/app/data/apiClient.ts`.
- Frontend default API URL is `http://localhost:4000/api`.
- Python backend default port is `4000`.
- Python backend DB env variables use:
  - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- SQL schema currently creates database **`nfr`** (`Backend/sql/schema.sql`).
- Some local env files may still refer to **`nfr_db`**. Keep one name consistently (recommended: `nfr`) to avoid connection/seed issues.

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

### 4) MySQL Import Commands by OS

Use a consistent database name in SQL import and backend env vars (recommended: `nfr`).

Windows (PowerShell):

```bash
Get-Content .\sql\schema.sql | mysql -u root -p nfr
Get-Content .\sql\seed.sql | mysql -u root -p nfr
```

Linux/macOS (bash/zsh):

```bash
mysql -u root -p nfr < sql/schema.sql
mysql -u root -p nfr < sql/seed.sql
```

## API and Health Check

Quick checks once services are up:

- Open frontend in browser.
- Call an API endpoint such as:
  - `GET http://localhost:4000/api/cases`

If the endpoint returns JSON, frontend-backend-database integration is working.

## Folder Roles

- `Frontend/`: pages, routes, API client, UI components.
- `Backend/routers/`: REST endpoints by entity.
- `Backend/shared/database.ts`: MySQL pool and query helpers.
- `Backend/sql/`: schema and initial seed data.

## Case Multi-Link Support

- Cases now support linking multiple entities of each type (accounts, products, projects, NFRs, knocks).
- Backend stores these in `case_entity_links` (created by schema and ensured at runtime in case routes).
- Existing single-link case fields remain for compatibility and are auto-synced to the newest linked item per type.

## Optional Alternative Backend

This repo also includes a Node/Express implementation, but you do not need it for your current workflow.
