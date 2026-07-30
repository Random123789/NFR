# CRM Beginner Guide

This is the plain-English guide for newcomers. It explains what the application does, how information moves through it, and where a developer would make common changes.

This file does not replace any README. The existing README files remain the setup and deployment references. Use this guide when you need to understand the app before editing it.

Maintenance note: edit this Markdown file as the source of truth. After editing, regenerate `BEGINNER_GUIDE_FOR_NEWCOMERS.docx` from the repository root with `python tools/build_docx_from_markdown.py BEGINNER_GUIDE_FOR_NEWCOMERS.md BEGINNER_GUIDE_FOR_NEWCOMERS.docx`.

Audit note: the descriptions and examples below were checked against the current frontend, backend, database schema, and deployment files on 30 July 2026. If the code changes later, treat the code as the final source of truth and update this guide with it.

## Who this guide is for

- A developer who is new to this codebase.
- A teammate who knows basic coding but needs a simple map of where things live.
- A non-coder who wants to understand what happens after a user clicks a button.
- Someone making small changes such as dropdown values, help text, report fields, or page fields.

You do not need to understand every code sample. Read the explanations and flow diagrams first. The later examples are for people who are ready to make a change.

## The app in one minute

The app is a CRM and case-management system. Users log in, then manage accounts, products, projects, cases, Mantis records, Knock requests, reports, bookmarks, notifications, read/unread state, users, and app feedback.

There are three main parts:

| Part | Location | Simple meaning |
| --- | --- | --- |
| Frontend | `Frontend/` | The browser app. It shows pages, forms, tables, buttons, charts, and detail screens. |
| Backend | `Backend/` | The API server. It checks login, validates data, applies rules, and talks to MySQL. |
| Database | MySQL, schema in `Backend/sql/schema.sql` | The stored data: users, cases, accounts, products, reports, etc. |

The normal flow looks like this:

```text
User clicks something in the browser
  -> React page or component handles the click
  -> frontend API service calls fetchJson()
  -> browser sends HTTP request to /api/...
  -> FastAPI backend router receives it
  -> backend checks the logged-in user
  -> backend reads or writes MySQL
  -> JSON comes back to the frontend
  -> React updates the page
```

## Important vocabulary

| Word | Meaning |
| --- | --- |
| Frontend | The part that runs in the browser and draws what the user sees. This project uses React and TypeScript. |
| Backend | The part that receives requests, checks permissions and data, and works with the database. This project uses FastAPI and Python. |
| Database | The long-term storage for the application. This project uses MySQL. Closing the browser does not remove these records. |
| `recordId` | The app's public ID for a record, such as `ACC-001`, `PRD-001`, `PRJ-001`, `MANTIS-001`, `KNOCK-001`, or `REC-001`. |
| API | A backend URL that the frontend calls, such as `/api/cases`. |
| Router | A backend file that defines API endpoints. Example: `Backend/caseService/router.py`. |
| Schema / model | A data shape. Backend models live in `Backend/schemas.py`; frontend TypeScript types live in `Frontend/src/app/services/api/types.ts`. |
| Context | A React provider that stores shared app state, such as the current user or loaded records. |
| JSON | A text format used to send structured information between the frontend and backend. |
| Payload | The information sent with an API request. For example, a new product payload contains its name, family, version, URL, and description. |
| Migration | A database change that brings an existing installation up to date without recreating the whole database. |
| History | An audit trail on records showing creation, edits, comments, and field changes. |
| UAT | A separate test deployment that should not share the production database, backend port, app directory, or Apache site. |

## What users see

After login, the browser route decides which page to show. These are the main areas defined in `Frontend/src/app/routes.tsx`:

| Screen | What it is for |
| --- | --- |
| Home | A role-aware summary of active work. The `manager` role receives a manager-focused dashboard; `user` and `admin` currently receive the SE-focused dashboard. |
| Cases | Tracks a piece of customer work or an escalation and links it to related records. |
| Accounts | Stores customer, distributor, and reseller organizations. |
| Projects | Stores customer projects, dates, ownership, stage, and SFDC details. |
| Products | Stores the Fortinet product catalog used elsewhere in the app. |
| Mantis | Tracks Mantis issues, categories, statuses, and dates. The URL is generated from the Mantis ID. |
| Knock | Tracks Knock feature requests. The URL is generated in the frontend from the Knock ID. |
| Reports | Builds and saves reports from approved data sources and fields. |
| Bookmarked | Shows records saved by the current user. |
| Backlog | Shows records the current user has acted on and highlights later activity by other users. Acknowledge/delete choices are stored in that browser. |
| Feedback | Lets any logged-in user submit app feedback; administrators can review open items and mark them done. |
| Profile | Lets a user update their profile or password. Administrators also manage other user accounts here. |

## Roles and record visibility

The code recognizes three roles. A role controls permissions; it is not just a label on the screen.

| Role | Main access rules in the current code |
| --- | --- |
| SE user (`user`) | Can use the application and create or edit records. Account lists are limited to the user's assigned vertical. Case lists are limited to cases where the user is the SE owner, assignee, a watcher, or shares the vertical of a linked account. |
| Manager (`manager`) | Can see all accounts and cases and can delete normal business records. |
| Administrator (`admin`) | Has manager-level record access and can also create/update users, reset other users' passwords, and review app feedback. |

Project, product, Mantis, and Knock list endpoints currently return all matching records to any logged-in user. Reports restrict case data by owner, assignee, or linked-account vertical and restrict direct account data by vertical, but report execution does not currently include watcher-only case access. Notification results apply the fuller role-aware visibility rules, including watchers.

If two people see different accounts, cases, or notifications, check their role, display name, vertical, case ownership, assignment, and watcher status before assuming data is missing. For reports, watcher-only access is not currently included.

## Folder map

| Path | What to look for there |
| --- | --- |
| `Frontend/src/main.tsx` | Starts the React app. |
| `Frontend/src/app/App.tsx` | Wraps the app in providers such as auth, records, bookmarks, and search. |
| `Frontend/src/app/routes.tsx` | Defines the pages and protected routes. |
| `Frontend/src/app/pages/` | Main screens: Cases, Accounts, Products, Reports, Profile, etc. |
| `Frontend/src/app/components/` | Shared UI parts, such as dialogs, detail tabs, history timelines, selectors, and page guides. |
| `Frontend/src/app/context/` | Shared frontend state: auth, records, bookmarks, read state, search, toast messages. |
| `Frontend/src/app/services/api/` | Frontend functions that call the backend. Example: `createCase()` calls `/api/cases`. |
| `Frontend/src/app/data/` | Shared frontend lists and labels, such as dropdown options and page guide text. |
| `Backend/main.py` | Starts the FastAPI app and exposes `/`, `/health`, and `/docs`. |
| `Backend/service_registry.py` | Registers all backend service routers under `/api`. |
| `Backend/*Service/router.py` | API endpoints for one feature area. Example: cases, products, reports, auth. |
| `Backend/entity_crud.py` | Shared create/read/update/delete helper for normal record types. |
| `Backend/schemas.py` | Backend request and response models. |
| `Backend/database.py` | MySQL connection pool and query helpers. |
| `Backend/report_builder.py` | Safe report builder SQL compiler. |
| `Backend/sql/schema.sql` | Database table definitions. |
| `deploy/apache/crm.conf` | Example Apache config for production. |
| `deploy/systemd/crm-backend.service` | Example backend systemd service. |

## How login works

The frontend stores a bearer token in browser `localStorage`. Every protected API call sends:

```text
Authorization: Bearer <token>
```

The backend hashes tokens before storing them in MySQL. Route functions call helpers such as:

| Helper | Meaning |
| --- | --- |
| `require_auth_user()` | User must be logged in. |
| `require_admin_user()` | User must be an admin. |
| `require_manager_or_admin_user()` | User must be a manager or admin. |

When the backend starts and cannot find any active administrator, it creates or reactivates this development administrator:

```text
Email: admin@local
Password: Admin123!
```

If an active administrator already exists, the backend leaves this default account alone. Change the default password immediately if the setup is used for anything beyond local testing.

## Main features in simple terms

### Accounts, products, projects, Mantis, and Knock

These are standard record types. They mostly use the shared backend helper in `Backend/entity_crud.py`.

That means they all follow a familiar pattern:

```text
list records
get one record
create record
update record
delete record
add history/comment
```

Their backend routers configure the shared helper with table names, fields, labels, search fields, and duplicate rules.

Example: product records are configured in `Backend/productService/router.py` as `PRODUCT_CONFIG`.

Any logged-in user can create or edit these records. Deletion endpoints require a manager or administrator. Accounts add an extra vertical-based visibility check for SE users.

### Cases

Cases are more custom because they connect to many other records.

| Relationship | Stored in |
| --- | --- |
| Case to project | `cases.project` column |
| Case to accounts | `case_entity_links` table |
| Case to products | `case_entity_links` table |
| Case to Mantis records | `case_entity_links` table |
| Case to Knock records | `case_entity_links` table |
| Case watchers | `case_watchers` table |

Cases also handle visibility rules, watchers, history entries, optional email notifications, and linked record lists.

### Reports

Reports do not accept raw SQL from the browser. The frontend sends a structured report definition. The backend checks it against a whitelist in `Backend/report_builder.py`, then creates SQL safely.

This is why adding a report field usually means editing `SOURCE_DEFS` in `Backend/report_builder.py`, not writing custom SQL in the frontend.

Saved reports belong to the user who created them. For an SE user, case reports include cases where they are the owner or assignee or where a linked account shares their vertical; watcher-only case access is not currently included. Direct account reports are limited to the user's vertical.

### Bookmarks, unread rows, and notifications

These are user-specific features.

| Feature | Main idea |
| --- | --- |
| Bookmarks | Stores records a user saved. |
| Read state | Stores what a user has already seen. |
| Notifications | Builds a list from recent record activity, then hides dismissed or cleared items per user. Notification items themselves are not stored as a permanent master list. |

Backlog is separate from read state. It examines record history for actions by the current user, flags later actions by other people, and stores its Acknowledge/Delete choices in browser `localStorage` rather than MySQL.

### App feedback

Any logged-in user can submit feedback. Admins can review open feedback, inspect uploaded images, and mark items as done.

Uploaded feedback images are stored in MySQL. The backend currently accepts up to five image files per feedback item, with a maximum size of 5 MB per image.

## Running the app locally

You can skip this section if you only want to understand the application. To run it, you need MySQL, Python 3.10 or newer, and Node.js/npm installed. The Ubuntu deployment guides use Node.js 20 or newer. The formal setup instructions and platform-specific deployment details remain in the README files.

The backend reads its settings from `Backend/.env`. Important defaults are MySQL on `localhost:3306`, database `crm`, backend port `4000`, and frontend origin `http://localhost:5173`. If your MySQL username or password is different, update `Backend/.env` before starting the backend. Do not commit real passwords.

### 1. Prepare MySQL

The schema creates the `crm` database and its tables. The seed file adds sample business records.

Windows PowerShell, from the repository root:

```powershell
Get-Content .\Backend\sql\schema.sql | mysql -u root -p
Get-Content .\Backend\sql\seed.sql | mysql -u root -p crm
```

Linux or macOS shell, from the repository root:

```bash
mysql -u root -p < Backend/sql/schema.sql
mysql -u root -p crm < Backend/sql/seed.sql
```

The `-p` flag asks MySQL for the password interactively; the password is not the letter `p`.

