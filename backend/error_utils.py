from flask import jsonify


def api_error(code: str, message: str, status: int = 400):
    """Return a normalized API error payload."""
    return jsonify({"error": {"code": code, "message": message}}), status


def api_exception(
    error: Exception,
    code: str = "INTERNAL_SERVER_ERROR",
    prefix: str = "",
    expose_message: bool = False,
):
    """Convert exception to normalized API error payload."""
    if expose_message:
        message = f"{prefix}{str(error)}" if prefix else str(error)
    else:
        message = f"{prefix}An unexpected server error occurred" if prefix else "An unexpected server error occurred"
    return api_error(code, message, 500)
