import functools
import io
import os
import sqlite3
from datetime import date

import click
import stripe
from fpdf import FPDF
from flask import (
    Flask,
    current_app,
    flash,
    g,
    redirect,
    render_template,
    request,
    send_file,
    session,
    url_for,
)
from werkzeug.security import check_password_hash, generate_password_hash

VALID_INVOICE_STATUSES = ("draft", "sent", "paid", "overdue")
VALID_ACCOUNT_ROLES = ("owner", "admin", "member")


def create_app(test_config=None):
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_mapping(
        SECRET_KEY="dev",
        DATABASE=os.path.join(app.instance_path, "freshbooks_clone.db"),
        STRIPE_SECRET_KEY=os.getenv("STRIPE_SECRET_KEY", ""),
        APP_BASE_URL=os.getenv("APP_BASE_URL", "http://127.0.0.1:5000"),
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
        migrate_schema(db)
        db.commit()

    @click.command("init-db")
    def init_db_command():
        init_db()
        click.echo("Initialized the database.")

    app.teardown_appcontext(close_db)
    app.cli.add_command(init_db_command)
    app.get_db = get_db
    app.init_db = init_db

    with app.app_context():
        init_db()


def register_routes(app):
    total_sql = "COALESCE(SUM(ii.quantity * ii.rate * (1 + ii.tax_percent / 100.0)), 0)"

    @app.before_request
    def load_logged_in_user():
        g.user = None
        g.account = None
        g.account_role = None
        g.user_accounts = []

        user_id = session.get("user_id")
        if user_id is None:
            return

        db = app.get_db()
        user = db.execute(
            "SELECT id, email, full_name, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if user is None:
            session.clear()
            return

        memberships = db.execute(
            """
            SELECT au.account_id, au.role, a.name AS account_name
            FROM account_users au
            JOIN accounts a ON a.id = au.account_id
            WHERE au.user_id = ?
            ORDER BY au.account_id ASC
            """,
            (user_id,),
        ).fetchall()
        if not memberships:
            session.clear()
            return

        g.user = user
        g.user_accounts = memberships

        account_id = session.get("account_id")
        current_membership = None
        for membership in memberships:
            if membership["account_id"] == account_id:
                current_membership = membership
                break
        if current_membership is None:
            current_membership = memberships[0]
            session["account_id"] = current_membership["account_id"]

        g.account = {
            "id": current_membership["account_id"],
            "name": current_membership["account_name"],
        }
        g.account_role = current_membership["role"]

    @app.post("/switch-account/<int:account_id>")
    @login_required
    def switch_account(account_id):
        membership = app.get_db().execute(
            """
            SELECT 1
            FROM account_users
            WHERE account_id = ? AND user_id = ?
            """,
            (account_id, g.user["id"]),
        ).fetchone()
        if membership is None:
            flash("You do not have access to that account.", "error")
            return redirect(url_for("dashboard"))
        session["account_id"] = account_id
        flash("Switched account.", "success")
        return redirect(url_for("dashboard"))

    @app.route("/register", methods=["GET", "POST"])
    def register():
        if g.user is not None:
            return redirect(url_for("dashboard"))
        if request.method == "POST":
            account_name = request.form.get("account_name", "").strip()
            full_name = request.form.get("full_name", "").strip()
            email = request.form.get("email", "").strip().lower()
            password = request.form.get("password", "")

            if not account_name or not full_name or not email or not password:
                flash("All fields are required.", "error")
                return redirect(url_for("register"))
            if len(password) < 8:
                flash("Password must be at least 8 characters.", "error")
                return redirect(url_for("register"))

            db = app.get_db()
            existing = db.execute(
                "SELECT id FROM users WHERE lower(email) = ?",
                (email,),
            ).fetchone()
            if existing is not None:
                flash("Email is already registered.", "error")
                return redirect(url_for("register"))

            cursor = db.execute("INSERT INTO accounts (name) VALUES (?)", (account_name,))
            account_id = cursor.lastrowid
            cursor = db.execute(
                """
                INSERT INTO users (email, full_name, password_hash)
                VALUES (?, ?, ?)
                """,
                (email, full_name, generate_password_hash(password)),
            )
            user_id = cursor.lastrowid
            db.execute(
                """
                INSERT INTO account_users (account_id, user_id, role)
                VALUES (?, ?, 'owner')
                """,
                (account_id, user_id),
            )
            db.commit()

            session.clear()
            session["user_id"] = user_id
            session["account_id"] = account_id
            flash("Welcome! Your account is ready.", "success")
            return redirect(url_for("dashboard"))
        return render_template("auth_register.html")

    @app.route("/login", methods=["GET", "POST"])
    def login():
        if g.user is not None:
            return redirect(url_for("dashboard"))
        if request.method == "POST":
            email = request.form.get("email", "").strip().lower()
            password = request.form.get("password", "")

            db = app.get_db()
            user = db.execute(
                """
                SELECT id, email, password_hash
                FROM users
                WHERE lower(email) = ?
                """,
                (email,),
            ).fetchone()
            if user is None or not check_password_hash(user["password_hash"], password):
                flash("Incorrect email or password.", "error")
                return redirect(url_for("login"))

            membership = db.execute(
                """
                SELECT account_id
                FROM account_users
                WHERE user_id = ?
                ORDER BY account_id ASC
                LIMIT 1
                """,
                (user["id"],),
            ).fetchone()
            if membership is None:
                flash("Your user is not assigned to an account.", "error")
                return redirect(url_for("login"))

            session.clear()
            session["user_id"] = user["id"]
            session["account_id"] = membership["account_id"]
            flash("Signed in successfully.", "success")
            return redirect(url_for("dashboard"))
        return render_template("auth_login.html")

    @app.post("/logout")
    @login_required
    def logout():
        session.clear()
        flash("Signed out.", "success")
        return redirect(url_for("login"))

    @app.route("/")
    @login_required
    def dashboard():
        db = app.get_db()
        account_id = g.account["id"]
        paid_total = db.execute(
            f"""
            SELECT COALESCE(SUM(invoice_totals.total), 0) AS paid_total
            FROM (
                SELECT i.id, {total_sql} AS total
                FROM invoices i
                LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
                WHERE i.status = 'paid' AND i.account_id = ?
                GROUP BY i.id
            ) AS invoice_totals
            """,
            (account_id,),
        ).fetchone()["paid_total"]
        outstanding_total = db.execute(
            f"""
            SELECT COALESCE(SUM(invoice_totals.total), 0) AS outstanding_total
            FROM (
                SELECT i.id, {total_sql} AS total
                FROM invoices i
                LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
                WHERE i.status != 'paid' AND i.account_id = ?
                GROUP BY i.id
            ) AS invoice_totals
            """,
            (account_id,),
        ).fetchone()["outstanding_total"]
        month_hours = db.execute(
            """
            SELECT COALESCE(SUM(hours), 0) AS month_hours
            FROM time_entries
            WHERE account_id = ?
              AND strftime('%Y-%m', work_date) = strftime('%Y-%m', 'now')
            """,
            (account_id,),
        ).fetchone()["month_hours"]
        month_expenses = db.execute(
            """
            SELECT COALESCE(SUM(amount), 0) AS month_expenses
            FROM expenses
            WHERE account_id = ?
              AND strftime('%Y-%m', expense_date) = strftime('%Y-%m', 'now')
            """,
            (account_id,),
        ).fetchone()["month_expenses"]
        recent_invoices = db.execute(
            f"""
            SELECT i.*, c.name AS client_name, {total_sql} AS total
            FROM invoices i
            JOIN clients c ON c.id = i.client_id
            LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
            WHERE i.account_id = ?
            GROUP BY i.id
            ORDER BY i.issue_date DESC, i.id DESC
            LIMIT 5
            """,
            (account_id,),
        ).fetchall()
        return render_template(
            "dashboard.html",
            paid_total=paid_total,
            outstanding_total=outstanding_total,
            month_hours=month_hours,
            month_expenses=month_expenses,
            recent_invoices=recent_invoices,
        )

    @app.route("/team", methods=["GET", "POST"])
    @login_required
    def team():
        db = app.get_db()
        account_id = g.account["id"]
        if request.method == "POST":
            if g.account_role not in ("owner", "admin"):
                flash("Only account owners/admins can add members.", "error")
                return redirect(url_for("team"))

            full_name = request.form.get("full_name", "").strip()
            email = request.form.get("email", "").strip().lower()
            password = request.form.get("password", "")
            role = request.form.get("role", "member").strip().lower()

            if not full_name or not email or not role:
                flash("Name, email, and role are required.", "error")
                return redirect(url_for("team"))
            if role not in VALID_ACCOUNT_ROLES:
                flash("Invalid role.", "error")
                return redirect(url_for("team"))
            if role == "owner" and g.account_role != "owner":
                flash("Only owners can add additional owners.", "error")
                return redirect(url_for("team"))

            existing_user = db.execute(
                "SELECT id FROM users WHERE lower(email) = ?",
                (email,),
            ).fetchone()
            if existing_user is None:
                if len(password) < 8:
                    flash("New users require a password with 8+ characters.", "error")
                    return redirect(url_for("team"))
                cursor = db.execute(
                    """
                    INSERT INTO users (email, full_name, password_hash)
                    VALUES (?, ?, ?)
                    """,
                    (email, full_name, generate_password_hash(password)),
                )
                user_id = cursor.lastrowid
            else:
                user_id = existing_user["id"]

            existing_membership = db.execute(
                """
                SELECT 1 FROM account_users
                WHERE account_id = ? AND user_id = ?
                """,
                (account_id, user_id),
            ).fetchone()
            if existing_membership is not None:
                flash("That user is already on this account.", "error")
                return redirect(url_for("team"))

            db.execute(
                """
                INSERT INTO account_users (account_id, user_id, role)
                VALUES (?, ?, ?)
                """,
                (account_id, user_id, role),
            )
            db.commit()
            flash("Team member added.", "success")
            return redirect(url_for("team"))

        members = db.execute(
            """
            SELECT u.full_name, u.email, au.role, au.created_at
            FROM account_users au
            JOIN users u ON u.id = au.user_id
            WHERE au.account_id = ?
            ORDER BY au.created_at ASC
            """,
            (account_id,),
        ).fetchall()
        return render_template("team.html", members=members)

    @app.route("/clients", methods=["GET", "POST"])
    @login_required
    def clients():
        db = app.get_db()
        account_id = g.account["id"]
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
                    INSERT INTO clients (account_id, name, email, company, phone)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (account_id, name, email, company, phone),
                )
                db.commit()
                flash("Client created.", "success")
                return redirect(url_for("clients"))
        clients_data = db.execute(
            """
            SELECT c.*, COUNT(i.id) AS invoice_count
            FROM clients c
            LEFT JOIN invoices i
              ON i.client_id = c.id
             AND i.account_id = c.account_id
            WHERE c.account_id = ?
            GROUP BY c.id
            ORDER BY c.created_at DESC
            """,
            (account_id,),
        ).fetchall()
        return render_template("clients.html", clients=clients_data)

    @app.post("/clients/<int:client_id>/delete")
    @login_required
    def delete_client(client_id):
        db = app.get_db()
        account_id = g.account["id"]
        client = db.execute(
            "SELECT id FROM clients WHERE id = ? AND account_id = ?",
            (client_id, account_id),
        ).fetchone()
        if client is None:
            flash("Client not found.", "error")
            return redirect(url_for("clients"))

        in_use = db.execute(
            """
            SELECT COUNT(*) AS total
            FROM invoices
            WHERE account_id = ? AND client_id = ?
            """,
            (account_id, client_id),
        ).fetchone()["total"]
        if in_use:
            flash("Cannot delete a client with invoices.", "error")
            return redirect(url_for("clients"))
        db.execute(
            "DELETE FROM clients WHERE id = ? AND account_id = ?",
            (client_id, account_id),
        )
        db.commit()
        flash("Client deleted.", "success")
        return redirect(url_for("clients"))

    @app.route("/invoices", methods=["GET", "POST"])
    @login_required
    def invoices():
        db = app.get_db()
        account_id = g.account["id"]
        if request.method == "POST":
            client_id_raw = request.form.get("client_id", "").strip()
            issue_date = request.form.get("issue_date", "").strip()
            due_date = request.form.get("due_date", "").strip()
            notes = request.form.get("notes", "").strip()
            if not client_id_raw or not issue_date or not due_date:
                flash("Client, issue date, and due date are required.", "error")
            else:
                try:
                    client_id = int(client_id_raw)
                except ValueError:
                    flash("Invalid client.", "error")
                    return redirect(url_for("invoices"))

                client = db.execute(
                    """
                    SELECT id
                    FROM clients
                    WHERE id = ? AND account_id = ?
                    """,
                    (client_id, account_id),
                ).fetchone()
                if client is None:
                    flash("Client not found in your account.", "error")
                    return redirect(url_for("invoices"))

                invoice_number = next_invoice_number(db, account_id)
                db.execute(
                    """
                    INSERT INTO invoices (
                        account_id, client_id, number, issue_date, due_date, status, notes
                    )
                    VALUES (?, ?, ?, ?, ?, 'draft', ?)
                    """,
                    (account_id, client_id, invoice_number, issue_date, due_date, notes),
                )
                db.commit()
                flash("Invoice created.", "success")
                return redirect(url_for("invoices"))
        clients_data = db.execute(
            "SELECT id, name FROM clients WHERE account_id = ? ORDER BY name ASC",
            (account_id,),
        ).fetchall()
        invoices_data = db.execute(
            f"""
            SELECT i.*, c.name AS client_name, {total_sql} AS total
            FROM invoices i
            JOIN clients c
              ON c.id = i.client_id
             AND c.account_id = i.account_id
            LEFT JOIN invoice_items ii ON ii.invoice_id = i.id
            WHERE i.account_id = ?
            GROUP BY i.id
            ORDER BY i.created_at DESC
            """,
            (account_id,),
        ).fetchall()
        return render_template(
            "invoices.html",
            invoices=invoices_data,
            clients=clients_data,
            statuses=VALID_INVOICE_STATUSES,
        )

    @app.route("/invoices/<int:invoice_id>", methods=["GET", "POST"])
    @login_required
    def invoice_detail(invoice_id):
        db = app.get_db()
        account_id = g.account["id"]

        if request.method == "POST":
            invoice, _items, _subtotal, _tax, _total = invoice_snapshot(db, account_id, invoice_id)
            if invoice is None:
                flash("Invoice not found.", "error")
                return redirect(url_for("invoices"))

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

        invoice, items, subtotal, total_tax, grand_total = invoice_snapshot(db, account_id, invoice_id)
        if invoice is None:
            flash("Invoice not found.", "error")
            return redirect(url_for("invoices"))
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
    @login_required
    def update_invoice_status(invoice_id):
        status = request.form.get("status", "").strip().lower()
        if status not in VALID_INVOICE_STATUSES:
            flash("Invalid invoice status.", "error")
            return redirect(url_for("invoice_detail", invoice_id=invoice_id))
        db = app.get_db()
        account_id = g.account["id"]
        db.execute(
            """
            UPDATE invoices
            SET status = ?
            WHERE id = ? AND account_id = ?
            """,
            (status, invoice_id, account_id),
        )
        db.commit()
        flash("Invoice status updated.", "success")
        return redirect(url_for("invoice_detail", invoice_id=invoice_id))

    @app.post("/invoices/<int:invoice_id>/delete-item/<int:item_id>")
    @login_required
    def delete_invoice_item(invoice_id, item_id):
        db = app.get_db()
        account_id = g.account["id"]
        db.execute(
            """
            DELETE FROM invoice_items
            WHERE id = ?
              AND invoice_id IN (
                  SELECT id FROM invoices
                  WHERE id = ? AND account_id = ?
              )
            """,
            (item_id, invoice_id, account_id),
        )
        db.commit()
        flash("Line item removed.", "success")
        return redirect(url_for("invoice_detail", invoice_id=invoice_id))

    @app.get("/invoices/<int:invoice_id>/pdf")
    @login_required
    def export_invoice_pdf(invoice_id):
        db = app.get_db()
        account_id = g.account["id"]
        invoice, items, subtotal, total_tax, grand_total = invoice_snapshot(db, account_id, invoice_id)
        if invoice is None:
            flash("Invoice not found.", "error")
            return redirect(url_for("invoices"))

        pdf_bytes = render_invoice_pdf(
            invoice=invoice,
            items=items,
            subtotal=subtotal,
            total_tax=total_tax,
            grand_total=grand_total,
            account_name=g.account["name"],
        )
        return send_file(
            io.BytesIO(pdf_bytes),
            mimetype="application/pdf",
            as_attachment=True,
            download_name=f"{invoice['number']}.pdf",
        )

    @app.post("/invoices/<int:invoice_id>/payment-link")
    @login_required
    def create_invoice_payment_link(invoice_id):
        db = app.get_db()
        account_id = g.account["id"]
        invoice, _items, _subtotal, _tax, grand_total = invoice_snapshot(db, account_id, invoice_id)
        if invoice is None:
            flash("Invoice not found.", "error")
            return redirect(url_for("invoices"))
        if grand_total <= 0:
            flash("Invoice total must be greater than zero.", "error")
            return redirect(url_for("invoice_detail", invoice_id=invoice_id))

        payment_url, error = create_stripe_checkout_link(
            invoice=invoice,
            grand_total=grand_total,
            app_base_url=current_app.config["APP_BASE_URL"],
            stripe_secret_key=current_app.config.get("STRIPE_SECRET_KEY", ""),
        )
        if error is not None:
            flash(error, "error")
            return redirect(url_for("invoice_detail", invoice_id=invoice_id))

        db.execute(
            """
            UPDATE invoices
            SET stripe_payment_url = ?, status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END
            WHERE id = ? AND account_id = ?
            """,
            (payment_url, invoice_id, account_id),
        )
        db.commit()
        flash("Stripe payment link generated.", "success")
        return redirect(url_for("invoice_detail", invoice_id=invoice_id))

    @app.route("/time-entries", methods=["GET", "POST"])
    @login_required
    def time_entries():
        db = app.get_db()
        account_id = g.account["id"]
        if request.method == "POST":
            client_id_raw = request.form.get("client_id", "").strip()
            description = request.form.get("description", "").strip()
            work_date = request.form.get("work_date", "").strip() or date.today().isoformat()
            hours_raw = request.form.get("hours", "").strip()
            billable_rate_raw = request.form.get("billable_rate", "").strip() or "0"
            if not client_id_raw or not description or not hours_raw:
                flash("Client, description, and hours are required.", "error")
            else:
                try:
                    client_id = int(client_id_raw)
                    hours = float(hours_raw)
                    billable_rate = float(billable_rate_raw)
                except ValueError:
                    flash("Client, hours, and billable rate must be valid numbers.", "error")
                    return redirect(url_for("time_entries"))

                client = db.execute(
                    "SELECT id FROM clients WHERE id = ? AND account_id = ?",
                    (client_id, account_id),
                ).fetchone()
                if client is None:
                    flash("Client not found in your account.", "error")
                    return redirect(url_for("time_entries"))

                if hours <= 0:
                    flash("Hours must be positive.", "error")
                else:
                    db.execute(
                        """
                        INSERT INTO time_entries (
                            account_id, client_id, description, work_date, hours, billable_rate
                        )
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (account_id, client_id, description, work_date, hours, billable_rate),
                    )
                    db.commit()
                    flash("Time entry logged.", "success")
                    return redirect(url_for("time_entries"))
        entries = db.execute(
            """
            SELECT te.*, c.name AS client_name, (te.hours * te.billable_rate) AS billable_total
            FROM time_entries te
            JOIN clients c
              ON c.id = te.client_id
             AND c.account_id = te.account_id
            WHERE te.account_id = ?
            ORDER BY te.work_date DESC, te.id DESC
            """,
            (account_id,),
        ).fetchall()
        clients_data = db.execute(
            "SELECT id, name FROM clients WHERE account_id = ? ORDER BY name ASC",
            (account_id,),
        ).fetchall()
        return render_template("time_entries.html", entries=entries, clients=clients_data)

    @app.route("/expenses", methods=["GET", "POST"])
    @login_required
    def expenses():
        db = app.get_db()
        account_id = g.account["id"]
        if request.method == "POST":
            client_id_raw = request.form.get("client_id", "").strip()
            category = request.form.get("category", "").strip()
            description = request.form.get("description", "").strip()
            expense_date = request.form.get("expense_date", "").strip() or date.today().isoformat()
            amount_raw = request.form.get("amount", "").strip()
            client_id = None
            if client_id_raw:
                try:
                    client_id = int(client_id_raw)
                except ValueError:
                    flash("Invalid client.", "error")
                    return redirect(url_for("expenses"))
                client = db.execute(
                    "SELECT id FROM clients WHERE id = ? AND account_id = ?",
                    (client_id, account_id),
                ).fetchone()
                if client is None:
                    flash("Client not found in your account.", "error")
                    return redirect(url_for("expenses"))

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
                        INSERT INTO expenses (
                            account_id, client_id, category, description, expense_date, amount
                        )
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (account_id, client_id, category, description, expense_date, amount),
                    )
                    db.commit()
                    flash("Expense recorded.", "success")
                    return redirect(url_for("expenses"))
        expenses_data = db.execute(
            """
            SELECT e.*, c.name AS client_name
            FROM expenses e
            LEFT JOIN clients c
              ON c.id = e.client_id
             AND c.account_id = e.account_id
            WHERE e.account_id = ?
            ORDER BY e.expense_date DESC, e.id DESC
            """,
            (account_id,),
        ).fetchall()
        clients_data = db.execute(
            "SELECT id, name FROM clients WHERE account_id = ? ORDER BY name ASC",
            (account_id,),
        ).fetchall()
        return render_template("expenses.html", expenses=expenses_data, clients=clients_data)


def column_exists(db, table_name, column_name):
    table_info = db.execute(f"PRAGMA table_info({table_name})").fetchall()
    return any(row["name"] == column_name for row in table_info)


def migrate_schema(db):
    default_account = db.execute(
        "SELECT id FROM accounts ORDER BY id ASC LIMIT 1"
    ).fetchone()
    if default_account is None:
        cursor = db.execute("INSERT INTO accounts (name) VALUES ('Primary Account')")
        default_account_id = cursor.lastrowid
    else:
        default_account_id = default_account["id"]

    owner_user = db.execute("SELECT id FROM users ORDER BY id ASC LIMIT 1").fetchone()
    if owner_user is None:
        cursor = db.execute(
            """
            INSERT INTO users (email, full_name, password_hash)
            VALUES (?, ?, ?)
            """,
            (
                "owner@example.com",
                "Owner User",
                generate_password_hash("changeme123"),
            ),
        )
        owner_user_id = cursor.lastrowid
    else:
        owner_user_id = owner_user["id"]

    owner_membership = db.execute(
        """
        SELECT 1
        FROM account_users
        WHERE account_id = ? AND user_id = ?
        """,
        (default_account_id, owner_user_id),
    ).fetchone()
    if owner_membership is None:
        db.execute(
            """
            INSERT INTO account_users (account_id, user_id, role)
            VALUES (?, ?, 'owner')
            """,
            (default_account_id, owner_user_id),
        )

    for table_name in ("clients", "invoices", "time_entries", "expenses"):
        if not column_exists(db, table_name, "account_id"):
            db.execute(f"ALTER TABLE {table_name} ADD COLUMN account_id INTEGER")
        db.execute(
            f"""
            UPDATE {table_name}
            SET account_id = ?
            WHERE account_id IS NULL
            """,
            (default_account_id,),
        )

    if not column_exists(db, "invoices", "stripe_payment_url"):
        db.execute("ALTER TABLE invoices ADD COLUMN stripe_payment_url TEXT")


def login_required(view):
    @functools.wraps(view)
    def wrapped_view(**kwargs):
        if g.user is None or g.account is None:
            return redirect(url_for("login"))
        return view(**kwargs)

    return wrapped_view


def next_invoice_number(db, account_id):
    prefix = f"INV-{date.today().year}-"
    base_count = db.execute(
        """
        SELECT COUNT(*) AS count
        FROM invoices
        WHERE account_id = ? AND number LIKE ?
        """,
        (account_id, f"{prefix}%"),
    ).fetchone()["count"]
    sequence = base_count + 1
    while True:
        candidate = f"{prefix}{sequence:04d}"
        collision = db.execute(
            "SELECT 1 FROM invoices WHERE number = ?",
            (candidate,),
        ).fetchone()
        if collision is None:
            return candidate
        sequence += 1


def invoice_snapshot(db, account_id, invoice_id):
    invoice = db.execute(
        """
        SELECT
            i.*,
            c.name AS client_name,
            c.email AS client_email,
            c.company AS client_company
        FROM invoices i
        JOIN clients c
          ON c.id = i.client_id
         AND c.account_id = i.account_id
        WHERE i.id = ? AND i.account_id = ?
        """,
        (invoice_id, account_id),
    ).fetchone()
    if invoice is None:
        return None, [], 0.0, 0.0, 0.0

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
    return invoice, items, subtotal, total_tax, grand_total


def render_invoice_pdf(invoice, items, subtotal, total_tax, grand_total, account_name):
    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, "Invoice", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 12)
    pdf.cell(0, 8, f"Business: {account_name}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, f"Invoice #: {invoice['number']}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, f"Client: {invoice['client_name']}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(
        0,
        8,
        f"Issue Date: {invoice['issue_date']}    Due Date: {invoice['due_date']}",
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.ln(5)

    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(70, 8, "Description", border=1)
    pdf.cell(25, 8, "Qty", border=1)
    pdf.cell(30, 8, "Rate", border=1)
    pdf.cell(20, 8, "Tax %", border=1)
    pdf.cell(40, 8, "Line Total", border=1, new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", "", 10)
    for item in items:
        pdf.cell(70, 8, str(item["description"])[:36], border=1)
        pdf.cell(25, 8, f"{item['quantity']:.2f}", border=1)
        pdf.cell(30, 8, f"${item['rate']:.2f}", border=1)
        pdf.cell(20, 8, f"{item['tax_percent']:.2f}", border=1)
        pdf.cell(40, 8, f"${item['line_total']:.2f}", border=1, new_x="LMARGIN", new_y="NEXT")

    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 11)
    pdf.cell(0, 8, f"Subtotal: ${subtotal:.2f}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, f"Tax: ${total_tax:.2f}", new_x="LMARGIN", new_y="NEXT")
    pdf.cell(0, 8, f"Total: ${grand_total:.2f}", new_x="LMARGIN", new_y="NEXT")
    if invoice["notes"]:
        pdf.ln(4)
        pdf.set_font("Helvetica", "B", 11)
        pdf.cell(0, 8, "Notes", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 6, invoice["notes"])

    payload = pdf.output()
    if isinstance(payload, str):
        return payload.encode("latin1")
    return bytes(payload)


def create_stripe_checkout_link(invoice, grand_total, app_base_url, stripe_secret_key):
    if not stripe_secret_key:
        return None, "Set STRIPE_SECRET_KEY to generate Stripe payment links."

    stripe.api_key = stripe_secret_key
    try:
        checkout_session = stripe.checkout.Session.create(
            mode="payment",
            success_url=f"{app_base_url}/invoices/{invoice['id']}?payment=success",
            cancel_url=f"{app_base_url}/invoices/{invoice['id']}?payment=cancelled",
            line_items=[
                {
                    "price_data": {
                        "currency": "usd",
                        "unit_amount": int(round(grand_total * 100)),
                        "product_data": {
                            "name": f"Invoice {invoice['number']}",
                            "description": f"Payment for {invoice['client_name']}",
                        },
                    },
                    "quantity": 1,
                }
            ],
            metadata={
                "invoice_id": str(invoice["id"]),
                "invoice_number": invoice["number"],
                "account_id": str(invoice["account_id"]),
            },
        )
    except Exception as exc:  # noqa: BLE001
        return None, f"Stripe error: {exc}"

    return checkout_session.url, None
