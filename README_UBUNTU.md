# Mantis Ubuntu Setup Guide

This is the quick path for running the Mantis app on Ubuntu. It focuses only on local Ubuntu setup.

## What You Will Run

- Frontend: React + Vite at `http://localhost:5173`
- Backend: FastAPI at `http://localhost:4000`
- Database: MySQL database named `crm`

## 1. Install System Dependencies

From a terminal:

```bash
sudo apt update
sudo apt install -y python3 python3-venv python3-pip mysql-server curl ca-certificates lsof
```

Install Node.js 22 LTS, or any Node version `>=20`:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Check the versions:

```bash
python3 --version
node --version
npm --version
mysql --version
```

Go to this repository before running the remaining commands:

```bash
cd /path/to/Mantis
```

## 2. Start MySQL

```bash
sudo systemctl enable --now mysql
sudo systemctl status mysql
```

If the status screen opens, press `q` to exit.

## 3. Create the Database and App User

From the repository root:

```bash
sudo mysql <<'SQL'
CREATE DATABASE IF NOT EXISTS crm;
CREATE USER IF NOT EXISTS 'crm_user'@'localhost' IDENTIFIED BY 'crm_password';
GRANT ALL PRIVILEGES ON crm.* TO 'crm_user'@'localhost';
FLUSH PRIVILEGES;
SQL
```

Import the schema and seed data:

```bash
sudo mysql < Backend/sql/schema.sql
sudo mysql crm < Backend/sql/seed.sql
```

The Mantis record component/table remains named `mantis`; these `crm` values are only for the MySQL database and login.

## 4. Set Up the Backend

From the repository root:

```bash
cd Backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Create `Backend/.env`:

```bash
cat > .env <<'EOF'
DB_HOST=localhost
DB_PORT=3306
DB_USER=crm_user
DB_PASSWORD=crm_password
DB_NAME=crm

HOST=0.0.0.0
PORT=4000
ENVIRONMENT=development
CORS_ORIGIN=http://localhost:5173
EOF
```

Start the backend:

```bash
python main.py
```

Expected output includes a server running on `0.0.0.0:4000`.

Leave this terminal open.

## 5. Check the Backend

Open a second terminal from the repository root:

```bash
curl http://localhost:4000/health
```

Expected:

```json
{"status":"ok","database":"connected"}
```

You can also check the API docs in a browser:

```text
http://localhost:4000/docs
```

## 6. Set Up the Frontend

In the second terminal, from the repository root:

```bash
cd Frontend
cat > .env <<'EOF'
VITE_API_URL=http://localhost:4000/api
EOF
npm ci
npm run dev
```

Expected output includes a local Vite URL, usually:

```text
http://localhost:5173
```

Open that URL in your browser.

## 7. Login

The backend creates a default admin user on startup:

```text
Email: admin@local
Password: Admin123!
```

Change this password after your first login if this is more than a throwaway local setup.

## Daily Startup

After the first setup, use two terminals.

Terminal 1:

```bash
cd Backend
source .venv/bin/activate
python main.py
```

Terminal 2:

```bash
cd Frontend
npm run dev
```

Then open:

```text
http://localhost:5173
```

## Troubleshooting

If `/health` says the database is disconnected:

```bash
sudo systemctl status mysql
cd Backend
source .venv/bin/activate
python main.py
```

Also confirm `Backend/.env` matches the MySQL user you created.

If `npm run dev` fails with a Node version error:

```bash
node --version
```

Install Node.js 22 LTS again if the version is below `20`.

If port `4000` is already in use:

```bash
sudo lsof -i :4000
```

Stop the process using that port, or change `PORT` in `Backend/.env` and update `Frontend/.env` to match, for example:

```env
VITE_API_URL=http://localhost:4001/api
```

If port `5173` is already in use, Vite will usually choose the next free port. The backend allows common localhost Vite ports during development.
