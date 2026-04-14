# FreshBooks Clone

A FreshBooks-style billing app for freelancers and small teams with authentication, multi-user accounts, invitation onboarding, password reset, PDF invoice export, and Stripe payment automation.

## Features

### Authentication + multi-user accounts
- Email/password sign-up and login
- Password reset via one-time email-style tokens
- Account-level workspaces (tenants)
- Team management with roles:
  - `owner`
  - `admin`
  - `member`
- Invitation-based onboarding from the Team page for new users
- Account switcher for users who belong to multiple accounts
- All business data is account-scoped (clients/invoices/time/expenses are isolated per account)

### Billing and bookkeeping workflows
- Dashboard KPIs:
  - Paid revenue
  - Outstanding invoice value
  - Current month tracked hours
  - Current month expenses
- Client management (create + safe delete)
- Invoice management:
  - Account-scoped invoice numbering
  - Add/remove line items
  - Per-line tax
  - Status workflow (`draft`, `sent`, `paid`, `overdue`)
- Time tracking with billable rates
- Expense tracking with optional client association

### Production-style enhancements
- PDF invoice export (`/invoices/<id>/pdf`)
- Stripe payment link generation from each invoice detail page
  - Saves checkout URL on the invoice
  - Automatically promotes `draft` invoices to `sent` when link is generated
- Stripe webhook endpoint (`/stripe/webhook`) that auto-marks invoices as `paid` on successful checkout completion

### Built-in local email outbox (for development/testing)
- Token links (password reset and team invites) are stored in `outbound_emails` table as queued messages.
- This replaces a real SMTP integration in this MVP while keeping realistic token/email flows.

## Tech stack

- Python + Flask
- SQLite
- Jinja templates + custom CSS
- fpdf2 (PDF generation)
- Stripe Python SDK

## Run locally

1. Create and activate a virtual environment:
   ```bash
   python3 -m venv .venv
   source .venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   python3 -m pip install -r requirements.txt
   ```
3. Optional environment variables:
   ```bash
   export STRIPE_SECRET_KEY=sk_test_...
   export STRIPE_WEBHOOK_SECRET=whsec_...
   export APP_BASE_URL=http://127.0.0.1:5000
   ```
4. Start the app:
   ```bash
   flask --app wsgi run --debug
   ```
5. Open:
   - `http://127.0.0.1:5000`

The app initializes and migrates the SQLite schema automatically on startup.
