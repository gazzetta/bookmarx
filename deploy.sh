#!/bin/bash
# BookMarx unified deployment script (Next.js + API)
#
# This script lives in the TOP-LEVEL folder of the repo. The website it deploys
# is NOT in the top-level folder - it is in src/website underneath it.
# All paths below are resolved from this script's own location, so running it
# from anywhere (or via sudo) resolves the same locations.
#
# Usage: cd /home/gazza/bookmarx && sudo ./deploy.sh

set -e

# Folder this script is running from. On the live server this is /home/gazza/bookmarx.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# Absolute path to this script file, plus its checksum BEFORE the git fetch
# below. If the fetch updates deploy.sh itself, the copy currently executing
# is stale, so we stop and ask the operator to re-run (see self-update check
# after the git pull/clone block).
SCRIPT_PATH="$SCRIPT_DIR/$(basename "${BASH_SOURCE[0]}")"
SELF_HASH="$(sha256sum "$SCRIPT_PATH" 2>/dev/null | cut -d' ' -f1 || echo "unknown")"
# Set BOOKMARX_REPO_DIR=/path/to/repo to deploy a checkout living somewhere else.
REPO_DIR="${BOOKMARX_REPO_DIR:-$SCRIPT_DIR}"
# The website itself lives one level down, under src/website.
WEBSITE_DIR="$REPO_DIR/src/website"
REPO_URL="https://github.com/gazzetta/bookmarx.git"
# The remote's default branch is master (the repo has no `main` branch).
BRANCH="master"
DOMAIN="www.bookmarx.cc"
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
        # -H forces HOME to the target user's home. Without it sudo may leave
        # HOME as /root, which breaks SSH key lookup (git fetch) and hides
        # nvm-based node/pm2 installs for the app user.
        sudo -H -u "$APP_USER" bash -lc "$1"
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

# NOTE: the repo layout (this script at the top level, the website in
# src/website) is validated further down, once the repo has been fetched.

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
    # Snapshot the live database BEFORE resetting: if any database sidecar is
    # ever tracked in git, `git reset --hard` overwrites it with a stale blob
    # and the mismatched WAL/DB pair corrupts the database (happened twice,
    # 2026-10-13 and 2026-10-14). Cheap insurance — restores are in .backups.
    if [ -f "$WEBSITE_DIR/data/bookmarx.db" ]; then
        DEPLOY_BK="$REPO_DIR/.backups/pre-deploy-$(date +%Y%m%d-%H%M%S)"
        mkdir -p "$DEPLOY_BK"
        cp -p "$WEBSITE_DIR/data"/bookmarx.db* "$DEPLOY_BK/" 2>/dev/null || true
        if [ "$IS_ROOT" = true ]; then chown -R "$APP_USER:$APP_USER" "$DEPLOY_BK"; fi
        log_info "Database snapshot saved to $DEPLOY_BK"
    fi
    run_as_app_user "cd \"$REPO_DIR\" && git fetch origin && git reset --hard \"origin/$BRANCH\""
elif [ -n "$(ls -A "$REPO_DIR" 2>/dev/null)" ]; then
    # Folder already has files (e.g. a pre-staged .env) but is not a git repo yet,
    # so clone into it and fetch in place rather than failing on a non-empty dir.
    log_info "Initialising git repo in existing folder..."
    run_as_app_user "cd \"$REPO_DIR\" && git init -q && git remote add origin \"$REPO_URL\" && git fetch -q origin \"$BRANCH\" && git reset --hard -q FETCH_HEAD"
else
    log_info "Cloning repository..."
    run_as_app_user "git clone -b \"$BRANCH\" \"$REPO_URL\" \"$REPO_DIR\""
fi

# Self-update check: if the fetch above pulled down a newer version of this
# script, the copy currently executing is stale. Stop here (this is not a
# failure) so the operator re-runs the new version from the top. Deliberately
# placed before anything is built, restarted or reloaded.
NEW_HASH="$(sha256sum "$SCRIPT_PATH" 2>/dev/null | cut -d' ' -f1 || echo "unknown")"
if [ "$SELF_HASH" != "$NEW_HASH" ]; then
    log_warn "This pull updated deploy.sh itself, so the copy now running is out of date."
    log_warn "Nothing has been built, restarted or deployed. Please run the deploy command again:"
    log_warn "  cd \"$REPO_DIR\" && sudo ./deploy.sh"
    exit 1
