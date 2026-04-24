import tempfile
from pathlib import Path

from flask import Flask

from routes.session_routes import register_session_routes
from session_store import create_session_store


def make_test_app(db_path: str):
    app = Flask(__name__)
    store = create_session_store(db_path)

    def server_error_response(error, prefix=""):
        return {"error": {"code": "INTERNAL_SERVER_ERROR", "message": f"{prefix}{error}"}}, 500

    register_session_routes(app, store, server_error_response)
    return app


def test_get_session_state_not_found_returns_null_state():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "sessions.db")
        app = make_test_app(db_path)
        client = app.test_client()

        response = client.get("/api/session-state?deviceId=test-device-123")

        assert response.status_code == 200
        payload = response.get_json()
        assert payload["state"] is None
        assert payload["updatedAt"] is None


def test_put_then_get_session_state_roundtrip():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "sessions.db")
        app = make_test_app(db_path)
        client = app.test_client()

        state = {
            "sessions": {
                "1": {
                    "id": "1",
                    "name": "Session 1",
                    "transcripts": {"0": {"text": "hello", "timestamp": 1}},
                }
            },
            "currentSessionId": "1",
            "defaultSettings": {
                "defaultLanguage": "Chinese",
                "defaultExplanationLanguage": "Chinese",
                "loadWelcomeSession": True,
            },
        }

        put_response = client.put(
            "/api/session-state",
            json={"deviceId": "test-device-123", "state": state},
        )
        assert put_response.status_code == 200

        get_response = client.get("/api/session-state?deviceId=test-device-123")
        assert get_response.status_code == 200
        payload = get_response.get_json()

        assert payload["deviceId"] == "test-device-123"
        assert payload["state"]["currentSessionId"] == "1"
        assert payload["state"]["sessions"]["1"]["name"] == "Session 1"
        assert isinstance(payload["updatedAt"], int)


def test_put_session_state_invalid_device_id_returns_400():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "sessions.db")
        app = make_test_app(db_path)
        client = app.test_client()

        response = client.put(
            "/api/session-state",
            json={"deviceId": "", "state": {"sessions": {}}},
        )

        assert response.status_code == 400
        payload = response.get_json()
        assert payload["error"]["code"] == "INVALID_DEVICE_ID"


def test_put_session_state_non_json_returns_structured_error():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "sessions.db")
        app = make_test_app(db_path)
        client = app.test_client()

        response = client.put(
            "/api/session-state",
            data="plain-text",
            content_type="text/plain",
        )

        assert response.status_code == 400
        payload = response.get_json()
        assert payload["error"]["code"] == "INVALID_JSON"


def test_put_session_state_invalid_payload_returns_400():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "sessions.db")
        app = make_test_app(db_path)
        client = app.test_client()

        response = client.put(
            "/api/session-state",
            json={"deviceId": "test-device-123", "state": "not-an-object"},
        )

        assert response.status_code == 400
        payload = response.get_json()
        assert payload["error"]["code"] == "INVALID_STATE"


def test_put_session_state_rejects_invalid_current_session_id_type():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "sessions.db")
        app = make_test_app(db_path)
        client = app.test_client()

        response = client.put(
            "/api/session-state",
            json={
                "deviceId": "test-device-123",
                "state": {
                    "sessions": {},
                    "currentSessionId": 123,
                },
            },
        )

        assert response.status_code == 400
        payload = response.get_json()
        assert payload["error"]["code"] == "INVALID_STATE"


def test_put_session_state_large_payload_roundtrip():
    with tempfile.TemporaryDirectory() as tmpdir:
        db_path = str(Path(tmpdir) / "sessions.db")
        app = make_test_app(db_path)
        client = app.test_client()

        large_text = "x" * 200000
        state = {
            "sessions": {
                "s-1": {
                    "id": "s-1",
                    "name": "Large Session",
                    "transcripts": {
                        "0": {
                            "text": large_text,
                            "timestamp": 1,
                        }
                    },
                }
            },
            "currentSessionId": "s-1",
            "defaultSettings": {
                "defaultLanguage": "Chinese",
                "defaultExplanationLanguage": "Chinese",
            },
        }

        put_response = client.put(
            "/api/session-state",
            json={"deviceId": "test-device-123", "state": state},
        )

        assert put_response.status_code == 200

        get_response = client.get("/api/session-state?deviceId=test-device-123")
        assert get_response.status_code == 200
        payload = get_response.get_json()
        assert payload["state"]["sessions"]["s-1"]["transcripts"]["0"]["text"] == large_text
