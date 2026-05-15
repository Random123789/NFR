# Mantis System Documentation

## 1. Purpose

The Mantis application is a web-based management system for tracking customer accounts, projects, products, cases, Mantis records, Knock requests, bookmarks, reports, and user activity.

It is organized as a React frontend, a FastAPI backend, and a MySQL database. The backend is structured as a local API gateway that mounts domain services under a shared `/api` prefix.

```text
Browser
  -> React + Vite frontend
  -> HTTP API calls to /api/*
  -> FastAPI backend gateway
  -> Service routers
  -> Shared MySQL query layer
  -> MySQL database
```

## 2. Repository Layout

| Path | Responsibility |
| --- | --- |
| `Frontend/` | React, Vite, routing, pages, contexts, UI components, and typed API clients. |
| `Frontend/src/app/pages/` | Main user-facing screens such as Home, Cases, Accounts, Reports, Login, and Profile. |
| `Frontend/src/app/services/api/` | Frontend API client modules grouped by backend service. |
| `Frontend/src/app/context/` | React providers for auth, bookmarks, search, and toast state. |
| `Backend/` | FastAPI application, service registry, shared database layer, schemas, and service routers. |
| `Backend/*Service/router.py` | Backend service modules for each domain. |
| `Backend/entity_crud.py` | Shared CRUD implementation for simple record-backed services. |
| `Backend/report_builder.py` | Safe SQL compiler for visual custom reports. |
| `Backend/sql/schema.sql` | MySQL schema definition. |
| `Backend/sql/seed.sql` | Initial seed data. |

## 3. Runtime Architecture

### Frontend

The frontend is a Vite React app. It uses:

| Area | Implementation |
| --- | --- |
| Routing | `react-router` in `Frontend/src/app/routes.tsx`. |
| Layout | `MainLayout` with side navigation, global search, notifications, and profile controls. |
| Authentication state | `AuthContext`, backed by a token in `localStorage`. |
| Bookmark state | `BookmarksContext`, backed by `/api/bookmarks`. |
| Global search | `SearchContext`, shared by the layout and record pages. |
| Toast messages | `ToastContext`. |
| Charts | `recharts` on Home and Reports. |
| UI primitives | Local `components/ui` plus Radix, Tailwind, MUI icons, and Lucide icons. |

### Backend

The backend is a FastAPI app in `Backend/main.py`.

| Component | Responsibility |
| --- | --- |
| `main.py` | Creates the FastAPI app, configures CORS, mounts services, exposes `/` and `/health`. |
| `service_registry.py` | Registers service routers under `/api` and runs service startup hooks. |
| `config.py` | Loads environment variables from `Backend/.env`. |
| `database.py` | Creates a MySQL connection pool and exposes query/mutation helpers. |
| `schemas.py` | Pydantic request and response models for records, auth, reports, and history. |
| `utils.py` | Shared record normalization and history-entry helpers. |
| `entity_crud.py` | Reusable list/detail/create/update/delete/history behavior for standard entities. |

### Database

The database is MySQL. The default database name is `mantis`.

The backend connects through a pooled MySQL connector using these environment variables:

| Variable | Default |
| --- | --- |
| `DB_HOST` | `localhost` |
| `DB_PORT` | `3306` |
| `DB_USER` | `root` |
| `DB_PASSWORD` | empty |
| `DB_NAME` | `mantis` |
| `HOST` | `0.0.0.0` |
| `PORT` | `4000` |
| `CORS_ORIGIN` | `http://localhost:5173` |
| `ENVIRONMENT` | `development` |

## 4. Application Entry Points

### Frontend Entry Points

| File | Role |
| --- | --- |
| `Frontend/src/main.tsx` | Mounts the React app into `#root`. |
| `Frontend/src/app/App.tsx` | Wraps the router with Auth, Bookmarks, Toast, and Search providers. |
| `Frontend/src/app/routes.tsx` | Defines public and protected routes. |
| `Frontend/src/app/services/api/http.ts` | Central fetch helper, API base URL, token attachment, and error handling. |

The frontend API base is:

```text
VITE_API_URL, or http://localhost:4000/api when not set
```

### Backend Entry Points

