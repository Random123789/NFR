# Mantis System Documentation

## 1. Purpose

The Mantis application is a web-based CRM and case-management system for tracking customer accounts, projects, products, cases, Mantis records, Knock requests, bookmarks, reports, notifications, read state, users, and app feedback.

It is organized as a React frontend, a FastAPI backend, and a MySQL database. The backend acts as a local API gateway that mounts domain routers under a shared `/api` prefix.

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
| `Frontend/src/main.tsx` | React root entry point. |
| `Frontend/src/app/App.tsx` | Top-level provider composition and router host. |
| `Frontend/src/app/routes.tsx` | Public and protected route definitions. |
| `Frontend/src/app/pages/` | Main user-facing pages such as Home, Cases, Accounts, Reports, Login, Profile, and App Feedback. |
| `Frontend/src/app/components/` | Shared layout, detail, history, selector, and UI components. |
| `Frontend/src/app/context/` | React providers for auth, records, read state, bookmarks, search, and toasts. |
| `Frontend/src/app/services/api/` | Frontend API modules grouped by backend service. |
| `Frontend/src/app/data/apiClient.ts` | Barrel export for API modules and shared API types. |
| `Backend/` | FastAPI app, service registry, database layer, schemas, utilities, and service routers. |
| `Backend/*Service/router.py` | Backend service modules for each domain. |
| `Backend/entity_crud.py` | Shared CRUD implementation for standard record-backed services. |
| `Backend/report_builder.py` | Safe SQL compiler for visual custom reports. |
| `Backend/email_notifications.py` | Optional SMTP case-update email delivery. |
| `Backend/sql/schema.sql` | MySQL schema definition. |
| `Backend/sql/seed.sql` | Initial seed data. |
| `deploy/apache/crm.conf` | Apache virtual host that serves the frontend and proxies backend routes. |
| `deploy/systemd/crm-backend.service` | systemd service for the FastAPI backend. |

## 3. Runtime Architecture

### Frontend

The frontend is a Vite React app. It uses:

| Area | Implementation |
| --- | --- |
| Routing | `react-router` in `Frontend/src/app/routes.tsx`. |
| Layout | `MainLayout` with side navigation, global search, notifications, profile, and logout controls. |
| Authentication state | `AuthContext`, backed by a bearer token in `localStorage`. |
| Record state | `RecordsContext`, which loads the main domain records after login and exposes upsert/remove helpers. |
| Record read state | `RecordReadContext`, backed by `/api/record-reads`. |
| Bookmark state | `BookmarksContext`, backed by `/api/bookmarks`. |
| Global search | `SearchContext`, shared by the layout and record pages. |
| Toast messages | `ToastContext`. |
| Charts | `recharts` on Home and Reports. |
| UI primitives | Local `components/ui`, Radix primitives, Tailwind CSS, Lucide icons, and small local helpers. |

The frontend fetch layer is centralized in `Frontend/src/app/services/api/http.ts`. It resolves the API base URL, attaches the stored bearer token, normalizes API timestamps, and converts failed HTTP responses into JavaScript errors.

### Backend

The backend is a FastAPI app in `Backend/main.py`.

| Component | Responsibility |
| --- | --- |
| `main.py` | Creates the FastAPI app, configures CORS, mounts services, exposes `/`, `/health`, and FastAPI docs. |
| `service_registry.py` | Registers service routers under `/api` and runs service startup hooks. |
| `config.py` | Loads environment variables from `Backend/.env`. |
| `database.py` | Creates a MySQL connection pool and exposes async query/mutation helpers backed by worker threads. |
| `schemas.py` | Pydantic request and response models for records, auth, reports, and history. |
| `utils.py` | Shared timestamp, record normalization, and history-entry helpers. |
| `entity_crud.py` | Reusable list/detail/create/update/delete/history behavior for standard entities. |
| `report_builder.py` | Validates report-builder specs and compiles them into whitelisted SQL. |
| `email_notifications.py` | Sends optional case update emails to owners/watchers when SMTP is configured. |

### Database

The database is MySQL. The default database name is `crm`. The Mantis feature still uses the `mantis` table and `/api/mantis` routes.

