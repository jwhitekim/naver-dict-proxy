#!/bin/sh
set -eu

usage() {
  cat <<'EOF'
Usage:
  ./setup-server.sh <domain> <certificate-email>

Example:
  ./setup-server.sh example.com admin@example.com

The application is expected to be available on 127.0.0.1:9000 (override with APP_PORT).
Router TCP ports 80 and 443 must point to this server.
EOF
}

if [ "$#" -ne 2 ]; then
  usage >&2
  exit 2
fi

DOMAIN=$1
EMAIL=$2
APP_PORT="${APP_PORT:-9000}"
NGINX_SITE="/etc/nginx/sites-available/${DOMAIN}"
NGINX_LINK="/etc/nginx/sites-enabled/${DOMAIN}"
CERT_PATH="/etc/letsencrypt/live/${DOMAIN}"

case "$DOMAIN" in
  *[!A-Za-z0-9.-]* | .* | *..* | *.)
    echo "Invalid domain: $DOMAIN" >&2
    exit 2
    ;;
esac

case "$EMAIL" in
  *@*.*) ;;
  *)
    echo "Invalid email: $EMAIL" >&2
    exit 2
    ;;
esac

if [ "$(uname -s)" != "Linux" ] || ! command -v apt-get >/dev/null 2>&1; then
  echo "This script supports Ubuntu/Debian Linux." >&2
  exit 1
fi

if [ "$(id -u)" -eq 0 ]; then
  SUDO=''
elif command -v sudo >/dev/null 2>&1; then
  SUDO='sudo'
else
  echo "Run as root or install sudo." >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to start the application." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "The Docker Compose plugin is required." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Cannot access the Docker daemon." >&2
  exit 1
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$SCRIPT_DIR"

echo "Domain:      $DOMAIN"
echo "Application: http://127.0.0.1:$APP_PORT"

if command -v getent >/dev/null 2>&1; then
  RESOLVED_IPS=$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || true)
  if [ -n "$RESOLVED_IPS" ]; then
    echo "DNS IPv4:   $RESOLVED_IPS"
  else
    echo "Warning: $DOMAIN does not resolve to an IPv4 address yet." >&2
  fi
fi

echo "[1/9] Installing Nginx and Certbot"
$SUDO apt-get update
$SUDO apt-get install -y nginx certbot curl

echo "[2/9] Starting the application"
APP_PORT="$APP_PORT" docker compose up -d --build

echo "[3/9] Waiting for the application on port ${APP_PORT}"
ATTEMPT=1
while [ "$ATTEMPT" -le 20 ]; do
  if curl --fail --silent --max-time 5 "http://127.0.0.1:${APP_PORT}/health" >/dev/null 2>&1; then
    break
  fi
  if [ "$ATTEMPT" -eq 20 ]; then
    echo "The application did not become ready on port ${APP_PORT}." >&2
    docker compose logs --tail=100 app >&2
    exit 1
  fi
  sleep 3
  ATTEMPT=$((ATTEMPT + 1))
done

echo "[4/9] Creating the HTTP Nginx configuration"
$SUDO mkdir -p /var/www/certbot/.well-known/acme-challenge
$SUDO tee "${NGINX_SITE}" >/dev/null <<NGINX_EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type text/plain;
        try_files \$uri =404;
    }

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX_EOF

$SUDO ln -sfn "${NGINX_SITE}" "${NGINX_LINK}"
$SUDO rm -f /etc/nginx/sites-enabled/default

echo "[5/9] Enabling Nginx"
$SUDO nginx -t
if command -v systemctl >/dev/null 2>&1; then
  $SUDO systemctl enable --now nginx
  $SUDO systemctl reload nginx
else
  $SUDO service nginx restart
fi

echo "[6/9] Requesting the TLS certificate"
$SUDO certbot certonly \
  --webroot \
  --webroot-path /var/www/certbot \
  --email "${EMAIL}" \
  --agree-tos \
  --no-eff-email \
  --non-interactive \
  -d "${DOMAIN}"

echo "[7/9] Creating the HTTPS Nginx configuration"
$SUDO tee "${NGINX_SITE}" >/dev/null <<NGINX_EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://\$host\$request_uri;
    }
}

server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name ${DOMAIN};

    ssl_certificate ${CERT_PATH}/fullchain.pem;
    ssl_certificate_key ${CERT_PATH}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 1d;

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX_EOF

$SUDO nginx -t
if command -v systemctl >/dev/null 2>&1; then
  $SUDO systemctl reload nginx
else
  $SUDO service nginx reload
fi

echo "[8/9] Installing the certificate renewal hook"
RENEW_SCRIPT="/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh"
$SUDO mkdir -p "$(dirname "${RENEW_SCRIPT}")"
$SUDO tee "${RENEW_SCRIPT}" >/dev/null <<'RENEW_EOF'
#!/bin/sh
set -e

if command -v systemctl >/dev/null 2>&1; then
    systemctl reload nginx
else
    service nginx reload
fi
RENEW_EOF
$SUDO chmod +x "${RENEW_SCRIPT}"

if command -v systemctl >/dev/null 2>&1; then
  $SUDO systemctl enable --now certbot.timer 2>/dev/null || true
fi

echo "[9/9] Checking HTTPS"
curl --fail --silent --show-error --max-time 15 "https://${DOMAIN}/health" >/dev/null

cat <<EOF

Setup complete:
  https://${DOMAIN}

Verify renewal with: sudo certbot renew --dry-run
EOF
