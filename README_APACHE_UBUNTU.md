# Apache Deployment on Ubuntu

This guide covers the production Apache deployment for the CRM app on Ubuntu.

Use this when you want a single production instance on one Ubuntu server.

## What Runs Separately

For a clean Apache deployment, keep these pieces separate from any UAT environment:

- Apache virtual host
- Backend systemd service
- Backend port
- Backend `.env`
- Frontend build output
- MySQL database and user
- Application deployment directory

Recommended production values:

- Apache site: `crm.example.com`
- App directory: `/opt/crm`
- Frontend publish directory: `/var/www/crm`
- Backend port: `4000`
- Database: `crm`
- Database user: `crm_user`

## 1. Install Packages

```bash
sudo apt update
sudo apt install -y apache2 mysql-server python3 python3-venv python3-pip rsync lsof curl ca-certificates
sudo a2enmod proxy proxy_http rewrite headers
sudo systemctl enable --now apache2 mysql
```

Install Node.js 20 or newer for the frontend build. If your server already has a suitable Node.js version, you can skip this block.

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node --version
npm --version
```

## 2. Create the Database

Use a dedicated production database and user:

```bash
sudo mysql <<'SQL'
CREATE DATABASE IF NOT EXISTS crm;
CREATE USER IF NOT EXISTS 'crm_user'@'localhost' IDENTIFIED BY 'crm_password';
GRANT ALL PRIVILEGES ON crm.* TO 'crm_user'@'localhost';
FLUSH PRIVILEGES;
SQL

# schema.sql currently contains "CREATE DATABASE crm" and "USE crm", so this
# initializes the production database named crm.
sudo mysql < Backend/sql/schema.sql

# Optional: load demo data only for a fresh demo/test production instance.
sudo mysql crm < Backend/sql/seed.sql
```

If you choose a database name other than `crm`, load the schema without the first two SQL lines:

```bash
tail -n +3 Backend/sql/schema.sql | sudo mysql your_database_name
sudo mysql your_database_name < Backend/sql/seed.sql
```

## 3. Deploy the Application

Copy the repository to a production location:

```bash
sudo mkdir -p /opt/crm
sudo rsync -a --delete \
  --exclude '.git' \
  --exclude '.venv' \
  --exclude 'Backend/.env' \
  --exclude 'Backend/.venv' \
  --exclude 'Frontend/node_modules' \
  --exclude 'Frontend/dist' \
  ./ /opt/crm/
```

Create the backend virtual environment:

```bash
cd /opt/crm/Backend
sudo python3 -m venv .venv
sudo .venv/bin/python -m pip install --upgrade pip
sudo .venv/bin/pip install -r requirements.txt
```

Create `/opt/crm/Backend/.env`:

```bash
sudo tee /opt/crm/Backend/.env >/dev/null <<'EOF'
DB_HOST=localhost
DB_PORT=3306
DB_USER=crm_user
DB_PASSWORD=crm_password
DB_NAME=crm
DB_POOL_SIZE=20

HOST=127.0.0.1
PORT=4000
ENVIRONMENT=production
CORS_ORIGIN=http://crm.example.com
EOF
```

Set permissions:

```bash
sudo chown -R root:www-data /opt/crm
sudo chmod -R g+rX /opt/crm
sudo chmod 640 /opt/crm/Backend/.env
```

## 4. Install the Backend Service

Create a dedicated systemd service such as `/etc/systemd/system/crm-backend.service`:

```ini
[Unit]
Description=CRM FastAPI backend
After=network-online.target mysql.service
Wants=network-online.target mysql.service

