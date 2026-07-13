# Function and Data Flow Guide

This guide explains the project in the way you would describe it to another person: what the frontend does, which backend function receives the request, and which database tables are read or changed.

The existing `SYSTEM_DOCUMENTATION.md` is the formal architecture/API reference. This file is the friendlier walkthrough.

## 1. The Big Picture

```text
User in browser
  -> React page or component
  -> frontend API service function
  -> fetchJson()
  -> /api/... HTTP request
  -> FastAPI router function
  -> shared helper function, if needed
  -> execute_query() or execute_mutation()
  -> MySQL table(s)
  -> response comes back to React
  -> React updates page state
```

The app has three main layers:

| Layer | Location | What it does |
| --- | --- | --- |
| Frontend | `Frontend/` | Displays pages, stores login state, calls backend API functions, and keeps loaded records in React context. |
| Backend | `Backend/` | Validates users, receives API requests, applies business rules, builds SQL, and returns normalized JSON. |
| Database | MySQL, schema in `Backend/sql/schema.sql` | Stores accounts, products, projects, cases, Mantis records, Knock records, users, bookmarks, reports, notifications, feedback, and read state. |

## 2. Important Vocabulary

| Term | Meaning |
| --- | --- |
| `recordId` | The app-level ID for records, such as `ACC-001`, `PRD-001`, `PRJ-001`, `MANTIS-001`, `KNOCK-001`, or `REC-001`. |
| `history` | A JSON audit trail stored on most records. It records creation, field updates, and comments. |
| `actor` | The currently logged-in user, returned by `require_auth_user()`. |
| `admin` | Can manage users and see broad data. |
| `manager` | Can see broad data and delete standard records/cases. |
| `user` / SE user | Has visibility based on assigned ownership, watch state, and vertical. |
| vertical | Account grouping such as `Commercial`, `Enterprise`, `Government`, etc. Used for visibility. |
| watcher | A user or display name attached to a case so they can see and receive updates about it. |

## 3. Startup Flow

When the backend starts:

```text
Backend/main.py
  -> creates FastAPI app
  -> configures CORS from Settings
  -> register_services(app)
  -> on startup: startup_services()
  -> each service bootstrap creates or normalizes its tables
```

Important functions:

| Function | What it does |
| --- | --- |
| `Settings` in `Backend/config.py` | Loads environment variables such as database credentials, CORS origin, port, SMTP settings, and app base URL. |
| `settings.cors_origins` | Returns allowed frontend origins. It includes configured `CORS_ORIGIN` plus local Vite origins. |
| `settings.cors_origin_regex` | Allows any localhost/127.0.0.1 Vite port in development only. |
| `register_services(app)` | Mounts every service router under `/api`. |
| `startup_services()` | Runs each service's optional bootstrap hook. For example, auth creates user tables and account/project services normalize old data. |
| `startup_bootstrap()` | FastAPI startup event that calls `startup_services()`. |
| `health_check()` | Checks database connectivity through `ping_database()` and returns `ok` or `error`. |
| `root()` | Returns API metadata and registered service names. |

## 4. Database Helper Flow

All backend services use the same database helper module.

| Function | What it does |
| --- | --- |
| `get_connection()` | Gets one MySQL connection from the connection pool. Fails if the pool was not created. |
| `_ping_database_sync()` | Runs `SELECT 1` synchronously to test the DB connection. |
| `ping_database()` | Runs `_ping_database_sync()` in a worker thread so FastAPI's async loop is not blocked. |
| `_execute_query_sync(sql, params, fetch_one)` | Runs a SELECT query, returns one row or many rows, and parses `history` JSON fields. |
| `execute_query(sql, params, fetch_one)` | Async wrapper used by routers for SELECT queries. |
| `_execute_mutation_sync(sql, params)` | Runs INSERT/UPDATE/DELETE, commits on success, rolls back on error, and returns last insert id or row count. |
| `execute_mutation(sql, params)` | Async wrapper used by routers for writes. |
| `serialize_history(history)` | Turns a Python list of history entries into a JSON string for DB storage. |
| `deserialize_history(history_str)` | Turns DB JSON text back into a Python list. Returns an empty list if invalid or empty. |
| `_generate_record_id_sync(prefix, table_name)` | Looks at the largest existing `recordId` number in a table and creates the next ID. |
| `generate_record_id(prefix, table_name)` | Async wrapper used when creating records. |

Plain English: router functions do not talk to MySQL directly. They call `execute_query()` for reads and `execute_mutation()` for writes.

## 5. Frontend Entry Flow

```text
Frontend/src/main.tsx
  -> renders <App />

App.tsx
  -> wraps the app in providers
  -> RouterProvider loads routes.tsx

routes.tsx
  -> /login is public
  -> every other route goes through ProtectedRoute and MainLayout
```

Main frontend functions:

| Function | What it does |
| --- | --- |
| `App()` | Composes app-wide providers: auth, records, read state, bookmarks, toast, search, then renders the router. |
| `PageFallback()` | Shows a spinner while lazily loaded pages download. |
| `pageElement(Page)` | Wraps a lazy page in `Suspense` with the fallback spinner. |
| `router` | Defines `/login` plus protected app routes such as `/cases`, `/accounts`, `/reports`, `/profile`, and `/feedback`. |

## 6. HTTP and Auth Flow

### Login

```text
Login page
  -> AuthContext.login(identifier, password)
  -> frontend login()
  -> POST /api/auth/login
  -> backend login()
  -> users table validates password
  -> user_sessions table stores hashed token
  -> frontend stores raw token in localStorage
```

### Every protected API call

```text
frontend service function
  -> fetchJson()
  -> getStoredToken()
  -> adds Authorization: Bearer <token>
  -> backend require_auth_user()
  -> _get_user_from_token()
  -> user_sessions + users lookup
```

Frontend auth functions:

| Function | Backend endpoint | What happens |
| --- | --- | --- |
| `login(identifier, password)` | `POST /api/auth/login` | Sends login credentials and receives `{ token, user }`. |
| `requestPasswordReset(email)` | `POST /api/auth/password-reset/request` | Requests an email reset link if SMTP is configured. |
| `resetPassword(token, password)` | `POST /api/auth/password-reset/confirm` | Uses a reset token to set a new password. |
| `getCurrentUser()` | `GET /api/auth/me` | Validates stored token and returns the logged-in user. |
| `logout()` | `POST /api/auth/logout` | Deletes the current session token from the backend. |
| `updateCurrentUser(data)` | `PUT /api/auth/me` | Updates own display name, email, or password. |
| `deleteCurrentUser()` | `DELETE /api/auth/me` | Deletes own sessions, bookmarks, and user record. |
| `listManagedUsers()` | `GET /api/auth/users` | Admin-only user list. |
| `listAssignableUsers()` | `GET /api/auth/assignees` | Users/managers available for owner/assignee dropdowns. |
| `createManagedUser(data)` | `POST /api/auth/users` | Admin creates a user. |
| `updateManagedUser(userId, data)` | `PUT /api/auth/users/{id}` | Admin updates name, email, role, or vertical. |
| `updateManagedUserRole(userId, data)` | `PUT /api/auth/users/{id}/role` | Admin updates role/vertical. |
| `updateManagedUserPassword(userId, data)` | `PUT /api/auth/users/{id}/password` | Admin resets another user's password. |

Backend auth helper functions:

| Function | What it does |
| --- | --- |
| `_hash_password(password, salt)` | Uses PBKDF2-SHA512 and a salt to store passwords safely. |
| `_verify_password(password, stored_hash)` | Recomputes a password hash and compares it securely. |
| `_hash_token(token)` | Hashes session/reset tokens before storing them in DB. |
| `_normalize_role(role)` | Converts role aliases such as `administrator` or `se_user` to `admin`, `manager`, or `user`. |
| `_normalize_vertical(vertical)` | Validates account vertical values and converts blank strings to `None`. |
| `ensure_auth_tables()` | Creates user/session/reset/bookmark/audit tables if needed and backfills newer columns. |
| `_active_admin_exists()` | Checks if there is any active admin. |
| `ensure_default_user()` | Creates or repairs the default admin account if no active admin exists. |
| `_record_audit_log(...)` | Inserts a row into `audit_logs`. |
| `_get_token_from_request(request)` | Extracts the bearer token from the Authorization header. |
| `_get_user_from_token(token)` | Looks up a valid, unexpired session and active user. |
| `require_auth_user(request)` | Requires any logged-in user or raises `401`. |
| `require_admin_user(request)` | Requires an admin or raises `403`. |
| `require_manager_or_admin_user(request)` | Requires manager/admin or raises `403`. |

Backend auth route functions:

| Function | Tables | What it does |
| --- | --- | --- |
| `request_password_reset()` | `users`, `password_reset_tokens`, `audit_logs` | Creates a one-hour reset token, emails it, and does not reveal whether an email exists. |
| `confirm_password_reset()` | `password_reset_tokens`, `users`, `user_sessions`, `audit_logs` | Validates reset token, updates password, marks token used, and revokes sessions. |
| `login()` | `users`, `user_sessions` | Finds a single matching email/display name, verifies password, creates a session token, updates last login. |
| `me()` | `user_sessions`, `users` | Returns current authenticated user. |
| `list_assignable_users()` | `users` | Returns active users/managers that can be selected in assignment fields. |
| `update_me()` | `users` | Updates own profile. Password changes require current password. |
| `delete_me()` | `user_sessions`, `user_bookmarks`, `users` | Deletes the current user's local account data. |
| `logout()` | `user_sessions` | Deletes current token hash. |
| `list_users()` | `users` | Admin user list. |
| `create_user()` | `users`, `audit_logs` | Admin creates an active user and records an audit entry. |
| `update_managed_user()` | `users`, `audit_logs` | Admin edits user profile/role/vertical. |
| `update_user_role()` | `users`, `audit_logs` | Admin role-specific update endpoint. |
| `update_user_password()` | `users`, `audit_logs` | Admin resets a user's password. |

## 7. Shared Record CRUD Flow

Accounts, products, projects, Mantis, and Knock all follow the same basic backend pattern.

```text
frontend create/update/list/delete function
  -> service router function
  -> require_auth_user() or require_manager_or_admin_user()
  -> entity_crud.py shared function
  -> database.py query/mutation helper
  -> entity table
```

Shared CRUD functions:

| Function | What it does |
| --- | --- |
| `EntityCrudConfig` | Defines the table name, record ID prefix, fields, search fields, nullable fields, unique fields, duplicate rules, and display labels for one entity type. |
| `_payload_value(data, field, default)` | Reads a value from a Pydantic model or plain dictionary. |
| `_db_value(config, data, field, default)` | Converts blank strings to `NULL` for configured nullable fields. |
| `_payload_to_update(config, data)` | Builds the field/value dictionary for an update. |
| `_history_from_record(record)` | Reads a record's history whether it is already a list or still JSON text. |
| `_canonical_duplicate_value(value)` | Normalizes values so duplicate comparison treats casing/spacing/blanks consistently. |
| `_duplicate_field_condition(field)` | Builds the SQL expression used for duplicate checking. |
| `_ensure_no_duplicate_record(config, data, record_id)` | Searches for an existing record with the same configured duplicate fields. Raises `409` if found. |
| `_ensure_unique_fields(config, data, record_id)` | Enforces configured fields that must be unique. |
| `list_entities(config, q, limit, offset)` | Lists records with optional text search and pagination. |
| `get_entity_or_404(config, record_id)` | Loads one record by `recordId`, normalizes it, or raises `404`. |
| `create_entity(config, data, actor_display_name)` | Generates a new `recordId`, stores metadata and fields, adds a Created history entry, returns the saved record. |
| `update_entity(config, record_id, data, actor_display_name)` | Compares old and new values, appends field-level history entries, updates fields, returns saved record. |
| `delete_entity(config, record_id)` | Confirms the record exists, deletes it, and returns `{ status: "deleted" }`. |
| `add_entity_history(config, record_id, entry)` | Appends a manual history/comment entry and returns the updated record. |