Backend configuration is read from `Backend/.env` by `Backend/config.py`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `DB_HOST` | `localhost` | MySQL host. |
| `DB_PORT` | `3306` | MySQL port. |
| `DB_USER` | `root` | MySQL user. |
| `DB_PASSWORD` | empty | MySQL password. |
| `DB_NAME` | `crm` | MySQL database name. |
| `DB_POOL_SIZE` | `20` | MySQL connection pool size. |
| `HOST` | `0.0.0.0` | Backend bind host. |
| `PORT` | `4000` | Backend bind port. |
| `CORS_ORIGIN` | `http://localhost:5173` | Primary allowed frontend origin. |
| `ENVIRONMENT` | `development` | Enables local Vite CORS regex in development. |
| `APP_BASE_URL` | `CORS_ORIGIN` or `http://localhost:5173` | Base URL used in case update emails. |
| `EMAIL_NOTIFICATIONS_ENABLED` | `false` | Enables SMTP case update and password reset emails when all SMTP values are configured. |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server. |
| `SMTP_PORT` | `587` | SMTP port. |
| `SMTP_USERNAME` | empty | SMTP login username. |
| `SMTP_PASSWORD` | empty | SMTP login password. |
| `SMTP_FROM_EMAIL` | `SMTP_USERNAME` | Sender email. |
| `SMTP_FROM_NAME` | `NFR CRM` | Sender display name. |
| `SMTP_USE_STARTTLS` | `true` | Whether to start TLS. |
| `SMTP_TIMEOUT_SECONDS` | `10` | SMTP timeout. |

## 4. Application Entry Points

### Frontend Entry Points

| File | Role |
| --- | --- |
| `Frontend/src/main.tsx` | Mounts the React app into `#root`. |
| `Frontend/src/app/App.tsx` | Wraps the router with `AuthProvider`, `RecordsProvider`, `RecordReadProvider`, `BookmarksProvider`, `ToastProvider`, and `SearchProvider`. |
| `Frontend/src/app/routes.tsx` | Defines `/login` plus protected application routes under `MainLayout`. |
| `Frontend/src/app/services/api/http.ts` | Central fetch helper, API base URL, token storage, token attachment, timestamp normalization, and error handling. |

The frontend API base is:

```text
VITE_API_URL, or /api when not set
```

In local Vite development, `/api` and `/health` are proxied to `http://localhost:4000` by `Frontend/vite.config.ts`. In Apache deployment, Apache serves the built frontend and proxies `/api`, `/health`, `/docs`, and `/openapi.json` to the backend.

### Backend Entry Points

| Endpoint | Purpose |
| --- | --- |
| `GET /` | Basic API metadata and registered service names. |
| `GET /health` | Backend and database health check. |
| `GET /docs` | FastAPI OpenAPI documentation. |
| `GET /openapi.json` | OpenAPI schema. |

All service APIs are mounted under:

```text
/api
```

## 5. Frontend Pages

| Route | Page | Purpose |
| --- | --- | --- |
| `/login` | `Login` | Authenticates a user and stores the bearer token. |
| `/` | `Home` | Shows dashboards, case metrics, recent cases, product/account signals, and role-specific views. |
| `/cases`, `/cases/:recordSlug` | `Cases` | Lists, filters, edits, bookmarks, comments on, watches, and links cases. |
| `/accounts`, `/accounts/:recordSlug` | `Accounts` | Manages account records and related projects/cases. |
| `/projects`, `/projects/:recordSlug` | `Projects` | Manages project records and links them to accounts/cases. |
| `/mantis`, `/mantis/:recordSlug` | `Mantis` | Manages Mantis records and linked cases. |
| `/knock`, `/knock/:recordSlug` | `Knock` | Manages Knock request records and linked cases. |
| `/product`, `/product/:recordSlug` | `Product` | Manages product records and linked cases. |
| `/reports` | `Reports` | Builds, previews, saves, reorders, resizes, runs, and deletes custom reports. |
| `/bookmarked` | `Bookmarked` | Shows user-saved bookmarks grouped by entity type. |
| `/backlog` | `Backlog` | Shows activity and read-state driven work items. |
| `/feedback` | `AppFeedback` | Lets users submit app feedback and lets admins review open feedback. |
| `/profile` | `Profile` | Updates profile/password, deletes own account, and exposes admin user management. |

All routes except `/login` are protected by `ProtectedRoute`.

## 6. Backend Service Catalog