| Endpoint | Purpose |
| --- | --- |
| `GET /` | Basic API metadata and registered services. |
| `GET /health` | Backend and database health check. |
| `GET /docs` | FastAPI OpenAPI documentation. |

All service APIs are mounted under:

```text
/api
```

## 5. Frontend Pages

| Route | Page | Purpose |
| --- | --- | --- |
| `/login` | `Login` | Authenticates a user and stores the bearer token. |
| `/` | `Home` | Shows metrics, recent cases, status breakdowns, and activity trends. |
| `/cases` | `Cases` | Lists, filters, edits, bookmarks, comments on, and links cases to other entities. |
| `/accounts` | `Accounts` | Manages account records and related cases/projects. |
| `/projects` | `Projects` | Manages project records and links them to accounts and cases. |
| `/mantis` | `Mantis` | Manages Mantis records and their case relationships. |
| `/knock` | `Knock` | Manages Knock request records and their case relationships. |
| `/product` | `Product` | Manages product records and linked cases. |
| `/reports` | `Reports` | Builds, previews, saves, reorders, resizes, runs, and deletes custom reports. |
| `/bookmarked` | `Bookmarked` | Shows user-saved bookmarks grouped by entity type. |
| `/profile` | `Profile` | Updates profile/password, deletes own account, and exposes admin user management. |
| `/create-data` | `CreateData` | Multi-step record creation flow for selected entity types. |

All routes except `/login` are protected by `ProtectedRoute`.

## 6. Backend Service Catalog

| Service | Prefix | Main Responsibilities |
| --- | --- | --- |
| `authService` | `/api/auth` | Login, logout, current user, profile updates, admin user management, assignable users. |
| `bookmarkService` | `/api/bookmarks` | Per-user bookmark list, add, and remove. |
| `accountService` | `/api/accounts` | Account CRUD, search, pagination, account history, and role-aware vertical visibility. |
| `caseService` | `/api/cases` | Case CRUD, visibility filtering, history, and multi-entity case links. |
| `productService` | `/api/products` | Product CRUD, search, pagination, and product history. |
| `projectService` | `/api/projects` | Project CRUD, search, pagination, and project history. |
| `mantisService` | `/api/mantis` | Mantis CRUD, search, pagination, unique Mantis ID validation, and history. |
| `knockService` | `/api/knocks` | Knock CRUD, search, pagination, unique Knock ID validation, and history. |
| `reportsService` | `/api/reports` | Summary reports, visual report builder schema, previews, and user-saved reports. |
| `notificationsService` | `/api/notifications` | Recent activity notifications, per-user dismissal, and clear-all state. |

## 7. API Summary

### Authentication

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Validates credentials and creates a 7-day bearer token session. |
| `GET` | `/api/auth/me` | Returns the authenticated user. |
| `PUT` | `/api/auth/me` | Updates display name, email, or password. |
| `DELETE` | `/api/auth/me` | Deletes the current user, sessions, and bookmarks. |
| `POST` | `/api/auth/logout` | Removes the current token session. |
| `GET` | `/api/auth/assignees` | Lists users that can be assigned to work. |
| `GET` | `/api/auth/users` | Admin-only user list. |
| `POST` | `/api/auth/users` | Admin-only user creation, including SE vertical assignment. |
| `PUT` | `/api/auth/users/{user_id}/role` | Admin-only role and SE vertical update. |

On first startup, the backend ensures a development admin user exists:

```text
Email: admin@local
Password: Admin123!
Role: admin
```

### Standard Record Services

Accounts, products, projects, Mantis records, and knocks share the same endpoint pattern:

| Method | Endpoint Pattern | Description |
| --- | --- | --- |
| `GET` | `/api/{records}` | List records with optional `q`, `limit`, and `offset`. |
| `GET` | `/api/{records}/{recordId}` | Fetch one record. |
| `POST` | `/api/{records}` | Create a record. |
| `PUT` | `/api/{records}/{recordId}` | Update a record and append field-level history entries. |
| `DELETE` | `/api/{records}/{recordId}` | Delete a record. |
| `POST` | `/api/{records}/{recordId}/history` | Append a manual history entry. |

Where `{records}` is one of:

```text
accounts, products, projects, mantis, knocks
```

