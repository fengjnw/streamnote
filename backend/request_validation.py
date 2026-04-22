"""
Request validation utilities for Flask routes.
Provides decorators and helper functions for consistent JSON request validation
and error handling across all API endpoints.
"""

from functools import wraps
from flask import request
from error_utils import api_error


def require_json(f):
    """
    Decorator to ensure POST/PUT requests have valid JSON body.
    
    Validates that:
    - Request has Content-Type: application/json
    - Request body is valid JSON
    - Request body is not empty
    
    If validation fails, returns a 400 error with appropriate error code.
    
    Usage:
        @app.route("/api/endpoint", methods=["POST"])
        @require_json
        def endpoint(data):
            # data is already parsed and validated JSON dict
            text = data.get("text", "")
            return jsonify({"result": process(text)})
    
    @param f: The route handler function
    @return: Decorated function that injects parsed JSON data as first argument
    """
    @wraps(f)
    def wrapper(*args, **kwargs):
        data = request.get_json(silent=True)
        if not data:
            return api_error("INVALID_JSON", "Request body must be valid JSON", 400)
        return f(data, *args, **kwargs)
    return wrapper


def get_json_safe(default=None):
    """
    Safely get JSON data from request, returning default if not available.
    
    @param default: Value to return if JSON parsing fails (default: None)
    @return: Parsed JSON dict or default value
    """
    return request.get_json(silent=True) or default


def validate_json_field(data: dict, field_name: str, field_type=None, required=True):
    """
    Validate a single field in JSON request data.
    
    @param data: Parsed JSON dict
    @param field_name: Name of field to validate
    @param field_type: Expected type (str, int, dict, list, etc.) or None to skip type check
    @param required: Whether field is required (default: True)
    @return: Tuple (is_valid, field_value, error_message)
    """
    if field_name not in data:
        if required:
            return False, None, f"Missing required field: {field_name}"
        return True, None, None
    
    value = data[field_name]
    
    if field_type and not isinstance(value, field_type):
        type_name = field_type.__name__ if hasattr(field_type, '__name__') else str(field_type)
        return False, None, f"Field '{field_name}' must be {type_name}"
    
    return True, value, None


def validate_required_fields(data: dict, field_specs: dict):
    """
    Validate multiple fields in JSON request data.
    
    @param data: Parsed JSON dict
    @param field_specs: Dict mapping field names to expected types or None
        Example: {"text": str, "count": int, "optional_field": None}
    @return: Tuple (is_valid, error_message)
    """
    for field_name, expected_type in field_specs.items():
        is_valid, _, error_msg = validate_json_field(
            data,
            field_name,
            field_type=expected_type,
            required=True
        )
        if not is_valid:
            return False, error_msg
    
    return True, None


def validate_optional_fields(data: dict, field_specs: dict):
    """
    Validate optional fields in JSON request data.
    
    @param data: Parsed JSON dict
    @param field_specs: Dict mapping field names to expected types
    @return: Tuple (is_valid, error_message)
    """
    for field_name, expected_type in field_specs.items():
        if field_name in data:
            is_valid, _, error_msg = validate_json_field(
                data,
                field_name,
                field_type=expected_type,
                required=False
            )
            if not is_valid:
                return False, error_msg
    
    return True, None
