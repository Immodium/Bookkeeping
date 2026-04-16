# Slimbooks

A secure, self-hosted billing and invoice management application built with React, TypeScript, and SQLite. Perfect for small businesses and freelancers who want complete control over their financial data.

🔒 **Security-First** • 🐳 **Docker Ready** • 🥧 **Raspberry Pi Optimized**

## ✨ Key Features

### 💼 Business Management
- **📊 Dashboard**: Real-time financial overview with interactive charts
- **👥 Client Management**: Complete client profiles with contact details and history
- **🧾 Professional Invoices**: Customizable templates with line items, taxes, and shipping
- **🔄 Recurring Invoices**: Automated recurring billing with customizable schedules (weekly, monthly, quarterly, yearly)
- **💰 Expense Tracking**: Categorized expense management with receipt uploads
- **📈 Financial Reports**: Revenue and expense analytics with detailed monthly/quarterly columns for yearly reports

### 🔒 Security & Privacy
- **🛡️ Enterprise Security**: Rate limiting, input validation, and security headers
- **🔐 JWT Authentication**: Secure token-based authentication with 2FA support
- **🏠 Self-Hosted**: Complete data ownership - no third-party data sharing
- **🔒 Encrypted Storage**: Secure SQLite database with encrypted sensitive data

### 🚀 Deployment
- **🐳 Docker Ready**: One-command deployment with Docker Compose
- **🥧 Raspberry Pi**: Optimized for ARM devices and low-power systems
- **⚡ Fast Setup**: Automated scripts for quick deployment
- **📦 Portable**: SQLite database - easy backup and migration

## 🛠️ Tech Stack

**Frontend**: React 18 + TypeScript + Vite
**UI**: shadcn/ui + Tailwind CSS + Lucide Icons
**Backend**: Node.js + Express + SQLite
**Security**: Helmet + Rate Limiting + JWT + bcrypt
**Deployment**: Docker + Docker Compose
**Charts**: Recharts for analytics visualization

## 🚀 Quick Start

### 🐳 Docker Deployment (Recommended)

```bash
# Clone the repository
git clone <your-repository-url>
cd slimbooks

# Generate secure secrets
./scripts/generate-secrets.sh

# Deploy with Docker
./scripts/deploy.sh
```

Access your app at `http://localhost:8080`

### 🥧 Raspberry Pi Setup

```bash
# Prepare your Raspberry Pi
curl -fsSL https://raw.githubusercontent.com/rbenzing/slimbooks/main/scripts/setup-raspberry-pi.sh | bash

# Deploy the application
./scripts/deploy.sh
```

### 💻 Development Setup

```bash
# Install dependencies
npm install

# Start development servers
npm run dev
```

Frontend: `http://localhost:8080` • Backend: `http://localhost:3002`

## ⚙️ Configuration

### Environment Variables

The application uses environment variables for secure configuration:

```env
# Security (REQUIRED - change in production)
JWT_SECRET=your-secure-64-character-secret
JWT_REFRESH_SECRET=your-secure-refresh-secret
SESSION_SECRET=your-secure-session-secret

# Network
CORS_ORIGIN=http://localhost:8080
PORT=3002

# Features
ENABLE_DEBUG_ENDPOINTS=false
```

Use `./scripts/generate-secrets.sh` to create secure secrets automatically.

### Database

- **SQLite**: Lightweight, serverless database perfect for self-hosting
- **Automatic Backups**: Daily automated backups with rotation
- **Data Portability**: Single file database for easy migration
- **No External Dependencies**: Everything runs locally

## 🔄 Recurring Invoice System

Slimbooks includes a powerful recurring invoice system for automated billing:

### Features
- **📅 Flexible Scheduling**: Weekly, monthly, quarterly, yearly, or custom frequencies
- **🤖 Automated Processing**: Cron job integration for hands-off billing
- **👥 Client-Specific Templates**: Create recurring templates for each client
- **💰 Dynamic Pricing**: Support for line items, taxes, and shipping
- **📊 Processing Statistics**: Monitor template performance and processing status
- **⚡ Manual Triggers**: Process individual templates or all due templates on-demand

### API Endpoints
```
/api/recurring-templates/*    - Template CRUD operations
/api/cron/recurring-invoices  - Automated processing endpoint
```

### Template Management
- Create recurring templates with client association
- Set payment terms and due date calculations
- Activate/deactivate templates as needed
- Track next invoice dates automatically
- Monitor processing history and errors

## 🔒 Security Features

- **🛡️ Rate Limiting**: Protection against brute force attacks (100 req/15min)
- **🔐 JWT Authentication**: Secure token-based auth with configurable expiration
- **🚫 Input Validation**: Server-side validation prevents injection attacks
- **🔒 Security Headers**: Comprehensive protection with Helmet.js
- **👤 Account Lockout**: Automatic lockout after failed login attempts
- **🔑 2FA Support**: Two-factor authentication for enhanced security
- **📝 Audit Logging**: Request/response logging for security monitoring

## 📚 Documentation

- **[Deployment Guide](./documentation/DEPLOYMENT.md)**: Complete deployment instructions
- **[Theme System](./THEME_SYSTEM.md)**: Customization and theming guide
- **[Contributing](./CONTRIBUTING.md)**: Development and contribution guidelines

## 🔧 Management Commands

```bash
# Update deployment
./scripts/deploy.sh

# Generate new secrets
./scripts/generate-secrets.sh

# Generate new certs for ssl
./scripts/generate-ssl-certs.sh
```

## 📄 License

MIT License - see [LICENSE](./LICENSE) for details.

---

**🏠 Self-hosted • 🔒 Secure • 🚀 Production-ready**

Perfect for small businesses, freelancers, and anyone who values data privacy and control.