Treat `schema.sql` as the fresh-install bootstrap. It contains standalone index and foreign-key creation statements, so repeatedly importing it into an already initialized database can fail on objects that already exist. For an existing installation, use the service startup migrations or a targeted migration for the change being deployed.

### 2. Start the backend

Windows PowerShell:

```powershell
cd Backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python main.py
```

Linux or macOS shell:

```bash
cd Backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 main.py
```

The backend startup hooks create supporting tables, migrate certain older columns, and ensure an active administrator exists. They do not replace the initial schema import.

Expected backend addresses:

```text
Application: http://localhost:4000
Health check: http://localhost:4000/health
Interactive API documentation: http://localhost:4000/docs
```

The health response should say `"status": "ok"` and `"database": "connected"`. If it says disconnected, check MySQL and the `DB_*` settings in `Backend/.env`.

### 3. Start the frontend

Open a second terminal at the repository root:

```bash
cd Frontend
npm install
npm run dev
```

Expected frontend:

```text
http://localhost:5173
```

During local development, Vite proxies `/api` to the backend on port `4000`.

## Email Notification Settings

Cmd into the backend directory, then nano the .env file
In a new section below CORS_ORIGIN, write the following and fill in the blanks:
APP_BASE_URL=
EMAIL_NOTIFICATIONS_ENABLED=true
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USE_STARTTLS=true
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=
SMTP_FROM_NAME=NFR CRM


`SMTP_USERNAME`, `SMTP_PASSWORD`, and `SMTP_FROM_EMAIL` must all be filled for email delivery to be considered configured. `APP_BASE_URL` should be the frontend address that recipients can open. Case-update emails are skipped when SMTP is incomplete; the forgot-password request returns a configuration error instead of creating a usable reset flow.

## Before you edit

Use this checklist before touching code:

- Know which layer you are changing: frontend, backend, database, or all three.
- Search first with `rg`, for example `rg "casePriorities"`.
- If a value is validated in both TypeScript and Python, update both.
- If you add a database column, update both the initial schema for new installations and the service startup migration hook for existing installations.
- Follow the same field all the way through: database, backend model/config, frontend type, form state, request payload, and display.
- Run a frontend build after TypeScript changes: `npm run build` from `Frontend/`.
- At minimum, compile the backend after Python changes: `python -m compileall -q -x ".venv" Backend` from the repository root. Excluding `.venv` avoids compiling installed third-party packages.
- Restart the backend after changing Python; Vite normally reloads frontend changes automatically.
- Test the actual screen you changed in the browser.

## Example 1: Add a new Case priority

Goal: Add a new priority named `Critical`.

This is a good beginner change because the database column is plain text, but the app still validates allowed values in both frontend and backend code.

Step 1: Update the dropdown list.

File: `Frontend/src/app/data/caseOptions.ts`

```ts
export const casePriorities: CasePriority[] = ["Low", "Medium", "High", "Critical"];
```

Step 2: Update the frontend TypeScript type.

File: `Frontend/src/app/services/api/types.ts`

```ts
export type CasePriority = 'Low' | 'Medium' | 'High' | 'Critical';
```

Step 3: Update the backend Pydantic validation.

File: `Backend/schemas.py`

```python
CasePriority = Literal["Low", "Medium", "High", "Critical"]
```

Step 4: Add a badge color if you want it to look intentional in the UI.

File: `Frontend/src/app/data/recordStyles.ts`

Add this line inside `casePriorityColors`:

```ts
Critical: "bg-red-100 text-red-800",
```

Step 5: Test it.

```bash
python -m compileall -q -x ".venv" Backend
cd Frontend
npm run build
```

Restart the backend so the changed Python model is loaded. Then open the app, create or edit a case, and confirm `Critical` appears, saves, and still appears after reloading the page.

Common mistake: only editing the frontend dropdown. If the backend type is not updated, the browser may show the new option but the API can reject the save.

### AI prompt (alternative to the manual steps)

Copy and paste this prompt into an AI coding assistant that has access to this repository:

```text
Add a new Case priority named "Critical" throughout this application. Inspect the current code before editing, then update the Case priority dropdown options, the frontend TypeScript CasePriority type, the backend Pydantic CasePriority validation, and the priority badge colors. Add an appropriate red badge style for Critical and preserve every existing priority and behavior. Run the backend compile check and the frontend build when finished. Then summarize the files changed and tell me how to confirm that Critical appears, saves, and remains after a page reload.
```

## Example 2: Edit the page help guide text

Goal: Change the guided tips shown on a page.

File: `Frontend/src/app/data/pageGuides.ts`

Each page has a list of guide steps:

```ts
export const productGuideSteps: PageGuideStep[] = [
  {
    targetId: "products-intro",
    title: "Product catalog",
    description: "Products keep the Fortinet catalog available for linking to cases and customer work.",
  },
];
```

Change the `title` or `description` text.

Important rule: `targetId` must match a `data-guide-id` in the page component. For products, the page is `Frontend/src/app/pages/Product.tsx`.

Example target in the page:

```tsx
<div data-guide-id="products-intro">
```

If the `targetId` does not match, the guide step will not point at the right screen area.

Test with:

```bash
cd Frontend
npm run build
```

Then open the page and launch the guide.

### AI prompt (alternative to the manual steps)

Replace the bracketed details, then copy and paste this prompt into an AI coding assistant that has access to this repository:

```text
Update the in-app page guide for [PAGE NAME]. Change the guide step titled "[CURRENT TITLE]" so its title is "[NEW TITLE]" and its description is "[NEW DESCRIPTION]". Inspect Frontend/src/app/data/pageGuides.ts and the matching page component before editing. Keep the existing targetId unless it is incorrect; verify that it exactly matches a data-guide-id on the intended screen element. Do not change guide text for other pages. Run the frontend build when finished, summarize the change, and tell me how to check the updated guide in the browser.
```

## Example 3: Add a field to the report builder

Goal: Let Reports use the Knock URL field.

The `knocks` table already has a `knockUrl` column, but the report builder only exposes fields listed in `Backend/report_builder.py`.

File: `Backend/report_builder.py`

Find the `knocks` entry in `SOURCE_DEFS`. Inside its existing `fields=(...)` tuple, add this one line after the `knockId` field:

```python
_field("knocks", "k", "knockUrl", "Knock URL"),
```

Do not replace the whole `knocks` block with a shortened example. Keep its existing status, request date, target date, created date, updated date, and join definitions.

Why this works: the Reports page asks the backend for `/api/reports/builder/schema`. The frontend builds its field dropdown from that response.

Test it:

- Run `python -m compileall -q -x ".venv" Backend` from the repository root.
- Restart the backend.
- Open Reports.
- Choose Knocks as a source.
- Confirm `Knock URL` appears as a field.
- Run a detail report containing `Knock URL` and confirm the returned values are correct.

### AI prompt (alternative to the manual steps)

Copy and paste this prompt into an AI coding assistant that has access to this repository:

```text
Expose the existing knocks.knockUrl column in the report builder as "Knock URL". Inspect Backend/report_builder.py and add the field to the existing knocks source definition immediately after knockId. Preserve all existing knock fields, date fields, status fields, and join definitions; do not replace or shorten the source block. Run the backend compile check when finished, summarize the exact change, and tell me how to verify the field in a detail report after restarting the backend.
```

## Example 4: Add a new field to an existing record type

Goal: Add `supportTier` to products.

This is a bigger change because every layer must agree on the field. Think of it as adding one new box to every form the value passes through.

Step 1: Add the database column for fresh installs.

File: `Backend/sql/schema.sql`

```sql
supportTier VARCHAR(120),
```

Add it inside the `CREATE TABLE IF NOT EXISTS products (...)` definition, after `description`. This only helps new databases.

Step 2: Add a startup migration for existing installs.