| Service | Prefix | Main Responsibilities |
| --- | --- | --- |
| `authService` | `/api/auth` | Login, logout, current user, profile updates, admin user management, assignable users, auth table bootstrap. |
| `bookmarkService` | `/api/bookmarks` | Per-user bookmark list, add, and remove. |
| `accountService` | `/api/accounts` | Account CRUD, search, pagination, account history, option normalization, and role-aware vertical visibility. |
| `productService` | `/api/products` | Product CRUD, search, pagination, duplicate detection, schema backfill, and product history. |
| `projectService` | `/api/projects` | Project CRUD, search, pagination, schema normalization, account cleanup, and project history. |
| `mantisService` | `/api/mantis` | Mantis CRUD, search, pagination, Mantis URL generation, old NFR naming migration, duplicate detection, and history. |
| `caseService` | `/api/cases` | Case CRUD, visibility filtering, history, watchers, optional email notifications, and case links. |
| `knockService` | `/api/knocks` | Knock CRUD, search, pagination, duplicate detection, and history. |
| `reportsService` | `/api/reports` | Visual report builder schema, report preview, and user-saved custom reports. |
| `notificationsService` | `/api/notifications` | Recent activity notifications, visibility filtering, per-user dismissal, and clear-all state. |
| `appFeedbackService` | `/api/app-feedback` | Authenticated feedback submission, image upload/storage, admin feedback list, and admin mark-done flow. |
| `recordReadService` | `/api/record-reads` | Per-user baseline/read timestamps for supported record types. |

## 7. API Summary

### Authentication

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/auth/login` | Validates email or display-name credentials and creates a 7-day bearer token session. |
| `GET` | `/api/auth/me` | Returns the authenticated user. |
| `PUT` | `/api/auth/me` | Updates current user's display name, email, or password. |
| `DELETE` | `/api/auth/me` | Deletes the current user, sessions, and bookmarks. |
| `POST` | `/api/auth/logout` | Removes the current token session. |
| `GET` | `/api/auth/assignees` | Lists active users/managers for owner and assignment dropdowns. |
| `GET` | `/api/auth/users` | Admin-only user list. |
| `POST` | `/api/auth/users` | Admin-only user creation, including role and user vertical. |
| `PUT` | `/api/auth/users/{user_id}` | Admin-only user display name, email, role, and vertical update. |
| `PUT` | `/api/auth/users/{user_id}/role` | Admin-only role and vertical update. |
| `PUT` | `/api/auth/users/{user_id}/password` | Admin-only password reset. |
| `POST` | `/api/auth/password-reset/request` | Public endpoint that creates a one-hour reset token and emails the reset link when SMTP is configured. |
| `POST` | `/api/auth/password-reset/confirm` | Public endpoint that consumes a reset token, updates the password, and revokes existing sessions. |

On first startup, the backend ensures an admin user exists if no active admin is present:

```text
Email: admin@local
Password: Admin123!
Role: admin
```

### Standard Record Services

Accounts, products, projects, Mantis records, and knocks share this endpoint pattern:

| Method | Endpoint Pattern | Description |
| --- | --- | --- |
| `GET` | `/api/{records}` | List records with optional `q`, `limit`, and `offset`. |
| `GET` | `/api/{records}/{recordId}` | Fetch one record. |
| `POST` | `/api/{records}` | Create a record and append creation history. |
| `PUT` | `/api/{records}/{recordId}` | Update a record and append field-level history entries. |
| `DELETE` | `/api/{records}/{recordId}` | Delete a record. Standard deletes require manager or admin. |
| `POST` | `/api/{records}/{recordId}/history` | Append a manual history entry. |

Where `{records}` is one of:

```text
accounts, products, projects, mantis, knocks
```

All standard record routes require authentication. Account list/detail/update/history additionally apply role-aware vertical visibility. The other standard entity services require authentication but do not apply list/detail role filtering in their own routers.

The shared CRUD helper performs duplicate detection using each service's configured duplicate fields. Current Mantis and Knock ID indexes are non-unique; duplicate detection is based on the configured field combinations, not a standalone unique database constraint.

### Cases

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/cases` | Lists visible cases with optional search, pagination, and field filters. |
| `GET` | `/api/cases/linked?entityType=...&entityRecordId=...` | Lists visible cases linked to a specific account/product/project/Mantis/Knock entity. |
| `GET` | `/api/cases/{recordId}` | Fetches one visible case. |
| `POST` | `/api/cases` | Creates a case and stores provided account/product/Mantis/Knock link rows. |
| `PUT` | `/api/cases/{recordId}` | Updates a visible case, records changed fields in history, updates provided links, and may queue case update email. |
| `POST` | `/api/cases/{recordId}/history` | Appends a case comment/history entry. |
| `POST` | `/api/cases/{recordId}/watchers` | Adds a watcher to a visible case. |
| `DELETE` | `/api/cases/{recordId}/watchers?displayName=...` | Lets a watcher remove themselves from a visible case. |
| `DELETE` | `/api/cases/{recordId}` | Deletes a visible case. Requires manager or admin. |
| `GET` | `/api/cases/{recordId}/links` | Returns linked accounts, products, project, Mantis records, and knocks. |
| `POST` | `/api/cases/{recordId}/links` | Adds one account/product/Mantis/Knock link or sets the case project. |
| `DELETE` | `/api/cases/{recordId}/links/{entityType}/{entityRecordId}` | Removes one account/product/Mantis/Knock link or clears the project if it matches. |

