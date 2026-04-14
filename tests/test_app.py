from freshbooks_clone import create_app


def build_client(tmp_path):
    database_path = tmp_path / "test.db"
    app = create_app(
        {
            "TESTING": True,
            "SECRET_KEY": "test",
            "DATABASE": str(database_path),
        }
    )
    return app.test_client()


def test_homepage_loads(tmp_path):
    client = build_client(tmp_path)
    response = client.get("/")
    assert response.status_code == 200
    assert b"FreshBooks Clone" in response.data


def test_create_client(tmp_path):
    client = build_client(tmp_path)
    response = client.post(
        "/clients",
        data={
            "name": "Acme LLC",
            "email": "hello@acme.test",
            "company": "Acme",
            "phone": "111-222-3333",
        },
        follow_redirects=True,
    )
    assert response.status_code == 200
    assert b"Client created." in response.data
    assert b"Acme LLC" in response.data


def test_invoice_lifecycle(tmp_path):
    client = build_client(tmp_path)
    client.post("/clients", data={"name": "Client One"}, follow_redirects=True)
    response = client.post(
        "/invoices",
        data={
            "client_id": "1",
            "issue_date": "2026-04-01",
            "due_date": "2026-04-15",
            "notes": "Net 14",
        },
        follow_redirects=True,
    )
    assert response.status_code == 200
    assert b"Invoice created." in response.data

    detail = client.post(
        "/invoices/1",
        data={
            "description": "Design work",
            "quantity": "2",
            "rate": "125",
            "tax_percent": "10",
        },
        follow_redirects=True,
    )
    assert detail.status_code == 200
    assert b"Line item added." in detail.data
    assert b"$275.00" in detail.data
