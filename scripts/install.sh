#!/usr/bin/env bash
# Ctxman - Installation Script
# Version: 2.3.6+
# Description: Installs ctxman globally on your system

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PACKAGE_NAME="ctxman"
INSTALL_DIR="$HOME/.ctxman"
BIN_LINK="/usr/local/bin/ctxman"
CONFIG_DIR="$HOME/.ctxman"
LOG_DIR="$CONFIG_DIR/logs"

echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Ctxman - Installation Script v2.3.6      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if Node.js is installed
echo -e "${YELLOW}➜${NC} Checking prerequisites..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗${NC} Node.js is not installed!"
    echo -e "${YELLOW}  Please install Node.js 22+ from: https://nodejs.org${NC}"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 22 ]; then
    echo -e "${RED}✗${NC} Node.js version 22+ required (current: $(node -v))"
    exit 1
fi

echo -e "${GREEN}✓${NC} Node.js $(node -v) detected"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗${NC} npm is not installed!"
    exit 1
fi

echo -e "${GREEN}✓${NC} npm $(npm -v) detected"
echo ""

# Ask for installation type
echo -e "${YELLOW}➜${NC} Choose installation method:"
echo "  1) Global installation (recommended)"
echo "  2) Local installation (current directory)"
echo ""
read -p "Enter choice [1-2] (default: 1): " choice

# Default to global if empty
if [ -z "$choice" ]; then
    choice=1
fi

case $choice in
    1)
        echo -e "${BLUE}Installing globally...${NC}"

        # Check if already installed
        if npm list -g $PACKAGE_NAME &> /dev/null; then
            echo -e "${YELLOW}⚠${NC}  $PACKAGE_NAME is already installed globally"
            read -p "Do you want to reinstall? [y/N]: " reinstall
            if [[ ! $reinstall =~ ^[Yy]$ ]]; then
                echo -e "${BLUE}Installation cancelled${NC}"
                exit 0
            fi
            echo -e "${YELLOW}➜${NC} Uninstalling existing version..."
            npm uninstall -g $PACKAGE_NAME
        fi

        echo -e "${YELLOW}➜${NC} Installing $PACKAGE_NAME globally..."
        npm install -g $PACKAGE_NAME

        echo -e "${GREEN}✓${NC} Global installation complete!"
        ;;

    2)
        echo -e "${BLUE}Installing locally...${NC}"

        # Create installation directory
        echo -e "${YELLOW}➜${NC} Creating installation directory..."
        mkdir -p "$INSTALL_DIR"

        # Clone or copy files
        if [ -d ".git" ]; then
            echo -e "${YELLOW}➜${NC} Copying files from git repository..."
            cp -r . "$INSTALL_DIR/"
        else
            echo -e "${YELLOW}➜${NC} Downloading from npm..."
            cd "$INSTALL_DIR"
            npm install $PACKAGE_NAME
        fi

        # Install dependencies
        echo -e "${YELLOW}➜${NC} Installing dependencies..."
        cd "$INSTALL_DIR"
        npm install

        # Create symlink
        echo -e "${YELLOW}➜${NC} Creating symlink..."
        if [ -L "$BIN_LINK" ]; then
            rm "$BIN_LINK"
        fi

        # Check if we need sudo for /usr/local/bin
        if [ -w "/usr/local/bin" ]; then
            ln -s "$INSTALL_DIR/bin/cli.js" "$BIN_LINK"
        else
            echo -e "${YELLOW}⚠${NC}  Need sudo to create symlink in /usr/local/bin"
            sudo ln -s "$INSTALL_DIR/bin/cli.js" "$BIN_LINK"
        fi

        chmod +x "$INSTALL_DIR/bin/cli.js"

        echo -e "${GREEN}✓${NC} Local installation complete!"
        ;;

    *)
        echo -e "${RED}✗${NC} Invalid choice"
        exit 1
        ;;
esac

# Create configuration directory
echo ""
echo -e "${YELLOW}➜${NC} Setting up configuration..."
mkdir -p "$CONFIG_DIR"
mkdir -p "$LOG_DIR"

# Create default config if not exists
if [ ! -f "$CONFIG_DIR/config.json" ]; then
    cat > "$CONFIG_DIR/config.json" <<EOF
{
  "version": "2.3.6",
  "updateChannel": "stable",
  "autoUpdate": false,
  "logLevel": "info",
  "telemetry": false,
  "outputFormat": "toon",
  "installedAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
    echo -e "${GREEN}✓${NC} Created default configuration"
fi

# Verify installation
echo ""
echo -e "${YELLOW}➜${NC} Verifying installation..."

if command -v ctxman &> /dev/null; then
    echo -e "${GREEN}✓${NC} ctxman is installed and ready!"
    echo -e "${GREEN}  Command available: ctxman${NC}"
else
    echo -e "${RED}✗${NC} Installation verification failed"
    echo -e "${YELLOW}  You may need to restart your terminal${NC}"
fi

# Success message
echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          Installation Complete! 🎉                     ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"
echo -e "  1. Run: ${YELLOW}ctxman --help${NC}"
echo -e "  2. Try wizard: ${YELLOW}ctxman --wizard${NC}"
echo -e "  3. View docs: ${YELLOW}https://github.com/hakkisagdic/ctxman${NC}"
echo ""
echo -e "${BLUE}Configuration:${NC}"
echo -e "  Directory: ${YELLOW}$CONFIG_DIR${NC}"
echo -e "  Logs: ${YELLOW}$LOG_DIR${NC}"
echo ""
echo -e "${BLUE}Update channel: ${YELLOW}stable${NC}"
echo -e "  Change to insider: ${YELLOW}ctxman config set updateChannel insider${NC}"
echo ""
