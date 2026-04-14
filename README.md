# FreshBooks Clone (MVP)

A lightweight FreshBooks-style web app for freelancers and small teams.

## Features

- Dashboard with high-level KPIs:
  - Paid revenue
  - Outstanding invoice value
  - Current month tracked hours
  - Current month expenses
- Client management (create + safe delete)
- Invoice management:
  - Create invoices with auto-numbering
  - Add/remove line items
  - Per-line tax
  - Status workflow (`draft`, `sent`, `paid`, `overdue`)
- Time tracking with billable rate support
- Expense tracking with optional client association

## Tech stack

- Python + Flask
- SQLite
- Jinja templates + custom CSS

## Run locally

1. Create and activate a virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Start the app:
   ```bash
   flask --app wsgi run --debug
   ```
4. Open:
   - `http://127.0.0.1:5000`

The app initializes and migrates the SQLite schema automatically on startup.
