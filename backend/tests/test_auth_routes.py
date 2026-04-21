import tempfile
from pathlib import Path

from flask import Flask

from auth_store import create_auth_store
from routes.auth_routes import register_auth_routes


def make_test_app(db_path: str, auth_cookie_secure: bool = False):
    app = Flask(__name__)
    app.config["AUTH_COOKIE_SECURE"] = auth_cookie_secure
    store = create_auth_store(db_path)

    def server_error_response(error, prefix=""):
        return {"error": {"code": "INTERNAL_SERVER_ERROR", "message": f"{prefix}{error}"}}, 500

    register_auth_routes(app, store, server_error_response)
    return app


def test_register_login_me_logout_flow():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        app = make_test_app(db_path)
        client = app.test_client()

        register_response = client.post(
            "/api/auth/register",
            json={
                "email": "test@example.com",
                "password": "123456",
                "deviceId": "device-12345678",
            },
        )
        assert register_response.status_code == 200
        assert register_response.get_json()["user"]["email"] == "test@example.com"

        me_response = client.get("/api/auth/me")
        assert me_response.status_code == 200
        assert me_response.get_json()["user"]["email"] == "test@example.com"

        logout_response = client.post("/api/auth/logout")
        assert logout_response.status_code == 200

        me_after_logout = client.get("/api/auth/me")
        assert me_after_logout.status_code == 401


def test_login_invalid_credentials_returns_401():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        app = make_test_app(db_path)
        client = app.test_client()

        client.post(
            "/api/auth/register",
            json={"email": "test@example.com", "password": "123456"},
        )

        login_response = client.post(
            "/api/auth/login",
            json={"email": "test@example.com", "password": "bad-password"},
        )

        assert login_response.status_code == 401
        payload = login_response.get_json()
        assert payload["error"]["code"] == "INVALID_CREDENTIALS"


def test_register_duplicate_email_returns_409():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        app = make_test_app(db_path)
        client = app.test_client()

        client.post(
            "/api/auth/register",
            json={"email": "dup@example.com", "password": "123456"},
        )

        duplicate = client.post(
            "/api/auth/register",
            json={"email": "dup@example.com", "password": "123456"},
        )

        assert duplicate.status_code == 409
        payload = duplicate.get_json()
        assert payload["error"]["code"] == "EMAIL_EXISTS"


def test_delete_account_requires_correct_password_and_logs_out():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        app = make_test_app(db_path)
        client = app.test_client()

        client.post(
            "/api/auth/register",
            json={"email": "remove@example.com", "password": "123456"},
        )

        bad_delete = client.post(
            "/api/auth/delete-account",
            json={"password": "wrong123"},
        )
        assert bad_delete.status_code == 401

        good_delete = client.post(
            "/api/auth/delete-account",
            json={"password": "123456"},
        )
        assert good_delete.status_code == 200
        assert good_delete.get_json()["ok"] is True

        me_after_delete = client.get("/api/auth/me")
        assert me_after_delete.status_code == 401


def test_register_sets_secure_cookie_when_enabled():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        app = make_test_app(db_path, auth_cookie_secure=True)
        client = app.test_client()

        response = client.post(
            "/api/auth/register",
            json={"email": "secure@example.com", "password": "123456"},
        )

        assert response.status_code == 200
        set_cookie = response.headers.get("Set-Cookie", "")
        assert "Secure" in set_cookie
        assert "HttpOnly" in set_cookie


def test_register_sets_non_secure_cookie_when_disabled():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        app = make_test_app(db_path, auth_cookie_secure=False)
        client = app.test_client()

        response = client.post(
            "/api/auth/register",
            json={"email": "local@example.com", "password": "123456"},
        )

        assert response.status_code == 200
        set_cookie = response.headers.get("Set-Cookie", "")
        assert "Secure" not in set_cookie


def test_register_non_json_returns_structured_error():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "auth.db")
        app = make_test_app(db_path)
        client = app.test_client()

        response = client.post(
            "/api/auth/register",
            data="plain-text",
            content_type="text/plain",
        )

        assert response.status_code == 400
        payload = response.get_json()
        assert payload["error"]["code"] == "INVALID_JSON"
