import re
import secrets

from flask import jsonify, request

from error_utils import api_error


AUTH_COOKIE_NAME = "streamnote_auth"
AUTH_TTL_SECONDS = 60 * 60 * 24 * 7


def _normalize_email(email: str) -> str:
    return email.strip().lower()


def _is_valid_email(email: str) -> bool:
    return bool(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email))


def _is_valid_password(password: str) -> bool:
    return isinstance(password, str) and len(password) >= 6


def _is_valid_device_id(device_id: str) -> bool:
    if not isinstance(device_id, str):
        return False
    trimmed = device_id.strip()
    return 8 <= len(trimmed) <= 128


def _session_response(payload: dict, session_id: str, secure_cookie: bool):
    response = jsonify(payload)
    response.set_cookie(
        AUTH_COOKIE_NAME,
        session_id,
        max_age=AUTH_TTL_SECONDS,
        httponly=True,
        secure=secure_cookie,
        samesite="Lax",
        path="/",
    )
    return response


def register_auth_routes(app, auth_store, server_error_response):
    if auth_store is None:
        return

    secure_cookie = bool(app.config.get("AUTH_COOKIE_SECURE", False))

    @app.route("/api/auth/register", methods=["POST"])
    def register():
        try:
            data = request.get_json(silent=True)
            if not data:
                return api_error("INVALID_JSON", "Request body must be JSON", 400)

            email = _normalize_email(data.get("email", ""))
            password = data.get("password", "")
            device_id = data.get("deviceId", "")

            if not _is_valid_email(email):
                return api_error("INVALID_EMAIL", "Email format is invalid", 400)

            if not _is_valid_password(password):
                return api_error("INVALID_PASSWORD", "Password must be at least 6 characters", 400)

            if auth_store.get_user_by_email(email):
                return api_error("EMAIL_EXISTS", "This email is already registered", 409)

            user = auth_store.create_user(email, password)
            session_id = secrets.token_urlsafe(32)
            auth_store.create_auth_session(session_id, user["id"], AUTH_TTL_SECONDS)

            if _is_valid_device_id(device_id):
                auth_store.bind_device_to_user(device_id.strip(), user["id"])

            return _session_response({"user": {"id": user["id"], "email": user["email"]}}, session_id, secure_cookie)
        except Exception as e:
            return server_error_response(e)

    @app.route("/api/auth/login", methods=["POST"])
    def login():
        try:
            data = request.get_json(silent=True)
            if not data:
                return api_error("INVALID_JSON", "Request body must be JSON", 400)

            email = _normalize_email(data.get("email", ""))
            password = data.get("password", "")
            device_id = data.get("deviceId", "")

            user = auth_store.verify_user_credentials(email, password)
            if not user:
                return api_error("INVALID_CREDENTIALS", "Email or password is incorrect", 401)

            session_id = secrets.token_urlsafe(32)
            auth_store.create_auth_session(session_id, user["id"], AUTH_TTL_SECONDS)

            if _is_valid_device_id(device_id):
                auth_store.bind_device_to_user(device_id.strip(), user["id"])

            return _session_response({"user": {"id": user["id"], "email": user["email"]}}, session_id, secure_cookie)
        except Exception as e:
            return server_error_response(e)

    @app.route("/api/auth/me", methods=["GET"])
    def me():
        try:
            session_id = request.cookies.get(AUTH_COOKIE_NAME, "").strip()
            if not session_id:
                return api_error("AUTH_REQUIRED", "Not logged in", 401)

            user = auth_store.get_user_by_session(session_id)
            if not user:
                response = api_error("AUTH_REQUIRED", "Not logged in", 401)[0]
                response.delete_cookie(AUTH_COOKIE_NAME, path="/")
                return response, 401

            return jsonify({"user": {"id": user["id"], "email": user["email"]}})
        except Exception as e:
            return server_error_response(e)

    @app.route("/api/auth/logout", methods=["POST"])
    def logout():
        try:
            session_id = request.cookies.get(AUTH_COOKIE_NAME, "").strip()
            if session_id:
                auth_store.delete_session(session_id)

            response = jsonify({"ok": True})
            response.delete_cookie(AUTH_COOKIE_NAME, path="/")
            return response
        except Exception as e:
            return server_error_response(e)

    @app.route("/api/auth/delete-account", methods=["POST"])
    def delete_account():
        try:
            session_id = request.cookies.get(AUTH_COOKIE_NAME, "").strip()
            if not session_id:
                return api_error("AUTH_REQUIRED", "Not logged in", 401)

            user = auth_store.get_user_by_session(session_id)
            if not user:
                response = api_error("AUTH_REQUIRED", "Not logged in", 401)[0]
                response.delete_cookie(AUTH_COOKIE_NAME, path="/")
                return response, 401

            data = request.get_json(silent=True)
            if not data:
                return api_error("INVALID_JSON", "Request body must be JSON", 400)

            password = data.get("password", "")
            if not _is_valid_password(password):
                return api_error("INVALID_PASSWORD", "Password must be at least 6 characters", 400)

            if not auth_store.verify_user_password(user["id"], password):
                return api_error("INVALID_CREDENTIALS", "Password is incorrect", 401)

            auth_store.delete_user_account(user["id"])

            response = jsonify({"ok": True})
            response.delete_cookie(AUTH_COOKIE_NAME, path="/")
            return response
        except Exception as e:
            return server_error_response(e)