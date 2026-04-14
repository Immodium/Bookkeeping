import os
import sqlite3
from datetime import date

import click
from flask import Flask, current_app, flash, g, redirect, render_template, request, url_for

VALID_INVOICE_STATUSES = ("draft", "sent", "paid", "overdue")


def create_app(test_config=None):
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_mapping(
        SECRET_KEY="dev",
        DATABASE=os.path.join(app.instance_path, "freshbooks_clone.db"),
    )

    if test_config is None:
        app.config.from_pyfile("config.py", silent=True)
    else:
        app.config.update(test_config)

    os.makedirs(app.instance_path, exist_ok=True)
    register_database(app)
    register_routes(app)
    return app


def register_database(app):
    def get_db():
        if "db" not in g:
            g.db = sqlite3.connect(current_app.config["DATABASE"])
            g.db.row_factory = sqlite3.Row
            # Keep relational integrity for client/invoice references.
            g.db.execute("PRAGMA foreign_keys = ON")
        return g.db

    def close_db(_error=None):
        db = g.pop("db", None)
        if db is not None:
            db.close()

    def init_db():
        db = get_db()
        with current_app.open_resource("schema.sql") as schema_file:
            db.executescript(schema_file.read().decode("utf8"))

    @click.command("init-db")
    def init_db_command():
        init_db()
        click.echo("Initialized the database.")

    app.teardown_appcontext(close_db)
    app.cli.add_command(init_db_command)
    app.get_db = get_db
    app.init_db = init_db

    with app.app_context():
        db = get_db()
        schema_ready = db.execute(
            """
            SELECT 1
            FROM sqlite_master
            WHERE type = 'table' AND name = 'clients'
            """
        ).fetchone()
        if schema_ready is None:
            init_db()