fi

# Now that the repo is present, verify the layout this script expects:
# deploy.sh in the top-level folder, with the website under src/website.
if [ ! -f "$WEBSITE_DIR/package.json" ]; then
    log_error "Website not found at $WEBSITE_DIR after fetching the repo."
    log_error "Expected: $REPO_DIR/deploy.sh with the website in $REPO_DIR/src/website"
    exit 1
fi
log_info "Website directory: $WEBSITE_DIR"

# Set up .env BEFORE building: Next.js inlines NEXT_PUBLIC_* variables into the
# client bundle at build time, so the env file must exist before `next build` runs.
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

# Install dependencies and build
cd "$WEBSITE_DIR"
# Skip the full reinstall when nothing relevant changed: hash the dependency
# manifests plus the node version (a node upgrade requires the native SQLite
# driver to be rebuilt even if the lockfile is untouched). The hash file is
# server-local state, survives `git reset --hard` (untracked) and is ignored
# by git. First deploy after this change installs once, then skips.
DEPS_HASH_FILE="$WEBSITE_DIR/.deploy-deps.hash"
DEPS_HASH="$(cat "$WEBSITE_DIR/package.json" "$WEBSITE_DIR/package-lock.json" 2>/dev/null | sha256sum | cut -d' ' -f1)-$(node -v 2>/dev/null || echo "no-node")"
if [ -f "$DEPS_HASH_FILE" ] && [ "$(cat "$DEPS_HASH_FILE" 2>/dev/null)" = "$DEPS_HASH" ] && [ -d "$WEBSITE_DIR/node_modules" ]; then
    log_info "Dependencies unchanged (and node_modules present), skipping npm ci..."
else
    log_info "Installing dependencies..."
    run_as_app_user "cd \"$WEBSITE_DIR\" && npm ci"
    echo "$DEPS_HASH" > "$DEPS_HASH_FILE"
    if [ "$IS_ROOT" = true ]; then
        chown "$APP_USER:$APP_USER" "$DEPS_HASH_FILE"
    fi
fi

log_info "Building unified app..."
run_as_app_user "cd \"$WEBSITE_DIR\" && npm run build"

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

    # Where the website actually lives on disk. This is a reverse-proxy setup, so
    # nginx forwards requests to the Next.js/API app above rather than serving the
    # site itself, but root points nginx at the website folder for any local
    # lookups (error pages, direct file hits) and documents the site's location.
    root ${WEBSITE_DIR};

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

    # NOTE: this box hosts other sites, and the nginx `default` catch-all may be
    # serving some of them. Back it up before disabling it so it can be restored,
    # and only remove it from sites-enabled. Stored outside conf.d/ so nginx
    # never loads the .bak file.
    if [ -L /etc/nginx/sites-enabled/default ] || [ -f /etc/nginx/sites-enabled/default ]; then
        cp -L /etc/nginx/sites-enabled/default /etc/nginx/bookmarx-default.bak 2>/dev/null || true
        log_warn "Backed up nginx default site to /etc/nginx/bookmarx-default.bak and disabled it"
        rm -f /etc/nginx/sites-enabled/default
    fi
fi

# Restart PM2
log_info "Restarting PM2..."
PM2_CMD="pm2"
if [ "$IS_ROOT" = true ]; then
    PM2_CMD="sudo -H -u $APP_USER pm2"
fi

$PM2_CMD delete bookmarx-api 2>/dev/null || true
$PM2_CMD start "$WEBSITE_DIR/ecosystem.config.js" --env production
$PM2_CMD save || true

# Health check: poll until the app responds. First boot compiles via tsx,
# runs DB migrations and prepares Next, which takes well over 3 seconds,
# so a single attempt is a guaranteed false negative on a fresh deploy.
log_info "Health check (waiting up to 90s for first boot)..."
HEALTH_OK=false
for i in $(seq 1 30); do
    HEALTH_CHECK=$(curl -s "http://localhost:${APP_PORT}/health" || echo "failed")
    if echo "$HEALTH_CHECK" | grep -q "ok"; then
        HEALTH_OK=true
        break
    fi
    sleep 3
done
if [ "$HEALTH_OK" = true ]; then
    log_info "Health check passed."
else
    log_error "Health check failed after 90s. Showing recent logs:"
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
