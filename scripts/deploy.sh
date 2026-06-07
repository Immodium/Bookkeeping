#!/bin/sh

# Slimbooks Production Deployment Script for Raspberry Pi (POSIX compliant)
# This script builds and deploys the application using Docker

set -e  # Exit on any error

# Colors for output (portable ANSI sequences)
RED="$(printf '\033[0;31m')"
GREEN="$(printf '\033[0;32m')"
YELLOW="$(printf '\033[1;33m')"
BLUE="$(printf '\033[0;34m')"
NC="$(printf '\033[0m')" # No Color

# Configuration
APP_NAME="slimbooks"
CONTAINER_NAME="slimbooks-app"
IMAGE_NAME="slimbooks:latest"
PORT=8080
DATA_DIR="./data"
UPLOADS_DIR="./uploads"
LOGS_DIR="./logs"

printf "%s🚀 Starting Slimbooks deployment...%s\n" "$BLUE" "$NC"

# Function to print colored output
print_status() {
    printf "%s✅ %s%s\n" "$GREEN" "$1" "$NC"
}

print_warning() {
    printf "%s⚠️  %s%s\n" "$YELLOW" "$1" "$NC"
}

print_error() {
    printf "%s❌ %s%s\n" "$RED" "$1" "$NC"
}

# Check if Docker is installed and running
if ! command -v docker >/dev/null 2>&1; then
    print_error "Docker is not installed. Please install Docker first."
    exit 1
fi

if ! docker info >/dev/null 2>&1; then
    print_error "Docker is not running. Please start Docker first."
    exit 1
fi

print_status "Docker is available and running"

# Check if docker-compose is available
if ! command -v docker-compose >/dev/null 2>&1; then
    print_warning "docker-compose not found, using 'docker compose' instead"
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# Create necessary directories
printf "%s📁 Creating necessary directories...%s\n" "$BLUE" "$NC"
mkdir -p "$DATA_DIR" "$UPLOADS_DIR" "$LOGS_DIR"
print_status "Directories created"

# Check for environment file
if [ ! -f ".env" ]; then
    print_warning "No .env file found. Creating from .env.production template..."
    if [ -f ".env.production" ]; then
        cp .env.production .env
        print_warning "Please edit .env file and update the JWT secrets before continuing!"
        printf "%sPress ENTER to continue after updating .env file...%s" "$YELLOW" "$NC"
        read dummy
    else
        print_error ".env.production template not found. Please create .env file manually."
        exit 1
    fi
fi

# Validate critical environment variables in .env
printf "%s🔍 Validating environment configuration (.env)...%s\n" "$BLUE" "$NC"

if [ ! -f ".env" ]; then
    print_error ".env file not found — cannot validate environment."
    exit 1
fi

# Read a value straight from the .env FILE (first matching KEY=...), ignoring any
# value that may already be exported in the surrounding shell environment, so the
# checks below reflect what is actually written in .env. Strips an optional
# `export ` prefix and surrounding single/double quotes.
env_file_value() {
    line=$(grep -E "^[[:space:]]*(export[[:space:]]+)?$1=" .env | head -n1)
    if [ -z "$line" ]; then
        printf '%s' ""
        return 0
    fi
    value=${line#*=}
    case "$value" in
        \"*\") value=${value#\"}; value=${value%\"} ;;
        \'*\') value=${value#\'}; value=${value%\'} ;;
    esac
    printf '%s' "$value"
}

ENV_ERRORS=0

JWT_SECRET=$(env_file_value "JWT_SECRET")
JWT_REFRESH_SECRET=$(env_file_value "JWT_REFRESH_SECRET")
SESSION_SECRET=$(env_file_value "SESSION_SECRET")
DATABASE_URL=$(env_file_value "DATABASE_URL")
WEBHOOK_ENCRYPTION_KEY=$(env_file_value "WEBHOOK_ENCRYPTION_KEY")

# Require a variable to be present and non-empty.
require_var() {
    # $1 = name, $2 = value
    if [ -z "$2" ]; then
        print_error "$1 is missing or empty in .env"
        ENV_ERRORS=$((ENV_ERRORS + 1))
    fi
}

# Require a secret: present, not a leftover placeholder, and long enough.
# $1 = name, $2 = value, $3 = minimum length (matches server config validation).
require_secret() {
    if [ -z "$2" ]; then
        print_error "$1 is missing or empty in .env"
        ENV_ERRORS=$((ENV_ERRORS + 1))
        return 0
    fi
    case "$2" in
        *CHANGE_THIS*|*change-in-production*|*your-secret*|*your-refresh*|*your-session*|*replace-with*|*default-*)
            print_error "$1 still contains a placeholder value in .env — generate a real secret (see scripts/generate-secrets.sh)"
            ENV_ERRORS=$((ENV_ERRORS + 1))
            return 0
            ;;
    esac
    if [ "${#2}" -lt "$3" ]; then
        print_error "$1 must be at least $3 characters (currently ${#2})"
        ENV_ERRORS=$((ENV_ERRORS + 1))
    fi
}