## 8. Standard Entity Mapping

| Frontend functions | Backend router | Backend config | Main table | Notes |
| --- | --- | --- | --- | --- |
| `listAccounts`, `createAccount`, `updateAccount`, `deleteAccount`, `addAccountHistory` | `accountService/router.py` | `ACCOUNT_CONFIG` | `accounts` | Account visibility depends on role and vertical. Deleting an account clears project account links and case account links. |
| `listProducts`, `createProduct`, `updateProduct`, `deleteProduct`, `addProductHistory` | `productService/router.py` | `PRODUCT_CONFIG` | `products` | Duplicate check uses product family/name/version. Deleting removes case product links. |
| `listProjects`, `createProject`, `updateProject`, `deleteProject`, `addProjectHistory` | `projectService/router.py` | `PROJECT_CONFIG` | `projects` | Project has direct `accountId`. Deleting a project clears `cases.project`. |
| `listMantis`, `createMantis`, `updateMantis`, `deleteMantis`, `addMantisHistory` | `mantisService/router.py` | `MANTIS_CONFIG` | `mantis` | Mantis URL is generated from `mantisId`. Old NFR naming is migrated to Mantis naming. |
| `listKnocks`, `createKnock`, `updateKnock`, `deleteKnock`, `addKnockHistory` | `knockService/router.py` | `KNOCK_CONFIG` | `knocks` | Deleting removes case Knock links. |

Standard router functions:

| Function pattern | What it does |
| --- | --- |
| `list_*()` | Requires login, applies optional search/pagination, returns normalized records. |
| `get_*()` | Requires login, gets one record by `recordId`, returns `404` if missing or hidden. |
| `create_*()` | Requires login, calls `create_entity()`, stores creator name in metadata/history. |
| `update_*()` | Requires login, calls `update_entity()`, creates history entries for changed fields. |
| `delete_*()` | Requires manager/admin, removes any dependent links, then deletes the record. |
| `add_*_history()` | Requires login and appends a comment/history item. |

Service-specific bootstrap functions:

| Function | What it does |
| --- | --- |
| `ensure_account_schema()` | Normalizes account type/vertical values. |
| `ensure_product_schema()` | Adds `description` and `productVersion` columns for older DBs. |
| `ensure_project_schema()` | Adds/normalizes project fields, converts `sfdcValue` to number, maps old stages, drops old `se` column. |
| `ensure_mantis_schema()` | Renames old `nfrs` table to `mantis`, renames NFR columns, backfills categories/statuses/URLs, and updates old links. |

## 9. Case Flow

Cases are more complex than the standard entities because they connect many other records.

### How cases link to other data

| Link type | Stored where | Why |
| --- | --- | --- |
| Case to project | `cases.project` | A case has at most one project. |
| Case to accounts | `case_entity_links` rows where `entityType = 'account'` | A case can link to multiple accounts. |
| Case to products | `case_entity_links` rows where `entityType = 'product'` | A case can link to multiple products. |
| Case to Mantis records | `case_entity_links` rows where `entityType = 'mantis'` | A case can link to multiple Mantis records. |
| Case to Knock records | `case_entity_links` rows where `entityType = 'knock'` | A case can link to multiple Knock records. |
| Case watchers | `case_watchers` | Stores people who can see or follow a case. |
| Watcher opt-outs | `case_watcher_opt_outs` | Stops automatically re-adding a watcher who removed themselves. |

### Creating a case

```text
createCase(data)
  -> POST /api/cases
  -> create_case()
  -> generate_record_id("REC", "cases")
  -> INSERT INTO cases
  -> _replace_case_links_from_data(..., replace_all=True)
  -> INSERT INTO case_entity_links for account/product/mantis/knock links
  -> _add_case_people_watchers()
  -> SELECT saved case
  -> enrich_case_record()
  -> response to frontend
```

### Updating a case

```text
updateCase(recordId, data)
  -> PUT /api/cases/{recordId}
  -> update_case()
  -> require_auth_user()
  -> get_case_or_404()
  -> _case_is_visible_to_actor()
  -> build_update_history_entries()
  -> UPDATE cases
  -> update watchers and links
  -> send_case_update_notification() in background, if SMTP configured
  -> enrich_case_record()
```

Important case helper functions:

| Function | What it does |
| --- | --- |
| `_column_exists`, `_index_exists`, `_foreign_key_exists` | Checks DB metadata before migrations. |
| `_add_index_if_missing`, `_add_column_if_missing`, `_add_foreign_key_if_missing` | Safe migration helpers. |
| `_drop_foreign_key_if_present`, `_drop_index_if_present`, `_drop_column_if_present` | Safe cleanup helpers for old schema. |
| `_blank_to_none(value)` | Converts blank strings to `None` before saving. |
| `_case_payload(data)` | Keeps only case table fields and normalizes blanks. |
| `_unique_clean_ids(values)` | Removes blanks and duplicates from linked record ID arrays. |
| `_history_from_record(record)` | Returns case history as a list. |
| `_normalize_case_created_at(value)` | Converts date-like values to `YYYY-MM-DD HH:MM`. |
| `_case_created_at_from_history(history)` | Finds a good created date from old history data. |
| `_canonical_duplicate_value(value)` | Normalizes values for duplicate checks. |
| `_clean_watcher_display_name(value)` | Removes blank or placeholder watcher names. |
| `_unique_watcher_names(values)` | Deduplicates watcher names case-insensitively. |
| `_watcher_names_from_case_record(case_record)` | Pulls likely watchers from owners, assignees, and status history. |
| `_resolve_case_watcher_identity(display_name, user_id)` | Converts a user ID/display name/email into watcher identity. |
| `_upsert_case_watcher(...)` | Inserts or refreshes one watcher and removes matching opt-out. |
| `_case_watcher_has_opted_out(...)` | Checks if someone removed themselves from the watchlist. |
| `_add_case_watcher_opt_out(...)` | Records a self-removal from the watchlist. |
| `_add_case_watcher_by_display_name(...)` | Adds a watcher by display name if valid and not opted out. |
| `_add_case_watchers_by_names(...)` | Adds several watcher names. |
| `_add_case_people_watchers(...)` | Automatically adds SE owner and assigned-to people as watchers. |
| `_backfill_case_watchers_once()` | One-time startup job that creates watcher rows from existing case data. |
| `_normalize_foreign_key_values()` | Converts blank/invalid foreign keys to `NULL`. |
| `_backfill_case_created_at()` | Fills missing case created dates from history/current timestamp. |
| `ensure_case_schema()` | Aligns `cases` table with current fields, indexes, foreign keys, and old data cleanup. |
| `drop_legacy_case_link_columns()` | Removes old one-column link fields from `cases` after backfilling links. |
| `ensure_case_link_tables()` | Creates link/watch tables, backfills old links, cleans invalid links. |
| `cleanup_case_entity_links()` | Deletes orphaned/invalid rows from `case_entity_links`. |
| `_upsert_case_entity_link(...)` | Inserts one case-to-entity link or refreshes it. |
| `_case_link_ids_from_data(data)` | Extracts account/product/mantis/knock arrays from the request. |
| `_case_link_field_was_provided(data, entity_type)` | Detects whether a link array was included in a partial update. |
| `_replace_case_links_from_data(...)` | Replaces all links on create or only provided link types on update. |
| `_current_case_link_ids(record_id)` | Reads current linked IDs from `case_entity_links`. |
| `_effective_case_link_ids(record_id, data)` | Merges incoming link arrays with existing link arrays for duplicate comparison. |
| `_ensure_no_duplicate_case(...)` | Detects duplicate cases by comparing fields and link sets. Currently present but not called by create/update. |
| `get_case_or_404(record_id)` | Loads a case row or raises `404`. |
| `enrich_case_records(case_rows)` | Adds `accountIds`, `productIds`, `mantisRecordIds`, `knockRecordIds`, and `watcherNames` to raw case rows. |
| `enrich_case_record(case_row)` | Single-record version of `enrich_case_records()`. |
| `build_case_links_payload(record_id)` | Returns full linked account/product/project/mantis/knock records for a case. |
| `build_linked_cases_payload(entity_type, entity_record_id, actor)` | Finds cases linked to a given entity and applies visibility rules. |
| `_case_visibility_clause(actor, case_alias)` | Builds SQL conditions so users only see cases they should see. |
| `_case_is_visible_to_actor(case_record, actor)` | In Python, checks if a single case is visible to the current user. |
| `_add_case_watcher(record_id, actor)` | Adds the current actor as a watcher, usually after status changes. |

Case route functions:

| Function | Endpoint | Tables | What it does |
| --- | --- | --- | --- |
| `list_cases()` | `GET /api/cases` | `cases`, `case_entity_links`, `case_watchers`, `accounts` | Lists visible cases, with search/filter support, then enriches link arrays/watchers. |
| `get_linked_cases()` | `GET /api/cases/linked` | `cases`, `case_entity_links` | Gets cases linked to one entity, such as a product or account. |
| `get_case()` | `GET /api/cases/{id}` | `cases`, link/watch tables | Loads one visible case and enriches it. |
| `create_case()` | `POST /api/cases` | `cases`, `case_entity_links`, `case_watchers` | Creates a case, stores history, saves links, and auto-adds watchers. |
| `update_case()` | `PUT /api/cases/{id}` | `cases`, `case_entity_links`, `case_watchers` | Updates fields, adds history, updates links/watchers, may email watchers. |
| `add_case_history()` | `POST /api/cases/{id}/history` | `cases` | Adds a comment/history entry. |
| `add_case_watcher()` | `POST /api/cases/{id}/watchers` | `case_watchers`, `case_watcher_opt_outs` | Adds a watcher to a visible case. |
| `remove_case_watcher()` | `DELETE /api/cases/{id}/watchers` | `case_watchers`, `case_watcher_opt_outs` | Lets a watcher remove themselves. |
| `delete_case()` | `DELETE /api/cases/{id}` | `case_entity_links`, `cases` | Manager/admin deletes a visible case and its links. |
| `get_case_links()` | `GET /api/cases/{id}/links` | all linked entity tables | Returns full records linked to the case. |
| `add_case_link()` | `POST /api/cases/{id}/links` | `cases` or `case_entity_links` | Links a case to a project or another entity. |
| `remove_case_link()` | `DELETE /api/cases/{id}/links/{type}/{entityId}` | `cases` or `case_entity_links` | Removes a project/entity link. |

## 10. Reports Flow

Reports use a safe structured query builder. The frontend never sends raw SQL.

```text
Reports page
  -> getReportBuilderSchema()
  -> user selects source/fields/filters
  -> previewReportQuery(querySpec)
  -> backend execute_report_query()
  -> whitelisted SQL generated
  -> execute_query()
  -> chart/table rows returned
```

Report route functions:

| Function | Endpoint | Tables | What it does |
| --- | --- | --- | --- |
| `ensure_custom_report_tables()` | startup | `custom_reports` | Creates saved report table and adds missing columns for old DBs. |
| `list_custom_reports()` | `GET /api/reports/custom` | `custom_reports` | Lists reports saved by the current user. |
| `get_report_builder_schema()` | `GET /api/reports/builder/schema` | none | Returns whitelisted data sources, fields, joins, and operators. |
| `preview_report()` | `POST /api/reports/preview` | selected source tables | Runs a temporary report query for preview. |
| `create_custom_report()` | `POST /api/reports/custom` | `custom_reports` | Saves a report configuration for the current user. |
| `update_custom_report()` | `PUT /api/reports/custom/{id}` | `custom_reports` | Updates saved report configuration. |
| `run_custom_report()` | `GET /api/reports/custom/{id}/run` | `custom_reports` plus source tables | Loads saved report spec and executes it. |
| `delete_custom_report()` | `DELETE /api/reports/custom/{id}` | `custom_reports` | Deletes the current user's saved report. |

Report builder functions:

| Function | What it does |
| --- | --- |
| `ReportField`, `ReportJoin`, `ReportSource` | Dataclasses describing allowed report fields, joins, and base tables. |
| `_field(...)` | Convenience helper to create a `ReportField`. |
| `build_report_schema()` | Converts backend source definitions into frontend builder metadata. |
| `build_legacy_query_spec(metric, filters)` | Converts old saved report settings into the current structured `ReportQuerySpec`. |
| `_get_source(source_key)` | Validates selected base source. |
| `_get_field(field_key)` | Validates selected field. |
| `_requested_joins(spec, required_sources)` | Adds joins required by selected fields/filters/grouping. |
| `_build_join_sql(base, joins)` | Validates join choices and builds SQL JOIN text. |
| `_validate_sources(fields, active_sources)` | Ensures selected fields only come from active joined sources. |
| `_build_filter_sql(spec, active_sources)` | Converts structured filter rules into safe SQL and parameters. |
| `_apply_case_visibility(...)` | Adds user-specific case visibility conditions to reports. |
| `_apply_account_visibility(...)` | Adds user-specific account visibility conditions when reporting directly on accounts. |
| `_limit(value)` | Clamps report result size between 1 and 500. |
| `execute_report_query(spec, actor)` | Builds and runs either table-mode SQL or aggregate summary SQL. |

## 11. Bookmarks Flow

```text
User clicks bookmark
  -> BookmarksContext.addBookmark()
  -> addUserBookmark()
  -> POST /api/bookmarks
  -> user_bookmarks upsert
```

| Function | Endpoint/table | What it does |
| --- | --- | --- |
| `BookmarksProvider()` | frontend context | Loads bookmarks after login and exposes add/remove/check helpers. |
| `addBookmark(item)` | frontend context | Optimistically adds bookmark in React state and calls backend. |
| `removeBookmark(id, type)` | frontend context | Optimistically removes bookmark in React state and calls backend. |
| `isBookmarked(id, type)` | frontend context | Checks local bookmark state. |
| `ensure_bookmark_tables()` | startup | Ensures auth tables exist and migrates old `nfr` bookmarks to `mantis`. |
| `list_bookmarks()` | `GET /api/bookmarks`, `user_bookmarks` | Returns current user's saved bookmarks. |
| `add_bookmark()` | `POST /api/bookmarks`, `user_bookmarks` | Validates type and inserts/updates one bookmark. |
| `remove_bookmark()` | `DELETE /api/bookmarks/{type}/{id}`, `user_bookmarks` | Deletes one bookmark for current user. |

## 12. Record Read State Flow

Unread rows are calculated per user.

```text
RecordReadProvider
  -> getRecordReadState()
  -> GET /api/record-reads
  -> baselineAt + per-record lastSeenAt

Opening/reading a record
  -> markRecordRead(entityType, entityId)
  -> POST /api/record-reads/mark-read
  -> user_record_reads upsert
```

| Function | What it does |
| --- | --- |
| `readKey(entityType, entityId)` | Builds a local map key like `case:REC-001`. |
| `timestampToMillis(value)` | Converts app timestamp strings to comparable numbers. |
| `RecordReadProvider()` | Loads read state after login and provides read/unread helpers. |
| `refreshRecordReadState()` | Calls backend and refreshes baseline plus per-record timestamps. |
| `isRecordUnread(entityType, entityId, activityAt)` | Compares latest activity time against last seen time. |
| `markRecordRead(entityType, entityId)` | Calls backend and updates local last-seen timestamp. |
| `ensure_record_read_tables()` | Creates `user_record_read_state` and `user_record_reads`. |
| `_normalize_entity_type(value)` | Validates supported record types. |
| `_normalize_entity_id(value)` | Rejects blank entity IDs. |
| `_get_or_create_user_read_state(user_id)` | Ensures a user has a baseline timestamp. |
| `get_record_read_state()` | Returns baseline plus all read rows for current user. |
| `mark_record_read()` | Upserts the current timestamp for one record. |

## 13. Notifications Flow

Notifications are not stored as full notification records. They are generated by querying recently updated records, then filtered by dismissal/clear state.

```text
MainLayout notification UI
  -> getRecentNotifications(hours)
  -> GET /api/notifications/recent
  -> backend queries recent cases/projects/accounts/products/mantis/knocks
  -> filters out dismissed and cleared notifications
```

