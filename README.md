# Slimbooks

Slimbooks is a self-hosted invoicing and bookkeeping app built with React, TypeScript, Express, and PostgreSQL.
It is designed for small teams that want full control of business data without relying on a hosted SaaS billing platform.

## What is in the current app

### Core modules
- Dashboard with business KPIs and charts
- Client management (create/edit/search/import/export)
- Invoices (draft/sent/paid flows)
- Recurring invoice templates + cron processing
- Expenses with receipt workflows
- Payments
- Retainers
- Reports (Profit & Loss, Expense, Invoice, Client)
- Settings (company, tax, shipping, notifications, appearance, integrations, users, backup/restore)

### Expense receipt workflows
- Upload with OCR (`Upload & OCR`) to auto-fill expense fields
- Manual attach (`Attach File Only`) for receipts/documents without OCR
- Replace/remove attachment in edit mode
- View attached receipt from the expense record details

### Auth and access control
- JWT auth with refresh tokens
- Register, login, forgot/reset password, email verification endpoints
- Role-based route protection (admin, user manager, project manager, client manager, viewer-style access controls)

### Data and deployment
- PostgreSQL 16 database (multi-tenant schema isolation)
- In-app backup/export and import/restore support
- Docker + docker-compose deployment
- Raspberry Pi-friendly scripts

## Tech stack

- Frontend: React 18, TypeScript, Vite, Tailwind, shadcn/radix UI
- Backend: Express (ESM), TypeScript, PostgreSQL (`pg`)
- Security: Helmet, express-rate-limit, express-validator, JWT, bcrypt
- OCR/PDF: `tesseract.js`, `pdf-lib`, Puppeteer-based PDF routes

## Quick start (development)

### 1) Install
```bash
npm install
```

### 2) PostgreSQL database
PostgreSQL 16 is required. For local development:

```bash
# Start PostgreSQL (Debian/Ubuntu example)
sudo pg_ctlcluster 16 main start

# Create role + database (once)
sudo -u postgres createuser -s slimbooks || true
sudo -u postgres psql -c "ALTER USER slimbooks WITH PASSWORD 'slimbooks';"
sudo -u postgres createdb -O slimbooks slimbooks || true
```

Set `DATABASE_URL` when running the app:

```bash
export DATABASE_URL=postgresql://slimbooks:slimbooks@localhost:5432/slimbooks?sslmode=disable
```

Migrations run automatically on server startup.

### 3) Configure env
Create `.env` from `.env.example` and adjust values for your environment.

At minimum for local development:
- `PORT=3002`
- `CLIENT_URL=http://localhost:8080`
- `CORS_ORIGIN=http://localhost:8080`
- `JWT_SECRET`, `JWT_REFRESH_SECRET`, `SESSION_SECRET`

### 4) Run the app
```bash
DATABASE_URL=postgresql://slimbooks:slimbooks@localhost:5432/slimbooks?sslmode=disable npm run dev
```

- Frontend: `http://localhost:8080`
- Backend/API: `http://localhost:3002`

### Seeded dev login
- Email: `admin@slimbooks.app`
- Password: `password`

## Scripts

| Task | Command |
|---|---|
| Dev server (frontend + backend) | `npm run dev` |
| Build | `npm run build` |
| Lint | `npm run lint` |
| Tests | `npm run test` |
| Test watch | `npm run test:watch` |
| Coverage | `npm run test:coverage` |

## Docker deployment

```bash
# Generate production secrets and .env
./scripts/generate-secrets.sh

# Build + deploy
./scripts/deploy.sh
```

The provided `docker-compose.yml` runs Slimbooks as `slimbooks-app` with persisted:
- `./data`
- `./uploads`
- `./logs`

## Key API groups

- `/api/auth` - login/register/verification/password flows
- `/api/users` - user/role management
- `/api/clients`
- `/api/invoices`
- `/api/recurring-templates`
- `/api/expenses` (includes `/receipt-ocr` and `/receipt-upload`)
- `/api/payments`
- `/api/retainers`
- `/api/reports` and `/api/reports/schedules`
- `/api/settings` + `/api/project-settings`
- `/api/db` (database export/import)
- `/api/cron` (recurring invoice processing)
- `/api/health`

## Optional integrations

Configured via env + project settings:
- SMTP or SendGrid email
- Stripe
- Google OAuth

The app is fully usable without these integrations enabled.

## Security notes

- Uses secure headers, request validation, and rate limits
- Login attempts are rate-limited and account lockout rules are configurable
- For production, always set strong secrets and TLS (`ENABLE_HTTPS=true` when applicable)

## Additional docs

- `documentation/DEPLOYMENT.md`
- `documentation/THEME_SYSTEM.md`
- `scripts/setup-cron.md`

## License

MIT License - see `LICENSE`.