Mantis records enforce unique `mantisId` values when present. Knocks enforce unique `knockId` values when present.

### Cases

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/cases` | Lists visible cases with optional search, pagination, and field filters. |
| `GET` | `/api/cases/linked?entityType=...&entityRecordId=...` | Lists visible cases linked to a specific entity. |
| `GET` | `/api/cases/{recordId}` | Fetches one visible case. |
| `POST` | `/api/cases` | Creates a case, resolves Mantis/Knock references, and creates link rows. |
| `PUT` | `/api/cases/{recordId}` | Updates a visible case. |
| `DELETE` | `/api/cases/{recordId}` | Deletes a visible case. |
| `POST` | `/api/cases/{recordId}/history` | Appends a case comment/history entry. |
| `GET` | `/api/cases/{recordId}/links` | Returns linked accounts, products, projects, Mantis records, and knocks. |
| `POST` | `/api/cases/{recordId}/links` | Adds one entity link to a case. |
| `DELETE` | `/api/cases/{recordId}/links/{entityType}/{entityRecordId}` | Removes one entity link from a case. |

Case visibility is role-aware:

| Role | Visibility |
| --- | --- |
| `admin` | Can see all cases. |
| `user` | Can see cases where their display name matches `assignedTo` or `seOwner`, plus cases linked to accounts in their assigned vertical. |

Account visibility is also role-aware:

| Role | Visibility |
| --- | --- |
| `admin` | Can see all accounts. |
| `user` | Can see accounts in their assigned vertical. |

### Reports

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/reports/summary` | Case/account/project summary counts. |
| `GET` | `/api/reports/cases-by-status` | Case count grouped by status. |
| `GET` | `/api/reports/cases-by-priority` | Case count grouped by priority. |
| `GET` | `/api/reports/cases-by-product` | Case count grouped by product. |
| `GET` | `/api/reports/cases-over-time` | Daily case close-date counts. |
| `GET` | `/api/reports/builder/schema` | Whitelisted report sources, joins, fields, and operators. |
| `POST` | `/api/reports/preview` | Runs an unsaved report query. |
| `GET` | `/api/reports/custom` | Lists current user's saved reports. |
| `POST` | `/api/reports/custom` | Saves a custom report. |
| `PUT` | `/api/reports/custom/{reportId}` | Updates a custom report. |
| `GET` | `/api/reports/custom/{reportId}/run` | Runs a saved custom report. |
| `DELETE` | `/api/reports/custom/{reportId}` | Deletes a saved custom report. |

The visual report builder accepts a safe `ReportQuerySpec` rather than raw SQL. The backend compiles this spec using a whitelist of sources, joins, fields, operators, limits, and sort options.

### Bookmarks

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/bookmarks` | Lists current user's bookmarks. |
| `POST` | `/api/bookmarks` | Adds or updates a bookmark. |
| `DELETE` | `/api/bookmarks/{entity_type}/{entity_id}` | Removes a bookmark. |

Supported bookmark types:

```text
case, project, account, mantis, knock, product
```

### Notifications

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/notifications/recent?hours=24` | Returns recent activity notifications for records updated in the selected time window. |
| `POST` | `/api/notifications/dismiss` | Dismisses one notification for the current user. |
| `POST` | `/api/notifications/clear-all` | Clears all current notifications for the current user. |

The frontend polls recent notifications every 30 seconds from `MainLayout`.

## 8. Data Model

### Shared Record Fields

Most non-case domain tables share these common fields:

| Field | Purpose |
| --- | --- |
| `recordId` | Human-readable primary key such as `ACC-001` or `PRD-001`. |
| `moduleId` | Module identifier such as `MOD-ACCOUNT`. |
| `recordRevision` | Record revision string, currently `1.0`. |
| `metaData` | Optional free-form metadata. |
| `ownedBy` | Owner display name. |
| `createdAt`, `createdBy` | Creation audit metadata. |
| `updatedAt`, `updatedBy` | Last update audit metadata. |
| `history` | JSON audit trail shown in record detail views. |

### Domain Tables

