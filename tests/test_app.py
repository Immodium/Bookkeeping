from freshbooks_clone import create_app


def build_client(tmp_path):
    database_path = tmp_path / "test.db"
    app = create_app(
        {
            "TESTING": True,
            "SECRET_KEY": "test",
            "DATABASE": str(database_path),
            "APP_BASE_URL": "http://testserver.local",
            "STRIPE_WEBHOOK_SECRET": "whsec_test",
        }
    )
    return app.test_client()


def register_account(client, *, account_name, full_name, email, password):
    return client.post(
        "/register",
        data={
            "account_name": account_name,
            "full_name": full_name,
            "email": email,
            "password": password,
        },
        follow_redirects=True,
    )


def create_client(client, *, name="Acme LLC"):
    return client.post(
        "/clients",
        data={
            "name": name,
            "email": "hello@acme.test",
            "company": "Acme",
            "phone": "111-222-3333",
        },
        follow_redirects=True,
    )


def create_invoice(client, *, client_id="1"):
    return client.post(
        "/invoices",
        data={
            "client_id": client_id,
            "issue_date": "2026-04-01",
            "due_date": "2026-04-15",
            "notes": "Net 14",
        },
        follow_redirects=True,
    )


def add_invoice_item(client, invoice_id="1"):
    return client.post(
        f"/invoices/{invoice_id}",
        data={
            "description": "Design work",
            "quantity": "2",
            "rate": "125",
            "tax_percent": "10",
        },
        follow_redirects=True,
    )


def test_auth_required_for_dashboard(tmp_path):
    client = build_client(tmp_path)
    response = client.get("/")
    assert response.status_code == 302
    assert "/login" in response.headers["Location"]


def test_registration_and_team_management(tmp_path):
    client = build_client(tmp_path)
    registration = register_account(
        client,
        account_name="Northwind LLC",
        full_name="Alice Owner",
        email="alice@example.com",
        password="verysecure123",
    )
    assert registration.status_code == 200
    assert b"Welcome! Your account is ready." in registration.data

    add_member = client.post(
        "/team",
        data={
            "full_name": "Bob Admin",
            "email": "bob@example.com",
            "role": "admin",
        },
        follow_redirects=True,
    )
    assert add_member.status_code == 200
    assert b"Invitation sent to team member." in add_member.data
    assert b"bob@example.com" in add_member.data

    with client.session_transaction() as sess:
        sess.clear()

    bad_invite = client.get("/team/invite/not-a-real-token", follow_redirects=True)
    assert b"Invitation link is invalid or expired." in bad_invite.data

    # Pull invite token from "outbox", then accept invite.
    app = client.application
    with app.app_context():
        db = app.get_db()
        email_row = db.execute(
            "SELECT body FROM outbound_emails WHERE to_email = ? ORDER BY id DESC LIMIT 1",
            ("bob@example.com",),
        ).fetchone()
    assert email_row is not None
    invite_url = email_row["body"].split("Accept your invite here:\n", 1)[1].splitlines()[0].strip()
    invite_path = invite_url.replace("http://testserver.local", "", 1)

    accepted = client.post(
        invite_path,
        data={"full_name": "Bob Admin", "password": "anothersecure123"},
        follow_redirects=True,
    )
    assert accepted.status_code == 200
    assert b"Welcome to Northwind LLC!" in accepted.data


def test_account_scoped_invoice_access(tmp_path):
    first_client = build_client(tmp_path)
    register_account(
        first_client,
        account_name="Account One",
        full_name="User One",
        email="one@example.com",
        password="password123",
    )
    create_client(first_client, name="Client One")
    create_invoice(first_client, client_id="1")
    add_invoice_item(first_client, "1")

    first_client.post("/logout", follow_redirects=True)

    second_client = build_client(tmp_path)
    register_account(
        second_client,
        account_name="Account Two",
        full_name="User Two",
        email="two@example.com",
        password="password456",
    )

    hidden_clients = second_client.get("/clients")
    assert hidden_clients.status_code == 200
    assert b"Client One" not in hidden_clients.data

    forbidden_invoice = second_client.get("/invoices/1", follow_redirects=True)
    assert forbidden_invoice.status_code == 200
    assert b"Invoice not found." in forbidden_invoice.data


def test_invoice_pdf_export_and_payment_link(tmp_path, monkeypatch):
    client = build_client(tmp_path)
    register_account(
        client,
        account_name="Billing Account",
        full_name="Bill Owner",
        email="bill@example.com",
        password="strongpassword123",
    )
    create_client(client, name="Client Billing")
    create_invoice(client, client_id="1")
    add_invoice_item(client, "1")

    pdf = client.get("/invoices/1/pdf")
    assert pdf.status_code == 200
    assert pdf.headers["Content-Type"].startswith("application/pdf")
    assert pdf.data.startswith(b"%PDF")

    monkeypatch.setattr(
        "freshbooks_clone.app.create_stripe_checkout_link",
        lambda **kwargs: ("https://checkout.stripe.test/session_123", "cs_test_123", None),
    )
    link_response = client.post("/invoices/1/payment-link", follow_redirects=True)
    assert link_response.status_code == 200
    assert b"Stripe payment link generated." in link_response.data
    assert b"https://checkout.stripe.test/session_123" in link_response.data

    def fake_construct_event(payload, signature, secret):
        return {
            "type": "checkout.session.completed",
            "data": {"object": {"id": "cs_test_123"}},
        }

    monkeypatch.setattr("freshbooks_clone.app.stripe.Webhook.construct_event", fake_construct_event)
    webhook_response = client.post(
        "/stripe/webhook",
        data=b'{"id":"evt_test"}',
        headers={"Stripe-Signature": "sig_test"},
    )
    assert webhook_response.status_code == 200

    refreshed = client.get("/invoices/1", follow_redirects=True)
    assert b"<option value=\"paid\" selected>" in refreshed.data


def test_password_reset_token_flow(tmp_path):
    client = build_client(tmp_path)
    register_account(
        client,
        account_name="Reset Corp",
        full_name="Reset Owner",
        email="reset@example.com",
        password="initialpass123",
    )
    client.post("/logout", follow_redirects=True)

    requested = client.post(
        "/forgot-password",
        data={"email": "reset@example.com"},
        follow_redirects=True,
    )
    assert requested.status_code == 200
    assert b"If an account exists for that email" in requested.data

    app = client.application
    with app.app_context():
        db = app.get_db()
        email_row = db.execute(
            "SELECT body FROM outbound_emails WHERE to_email = ? ORDER BY id DESC LIMIT 1",
            ("reset@example.com",),
        ).fetchone()
    assert email_row is not None
    reset_url = email_row["body"].split("Use this link within one hour:\n", 1)[1].splitlines()[0].strip()
    reset_path = reset_url.replace("http://testserver.local", "", 1)

    reset_done = client.post(
        reset_path,
        data={"password": "newpass123", "confirm_password": "newpass123"},
        follow_redirects=True,
    )
    assert reset_done.status_code == 200
    assert b"Password updated. Please sign in." in reset_done.data

    relogin = client.post(
        "/login",
        data={"email": "reset@example.com", "password": "newpass123"},
        follow_redirects=True,
    )
    assert relogin.status_code == 200
    assert b"Signed in successfully." in relogin.data