Supported case link entity types are:

```text
account, product, project, mantis, knock
```

Accounts, products, Mantis records, and knocks are stored in `case_entity_links`. Projects are special-cased and stored in the direct `cases.project` column.

Case visibility is role-aware:

| Role | Visibility |
| --- | --- |
| `admin` | Can see all cases. |
| `manager` | Can see all cases. |
| `user` | Can see cases where their display name matches `assignedTo` or `seOwner`, cases they watch, and cases linked to accounts in their assigned vertical. |

Account visibility is also role-aware:

| Role | Visibility |
| --- | --- |
| `admin` | Can see all accounts. |
| `manager` | Can see all accounts. |
| `user` | Can see accounts in their assigned vertical. |

### Reports

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/reports/custom` | Lists current user's saved reports. |
| `GET` | `/api/reports/builder/schema` | Returns whitelisted report sources, joins, fields, and operators. |
| `POST` | `/api/reports/preview` | Runs an unsaved report query spec. |
| `POST` | `/api/reports/custom` | Saves a custom report. |
| `PUT` | `/api/reports/custom/{reportId}` | Updates a custom report. |
| `GET` | `/api/reports/custom/{reportId}/run` | Runs a saved custom report. |
| `DELETE` | `/api/reports/custom/{reportId}` | Deletes a saved custom report. |

The visual report builder accepts a safe `ReportQuerySpec` rather than raw SQL. The backend compiles the spec using a whitelist of sources, joins, fields, operators, limits, and sort options.

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
| `GET` | `/api/notifications/recent?hours=24` | Returns recent visible activity notifications from the selected time window. `hours` is clamped to 1 through 168. |
| `POST` | `/api/notifications/dismiss` | Dismisses one notification for the current user. |
| `POST` | `/api/notifications/clear-all` | Clears all current notifications for the current user. |

`MainLayout` polls recent notifications every 60 seconds while authenticated.

### Record Reads

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/record-reads` | Gets or creates the current user's read baseline and returns per-record read timestamps. |
| `POST` | `/api/record-reads/mark-read` | Marks one supported record as read for the current user. |

Supported read-state entity types:

```text
case, project, account, mantis, knock, product
```