| Table | Primary Data |
| --- | --- |
| `accounts` | Account name, website, account type, vertical. |
| `products` | Product family, product name, product URL. |
| `projects` | Project name, account link, dates, stage, SFDC fields, SE. |
| `mantis` | Mantis description, Mantis ID/URL, status, request date, target date. |
| `knocks` | Knock description, Knock ID/URL, status, request date, target date. |
| `cases` | `recordId`, account, project, category, escalation type/note, product, close date, description, SE owner, assigned to, priority, status, Knock ID, Mantis ID, and history. |

### User and Application State Tables

| Table | Purpose |
| --- | --- |
| `users` | Local user accounts, roles, SE verticals, password hashes, and login metadata. |
| `user_sessions` | Hashed bearer tokens and expiry timestamps. |
| `user_bookmarks` | Per-user saved entities. |
| `audit_logs` | Administrative audit records such as user creation and role changes. |
| `custom_reports` | Per-user saved report definitions. |
| `user_notification_dismissals` | Notification IDs dismissed by a user. |
| `user_notification_state` | Per-user clear-all timestamp. |
| `case_entity_links` | Multi-link relationships between cases and accounts/products/projects/Mantis records/knocks. |

### Relationship Summary

```text
accounts.recordId
  -> projects.accountId
  -> cases.account

products.recordId
  -> cases.product

projects.recordId
  -> cases.project

mantis.mantisId
  -> cases.mantisId

knocks.knockId
  -> cases.knockId

cases.recordId
  -> case_entity_links.caseRecordId

users.id
  -> user_sessions.userId
  -> user_bookmarks.userId
  -> custom_reports.userId
  -> user_notification_dismissals.userId
  -> user_notification_state.userId
```

The `case_entity_links` table supports multiple linked entities per case. Cases also keep direct text references for account, product, project, Mantis ID, and Knock ID.

## 9. Key Interaction Flows

### Login and Session Bootstrap

```text
User submits login form
  -> POST /api/auth/login
  -> backend verifies PBKDF2 password hash
  -> backend stores hashed token in user_sessions
  -> frontend stores raw token in localStorage
  -> AuthContext calls initializeData()
  -> frontend loads accounts, products, projects, Mantis records, knocks, and visible cases
```

### Protected Frontend Navigation

```text
Route request
  -> ProtectedRoute checks AuthContext
  -> if loading, show loading state
  -> if unauthenticated, redirect to /login
  -> if authenticated, render MainLayout and child route
```

### Record List and Detail

```text
User opens a record page
  -> page reads initialized in-memory arrays from recordStore
  -> global search and page filters run in the browser
  -> user opens detail drawer/panel
  -> detail view can edit, bookmark, comment, and navigate linked entities
```

### Record Create or Update

```text
Frontend submits typed payload
  -> service API module calls fetchJson()
  -> fetchJson attaches Authorization: Bearer <token>
  -> backend validates request model
  -> service writes to MySQL
  -> history entries are appended for creation or changed fields
  -> backend returns normalized JSON
  -> frontend updates local record arrays and selected detail state
```

### Case Linking

```text
User links a case to an account/product/project/Mantis/Knock
  -> POST /api/cases/{recordId}/links
  -> backend validates case visibility and target entity existence
  -> backend inserts into case_entity_links
  -> backend syncs direct case reference fields
  -> frontend refreshes linked entity lists
```

### Custom Report Builder

```text
Reports page loads schema
  -> GET /api/reports/builder/schema
  -> user selects source, joins, fields, filters, grouping, chart type
  -> POST /api/reports/preview runs unsaved query
  -> POST /api/reports/custom saves querySpec
  -> GET /api/reports/custom/{id}/run renders saved report
```

### Notifications

```text
MainLayout polls every 30 seconds
  -> GET /api/notifications/recent
  -> backend builds notifications from recently updated records
  -> backend filters dismissed and cleared notifications per user
  -> user can dismiss one or clear all
```

## 10. Security and Access Control