| Function | What it does |
| --- | --- |
| `ensure_notification_tables()` | Creates dismissal and clear-all state tables. |
| `_normalize_timestamp(value)` | Formats notification timestamps consistently. |
| `_to_datetime(value)` | Converts timestamps for sorting/filtering. |
| `_safe_event_key(value)` | Builds a safe notification ID segment. |
| `_qualified(alias, field)` | Builds SQL field references with optional alias. |
| `_is_manager_or_admin(actor)` | Checks broad visibility role. |
| `_case_visibility_clause(actor, alias)` | SQL visibility rules for case notifications. |
| `_account_visibility_clause(actor, alias)` | SQL visibility rules for account notifications. |
| `_project_visibility_clause(actor, alias)` | SQL visibility rules for project notifications. |
| `_linked_case_visibility_clause(actor, entity_type, alias)` | Visibility for products/mantis/knocks through linked visible cases. |
| `_build_notification(...)` | Creates the frontend notification object. |
| `_summarize(value, fallback)` | Shortens long titles/descriptions. |
| `_fetch_case_notifications(...)` | Finds recent visible case updates. |
| `_fetch_project_notifications(...)` | Finds recent visible project updates. |
| `_fetch_account_notifications(...)` | Finds recent visible account updates. |
| `_fetch_product_notifications(...)` | Finds recent visible product updates. |
| `_fetch_mantis_notifications(...)` | Finds recent visible Mantis updates. |
| `_fetch_knock_notifications(...)` | Finds recent visible Knock updates. |
| `_dismissed_notification_ids(user_id)` | Reads notification IDs the user dismissed. |
| `_last_cleared_at(user_id)` | Reads user's clear-all timestamp. |
| `get_recent_notifications()` | Builds, filters, sorts, and returns at most 20 notifications. |
| `dismiss_notification()` | Stores one dismissed notification ID. |
| `clear_all_notifications()` | Stores a timestamp so older notifications stay hidden. |

## 14. App Feedback Flow

```text
Feedback page
  -> submitAppFeedback(form data)
  -> POST /api/app-feedback
  -> app_feedback row inserted
  -> optional app_feedback_images rows inserted

Admin feedback review
  -> listAppFeedback()
  -> GET /api/app-feedback
  -> markAppFeedbackDone(id)
  -> PUT /api/app-feedback/{id}/done
```

| Function | What it does |
| --- | --- |
| `submitAppFeedback(data)` | Builds `FormData` with category/title/description/images and posts it. |
| `listAppFeedback()` | Admin fetches open feedback. |
| `markAppFeedbackDone(feedbackId)` | Admin marks feedback done. |
| `fetchAppFeedbackImage(imageId)` | Fetches image blob with bearer token. |
| `ensure_app_feedback_tables()` | Creates feedback and feedback image tables and adds newer columns/indexes. |
| `_format_timestamp(value)` | Formats feedback timestamps. |
| `_get_images_for_feedback(feedback_ids)` | Gets image metadata grouped by feedback ID. |
| `_build_feedback_record(feedback_id)` | Loads one feedback row plus image metadata. |
| `create_app_feedback()` | Validates category/title/description/images, stores feedback, stores image blobs, returns saved record. |
| `list_app_feedback()` | Admin-only list of open feedback records. |
| `mark_app_feedback_done()` | Admin-only status update to `done`. |
| `get_app_feedback_image()` | Admin-only image download/inline response. |

## 15. Email Notification Flow

Emails are optional and only work when SMTP settings are fully configured.

| Function | What it does |
| --- | --- |
| `_clean_text(value)` | Converts values to trimmed strings. |
| `_normalize_email(value)` | Lowercases/cleans email values. |
| `_looks_like_email(value)` | Simple email shape check. |
| `_case_public_id(record_id)` | Converts `REC-001` to display ID `CASE-001`. |
| `_case_url(record_id)` | Builds a frontend case URL using `APP_BASE_URL`. |
| `_smtp_configured()` | Checks all required SMTP settings. |
| `is_smtp_configured()` | Public wrapper used by password reset. |
| `_fetch_case_recipients(case_record)` | Finds owner/assignee/watcher email addresses. |
| `_format_changes(changes)` | Creates readable bullet lines for changed fields. |
| `_build_case_update_message(...)` | Builds the case-update email body. |
| `_password_reset_url(token)` | Builds reset URL for login page. |
| `_build_password_reset_message(...)` | Builds password-reset email body. |
| `_send_message(message)` | Sends one email through SMTP. |
| `send_case_update_notification(...)` | Background task used after case updates. |
| `send_password_reset_email(...)` | Sends password reset email or raises if sending fails. |

## 16. Frontend State and Helper Functions

### Context providers

| Function | What it does |
| --- | --- |
| `AuthProvider()` | Owns current token/user/loading state. Bootstraps user from stored token. Provides login/logout. |
| `useAuth()` | Gives components access to auth state. Throws if used outside provider. |
| `RecordsProvider()` | Loads accounts/products/projects/mantis/knocks/cases after login and stores them in memory. |
| `refreshRecords()` | Loads all main record types in parallel. |
| `upsertByRecordId()` | Replaces a record in local state or prepends it if new. |
| `removeByRecordId()` | Removes a record from local state. |
| `useRecords()` | Gives pages access to loaded records and lookup helpers. |
| `SearchProvider()` | Stores global search text. |
| `useSearch()` | Gives components access to global search state. |
| `ToastProvider()` | Displays temporary success/error messages. |
| `showToast(message, type)` | Shows one toast for five seconds. |
| `useToast()` | Gives components access to `showToast()`. |

### Hooks

| Function | What it does |
| --- | --- |
| `useRoutedEntityDetail(...)` | Keeps list/detail pages in sync with route params and navigation state. Tracks selected record, edit mode, edited record, active tab, and back behavior. |
| `useLinkedCases(...)` | Loads cases linked to an entity, calculates available cases, and exposes link/unlink actions. |
| `useRecordComments(...)` | Handles comment/reply text state, calls the correct `addHistory` API, and updates selected/local records. |
| `getNextSortConfig(current, key)` | Cycles table sort through ascending, descending, and off. |
| `useStoredColumnKeys(storageKey, defaultKeys)` | Persists visible table columns in `localStorage`. |
| `toggleColumnKey(currentKeys, key, defaultKeys)` | Shows/hides a column while preventing all columns from being hidden. |
| `compareValues(aValue, bValue, direction)` | Generic table sort comparator. |

### Utility functions