### App Feedback

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/api/app-feedback` | Authenticated user submits feedback using multipart form data. Allows up to 5 image uploads, 5 MB each. |
| `GET` | `/api/app-feedback?limit=100` | Admin-only list of open feedback. Limit is clamped to 1 through 200. |
| `PUT` | `/api/app-feedback/{feedback_id}/done` | Admin-only mark feedback done. |
| `GET` | `/api/app-feedback/images/{image_id}` | Admin-only image download/display endpoint. |

Supported feedback categories:

```text
bug, improvement, feature
```

## 8. Data Model

### Shared Record Fields

Most non-case domain tables share these common fields:

| Field | Purpose |
| --- | --- |
| `recordId` | Human-readable primary key such as `ACC-001`, `PRD-001`, or `MANTIS-001`. |
| `moduleId` | Module identifier such as `MOD-ACCOUNT`. |
| `recordRevision` | Record revision string, currently `1.0`. |
| `metaData` | Optional free-form metadata. |
| `ownedBy` | Owner display name. |
| `createdAt`, `createdBy` | Creation audit metadata. |
| `updatedAt`, `updatedBy` | Last update audit metadata. |
| `history` | JSON audit trail shown in record detail views. |

Cases intentionally use a smaller record shape and do not inherit `BaseRecord`.

### Domain Tables

| Table | Primary Data |
| --- | --- |
| `accounts` | Account name, website, account type, vertical. |
| `products` | Product family, product name, version, URL, description. |
| `projects` | Project name, account link, dates, SE owner, closed flag, stage, SFDC fields. |
| `mantis` | Mantis description, generated Mantis URL, category, status, request date, target date. |
| `knocks` | Knock description, ID/URL, status, request date, target date. |
| `cases` | Case ID, creation date, project, category, escalation type/note, description, SE owner, assignee, priority, status, history. |
| `case_entity_links` | Many-to-many links from cases to accounts, products, Mantis records, and knocks. |
| `case_watchers` | Case watcher list. |
| `case_watcher_opt_outs` | Watcher self-removal/opt-out state. |

### User and Application State Tables

| Table | Purpose |
| --- | --- |
| `users` | Local user accounts, roles, verticals, password hashes, active flag, and login metadata. |
| `user_sessions` | Hashed bearer tokens and expiry timestamps. |
| `password_reset_tokens` | Hashed one-hour password reset tokens, expiry timestamps, optional use timestamp, and requesting IP. |
| `user_bookmarks` | Per-user saved entities. |
| `user_record_read_state` | Per-user read-state baseline timestamp. |
| `user_record_reads` | Per-user per-record last-seen timestamps. |
| `user_notification_dismissals` | Notification IDs dismissed by a user. |
| `user_notification_state` | Per-user clear-all timestamp. |
| `audit_logs` | Administrative audit records such as user creation and role changes. |
| `custom_reports` | Per-user saved report definitions. |
| `app_feedback` | User feedback records. |
| `app_feedback_images` | Uploaded feedback images stored as blobs. |

### Relationship Summary

```text
accounts.recordId
  -> projects.accountId

projects.recordId
  -> cases.project

cases.recordId
  -> case_entity_links.caseRecordId
  -> case_watchers.caseRecordId
  -> case_watcher_opt_outs.caseRecordId

accounts.recordId
  -> case_entity_links.entityRecordId where entityType = 'account'

products.recordId
  -> case_entity_links.entityRecordId where entityType = 'product'

mantis.recordId
  -> case_entity_links.entityRecordId where entityType = 'mantis'

knocks.recordId
  -> case_entity_links.entityRecordId where entityType = 'knock'

users.id
  -> user_sessions.userId
  -> password_reset_tokens.userId
  -> user_bookmarks.userId
  -> user_record_read_state.userId
  -> user_record_reads.userId
  -> user_notification_dismissals.userId
  -> user_notification_state.userId
  -> custom_reports.userId
  -> case_watchers.userId
  -> app_feedback.createdByUserId
  -> app_feedback.doneByUserId
```

Legacy case columns such as `account`, `product`, `mantisId`, and `knockId` are backfilled into `case_entity_links` and dropped by `ensure_case_link_tables()`.

## 9. Key Interaction Flows

### Login and Session Bootstrap

```text
User submits login form
  -> POST /api/auth/login
  -> backend verifies PBKDF2 password hash
  -> backend stores hashed token in user_sessions
  -> frontend stores raw token in localStorage
  -> AuthContext fetches /api/auth/me when a stored token exists
  -> RecordsContext loads accounts, products, projects, Mantis records, knocks, and visible cases
  -> RecordReadContext and BookmarksContext load user-scoped state
```

### Protected Frontend Navigation

```text
Route request
  -> ProtectedRoute checks AuthContext
  -> if loading, show loading state
  -> if unauthenticated, redirect to /login
  -> if authenticated, render MainLayout and child route
```

### Forgot Password

```text
User clicks Forgot password? on /login
  -> frontend submits email to POST /api/auth/password-reset/request
  -> backend requires SMTP configuration before issuing a reset
  -> backend creates a random reset token and stores only its SHA-256 hash
  -> backend emails APP_BASE_URL/login?resetToken=...
  -> user opens the link and submits a new password
  -> POST /api/auth/password-reset/confirm validates the token and expiry
  -> backend updates passwordHash, marks the token used, revokes sessions, and writes an audit log
