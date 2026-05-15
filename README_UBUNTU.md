# Mantis Ubuntu Setup Guide

This is the quick path for running the Mantis app on Ubuntu. It covers both local development and an Apache deployment.

## What You Will Run

- Local frontend dev: React + Vite at `http://localhost:5173`
- Backend: FastAPI at `http://localhost:4000`
- Apache production: Apache serves the built frontend and proxies `/api` to FastAPI
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
npm ci
npm run dev
```

Expected output includes a local Vite URL, usually:

```text
http://localhost:5173
```

Open that URL in your browser.

The frontend defaults to `/api`. During `npm run dev`, Vite proxies `/api` to `http://localhost:4000`, so you usually do not need a frontend `.env` file. If you intentionally run the backend somewhere else, create `Frontend/.env`:

```bash
cat > .env <<'EOF'
VITE_API_URL=http://localhost:4000/api
EOF
```

### Access from outside the VM

The default Vite dev server only listens for connections from inside the VM. To open the app from your host machine or another machine, use the VM IP address and bind Vite to all interfaces.

Find the VM IP:

```bash
hostname -I
```

Start Vite with a network bind:

```bash
npm run dev -- --host 0.0.0.0
```

Then open:

```text
http://<VM_IP>:5173
```

If Ubuntu firewall is enabled, allow the Vite port:

```bash
sudo ufw allow 5173/tcp
```

You only need to expose port `4000` if you want browsers or other machines to call the backend directly. The default Vite setup keeps browser API calls on `/api` and proxies them from port `5173` to the backend inside the VM.

If the VM uses NAT networking, configure port forwarding for `5173`, or switch the VM to bridged networking so the VM has a reachable LAN IP. Forward `4000` only if you intentionally expose the backend directly.

## 7. Login

The backend creates a default admin user on startup:

```text
Email: admin@local
Password: Admin123!
```

Change this password after your first login if this is more than a throwaway local setup.

## Apache Production Deployment

Use this when you want Apache to serve the app on normal HTTP port `80` instead of running the Vite dev server. Apache serves the built React files from `/var/www/mantis` and proxies `/api` to the FastAPI backend on `127.0.0.1:4000`.

### 1. Install Apache

```bash
sudo apt update
sudo apt install -y apache2 rsync
sudo a2enmod proxy proxy_http rewrite headers
sudo systemctl enable --now apache2
```

### 2. Copy the Backend to `/opt/mantis`

From your repository root:

```bash
sudo mkdir -p /opt/mantis
sudo rsync -a --delete \
  --exclude '.git' \
  --exclude '.venv' \
  --exclude 'Frontend/node_modules' \
  --exclude 'Frontend/dist' \
  --exclude 'Backend/.env' \
  --exclude 'Backend/.venv' \
  ./ /opt/mantis/
```

Create the backend virtual environment:

```bash
cd /opt/mantis/Backend
sudo python3 -m venv .venv
sudo .venv/bin/python -m pip install --upgrade pip
sudo .venv/bin/pip install -r requirements.txt
```

Create the production backend environment:

```bash
sudo tee /opt/mantis/Backend/.env >/dev/null <<'EOF'
DB_HOST=localhost
DB_PORT=3306
DB_USER=crm_user
DB_PASSWORD=crm_password
DB_NAME=crm

HOST=127.0.0.1
PORT=4000
ENVIRONMENT=production
CORS_ORIGIN=http://your-server-name-or-ip
EOF
```

Set read permissions for the service account:

```bash
sudo chown -R root:www-data /opt/mantis
sudo chmod -R g+rX /opt/mantis
sudo chmod 640 /opt/mantis/Backend/.env
```

### 3. Install the Backend Service

From your repository root:

```bash
sudo cp deploy/systemd/mantis-backend.service /etc/systemd/system/mantis-backend.service
sudo systemctl daemon-reload
sudo systemctl enable --now mantis-backend
curl http://127.0.0.1:4000/health
```

Expected:

```json
{"status":"ok","database":"connected"}
```

If you need logs:

```bash
sudo journalctl -u mantis-backend -f
```

### 4. Build and Publish the Frontend

From your normal writable repository checkout, not from `/opt/mantis`:

```bash
cd Frontend
npm ci
VITE_API_URL=/api npm run build
sudo mkdir -p /var/www/mantis
sudo rsync -a --delete dist/ /var/www/mantis/
sudo chown -R www-data:www-data /var/www/mantis
```

The production frontend must call `/api`, not `http://<server-ip>:4000/api`. Vite bakes `VITE_API_URL` into the JavaScript during `npm run build`, so the command above forces the Apache-safe value even if `Frontend/.env` contains an older development URL.

You can confirm the built frontend is Apache-ready:

```bash
grep -R "http://.*:4000" dist/assets || echo "OK: frontend uses Apache /api proxy"
```

If you are already inside `/opt/mantis/Frontend`, creating files may fail because `/opt/mantis` is owned by root/www-data for the system service.

### 5. Enable the Apache Site

From your repository root:

```bash
sudo cp deploy/apache/mantis.conf /etc/apache2/sites-available/mantis.conf
sudo nano /etc/apache2/sites-available/mantis.conf
```

In that file, replace:

```apache
ServerName mantis.local
```

with your DNS name or server IP, for example:

```apache
ServerName 192.168.1.50
```

Enable the site:

```bash
sudo a2dissite 000-default.conf
sudo a2ensite mantis.conf
sudo apache2ctl configtest
sudo systemctl reload apache2
```

If Ubuntu firewall is enabled:

```bash
sudo ufw allow 'Apache Full'
```

Open:

```text
http://your-server-name-or-ip/
```

Useful checks:

```bash
curl http://127.0.0.1/health
curl http://127.0.0.1/api/cases
```

The `/api/cases` check may return an authentication error if you are not logged in; that still proves Apache reached the backend. If page refreshes such as `/cases` return `404`, confirm `rewrite` is enabled and this virtual host is active.

### Updating an Apache Deployment

Frontend-only changes:

```bash
cd Frontend
npm run build
sudo rsync -a --delete dist/ /var/www/mantis/
```

Backend changes:

```bash
sudo rsync -a --delete \
  --exclude '.git' \
  --exclude '.venv' \
  --exclude 'Frontend/node_modules' \
  --exclude 'Frontend/dist' \
  --exclude 'Backend/.env' \
  --exclude 'Backend/.venv' \
  ./ /opt/mantis/
sudo chown -R root:www-data /opt/mantis
sudo chmod -R g+rX /opt/mantis
sudo chmod 640 /opt/mantis/Backend/.env
sudo systemctl restart mantis-backend
```

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

For access from outside the VM, use the network startup command from step 6:

```bash
npm run dev -- --host 0.0.0.0
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

Stop the process using that port, or change `PORT` in `Backend/.env`. For Vite development, update `Frontend/.env` to match, for example:

```env
VITE_API_URL=http://localhost:4001/api
```

For Apache deployment, also update the `ProxyPass` and `ProxyPassReverse` targets in `/etc/apache2/sites-available/mantis.conf`.

If port `5173` is already in use, Vite will usually choose the next free port. The backend allows common localhost Vite ports during development.