| Area | Current Behavior |
| --- | --- |
| Password storage | Passwords are hashed with PBKDF2-HMAC-SHA512 and a per-password salt. |
| Session tokens | Login returns a random token; only a SHA-256 token hash is stored in MySQL. |
| Token TTL | Sessions expire after 7 days. |
| Frontend token storage | The bearer token is stored in `localStorage`. |
| Admin role | Admins can list users, create users, and update user roles and SE verticals. |
| Account visibility | Non-admin users only see accounts in their assigned vertical. |
| Case visibility | Non-admin users see cases associated with their display name or linked to accounts in their assigned vertical. |
| Report visibility | Custom reports are scoped to the current user. Report query execution applies account/case visibility when accounts or cases are involved. |
| Bookmarks and notifications | Scoped to the current user. |

Implementation note: the frontend protects all application pages except `/login`, but backend route-level auth varies by service. Standard record create/update routes require authentication. Account and case list/detail routes require authentication because they apply role-aware visibility. Some standard record delete and manual-history routes also do not take a `Request` object and therefore do not enforce auth in the route function. Bookmarks, notifications, custom reports, and profile/admin routes require authentication. Static report summary endpoints are currently public API routes.

## 11. Startup Hooks

The backend runs service startup hooks from `startup_services()`:

| Service | Startup Hook | Purpose |
| --- | --- | --- |
| `authService` | `ensure_default_user` | Creates auth tables and the development admin user. |
| `bookmarkService` | `ensure_bookmark_tables` | Ensures auth/bookmark tables exist. |
| `caseService` | `ensure_case_link_tables` | Ensures case links, indexes, foreign keys, and backfilled links exist. |
| `reportsService` | `ensure_custom_report_tables` | Ensures user-saved custom report tables and columns exist. |
| `notificationsService` | `ensure_notification_tables` | Ensures dismissal and clear-all notification tables exist. |

## 12. Local Development

### Backend

```bash
cd Backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py
```

Expected backend URL:

```text
http://localhost:4000
```

### Frontend

```bash
cd Frontend
npm install
npm run dev
```

Expected frontend URL:

```text
http://localhost:5173
```

### Database

Import schema and seed data:

```bash
cd Backend
mysql -u root -p < sql/schema.sql
mysql -u root -p mantis < sql/seed.sql
```

On Windows PowerShell:

```powershell
cd Backend
Get-Content .\sql\schema.sql | mysql -u root -p
Get-Content .\sql\seed.sql | mysql -u root -p mantis
```

## 13. Extending the System

### Add a Standard Entity Service

1. Add a database table with the shared record fields and entity-specific columns.
2. Add Pydantic models in `Backend/schemas.py`.
3. Create `Backend/<entity>Service/router.py`.
4. Configure `EntityCrudConfig` with table name, record prefix, module ID, fields, labels, and search fields.
5. Register the router in `Backend/service_registry.py`.
6. Add a frontend API module in `Frontend/src/app/services/api/`.
7. Export the API module from `Frontend/src/app/data/apiClient.ts`.
8. Add frontend types in `Frontend/src/app/services/api/types.ts`.
9. Add a route/page if the entity needs a dedicated screen.

### Add a Report Builder Field

1. Add the field to the relevant `ReportSource` in `Backend/report_builder.py`.
2. Add or adjust joins if the field belongs to another table.
3. Confirm the field appears in `/api/reports/builder/schema`.
4. Use the Reports page preview to validate the compiled query.

### Add a Case Link Type

1. Add the entity type to `CASE_LINK_ENTITY_TYPES`.
2. Add the target table lookup in `caseService/router.py`.
3. Add link payload support to frontend API types.
4. Add UI support in the Cases detail linked tab and the target entity page.
5. Update `case_entity_links` usage and any legacy sync logic if compatibility fields are required.

## 14. Troubleshooting

| Symptom | Checks |
| --- | --- |
| Frontend cannot reach API | Confirm backend is running on port `4000` and `VITE_API_URL` points to `http://localhost:4000/api`. |
| Login fails on first run | Confirm MySQL is reachable and startup hooks created the default user. |
| `/health` says database disconnected | Check `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`. |
| Empty pages after login | Check backend logs and browser console for failed initialization calls. |
| CORS errors | Confirm frontend origin is allowed by `CORS_ORIGIN` or local development regex. |
| Missing linked cases | Confirm `case_entity_links` exists and `ensure_case_link_tables()` ran on backend startup. |
| Report preview fails | Confirm requested fields are supported by `report_builder.py` and the selected joins include required sources. |
