#!/bin/bash
# BookMarx unified deployment script (Next.js + API)
# Usage: cd /home/gazza/bookmarx/src/website && sudo ./deploy.sh

set -e

REPO_DIR="/home/gazza/bookmarx"
WEBSITE_DIR="$REPO_DIR/src/website"
REPO_URL="https://github.com/gazzetta/bookmarx.git"
BRANCH="main"
DOMAIN="bookmarx.gasdigital.co.uk"
APP_PORT="3005"
SITE_CONF="/etc/nginx/sites-available/bookmarx"
LIMIT_CONF="/etc/nginx/conf.d/bookmarx-rate-limit.conf"

APP_USER="gazza"
IS_ROOT=false
if [ "$(id -u)" -eq 0 ]; then
    IS_ROOT=true
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'
log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

run_as_app_user() {
    if [ "$IS_ROOT" = true ]; then
        sudo -u "$APP_USER" bash -lc "$1"
    else
        bash -lc "$1"
    fi
}

echo "=========================================="
echo "BookMarx Unified Deploy"
echo "=========================================="

if [ "$IS_ROOT" = false ]; then
    log_warn "Recommended: run with sudo for nginx/systemctl operations."
fi

if ! id -u "$APP_USER" >/dev/null 2>&1; then
    log_error "Required user '$APP_USER' does not exist on this server."
    exit 1
fi

# Create required directories
log_info "Creating directories..."
mkdir -p "$REPO_DIR" "/var/log/bookmarx" "$WEBSITE_DIR/data"
if [ "$IS_ROOT" = true ]; then
    chown -R "$APP_USER:$APP_USER" "$REPO_DIR" "/var/log/bookmarx"
fi

# Git pull or clone
cd "$REPO_DIR"
if [ -d ".git" ]; then
    log_info "Pulling latest changes..."
    run_as_app_user "cd \"$REPO_DIR\" && git fetch origin && git reset --hard \"origin/$BRANCH\""
else
    log_info "Cloning repository..."
    run_as_app_user "git clone -b \"$BRANCH\" \"$REPO_URL\" \"$REPO_DIR\""
fi

# Install dependencies and build
cd "$WEBSITE_DIR"
log_info "Installing dependencies..."
run_as_app_user "cd \"$WEBSITE_DIR\" && npm ci"

log_info "Building unified app..."
run_as_app_user "cd \"$WEBSITE_DIR\" && npm run build"

# Set up .env if it doesn't exist
if [ ! -f "$WEBSITE_DIR/.env" ]; then
    if [ -f "$WEBSITE_DIR/.env.production" ]; then
        log_warn "No .env found. Copying .env.production..."
        cp "$WEBSITE_DIR/.env.production" "$WEBSITE_DIR/.env"
        chown "$APP_USER:$APP_USER" "$WEBSITE_DIR/.env"
        log_warn "Review and update secrets in: $WEBSITE_DIR/.env"
    else
        log_error "No .env or .env.production found! Create $WEBSITE_DIR/.env before continuing."
        exit 1
    fi
fi

# Nginx config (only when running as root)
if [ "$IS_ROOT" = true ]; then
    log_info "Writing nginx rate-limit config..."
    cat > "$LIMIT_CONF" <<'EOF'
limit_req_zone $binary_remote_addr zone=auth_limit:10m rate=10r/m;
EOF

    log_info "Writing nginx site config (Cloudflare Flexible SSL origin)..."
    cat > "$SITE_CONF" <<EOF
upstream bookmarx_app {
    server 127.0.0.1:${APP_PORT};
    keepalive 64;
}

server {
    listen 80;
    server_name ${DOMAIN};

    add_header Strict-Transport-Security "max-age=63072000" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    access_log /var/log/nginx/bookmarx_access.log;
    error_log /var/log/nginx/bookmarx_error.log;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml application/json application/javascript application/rss+xml application/atom+xml image/svg+xml;

    location / {
        proxy_pass http://bookmarx_app;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$http_x_forwarded_proto;
        proxy_cache_bypass \$http_upgrade;
        proxy_read_timeout 90;
        proxy_connect_timeout 90;
    }

    location /api/v1/auth/ {
        limit_req zone=auth_limit burst=5 nodelay;
        proxy_pass http://bookmarx_app;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$http_x_forwarded_proto;
    }
}
EOF

    ln -sf "$SITE_CONF" /etc/nginx/sites-enabled/bookmarx
    rm -f /etc/nginx/sites-enabled/default
fi

# Restart PM2
log_info "Restarting PM2..."
PM2_CMD="pm2"
if [ "$IS_ROOT" = true ]; then
    PM2_CMD="sudo -u $APP_USER pm2"
fi

$PM2_CMD delete bookmarx-api 2>/dev/null || true
$PM2_CMD start "$WEBSITE_DIR/ecosystem.config.js" --env production
$PM2_CMD save || true

# Health check
log_info "Health check..."
sleep 3
HEALTH_CHECK=$(curl -s "http://localhost:${APP_PORT}/health" || echo "failed")
if echo "$HEALTH_CHECK" | grep -q "ok"; then
    log_info "Health check passed."
else
    log_error "Health check failed. Showing recent logs:"
    $PM2_CMD logs bookmarx-api --lines 80 --nostream || true
    exit 1
fi

# Reload Nginx
if [ "$IS_ROOT" = true ]; then
    log_info "Reloading Nginx..."
    nginx -t && systemctl reload nginx
fi

echo ""
echo "=========================================="
log_info "Deployment complete."
echo "=========================================="
echo "Repo dir:    $REPO_DIR"
echo "Website dir: $WEBSITE_DIR"
echo "Domain:      $DOMAIN"
echo ""
echo "Next steps:"
echo "  1. Confirm .env: $WEBSITE_DIR/.env"
echo "  2. Cloudflare SSL/TLS mode should be set to Flexible"
echo "  3. Check logs: $PM2_CMD logs bookmarx-api"