File: `Backend/productService/router.py`

Inside `ensure_product_schema()`:

```python
if not await _column_exists("products", "supportTier"):
    await execute_mutation("ALTER TABLE products ADD COLUMN supportTier VARCHAR(120) NULL AFTER description")
```

Step 3: Add backend models.

File: `Backend/schemas.py`

Add to `ProductRecord` and `ProductCreate`:

```python
supportTier: Optional[str] = None
```

Step 4: Add the field to `PRODUCT_CONFIG`.

File: `Backend/productService/router.py`

Append the field to `data_fields` so create and update SQL includes it:

```python
data_fields=("productFamily", "productName", "productVersion", "productUrl", "description", "supportTier")
```

Add these entries to the existing configuration collections:

```python
field_labels={
    # keep the existing labels
    "supportTier": "Support Tier",
},
search_fields=(
    # keep the existing fields
    "supportTier",
),
nullable_fields=(
    # keep the existing fields
    "supportTier",
),
```

The comments mean "preserve what is already there"; do not replace the complete collections with only `supportTier`. `nullable_fields` lets an empty value become database `NULL`. Add it to `search_fields` only if users should find products by this value.

Step 5: Add frontend API type.

File: `Frontend/src/app/services/api/types.ts`

```ts
export interface ProductRecord extends BaseRecord {
  productFamily: string | null;
  productName: string;
  productVersion: string | null;
  productUrl: string | null;
  description: string | null;
  supportTier: string | null;
}
```

No separate frontend create type is required in the current code: `createProduct()` derives its input shape from `ProductRecord` in `Frontend/src/app/services/api/productService.ts`.

Step 6: Add it to the Product list and detail page.

File: `Frontend/src/app/pages/Product.tsx`

Update every place below:

- Add `"supportTier"` to `ProductColumnKey`.
- Add `"supportTier"` to `ProductSearchKey` and the `searchFilters` state if the table needs a search box for it.
- Add `{ key: "supportTier", label: "Support Tier", sortKey: "supportTier", searchKey: "supportTier" }` to `PRODUCT_TABLE_COLUMNS`. Omit `searchKey` if it is not searchable.
- Add a `supportTier` case to the `renderColumnCell()` switch so the table displays it.
- Add a Support Tier control to the detail view. In edit mode it should update `editedProduct.supportTier`; in view mode it should show `selectedProduct.supportTier` or `-`.
- Add `supportTier: editedProduct.supportTier` to the object passed to `updateProduct()` in `handleSave()`.

Step 7: Add it to every product creation path.

File: `Frontend/src/app/components/CreateEntityDialog.tsx`

This component supports both the normal New Product form and a quick product form inside case creation. Update all of these places:

- Add `supportTier: string` to `FormData.product`.
- Add `supportTier: ""` to the product object returned by `createInitialFormData()`.
- Add the input to `renderProductFields()` for normal product creation.
- Add `supportTier: nullableString(formData.product.supportTier)` to the normal `createProduct()` payload.
- To support quick creation as well, add the input to `renderQuickProductFields()` and add `supportTier: nullableString(quickProductDraft.supportTier)` to `handleCreateQuickProduct()`.

Because `createEmptyQuickProductDraft()` reuses `createInitialFormData().product`, the initial value added above is also used by the quick form.

Step 8: Optional report support.

File: `Backend/report_builder.py`

Add:

```python
_field("products", "prd", "supportTier", "Support Tier")
```

Put this inside the existing `products` source `fields=(...)` tuple and preserve all existing product report fields.

Step 9: Test the whole path.

```bash
python -m compileall -q -x ".venv" Backend
cd Frontend
npm run build
```

Restart the backend so it runs `ensure_product_schema()` and loads the changed models. Then test both paths:

- Create a product with Support Tier and open its detail page.
- Edit Support Tier, save, reload the browser, and confirm the value remains.
- If you changed the quick form, create a product while creating a case.
- If you changed reports, select and run the Support Tier field in Reports.
- If an existing database is used, confirm the `products.supportTier` column was created.

