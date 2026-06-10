#!/bin/sh

# Generate secure secrets for Slimbooks production deployment.
# This script now uses .env.example as the source of truth and preserves
# existing .env values (including external service keys) when regenerating.

set -e

# Colors for output (portable ANSI sequences)
RED=$(printf '\033[0;31m')
GREEN=$(printf '\033[0;32m')
YELLOW=$(printf '\033[1;33m')
BLUE=$(printf '\033[0;34m')
NC=$(printf '\033[0m')

print_status() {
    printf "%b✅ %s%b\n" "$GREEN" "$1" "$NC"
}

print_warning() {
    printf "%b⚠️  %s%b\n" "$YELLOW" "$1" "$NC"
}

print_error() {
    printf "%b❌ %s%b\n" "$RED" "$1" "$NC"
}

generate_secret() {
    length=${1:-64}
    openssl rand -base64 "$length" | tr -d '=+/' | cut -c1-"$length"
}

extract_env_value() {
    key="$1"
    file="$2"
    awk -v k="$key" '
        $0 ~ ("^" k "=") {
            sub(/^[^=]*=/, "");
            print;
            exit;
        }
    ' "$file"
}

set_env_value() {
    key="$1"
    value="$2"
    file="$3"
    tmp_file="${file}.tmp.$$"

    awk -v k="$key" -v v="$value" '
        BEGIN { found = 0 }
        $0 ~ ("^" k "=") {
            print k "=" v;
            found = 1;
            next;
        }
        { print }
        END {
            if (!found) {
                print k "=" v;
            }
        }
    ' "$file" > "$tmp_file"

    mv "$tmp_file" "$file"
}

# Check dependencies
if ! command -v openssl >/dev/null 2>&1; then
    print_error "OpenSSL is required but not installed."
    exit 1
fi

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
ENV_FILE="$PROJECT_ROOT/.env"
ENV_TEMPLATE="$PROJECT_ROOT/.env.example"
BACKUP_FILE="$PROJECT_ROOT/.env.backup.$(date +%Y%m%d_%H%M%S)"

if [ ! -f "$ENV_TEMPLATE" ]; then
    print_error "Template file not found: $ENV_TEMPLATE"
    exit 1
fi

printf "%b\n" "${BLUE}🔐 Generating secure secrets for Slimbooks...${NC}"
printf "%b\n" "${BLUE}🎲 Generating cryptographically secure secrets...${NC}"

JWT_SECRET=$(generate_secret 64)
JWT_REFRESH_SECRET=$(generate_secret 64)
SESSION_SECRET=$(generate_secret 64)

print_status "Secrets generated successfully"

PREVIOUS_ENV=""
if [ -f "$ENV_FILE" ]; then
    print_warning "Existing .env file found. Creating backup..."
    cp "$ENV_FILE" "$BACKUP_FILE"
    PREVIOUS_ENV="$BACKUP_FILE"
    print_status "Backup created: $BACKUP_FILE"
fi

printf "%b\n" "${BLUE}📝 Creating .env file from .env.example template...${NC}"
cp "$ENV_TEMPLATE" "$ENV_FILE"

if [ -n "$PREVIOUS_ENV" ] && [ -f "$PREVIOUS_ENV" ]; then
    print_status "Merging existing environment values into new template"
    awk -F= '/^[A-Za-z_][A-Za-z0-9_]*=/{ print $1 }' "$PREVIOUS_ENV" | awk '!seen[$0]++' | while IFS= read -r key; do
        value=$(extract_env_value "$key" "$PREVIOUS_ENV")
        set_env_value "$key" "$value" "$ENV_FILE"
    done
fi

# Always refresh generated secrets and enforce production defaults.
set_env_value "JWT_SECRET" "$JWT_SECRET" "$ENV_FILE"
set_env_value "JWT_REFRESH_SECRET" "$JWT_REFRESH_SECRET" "$ENV_FILE"
set_env_value "SESSION_SECRET" "$SESSION_SECRET" "$ENV_FILE"
set_env_value "NODE_ENV" "production" "$ENV_FILE"
set_env_value "HOST" "0.0.0.0" "$ENV_FILE"
set_env_value "ADMIN_PASSWORD" "SlimBooks123" "$ENV_FILE"

chmod 600 "$ENV_FILE"
print_status ".env file created with secure secrets"
print_status "File permissions set to 600 (owner read/write only)"

printf "\n%b🎉 Secure secrets generated successfully!%b\n" "$GREEN" "$NC"
printf "%b📊 Configuration Summary:%b\n" "$BLUE" "$NC"
printf "  🔐 JWT Secret: %.16s... (64 characters)\n" "$JWT_SECRET"
printf "  🔐 JWT Refresh Secret: %.16s... (64 characters)\n" "$JWT_REFRESH_SECRET"
printf "  🔐 Session Secret: %.16s... (64 characters)\n" "$SESSION_SECRET"

printf "\n%b📁 Files Created:%b\n" "$BLUE" "$NC"
printf "  ✅ %s (secure environment configuration)\n" "$ENV_FILE"
if [ -f "$BACKUP_FILE" ]; then
    printf "  💾 %s (backup of previous configuration)\n" "$BACKUP_FILE"
fi

printf "\n%b⚠️  Important Security Notes:%b\n" "$YELLOW" "$NC"
printf "  • Existing integration keys are preserved when regenerating .env\n"
printf "  • Keep your .env file secure and never commit it to version control\n"
printf "  • Update CORS_ORIGIN to match your actual domain in production\n"
printf "  • The .env file has been set to read/write for owner only (600 permissions)\n"

printf "\n%b🔧 Next Steps:%b\n" "$BLUE" "$NC"
printf "  1. Review and customize the .env file as needed\n"
printf "  2. Configure optional services (email providers) if needed\n"
printf "  3. Run the deployment script: ./scripts/deploy.sh\n"

printf "\n%b✅ Your Slimbooks application is now configured with secure secrets!%b\n" "$GREEN" "$NC"