[Service]
Type=simple
WorkingDirectory=/opt/crm/Backend
EnvironmentFile=/opt/crm/Backend/.env
Environment=PYTHONDONTWRITEBYTECODE=1
ExecStart=/opt/crm/Backend/.venv/bin/python main.py
Restart=on-failure
RestartSec=5
User=www-data
Group=www-data
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Then enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now crm-backend
curl http://127.0.0.1:4000/health
```

## 5. Build the Frontend

Build with Apache routing in mind, so the frontend uses `/api`:

```bash
cd /opt/crm/Frontend
sudo npm ci
sudo env VITE_API_URL=/api npm run build
sudo mkdir -p /var/www/crm
sudo rsync -a --delete dist/ /var/www/crm/
sudo chown -R www-data:www-data /var/www/crm
```

## 6. Configure Apache

Create `/etc/apache2/sites-available/crm.conf` from `deploy/apache/crm.conf` and change the placeholders:

- `ServerName crm.example.com`
- `DocumentRoot /var/www/crm`
- `ProxyPass` targets to `http://127.0.0.1:4000`

Example vhost:

```apache
<VirtualHost *:80>
    ServerName crm.example.com

    DocumentRoot /var/www/crm

    ProxyPreserveHost On
    ProxyRequests Off

    ProxyPass /api/ http://127.0.0.1:4000/api/
    ProxyPassReverse /api/ http://127.0.0.1:4000/api/
    ProxyPass /api http://127.0.0.1:4000/api
    ProxyPassReverse /api http://127.0.0.1:4000/api

    ProxyPass /health http://127.0.0.1:4000/health
    ProxyPassReverse /health http://127.0.0.1:4000/health
    ProxyPass /docs http://127.0.0.1:4000/docs
    ProxyPassReverse /docs http://127.0.0.1:4000/docs
    ProxyPass /openapi.json http://127.0.0.1:4000/openapi.json
    ProxyPassReverse /openapi.json http://127.0.0.1:4000/openapi.json

    <Directory /var/www/crm>
        Options -Indexes +FollowSymLinks
        AllowOverride None
        Require all granted

        RewriteEngine On
        RewriteRule ^index\.html$ - [L]
        RewriteCond %{REQUEST_FILENAME} !-f
        RewriteCond %{REQUEST_FILENAME} !-d
        RewriteRule . /index.html [L]
    </Directory>

    <FilesMatch "\.(?:js|mjs|css|png|jpg|jpeg|gif|svg|webp|ico|woff2?)$">
        Header set Cache-Control "public, max-age=31536000, immutable"
    </FilesMatch>

    <FilesMatch "\.html$">
        Header set Cache-Control "no-cache"
    </FilesMatch>

    ErrorLog ${APACHE_LOG_DIR}/crm-error.log
    CustomLog ${APACHE_LOG_DIR}/crm-access.log combined
</VirtualHost>
```

Enable the site:

```bash
sudo a2dissite 000-default.conf
sudo a2ensite crm.conf
sudo apache2ctl configtest
sudo systemctl reload apache2
```

## 7. Verify

```bash
curl http://127.0.0.1:4000/health
curl -H 'Host: crm.example.com' http://127.0.0.1/health
curl -H 'Host: crm.example.com' http://127.0.0.1/api/cases
```

If the `/api/cases` command returns an auth error, that is still fine for a connectivity check.

For a real production deployment, put the site behind HTTPS and update `CORS_ORIGIN` to the HTTPS origin:

```bash
sudo apt install -y certbot python3-certbot-apache
sudo certbot --apache -d crm.example.com
```

## Updating Production

Backend changes:

```bash
sudo rsync -a --delete \
  --exclude '.git' \
  --exclude '.venv' \
  --exclude 'Backend/.env' \
  --exclude 'Backend/.venv' \
  --exclude 'Frontend/node_modules' \
  --exclude 'Frontend/dist' \
  ./ /opt/crm/
sudo chown -R root:www-data /opt/crm
sudo chmod -R g+rX /opt/crm
sudo chmod 640 /opt/crm/Backend/.env
sudo systemctl restart crm-backend
```

Frontend-only changes:

```bash
cd /opt/crm/Frontend
sudo npm ci
sudo env VITE_API_URL=/api npm run build
sudo rsync -a --delete dist/ /var/www/crm/
sudo chown -R www-data:www-data /var/www/crm
```

## Production Summary

Production should have its own Apache vhost, backend service, backend port, and database. You can reuse the same source code, but do not share the same runtime directories, `.env`, or database with UAT.
