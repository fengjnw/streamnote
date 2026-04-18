import tempfile
from pathlib import Path

from flask import Flask

from auth_store import create_auth_store
from routes.auth_routes import register_auth_routes


def make_test_app(db_path: str):
    app = Flask(__name__)
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
