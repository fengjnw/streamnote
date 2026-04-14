from flask import jsonify


def api_error(code: str, message: str, status: int = 400):
    """Return a normalized API error payload."""
    return jsonify({"error": {"code": code, "message": message}}), status


def api_exception(error: Exception, code: str = "INTERNAL_SERVER_ERROR", prefix: str = ""):
    """Convert exception to normalized API error payload."""
    message = f"{prefix}{str(error)}" if prefix else str(error)
    return api_error(code, message, 500)