| Function | What it does |
| --- | --- |
| `formatTimestampMinute(value)` | Formats dates as `YYYY-MM-DD HH:MM`. |
| `normalizeApiTimestamps(value)` | Recursively trims seconds from API timestamp strings. Used by `fetchJson()`. |
| `formatHistoryEntryText(entry)` | Returns readable history text, especially for field changes. |
| `parseHistoryTime(entry)` | Parses a history timestamp for sorting. |
| `sortHistoryEntries(history, direction)` | Sorts history entries while preserving stable order for ties. |
| `getHistoryActionBadgeClass(action)` | Returns CSS classes for history action badges. |
| `parseQuotedReply(changes)` | Parses stored quoted-reply text back into structured pieces. |
| `formatQuotedReplyChanges(entry, replyBody)` | Stores replies with a quote header and body. |
| `getHistoryEntryReplyKey(entry)` | Builds a matching key for reply grouping. |
| `getQuotedReplyTargetKey(entry)` | Finds which history entry a reply targets. |
| `isGroupableHistoryUpdateEntry(entry)` | Detects field-change update entries that can be grouped. |
| `getHistoryUpdateGroupKey(entry)` | Groups related update entries by batch/timestamp/user. |
| `groupAdjacentHistoryUpdateEntries(entries)` | Groups consecutive field updates for cleaner display. |
| `splitQuotedReplyHistoryEntries(history)` | Separates base history entries from reply entries. |
| `getReplyEntriesForHistoryEntries(entries, replyMap)` | Finds replies attached to displayed entries. |
| `getRecordActivityTimestamp(record)` | Uses `updatedAt` when present, otherwise latest history timestamp. |
| `unreadRowClassName(isUnread)` | Returns row CSS class for unread/read table rows. |
| `isActiveAssignableUser(user)` | Checks assignable user active flag. |
| `isSeUserRole(role)` | Recognizes SE user role names. |
| `isManagerRole(role)` | Recognizes manager role names. |
| `isSeOwnerRole(role)` | True for users/managers that can be SE owners. |
| `toAssignableUserOption(user)` | Converts backend user to dropdown option. |
| `getRelatedCaseLabelParts(case, accounts, projects)` | Builds account/project/description labels for case dropdowns. |
| `formatRelatedCaseOption(case, accounts, projects)` | Creates one readable dropdown label for a case. |
| `exportRowsToCsv(filenamePrefix, rows, columns)` | Builds a CSV file in the browser and downloads it. |
| `normalizeUsdIntegerInput(value)` | Removes non-digits from currency input. |
| `parseUsdIntegerInput(value)` | Parses cleaned currency input into a number or `null`. |
| `formatUsdInteger(value)` | Formats numeric values as whole-dollar USD. |
| `findDuplicateProduct(products, input, excludeRecordId)` | Frontend pre-check for duplicate product family/name/version. |
| `productFieldSuggestions(products, field, excludeRecordId)` | Builds unique sorted product suggestions. |
| `fieldSuggestions(records, field, excludeRecordId)` | Generic unique sorted suggestions for typeahead fields. |

## 17. Main Frontend API to Backend to Database Map

