import tempfile
from pathlib import Path

from flask import Flask

from auth_store import create_auth_store
from routes.auth_routes import register_auth_routes
from routes.session_routes import register_session_routes
from session_store import create_session_store


def make_test_app(db_path: str):
    app = Flask(__name__)
    auth_store = create_auth_store(db_path)
    session_store = create_session_store(db_path)

    def server_error_response(error, prefix=""):
        return {"error": {"code": "INTERNAL_SERVER_ERROR", "message": f"{prefix}{error}"}}, 500

    register_auth_routes(app, auth_store, server_error_response)
    register_session_routes(app, session_store, server_error_response, auth_store=auth_store)
    return app


def test_account_session_requires_auth():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "account-session.db")
        app = make_test_app(db_path)
        client = app.test_client()

        response = client.get("/api/account-session-state")
        assert response.status_code == 401
        payload = response.get_json()
        assert payload["error"]["code"] == "AUTH_REQUIRED"


def test_account_session_roundtrip_after_login():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "account-session.db")
        app = make_test_app(db_path)
        client = app.test_client()

        register_response = client.post(
            "/api/auth/register",
            json={"email": "sync@example.com", "password": "123456", "deviceId": "device-12345678"},
        )
        assert register_response.status_code == 200

        state = {
            "sessions": {
                "s-1": {
                    "id": "s-1",
                    "name": "Session 1",
                    "transcripts": {"0": {"text": "hello", "timestamp": 1}},
                    "lastModified": 100,
                }
            },
            "currentSessionId": "s-1",
            "defaultSettings": {
                "defaultLanguage": "Chinese",
                "defaultExplanationLanguage": "Chinese",
            },
        }

        put_response = client.put(
            "/api/account-session-state",
            json={"state": state},
        )
        assert put_response.status_code == 200

        get_response = client.get("/api/account-session-state")
        assert get_response.status_code == 200
        payload = get_response.get_json()

        assert payload["state"]["currentSessionId"] == "s-1"
        assert payload["state"]["sessions"]["s-1"]["name"] == "Session 1"
        assert isinstance(payload["updatedAt"], int)