```

### Record List and Detail

```text
User opens a record page
  -> page reads initialized arrays from RecordsContext
  -> global search and page filters run in the browser
  -> optional recordSlug/state opens a detail workflow
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
  -> frontend upserts/removes local record arrays and selected detail state
```

### Case Linking

```text
User links a case to an account/product/project/Mantis/Knock
  -> POST /api/cases/{recordId}/links
  -> backend validates case visibility and target entity existence
  -> account/product/Mantis/Knock links insert into case_entity_links
  -> project links update cases.project
  -> frontend refreshes linked entity lists
```

### Case Watchers and Email

```text
Case is created or updated
  -> backend automatically tracks SE owner and assignee as watchers
  -> users can add themselves or another resolved display name as a watcher
  -> users can remove themselves, creating an opt-out row
  -> if a case update changes tracked fields and SMTP is configured, a background email task notifies case owners/watchers
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
MainLayout polls every 60 seconds
  -> GET /api/notifications/recent
  -> backend builds notifications from recently updated visible records
  -> backend filters dismissed and cleared notifications per user
  -> user can dismiss one or clear all
```

### Read State

```text
Authenticated app loads
  -> GET /api/record-reads gets or creates a user baseline
  -> frontend compares record activity against last-seen timestamps
  -> user views a record
  -> POST /api/record-reads/mark-read stores lastSeenAt for that entity
```

## 10. Security and Access Control

| Area | Current Behavior |
| --- | --- |
| Password storage | Passwords are hashed with PBKDF2-HMAC-SHA512 and a per-password salt. |
| Session tokens | Login returns a random token; only a SHA-256 token hash is stored in MySQL. |
| Token TTL | Sessions expire after 7 days. |
| Token cleanup | Backend startup creates a background task that removes expired sessions plus expired/used password reset tokens immediately and then every 7 days while the backend is running. |
| Password reset tokens | Reset requests store only a SHA-256 token hash, expire after 60 minutes, are single-use, and revoke existing sessions after reset. |
| Frontend token storage | The bearer token is stored in `localStorage`. |
| Protected frontend routes | All app pages except `/login` are wrapped in `ProtectedRoute`. |
| Admin role | Admins can list users, create users, update users, reset passwords, and review app feedback. |
| Manager role | Managers share broad account/case visibility and can delete standard records/cases. |
| Account visibility | Non-admin/non-manager users only see accounts in their assigned vertical. |
| Case visibility | Non-admin/non-manager users see cases associated with their display name, watched cases, or cases linked to accounts in their assigned vertical. |
| Report visibility | Saved reports are scoped to the current user. Report execution applies case/account visibility when those sources are active. |
| Notifications | Notifications are scoped by user visibility, dismissal state, and clear-all state. |
| Bookmarks and read state | Scoped to the current user. |
| App feedback | Submission requires any authenticated user. Listing, image access, and mark-done require admin. |

Implementation note: backend route-level auth is the source of truth. Standard record create/update/history/list/detail routes require authentication; standard record deletes require manager or admin. Account and case routes add role-aware visibility filtering. Reports, bookmarks, notifications, record reads, profile/admin routes, and app feedback routes require authentication according to each route function.

## 11. Startup Hooks

The backend runs service startup hooks from `startup_services()` in `Backend/service_registry.py`:

| Service | Startup Hook | Purpose |
| --- | --- | --- |
| `authService` | `ensure_default_user` | Creates auth tables, password reset table, and the development admin user when no active admin exists. |
| `bookmarkService` | `ensure_bookmark_tables` | Ensures auth/bookmark dependencies and migrates old bookmark type names. |
| `accountService` | `ensure_account_schema` | Normalizes account type and vertical values. |
| `productService` | `ensure_product_schema` | Adds product description/version columns for older deployments. |
| `projectService` | `ensure_project_schema` | Adds and normalizes project columns and option values. |
| `mantisService` | `ensure_mantis_schema` | Migrates old NFR naming to Mantis naming and normalizes values/indexes. |
| `caseService` | `ensure_case_link_tables` | Ensures case schema, case links, watchers, indexes, foreign keys, and legacy link backfill. |
| `reportsService` | `ensure_custom_report_tables` | Ensures user-saved custom report tables and columns exist. |
| `notificationsService` | `ensure_notification_tables` | Ensures dismissal and clear-all notification tables exist. |
| `appFeedbackService` | `ensure_app_feedback_tables` | Ensures feedback and feedback image tables/columns/indexes exist. |
| `recordReadService` | `ensure_record_read_tables` | Ensures per-user read-state tables exist. |

`knockService` currently has no startup hook.

After startup hooks complete, `Backend/main.py` schedules `scheduled_auth_token_cleanup()`. It runs `cleanup_expired_auth_tokens()` once immediately and then weekly to keep `user_sessions` and `password_reset_tokens` from accumulating stale rows.

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
mysql -u root -p crm < sql/seed.sql
```