| Frontend API function | Backend endpoint | Backend function | Main database tables |
| --- | --- | --- | --- |
| `login` | `POST /api/auth/login` | `login()` | `users`, `user_sessions` |
| `getCurrentUser` | `GET /api/auth/me` | `me()` | `user_sessions`, `users` |
| `logout` | `POST /api/auth/logout` | `logout()` | `user_sessions` |
| `listAccounts` | `GET /api/accounts` | `list_accounts()` | `accounts` |
| `createAccount` | `POST /api/accounts` | `create_account()` | `accounts` |
| `updateAccount` | `PUT /api/accounts/{id}` | `update_account()` | `accounts` |
| `deleteAccount` | `DELETE /api/accounts/{id}` | `delete_account()` | `accounts`, `projects`, `case_entity_links` |
| `listProducts` | `GET /api/products` | `list_products()` | `products` |
| `createProduct` | `POST /api/products` | `create_product()` | `products` |
| `updateProduct` | `PUT /api/products/{id}` | `update_product()` | `products` |
| `deleteProduct` | `DELETE /api/products/{id}` | `delete_product()` | `products`, `case_entity_links` |
| `listProjects` | `GET /api/projects` | `list_projects()` | `projects` |
| `createProject` | `POST /api/projects` | `create_project()` | `projects` |
| `updateProject` | `PUT /api/projects/{id}` | `update_project()` | `projects` |
| `deleteProject` | `DELETE /api/projects/{id}` | `delete_project()` | `projects`, `cases` |
| `listMantis` | `GET /api/mantis` | `list_mantis()` | `mantis` |
| `createMantis` | `POST /api/mantis` | `create_mantis()` | `mantis` |
| `updateMantis` | `PUT /api/mantis/{id}` | `update_mantis()` | `mantis` |
| `deleteMantis` | `DELETE /api/mantis/{id}` | `delete_mantis()` | `mantis`, `case_entity_links` |
| `listKnocks` | `GET /api/knocks` | `list_knocks()` | `knocks` |
| `createKnock` | `POST /api/knocks` | `create_knock()` | `knocks` |
| `updateKnock` | `PUT /api/knocks/{id}` | `update_knock()` | `knocks` |
| `deleteKnock` | `DELETE /api/knocks/{id}` | `delete_knock()` | `knocks`, `case_entity_links` |
| `listCases` | `GET /api/cases` | `list_cases()` | `cases`, `case_entity_links`, `case_watchers`, `accounts` |
| `createCase` | `POST /api/cases` | `create_case()` | `cases`, `case_entity_links`, `case_watchers` |
| `updateCase` | `PUT /api/cases/{id}` | `update_case()` | `cases`, `case_entity_links`, `case_watchers` |
| `deleteCase` | `DELETE /api/cases/{id}` | `delete_case()` | `cases`, `case_entity_links` |
| `getCaseLinks` | `GET /api/cases/{id}/links` | `get_case_links()` | all linked entity tables |
| `getLinkedCasesByEntity` | `GET /api/cases/linked` | `get_linked_cases()` | `cases`, `case_entity_links` |
| `addCaseLink` | `POST /api/cases/{id}/links` | `add_case_link()` | `cases` or `case_entity_links` |
| `removeCaseLink` | `DELETE /api/cases/{id}/links/{type}/{entityId}` | `remove_case_link()` | `cases` or `case_entity_links` |
| `addCaseWatcher` | `POST /api/cases/{id}/watchers` | `add_case_watcher()` | `case_watchers`, `case_watcher_opt_outs` |
| `removeCaseWatcher` | `DELETE /api/cases/{id}/watchers` | `remove_case_watcher()` | `case_watchers`, `case_watcher_opt_outs` |
| `getCustomReports` | `GET /api/reports/custom` | `list_custom_reports()` | `custom_reports` |
| `getReportBuilderSchema` | `GET /api/reports/builder/schema` | `get_report_builder_schema()` | none |
| `previewReportQuery` | `POST /api/reports/preview` | `preview_report()` | selected report tables |
| `runCustomReport` | `GET /api/reports/custom/{id}/run` | `run_custom_report()` | `custom_reports`, selected report tables |
| `createCustomReport` | `POST /api/reports/custom` | `create_custom_report()` | `custom_reports` |
| `updateCustomReport` | `PUT /api/reports/custom/{id}` | `update_custom_report()` | `custom_reports` |
| `deleteCustomReport` | `DELETE /api/reports/custom/{id}` | `delete_custom_report()` | `custom_reports` |
| `getUserBookmarks` | `GET /api/bookmarks` | `list_bookmarks()` | `user_bookmarks` |
| `addUserBookmark` | `POST /api/bookmarks` | `add_bookmark()` | `user_bookmarks` |
| `removeUserBookmark` | `DELETE /api/bookmarks/{type}/{id}` | `remove_bookmark()` | `user_bookmarks` |
| `getRecordReadState` | `GET /api/record-reads` | `get_record_read_state()` | `user_record_read_state`, `user_record_reads` |
| `markRecordRead` | `POST /api/record-reads/mark-read` | `mark_record_read()` | `user_record_reads`, `user_record_read_state` |
| `getRecentNotifications` | `GET /api/notifications/recent` | `get_recent_notifications()` | domain tables, `user_notification_dismissals`, `user_notification_state` |
| `dismissNotification` | `POST /api/notifications/dismiss` | `dismiss_notification()` | `user_notification_dismissals` |
| `clearAllNotifications` | `POST /api/notifications/clear-all` | `clear_all_notifications()` | `user_notification_state` |
| `submitAppFeedback` | `POST /api/app-feedback` | `create_app_feedback()` | `app_feedback`, `app_feedback_images` |
| `listAppFeedback` | `GET /api/app-feedback` | `list_app_feedback()` | `app_feedback`, `app_feedback_images` |
| `markAppFeedbackDone` | `PUT /api/app-feedback/{id}/done` | `mark_app_feedback_done()` | `app_feedback` |
| `fetchAppFeedbackImage` | `GET /api/app-feedback/images/{id}` | `get_app_feedback_image()` | `app_feedback_images` |

## 18. Database Tables in Plain English

| Table | Stores |
| --- | --- |
| `accounts` | Customer/distributor/reseller accounts and verticals. |
| `products` | Product family/name/version/URL/description. |
| `projects` | Projects, account link, owner, stage, SFDC fields, closed state. |
| `mantis` | Mantis bug/request records, category, status, dates, URL. |
| `knocks` | Knock feature request records, status, dates, URL. |
| `cases` | Case fields such as description, project, owner, assignee, priority, status, history. |
| `case_entity_links` | Many-to-many links from cases to accounts/products/mantis/knocks. |
| `case_watchers` | People watching cases. |
| `case_watcher_opt_outs` | Watchers who removed themselves and should not be auto-added back. |
| `users` | Login accounts, display names, roles, verticals, password hashes. |
| `user_sessions` | Hashed login tokens and expiry times. |
| `password_reset_tokens` | Hashed reset tokens and expiry/used state. |
| `user_bookmarks` | Per-user saved records. |
| `user_record_read_state` | Per-user unread baseline timestamp. |
| `user_record_reads` | Per-user last-seen timestamp for each record. |
| `user_notification_dismissals` | Notification IDs dismissed by a user. |
| `user_notification_state` | User clear-all timestamp for notifications. |
| `audit_logs` | Admin/security activity such as user creation/password reset. |
| `custom_reports` | Per-user report builder configurations. |
| `app_feedback` | Feedback submitted from the app. |
| `app_feedback_images` | Uploaded feedback screenshots/images as blobs. |

## 19. The Short Explanation You Can Give Someone

This app is a React frontend connected to a FastAPI backend and MySQL database. The frontend does not access the database directly. It calls typed API functions like `createCase()` or `listAccounts()`, and those all go through `fetchJson()`, which attaches the user's bearer token.

The backend receives those `/api/...` requests through service routers. Each router checks the user with `require_auth_user()` or a stricter role helper, applies visibility/business rules, then reads or writes MySQL through `execute_query()` and `execute_mutation()`.

Most record types use the shared `entity_crud.py` functions, so accounts/products/projects/Mantis/Knock all behave consistently: list, get, create, update, delete, and add history. Cases are more custom because they link to projects directly and link to accounts/products/Mantis/Knock through `case_entity_links`. Cases also manage watchers, visibility, history, and optional email notifications.

Reports are safe because the frontend sends a structured report definition, not SQL. The backend report builder only allows whitelisted tables, fields, joins, and filters before it generates SQL.

User-specific features such as bookmarks, unread rows, notifications, saved reports, and app feedback each have small dedicated tables keyed by the logged-in user.
