#!/bin/bash
# BookMarx Server Setup Script
# Run on a fresh Ubuntu 22.04 VPS

set -e

echo "=========================================="
echo "BookMarx Server Setup"
echo "=========================================="

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root"
    exit 1
fi

# Update system
echo "[1/8] Updating system packages..."
apt update && apt upgrade -y

# Install Node.js 20.x
echo "[2/8] Installing Node.js..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Install build essentials (for native modules)
echo "[3/8] Installing build tools..."
apt install -y build-essential git

# Install Nginx
echo "[4/8] Installing Nginx..."
apt install -y nginx
systemctl enable nginx

# Install PM2
echo "[5/8] Installing PM2..."
npm install -g pm2
pm2 startup systemd -u root --hp /root

# Install Certbot for SSL
echo "[6/8] Installing Certbot..."
apt install -y certbot python3-certbot-nginx

# Create app directories
echo "[7/8] Creating directories..."
mkdir -p /home/gazza/bookmarx
mkdir -p /var/log/bookmarx
chown -R gazza:gazza /home/gazza/bookmarx
chown -R gazza:gazza /var/log/bookmarx

# Configure firewall
echo "[8/8] Configuring firewall..."
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

echo ""
echo "=========================================="
echo "Setup complete!"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Configure your domain DNS to point to this server"
echo "2. Run: certbot --nginx -d api.bookmarx.app"
echo "3. Copy nginx.conf to /etc/nginx/sites-available/bookmarx"
echo "4. Enable site: ln -s /etc/nginx/sites-available/bookmarx /etc/nginx/sites-enabled/"
echo "5. Run deploy.sh to deploy the application"
echo ""
echo "Server info:"
echo "  Node.js: $(node -v)"
echo "  npm: $(npm -v)"
echo "  PM2: $(pm2 -v)"
echo "  Nginx: $(nginx -v 2>&1)"
