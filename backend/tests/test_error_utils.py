"""Tests for error_utils.py"""

import json

from flask import Flask

from error_utils import api_error, api_exception


def create_app():
    """Create a minimal Flask app for testing"""
    return Flask(__name__)


def test_api_error_basic():
    """Test basic api_error function"""
    app = create_app()
    with app.app_context():
        response, status = api_error("TEST_CODE", "Test message")
        assert status == 400
        
        data = json.loads(response.get_data(as_text=True))
        assert data["error"]["code"] == "TEST_CODE"
        assert data["error"]["message"] == "Test message"


def test_api_error_custom_status():
    """Test api_error with custom status code"""
    app = create_app()
    with app.app_context():
        response, status = api_error("NOT_FOUND", "Resource not found", 404)
        assert status == 404
        
        data = json.loads(response.get_data(as_text=True))
        assert data["error"]["code"] == "NOT_FOUND"
        assert data["error"]["message"] == "Resource not found"


def test_api_error_common_codes():
    """Test api_error with common error codes"""
    app = create_app()
    with app.app_context():
        test_cases = [
            ("INVALID_JSON", "Invalid JSON", 400),
            ("UNAUTHORIZED", "Unauthorized", 401),
            ("FORBIDDEN", "Forbidden", 403),
            ("NOT_FOUND", "Not found", 404),
            ("CONFLICT", "Conflict", 409),
            ("INTERNAL_SERVER_ERROR", "Server error", 500),
        ]
        
        for code, message, status in test_cases:
            response, resp_status = api_error(code, message, status)
            assert resp_status == status
            data = json.loads(response.get_data(as_text=True))
            assert data["error"]["code"] == code
            assert data["error"]["message"] == message


def test_api_exception_default():
    """Test api_exception with default error code and no exposure"""
    app = create_app()
    with app.app_context():
        exception = ValueError("Something went wrong")
        response, status = api_exception(exception)
        
        assert status == 500
        data = json.loads(response.get_data(as_text=True))
        assert data["error"]["code"] == "INTERNAL_SERVER_ERROR"
        assert "unexpected server error" in data["error"]["message"].lower()
        # Should not expose the original error message
        assert "Something went wrong" not in data["error"]["message"]


def test_api_exception_expose_message():
    """Test api_exception with message exposure enabled"""
    app = create_app()
    with app.app_context():
        exception = ValueError("Something went wrong")
        response, status = api_exception(exception, expose_message=True)
        
        assert status == 500
        data = json.loads(response.get_data(as_text=True))
        assert "Something went wrong" in data["error"]["message"]


def test_api_exception_custom_code():
    """Test api_exception with custom error code"""
    app = create_app()
    with app.app_context():
        exception = RuntimeError("Service down")
        response, status = api_exception(exception, code="SERVICE_ERROR")
        
        assert status == 500
        data = json.loads(response.get_data(as_text=True))
        assert data["error"]["code"] == "SERVICE_ERROR"


def test_api_exception_with_prefix():
    """Test api_exception with prefix"""
    app = create_app()
    with app.app_context():
        exception = IOError("File not found")
        response, status = api_exception(exception, prefix="File I/O error: ", expose_message=True)
        
        assert status == 500
        data = json.loads(response.get_data(as_text=True))
        assert "File I/O error: File not found" in data["error"]["message"]


def test_api_exception_prefix_without_expose():
    """Test api_exception with prefix but no message exposure"""
    app = create_app()
    with app.app_context():
        exception = IOError("File not found")
        response, status = api_exception(exception, prefix="Error prefix: ")
        
        assert status == 500
        data = json.loads(response.get_data(as_text=True))
        # Should use prefix + generic message, not expose actual exception
        assert "Error prefix: " in data["error"]["message"]
        assert "File not found" not in data["error"]["message"]


def test_api_error_json_format():
    """Test that api_error returns proper JSON format"""
    app = create_app()
    with app.app_context():
        response, _ = api_error("TEST", "message")
        data = json.loads(response.get_data(as_text=True))
        
        # Check structure
        assert "error" in data
        assert "code" in data["error"]
        assert "message" in data["error"]
        assert len(data) == 1  # Only error field at top level
        assert len(data["error"]) == 2  # Only code and message in error


def test_api_exception_empty_error_message():
    """Test api_exception with exception that has empty message"""
    app = create_app()
    with app.app_context():
        exception = RuntimeError()
        response, status = api_exception(exception, expose_message=True)
        
        assert status == 500
        data = json.loads(response.get_data(as_text=True))
        # Should handle empty exception messages gracefully
        assert isinstance(data["error"]["message"], str)
        # When expose_message=True and exception has no message, it will be empty