On Windows PowerShell:

```powershell
cd Backend
Get-Content .\sql\schema.sql | mysql -u root -p
Get-Content .\sql\seed.sql | mysql -u root -p crm
```

## 13. Deployment Notes

The repository includes deployment examples:

| File | Purpose |
| --- | --- |
| `deploy/apache/crm.conf` | Apache virtual host for `crm.local`, static frontend serving, SPA fallback, asset caching, and backend proxying. |
| `deploy/systemd/crm-backend.service` | systemd service running `python main.py` from `/opt/crm/Backend` as `www-data`. |

Apache proxies these backend paths to `127.0.0.1:4000`:

```text
/api
/health
/docs
/openapi.json
```

## 14. Extending the System

### Add a Standard Entity Service

1. Add a database table with the shared record fields and entity-specific columns.
2. Add Pydantic models in `Backend/schemas.py`.
3. Create `Backend/<entity>Service/router.py`.
4. Configure `EntityCrudConfig` with table name, record prefix, module ID, fields, labels, search fields, nullable fields, and duplicate fields.
5. Register the router and optional startup hook in `Backend/service_registry.py`.
6. Add a frontend API module in `Frontend/src/app/services/api/`.
7. Export the API module from `Frontend/src/app/data/apiClient.ts`.
8. Add frontend types in `Frontend/src/app/services/api/types.ts`.
9. Add frontend route/page/context support if the entity needs a dedicated screen or global record cache.

### Add a Report Builder Field

1. Add the field to the relevant `ReportSource` in `Backend/report_builder.py`.
2. Add or adjust joins if the field belongs to another table.
3. Confirm the field appears in `/api/reports/builder/schema`.
4. Use the Reports page preview to validate the compiled query.

### Add a Case Link Type

1. Decide whether the link belongs in `case_entity_links` or a direct case column.
2. Update `CASE_LINK_TARGET_TABLES`, `CASE_LINK_ENTITY_TYPES`, cleanup logic, and payload field mapping in `Backend/caseService/router.py`.
3. Add Pydantic and frontend API types for the new link payload.
4. Update the Cases detail linked-entity UI and the target entity page.
5. Update schema/startup migration logic for new tables, indexes, or legacy compatibility fields.

## 15. Troubleshooting

| Symptom | Checks |
| --- | --- |
| Frontend cannot reach API | Confirm backend is running on port `4000`. In Vite dev, `/api` should proxy to that backend; in Apache, the virtual host should proxy `/api` to `127.0.0.1:4000`. |
| Login fails on first run | Confirm MySQL is reachable and startup hooks created the default admin user. |
| `/health` says database disconnected | Check `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`. |
| Empty pages after login | Check backend logs and browser console for failed `RecordsContext` initialization calls. |
| CORS errors | Confirm frontend origin is allowed by `CORS_ORIGIN` or the local development regex. |
| Missing linked cases | Confirm `case_entity_links` exists and `ensure_case_link_tables()` ran on backend startup. |
| Missing read/unread state | Confirm `user_record_read_state` and `user_record_reads` exist and `/api/record-reads` returns data. |
| Report preview fails | Confirm requested fields are supported by `report_builder.py` and selected joins include required sources. |
| Case update emails do not send | Confirm `EMAIL_NOTIFICATIONS_ENABLED=true` and all SMTP settings are configured. |
| Forgot password email does not send | Confirm `EMAIL_NOTIFICATIONS_ENABLED=true`, all SMTP settings are configured, and `APP_BASE_URL` points to the frontend URL users can open. |