Common mistakes:

- Adding an input but not adding the field to its `createProduct()` or `updateProduct()` payload. It appears on screen but is never sent.
- Updating `schema.sql` only. Existing databases do not rerun the initial `CREATE TABLE` definition, so they still need the startup migration.
- Updating `ProductRecord` only. The backend still rejects or drops the field unless `ProductCreate` and `PRODUCT_CONFIG.data_fields` also include it.

### AI prompt (alternative to the manual steps)

Copy and paste this prompt into an AI coding assistant that has access to this repository:

```text
Add an optional text field named supportTier, displayed as "Support Tier", to products across the entire application. Inspect the current implementation and follow an existing optional product field through every layer. Update the fresh-install database schema, the idempotent startup migration for existing databases, backend ProductRecord and ProductCreate models, PRODUCT_CONFIG data fields/labels/search/null handling, the frontend ProductRecord type, the Product list/detail/edit/save UI, normal product creation, and quick product creation inside case creation. Also expose Support Tier in the product report fields. Preserve all existing configuration entries and behavior rather than replacing whole collections or blocks. Run the backend compile check and frontend build. Then summarize every changed file and provide a browser test checklist covering create, quick create, edit, reload persistence, database migration, search, and reports.
```

## Example 5: Understand a create/edit save flow

When you create or edit a product, no single file does everything. Each layer has one job:

| Layer | Job in a product save |
| --- | --- |
| Product page or create dialog | Reads what the person typed and builds a product payload. |
| Product API service | Chooses the URL and HTTP method. Create uses `POST`; edit uses `PUT`. |
| `fetchJson()` | Adds JSON headers and the login token, sends the request, and turns errors or JSON responses into JavaScript values. |
| Product backend router | Requires login and asks Pydantic to validate the request as `ProductCreate`. |
| Shared entity CRUD helper | Builds parameterized database operations from the approved `PRODUCT_CONFIG` fields and records history. |
| MySQL | Permanently stores the row. |
| `RecordsContext` | Replaces or inserts the returned product in the browser's in-memory list so the screen updates immediately. |

The full flow is:

```text
Product page or CreateEntityDialog
  -> createProduct() or updateProduct()
  -> fetchJson()
  -> POST /api/products or PUT /api/products/{id}
  -> Backend/productService/router.py
  -> create_entity() or update_entity() in entity_crud.py
  -> products table
  -> returned ProductRecord
  -> RecordsContext updates local product list
```

`RecordsContext` is a convenient browser-side copy, not the permanent source of truth. Reloading the page fetches records again from the backend. That is why a reload is an important save test: if a value disappears, it probably never reached MySQL or was not returned by the backend.

This same mental model works for accounts, projects, Mantis, and Knock.

Cases are similar, but more custom:

```text
Cases page or CreateEntityDialog
  -> createCase() or updateCase()
  -> fetchJson()
  -> POST /api/cases or PUT /api/cases/{id}
  -> Backend/caseService/router.py
  -> cases table
  -> case_entity_links table for linked account/product/mantis/knock records
  -> case_watchers table for watchers
  -> returned CaseRecord
```

The project relationship is the exception: it is stored directly in `cases.project`, not as a project row in `case_entity_links`.

### AI prompt (alternative to tracing the flow manually)

Copy and paste this prompt into an AI coding assistant that has access to this repository:

```text
Trace the current create and edit save flow for products in this repository without changing any files. Start at the Product page and CreateEntityDialog, then follow the API service, fetchJson, backend route and Pydantic validation, shared CRUD helper, MySQL operation, returned ProductRecord, and RecordsContext update. Cite the exact files and function names you find, explain what each layer is responsible for in beginner-friendly language, and point out where a value could be lost if it appears in the form but disappears after a page reload. Briefly compare this flow with cases, including linked entities, watchers, and the special handling of the project relationship.
```