# Always-required configuration.
require_var "DATABASE_URL" "$DATABASE_URL"

# Secrets required by the server in production (server/config/index.ts).
require_secret "JWT_SECRET" "$JWT_SECRET" 32
require_secret "JWT_REFRESH_SECRET" "$JWT_REFRESH_SECRET" 32
require_secret "SESSION_SECRET" "$SESSION_SECRET" 32

# Optional, but if set the webhook encryption key must be exactly 64 hex chars.
if [ -n "$WEBHOOK_ENCRYPTION_KEY" ]; then
    if [ "${#WEBHOOK_ENCRYPTION_KEY}" -ne 64 ]; then
        print_error "WEBHOOK_ENCRYPTION_KEY must be exactly 64 hex characters when set (currently ${#WEBHOOK_ENCRYPTION_KEY})"
        ENV_ERRORS=$((ENV_ERRORS + 1))
    else
        case "$WEBHOOK_ENCRYPTION_KEY" in
            *[!0-9a-fA-F]*)
                print_error "WEBHOOK_ENCRYPTION_KEY must contain only hex characters (0-9, a-f)"
                ENV_ERRORS=$((ENV_ERRORS + 1))
                ;;
        esac
    fi
fi

if [ "$ENV_ERRORS" -gt 0 ]; then
    print_error "Environment validation failed with $ENV_ERRORS error(s). Update .env and re-run the deploy."
    exit 1
fi

print_status "Environment configuration validated"

# Stop existing container if running
printf "%s🛑 Stopping existing containers...%s\n" "$BLUE" "$NC"
$DOCKER_COMPOSE down --remove-orphans || true
print_status "Existing containers stopped"

# Build the application
printf "%s🔨 Building application...%s\n" "$BLUE" "$NC"
npm ci --only=production
npm run build
print_status "Application built successfully"

# Build Docker image
printf "%s🐳 Building Docker image...%s\n" "$BLUE" "$NC"
docker build -t "$IMAGE_NAME" .
print_status "Docker image built successfully"

# Start the application
printf "%s🚀 Starting application...%s\n" "$BLUE" "$NC"
$DOCKER_COMPOSE up -d
print_status "Application started successfully"

# Wait for application to be ready
printf "%s⏳ Waiting for application to be ready...%s\n" "$BLUE" "$NC"
sleep 10

# Health check loop (POSIX compliant)
printf "%s🏥 Performing health check...%s\n" "$BLUE" "$NC"
i=1
while [ "$i" -le 30 ]; do
    if curl -f "http://localhost:$PORT/api/health" >/dev/null 2>&1; then
        print_status "Application is healthy and ready!"
        break
    fi
    if [ "$i" -eq 30 ]; then
        print_error "Health check failed after 30 attempts"
        printf "%sChecking logs...%s\n" "$YELLOW" "$NC"
        $DOCKER_COMPOSE logs --tail=20
        exit 1
    fi
    printf "."
    sleep 2
    i=$((i+1))
done

# Deployment info
printf "\n%s🎉 Deployment completed successfully!%s\n" "$GREEN" "$NC"
printf "%s📊 Deployment Information:%s\n" "$BLUE" "$NC"
printf "  🌐 Application URL: http://localhost:%s\n" "$PORT"
printf "  🐳 Container Name: %s\n" "$CONTAINER_NAME"
printf "  📁 Data Directory: %s\n" "$DATA_DIR"
printf "  📤 Uploads Directory: %s\n" "$UPLOADS_DIR"
printf "  📝 Logs Directory: %s\n" "$LOGS_DIR"

printf "\n%s🔧 Useful Commands:%s\n" "$BLUE" "$NC"
printf "  View logs: %s logs -f\n" "$DOCKER_COMPOSE"
printf "  Stop app: %s down\n" "$DOCKER_COMPOSE"
printf "  Restart: %s restart\n" "$DOCKER_COMPOSE"
printf "  Update: ./scripts/deploy.sh\n"

printf "\n%s✅ Slimbooks is now running on your Raspberry Pi!%s\n" "$GREEN" "$NC"
