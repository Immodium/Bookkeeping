from freshbooks_clone import create_app


def build_client(tmp_path):
    database_path = tmp_path / "test.db"
    app = create_app(
        {
            "TESTING": True,
            "SECRET_KEY": "test",
            "DATABASE": str(database_path),
            "APP_BASE_URL": "http://testserver.local",
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
            "password": "anothersecure123",
        },
        follow_redirects=True,
    )
    assert add_member.status_code == 200
    assert b"Team member added." in add_member.data
    assert b"bob@example.com" in add_member.data


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
        lambda **kwargs: ("https://checkout.stripe.test/session_123", None),
    )
    link_response = client.post("/invoices/1/payment-link", follow_redirects=True)
    assert link_response.status_code == 200
    assert b"Stripe payment link generated." in link_response.data
    assert b"https://checkout.stripe.test/session_123" in link_response.data