def register_routes(app):
    total_sql = "COALESCE(SUM(ii.quantity * ii.rate * (1 + ii.tax_percent / 100.0)), 0)"

    @app.get("/")
    def dashboard():
        db = app.get_db()
        paid_total = db.execute(
            f"""
            SELECT COALESCE(SUM(invoice_totals.total), 0) AS paid_total
            FROM (
                SELECT i.id, {total_sql} AS total
                FROM invoices i
                LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
                WHERE i.status = 'paid'
                GROUP BY i.id
            ) AS invoice_totals
            """
        ).fetchone()["paid_total"]
        outstanding_total = db.execute(
            f"""
            SELECT COALESCE(SUM(invoice_totals.total), 0) AS outstanding_total
            FROM (
                SELECT i.id, {total_sql} AS total
                FROM invoices i
                LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
                WHERE i.status != 'paid'
                GROUP BY i.id
            ) AS invoice_totals
            """
        ).fetchone()["outstanding_total"]
        month_hours = db.execute(
            """
            SELECT COALESCE(SUM(hours), 0) AS month_hours
            FROM time_entries
            WHERE strftime('%Y-%m', work_date) = strftime('%Y-%m', 'now')
            """
        ).fetchone()["month_hours"]
        month_expenses = db.execute(
            """
            SELECT COALESCE(SUM(amount), 0) AS month_expenses
            FROM expenses
            WHERE strftime('%Y-%m', expense_date) = strftime('%Y-%m', 'now')
            """
        ).fetchone()["month_expenses"]
        recent_invoices = db.execute(
            f"""
            SELECT i.*, c.name AS client_name, {total_sql} AS total
            FROM invoices i
            JOIN clients c ON c.id = i.client_id
            LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
            GROUP BY i.id
            ORDER BY i.issue_date DESC, i.id DESC
            LIMIT 5
            """
        ).fetchall()
        return render_template(
            "dashboard.html",
            paid_total=paid_total,
            outstanding_total=outstanding_total,
            month_hours=month_hours,
            month_expenses=month_expenses,
            recent_invoices=recent_invoices,
        )

    @app.route("/clients", methods=["GET", "POST"])
    def clients():
        db = app.get_db()
        if request.method == "POST":
            name = request.form.get("name", "").strip()
            email = request.form.get("email", "").strip()
            company = request.form.get("company", "").strip()
            phone = request.form.get("phone", "").strip()
            if not name:
                flash("Client name is required.", "error")
            else:
                db.execute(
                    """
                    INSERT INTO clients (name, email, company, phone)
                    VALUES (?, ?, ?, ?)
                    """,
                    (name, email, company, phone),
                )
                db.commit()
                flash("Client created.", "success")
                return redirect(url_for("clients"))
        clients_data = db.execute(
            """
            SELECT c.*, COUNT(i.id) AS invoice_count
            FROM clients c
            LEFT JOIN invoices i ON i.client_id = c.id
            GROUP BY c.id
            ORDER BY c.created_at DESC
            """
        ).fetchall()
        return render_template("clients.html", clients=clients_data)

    @app.post("/clients/<int:client_id>/delete")
    def delete_client(client_id):
        db = app.get_db()
        in_use = db.execute(
            "SELECT COUNT(*) AS total FROM invoices WHERE client_id = ?",
            (client_id,),
        ).fetchone()["total"]
        if in_use:
            flash("Cannot delete a client with invoices.", "error")
            return redirect(url_for("clients"))
        db.execute("DELETE FROM clients WHERE id = ?", (client_id,))
        db.commit()
        flash("Client deleted.", "success")
        return redirect(url_for("clients"))

    @app.route("/invoices", methods=["GET", "POST"])
    def invoices():
        db = app.get_db()
        if request.method == "POST":
            client_id = request.form.get("client_id", "").strip()
            issue_date = request.form.get("issue_date", "").strip()
            due_date = request.form.get("due_date", "").strip()
            notes = request.form.get("notes", "").strip()
            if not client_id or not issue_date or not due_date:
                flash("Client, issue date, and due date are required.", "error")
            else:
                invoice_number = next_invoice_number(db)
                db.execute(
                    """
                    INSERT INTO invoices (client_id, number, issue_date, due_date, status, notes)
                    VALUES (?, ?, ?, ?, 'draft', ?)
                    """,
                    (client_id, invoice_number, issue_date, due_date, notes),
                )
                db.commit()
                flash("Invoice created.", "success")
                return redirect(url_for("invoices"))
        clients_data = db.execute(
            "SELECT id, name FROM clients ORDER BY name ASC"
        ).fetchall()
        invoices_data = db.execute(
            f"""
            SELECT i.*, c.name AS client_name, {total_sql} AS total
            FROM invoices i
            JOIN clients c ON c.id = i.client_id
            LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
            GROUP BY i.id
            ORDER BY i.created_at DESC
            """
        ).fetchall()
        return render_template(
            "invoices.html", invoices=invoices_data, clients=clients_data, statuses=VALID_INVOICE_STATUSES
        )

    @app.route("/invoices/<int:invoice_id>", methods=["GET", "POST"])
    def invoice_detail(invoice_id):
        db = app.get_db()
        if request.method == "POST":
            description = request.form.get("description", "").strip()
            quantity_raw = request.form.get("quantity", "").strip()
            rate_raw = request.form.get("rate", "").strip()
            tax_raw = request.form.get("tax_percent", "").strip() or "0"
            if not description or not quantity_raw or not rate_raw:
                flash("Description, quantity, and rate are required.", "error")
            else:
                try:
                    quantity = float(quantity_raw)
                    rate = float(rate_raw)
                    tax_percent = float(tax_raw)
                except ValueError:
                    flash("Quantity, rate, and tax must be numbers.", "error")
                    return redirect(url_for("invoice_detail", invoice_id=invoice_id))
                if quantity <= 0 or rate < 0:
                    flash("Quantity must be positive and rate cannot be negative.", "error")
                else:
                    db.execute(
                        """
                        INSERT INTO invoice_items (invoice_id, description, quantity, rate, tax_percent)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (invoice_id, description, quantity, rate, tax_percent),
                    )
                    db.commit()
                    flash("Line item added.", "success")
                    return redirect(url_for("invoice_detail", invoice_id=invoice_id))

        invoice = db.execute(
            """
            SELECT i.*, c.name AS client_name, c.email AS client_email, c.company AS client_company
            FROM invoices i
            JOIN clients c ON c.id = i.client_id
            WHERE i.id = ?
            """,
            (invoice_id,),
        ).fetchone()
        if invoice is None:
            flash("Invoice not found.", "error")
            return redirect(url_for("invoices"))
        items = db.execute(
            """
            SELECT *, (quantity * rate * (1 + tax_percent / 100.0)) AS line_total
            FROM invoice_items
            WHERE invoice_id = ?
            ORDER BY id ASC
            """,
            (invoice_id,),
        ).fetchall()
        subtotal = sum(item["quantity"] * item["rate"] for item in items)
        total_tax = sum(item["quantity"] * item["rate"] * item["tax_percent"] / 100.0 for item in items)
        grand_total = subtotal + total_tax
        return render_template(
            "invoice_detail.html",
            invoice=invoice,
            items=items,
            subtotal=subtotal,
            total_tax=total_tax,
            grand_total=grand_total,
            statuses=VALID_INVOICE_STATUSES,
        )

    @app.post("/invoices/<int:invoice_id>/status")
    def update_invoice_status(invoice_id):
        status = request.form.get("status", "").strip().lower()
        if status not in VALID_INVOICE_STATUSES:
            flash("Invalid invoice status.", "error")
            return redirect(url_for("invoice_detail", invoice_id=invoice_id))
        db = app.get_db()
        db.execute("UPDATE invoices SET status = ? WHERE id = ?", (status, invoice_id))
        db.commit()
        flash("Invoice status updated.", "success")
        return redirect(url_for("invoice_detail", invoice_id=invoice_id))

    @app.post("/invoices/<int:invoice_id>/delete-item/<int:item_id>")
    def delete_invoice_item(invoice_id, item_id):
        db = app.get_db()
        db.execute(
            "DELETE FROM invoice_items WHERE id = ? AND invoice_id = ?",
            (item_id, invoice_id),
        )
        db.commit()
        flash("Line item removed.", "success")
        return redirect(url_for("invoice_detail", invoice_id=invoice_id))

    @app.route("/time-entries", methods=["GET", "POST"])
    def time_entries():
        db = app.get_db()
        if request.method == "POST":
            client_id = request.form.get("client_id", "").strip()
            description = request.form.get("description", "").strip()
            work_date = request.form.get("work_date", "").strip() or date.today().isoformat()
            hours_raw = request.form.get("hours", "").strip()
            billable_rate_raw = request.form.get("billable_rate", "").strip() or "0"
            if not client_id or not description or not hours_raw:
                flash("Client, description, and hours are required.", "error")
            else:
                try:
                    hours = float(hours_raw)
                    billable_rate = float(billable_rate_raw)
                except ValueError:
                    flash("Hours and billable rate must be numbers.", "error")
                    return redirect(url_for("time_entries"))
                if hours <= 0:
                    flash("Hours must be positive.", "error")
                else:
                    db.execute(
                        """
                        INSERT INTO time_entries (client_id, description, work_date, hours, billable_rate)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (client_id, description, work_date, hours, billable_rate),
                    )
                    db.commit()
                    flash("Time entry logged.", "success")
                    return redirect(url_for("time_entries"))
        entries = db.execute(
            """
            SELECT te.*, c.name AS client_name, (te.hours * te.billable_rate) AS billable_total
            FROM time_entries te
            JOIN clients c ON c.id = te.client_id
            ORDER BY te.work_date DESC, te.id DESC
            """
        ).fetchall()
        clients_data = db.execute("SELECT id, name FROM clients ORDER BY name ASC").fetchall()
        return render_template("time_entries.html", entries=entries, clients=clients_data)

    @app.route("/expenses", methods=["GET", "POST"])
    def expenses():
        db = app.get_db()
        if request.method == "POST":
            client_id = request.form.get("client_id", "").strip() or None
            category = request.form.get("category", "").strip()
            description = request.form.get("description", "").strip()
            expense_date = request.form.get("expense_date", "").strip() or date.today().isoformat()
            amount_raw = request.form.get("amount", "").strip()
            if not category or not description or not amount_raw:
                flash("Category, description, and amount are required.", "error")
            else:
                try:
                    amount = float(amount_raw)
                except ValueError:
                    flash("Amount must be a number.", "error")
                    return redirect(url_for("expenses"))
                if amount <= 0:
                    flash("Amount must be positive.", "error")
                else:
                    db.execute(
                        """
                        INSERT INTO expenses (client_id, category, description, expense_date, amount)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                        (client_id, category, description, expense_date, amount),
                    )
                    db.commit()
                    flash("Expense recorded.", "success")
                    return redirect(url_for("expenses"))
        expenses_data = db.execute(
            """
            SELECT e.*, c.name AS client_name
            FROM expenses e
            LEFT JOIN clients c ON c.id = e.client_id
            ORDER BY e.expense_date DESC, e.id DESC
            """
        ).fetchall()
        clients_data = db.execute("SELECT id, name FROM clients ORDER BY name ASC").fetchall()
        return render_template("expenses.html", expenses=expenses_data, clients=clients_data)


def next_invoice_number(db):
    prefix = f"INV-{date.today().year}-"
    row = db.execute(
        "SELECT COUNT(*) AS count FROM invoices WHERE number LIKE ?",
        (f"{prefix}%",),
    ).fetchone()
    return f"{prefix}{row['count'] + 1:04d}"