## Deployment explained simply

Local development runs two developer servers:

| Thing | Local URL |
| --- | --- |
| Frontend Vite app | `http://localhost:5173` |
| Backend FastAPI app | `http://localhost:4000` |

Apache deployment is different:

```text
Browser
  -> Apache on port 80 or 443
  -> Apache serves built frontend files
  -> Apache proxies /api to FastAPI backend
  -> FastAPI talks to MySQL
```

Production and UAT should stay separate.

| Setting | Production example | UAT example |
| --- | --- | --- |
| App directory | `/opt/crm` | `/opt/crm-uat` |
| Frontend publish directory | `/var/www/crm` | `/var/www/crm-uat` |
| Backend port | `4000` | `4001` |
| Database | `crm` | `crm_uat` |
| Apache site | `crm.example.com` | `uat.crm.example.com` |

Use `README_APACHE_UBUNTU.md` for production and `README_APACHE_UAT_UBUNTU.md` for UAT.

## Troubleshooting for newcomers

| Problem | First things to check |
| --- | --- |
| Login fails | Is MySQL running? Did backend startup create the default admin? Does `/health` show database connected? |
| Frontend cannot reach API | Is backend running on port `4000`? Is Vite proxying `/api`? |
| A user cannot see an account or case | Check the user's role and vertical, plus the case SE owner, assignee, watchers, and linked account vertical. |
| Delete button is missing | Only managers and administrators can delete normal business records. The button appears while editing a record. |
| New dropdown option will not save | Did you update both frontend TypeScript type and backend `Literal` validation? |
| New field disappears after saving | Did you update the database column, backend models/config, frontend type/form state, and every create/update payload? Reload to verify it reached MySQL. |
| Reports field does not appear | Did you add it to `SOURCE_DEFS` in `Backend/report_builder.py` and restart backend? |
| Apache page refresh gives 404 | Is Apache rewrite enabled and configured to fall back to `index.html`? |
| UAT is changing production data | Stop and check database name, backend port, app directory, and Apache vhost. UAT must be separate. |

## Quick editing map

| I want to change... | Start here |
| --- | --- |
| A case dropdown option | `Frontend/src/app/data/caseOptions.ts`, then `Frontend/src/app/services/api/types.ts`, then `Backend/schemas.py` |
| Account verticals or account types | `Frontend/src/app/data/accountOptions.ts`, `Frontend/src/app/services/api/types.ts`, `Backend/schemas.py`, and the allowed values/normalization in `Backend/accountService/router.py` |
| Project stages | `Frontend/src/app/data/projectOptions.ts`, `Frontend/src/app/services/api/types.ts`, `Backend/schemas.py`, and `PROJECT_STAGES` plus normalization in `Backend/projectService/router.py` |
| Mantis statuses/categories | `Frontend/src/app/data/mantisOptions.ts`. The current backend models accept strings; update backend validation too if that design changes. |
| Help guide text | `Frontend/src/app/data/pageGuides.ts` |
| Table columns on a page | The matching file in `Frontend/src/app/pages/` |
| API call behavior | Matching file in `Frontend/src/app/services/api/` and matching backend router |
| Backend endpoint behavior | Matching `Backend/*Service/router.py` |
| Shared record create/update logic | `Backend/entity_crud.py` |
| Report builder fields | `Backend/report_builder.py` |
| Database tables | `Backend/sql/schema.sql` and service startup migration hook |
| User roles/login | `Backend/authService/router.py` and `Frontend/src/app/context/AuthContext.tsx` |

## Golden rule

Small UI text edits usually live in one frontend file.

Saved data changes usually cross several files:

```text
database column
  -> backend schema
  -> backend router/config
  -> frontend API type
  -> frontend page/form
  -> report builder, if reports need it
```

When in doubt, follow an existing field with a similar shape. For example, if you add a product field, search for `productVersion` and copy the same pattern carefully.
