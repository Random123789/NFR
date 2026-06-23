# Apache UAT Deployment on Ubuntu

This guide covers a separate UAT deployment for the CRM app on Ubuntu.

Use this when you want an isolated test environment that behaves like production but does not share runtime state with it.

## What Must Be Separate from Production

UAT should have its own:

- Apache virtual host
- Backend systemd service
- Backend port
- Backend `.env`
- Frontend build output
- MySQL database and user
- Application deployment directory

Recommended UAT values:

- Apache site: `uat.crm.example.com`
- App directory: `/opt/crm-uat`
- Frontend publish directory: `/var/www/crm-uat`
- Backend port: `4001`
- Database: `crm_uat`
- Database user: `crm_uat_user`

## 1. Install Packages

If UAT is on the same server as production, these packages and Apache modules may already be installed. If UAT is on its own server, install them first:

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

## 2. Create the UAT Database

Use a separate schema from production so test data and test changes stay isolated:

```bash
sudo mysql <<'SQL'
CREATE DATABASE IF NOT EXISTS crm_uat;
CREATE USER IF NOT EXISTS 'crm_uat_user'@'localhost' IDENTIFIED BY 'crm_uat_password';
GRANT ALL PRIVILEGES ON crm_uat.* TO 'crm_uat_user'@'localhost';
FLUSH PRIVILEGES;
SQL

# schema.sql starts with "CREATE DATABASE crm" and "USE crm". Strip those
# first two lines so UAT tables are created in crm_uat, not production crm.
tail -n +3 Backend/sql/schema.sql | sudo mysql crm_uat

# Optional: load demo data into the fresh UAT database.
sudo mysql crm_uat < Backend/sql/seed.sql
```

## 3. Deploy the UAT Application

Copy the repository to a separate path:

```bash
sudo mkdir -p /opt/crm-uat
sudo rsync -a --delete \
  --exclude '.git' \
  --exclude '.venv' \
  --exclude 'Backend/.env' \
  --exclude 'Backend/.venv' \
  --exclude 'Frontend/node_modules' \
  --exclude 'Frontend/dist' \
  ./ /opt/crm-uat/
```

Create the UAT backend virtual environment:

```bash
cd /opt/crm-uat/Backend
sudo python3 -m venv .venv
sudo .venv/bin/python -m pip install --upgrade pip
sudo .venv/bin/pip install -r requirements.txt
```

Create `/opt/crm-uat/Backend/.env`:

```bash
sudo tee /opt/crm-uat/Backend/.env >/dev/null <<'EOF'
DB_HOST=localhost
DB_PORT=3306
DB_USER=crm_uat_user
DB_PASSWORD=crm_uat_password
DB_NAME=crm_uat
DB_POOL_SIZE=20

HOST=127.0.0.1
PORT=4001
ENVIRONMENT=uat
CORS_ORIGIN=http://uat.crm.example.com
EOF
```

Set permissions:

```bash
sudo chown -R root:www-data /opt/crm-uat
sudo chmod -R g+rX /opt/crm-uat
sudo chmod 640 /opt/crm-uat/Backend/.env
```

## 4. Install the UAT Backend Service

Create `/etc/systemd/system/crm-backend-uat.service`:

```ini
[Unit]
Description=CRM FastAPI backend UAT
After=network-online.target mysql.service
Wants=network-online.target mysql.service

[Service]
Type=simple
WorkingDirectory=/opt/crm-uat/Backend
EnvironmentFile=/opt/crm-uat/Backend/.env
Environment=PYTHONDONTWRITEBYTECODE=1
ExecStart=/opt/crm-uat/Backend/.venv/bin/python main.py
Restart=on-failure
RestartSec=5
User=www-data
Group=www-data
NoNewPrivileges=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Enable it:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now crm-backend-uat
curl http://127.0.0.1:4001/health
```

## 5. Build the UAT Frontend

Build the frontend for Apache, just like production, so the browser uses `/api` and Apache handles the proxy:

```bash
cd /opt/crm-uat/Frontend
sudo npm ci
sudo env VITE_API_URL=/api npm run build
sudo mkdir -p /var/www/crm-uat
sudo rsync -a --delete dist/ /var/www/crm-uat/
sudo chown -R www-data:www-data /var/www/crm-uat
```

## 6. Configure the UAT Apache Vhost

Create `/etc/apache2/sites-available/crm-uat.conf` and point it at the UAT backend and document root:

```apache
<VirtualHost *:80>
    ServerName uat.crm.example.com

    DocumentRoot /var/www/crm-uat

    ProxyPreserveHost On
    ProxyRequests Off

    ProxyPass /api/ http://127.0.0.1:4001/api/
    ProxyPassReverse /api/ http://127.0.0.1:4001/api/
    ProxyPass /api http://127.0.0.1:4001/api
    ProxyPassReverse /api http://127.0.0.1:4001/api

    ProxyPass /health http://127.0.0.1:4001/health
    ProxyPassReverse /health http://127.0.0.1:4001/health
    ProxyPass /docs http://127.0.0.1:4001/docs
    ProxyPassReverse /docs http://127.0.0.1:4001/docs
    ProxyPass /openapi.json http://127.0.0.1:4001/openapi.json
    ProxyPassReverse /openapi.json http://127.0.0.1:4001/openapi.json

    <Directory /var/www/crm-uat>
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

    ErrorLog ${APACHE_LOG_DIR}/crm-uat-error.log
    CustomLog ${APACHE_LOG_DIR}/crm-uat-access.log combined
</VirtualHost>
```

Enable the site:

```bash
sudo a2ensite crm-uat.conf
sudo apache2ctl configtest
sudo systemctl reload apache2
```

## 7. Verify UAT

```bash
curl http://127.0.0.1:4001/health
curl -H 'Host: uat.crm.example.com' http://127.0.0.1/health
curl -H 'Host: uat.crm.example.com' http://127.0.0.1/api/cases
```

If the `/api/cases` command returns an auth error, that is still fine for a connectivity check.

Open the UAT site in a browser:

```text
http://uat.crm.example.com/
```

If UAT should use HTTPS, enable it separately from production and update `CORS_ORIGIN` to the HTTPS origin:

```bash
sudo apt install -y certbot python3-certbot-apache
sudo certbot --apache -d uat.crm.example.com
```

## Updating UAT

Backend changes:

```bash
cd ~/Documents/NFR
sudo rsync -a --delete \
  --exclude '.git' \
  --exclude '.venv' \
  --exclude 'Backend/.env' \
  --exclude 'Backend/.venv' \
  --exclude 'Frontend/node_modules' \
  --exclude 'Frontend/dist' \
  ./ /opt/crm-uat/
sudo chown -R root:www-data /opt/crm-uat
sudo chmod -R g+rX /opt/crm-uat
sudo chmod 640 /opt/crm-uat/Backend/.env
sudo systemctl restart crm-backend-uat
```

Frontend-only changes:

```bash
cd /opt/crm-uat/Frontend
sudo npm ci
sudo env VITE_API_URL=/api npm run build
sudo rsync -a --delete dist/ /var/www/crm-uat/
sudo chown -R www-data:www-data /var/www/crm-uat
```

## UAT Summary

UAT should be a full parallel deployment. Share the source code if you want, but keep the Apache vhost, backend process, backend port, build output, and database separate from production.


```bash
cd ~/Documents/NFR
sudo rsync -a --delete \
  --exclude '.git' \
  --exclude '.venv' \
  --exclude 'Backend/.env' \
  --exclude 'Backend/.venv' \
  --exclude 'Frontend/node_modules' \
  --exclude 'Frontend/dist' \
  ./ /opt/crm-uat/
sudo chown -R root:www-data /opt/crm-uat
sudo chmod -R g+rX /opt/crm-uat
sudo chmod 640 /opt/crm-uat/Backend/.env
sudo systemctl restart crm-backend-uat
cd /opt/crm-uat/Frontend
sudo npm ci
sudo env VITE_API_URL=/api npm run build
sudo rsync -a --delete dist/ /var/www/crm-uat/
sudo chown -R www-data:www-data /var/www/crm-uat
```