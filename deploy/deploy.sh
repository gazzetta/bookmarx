#!/bin/bash
# BookMarx Deployment Script
# Run on production server: ./deploy.sh

set -e

# Configuration
APP_DIR="/home/gazza/bookmarx"
SERVER_DIR="$APP_DIR/src/server"
REPO_URL="git@github.com:yourusername/bookmarx.git"  # Update with your actual repo URL
BRANCH="main"

echo "=========================================="
echo "BookMarx Deployment Script"
echo "=========================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Can run as gazza user or root
RUN_USER="gazza"

# Create directories if they don't exist
log_info "Creating directories..."
mkdir -p $APP_DIR
mkdir -p /var/log/bookmarx
chown -R gazza:gazza /var/log/bookmarx

# Navigate to app directory
cd $APP_DIR

# Clone or pull latest code
if [ -d ".git" ]; then
    log_info "Pulling latest changes..."
    git fetch origin
    git reset --hard origin/$BRANCH
else
    log_info "Cloning repository..."
    git clone -b $BRANCH $REPO_URL .
fi

# Install server dependencies
log_info "Installing server dependencies..."
cd $SERVER_DIR
npm ci --production

# Build server
log_info "Building server..."
npm run build

# Copy production environment file if it doesn't exist
if [ ! -f ".env" ]; then
    log_warn ".env file not found. Copying from template..."
    cp .env.production.template .env
    log_warn "Please edit $SERVER_DIR/.env with your production values!"
fi

# Restart PM2
log_info "Restarting PM2..."
cd $APP_DIR/deploy
pm2 delete bookmarx-api 2>/dev/null || true
pm2 start ecosystem.config.js --env production
pm2 save

# Test the API
log_info "Testing API health..."
sleep 3
HEALTH_CHECK=$(curl -s http://localhost:3005/health || echo "failed")
if echo "$HEALTH_CHECK" | grep -q "ok"; then
    log_info "Health check passed!"
else
    log_error "Health check failed!"
    pm2 logs bookmarx-api --lines 50
    exit 1
fi

# Reload Nginx
log_info "Reloading Nginx..."
nginx -t && systemctl reload nginx

echo ""
echo "=========================================="
log_info "Deployment complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Ensure .env is configured: $SERVER_DIR/.env"
echo "2. Check logs: pm2 logs bookmarx-api"
echo "3. Monitor: pm2 monit"
