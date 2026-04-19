from flask import jsonify, request

from error_utils import api_error


AUTH_COOKIE_NAME = "streamnote_auth"


def _is_valid_device_id(device_id: str) -> bool:
    if not isinstance(device_id, str):
        return False
    trimmed = device_id.strip()
    return 8 <= len(trimmed) <= 128


def _is_valid_state_payload(state: dict) -> bool:
    if not isinstance(state, dict):
        return False

    sessions = state.get("sessions")
    current_session_id = state.get("currentSessionId")
    default_settings = state.get("defaultSettings")

    if sessions is not None and not isinstance(sessions, dict):
        return False

    if current_session_id is not None and not isinstance(current_session_id, str):
        return False

    if default_settings is not None and not isinstance(default_settings, dict):
        return False

    return True


def _get_authenticated_user(auth_store):
    if auth_store is None:
        return None

    session_id = request.cookies.get(AUTH_COOKIE_NAME, "").strip()
    if not session_id:
        return None

    return auth_store.get_user_by_session(session_id)


def register_session_routes(app, session_store, server_error_response, auth_store=None):
    """Register persistence endpoints for anonymous per-device session state."""

    if session_store is None:
        return

    @app.route("/api/session-state", methods=["GET"])
    def get_session_state():
        try:
            device_id = request.args.get("deviceId", "").strip()
            if not _is_valid_device_id(device_id):
                return api_error("INVALID_DEVICE_ID", "deviceId is required", 400)

            existing = session_store.get_state(device_id)
            if not existing:
                return jsonify({"deviceId": device_id, "state": None, "updatedAt": None})

            return jsonify(
                {
                    "deviceId": device_id,
                    "state": existing["state"],
                    "updatedAt": existing["updated_at"],
                }
            )
        except Exception as e:
            return server_error_response(e)

    @app.route("/api/session-state", methods=["PUT"])
    def save_session_state():
        try:
            data = request.get_json(silent=True)
            if not data:
                return api_error("INVALID_JSON", "Request body must be JSON", 400)

            device_id = data.get("deviceId", "")
            state = data.get("state")

            if not _is_valid_device_id(device_id):
                return api_error("INVALID_DEVICE_ID", "deviceId is required", 400)

            if not _is_valid_state_payload(state):
                return api_error("INVALID_STATE", "state payload is invalid", 400)

            updated_at = session_store.save_state(device_id.strip(), state)
            return jsonify({"ok": True, "updatedAt": updated_at})
        except Exception as e:
            return server_error_response(e)

    @app.route("/api/account-session-state", methods=["GET"])
    def get_account_session_state():
        try:
            user = _get_authenticated_user(auth_store)
            if not user:
                return api_error("AUTH_REQUIRED", "Not logged in", 401)

            existing = session_store.get_user_state(user["id"])
            if not existing:
                return jsonify({"userId": user["id"], "state": None, "updatedAt": None})

            return jsonify(
                {
                    "userId": user["id"],
                    "state": existing["state"],
                    "updatedAt": existing["updated_at"],
                }
            )
        except Exception as e:
            return server_error_response(e)

    @app.route("/api/account-session-state", methods=["PUT"])
    def save_account_session_state():
        try:
            user = _get_authenticated_user(auth_store)
            if not user:
                return api_error("AUTH_REQUIRED", "Not logged in", 401)

            data = request.get_json(silent=True)
            if not data:
                return api_error("INVALID_JSON", "Request body must be JSON", 400)

            state = data.get("state")
            if not _is_valid_state_payload(state):
                return api_error("INVALID_STATE", "state payload is invalid", 400)

            updated_at = session_store.save_user_state(user["id"], state)
            return jsonify({"ok": True, "updatedAt": updated_at})
        except Exception as e:
            return server_error_response(e)