from routes.ai_routes import register_ai_routes
from routes.file_routes import register_file_routes
from routes.session_routes import register_session_routes


def register_api_routes(app, services, server_error_response):
    """Register API endpoints for transcription and AI features."""
    register_ai_routes(app, services, server_error_response)
    register_file_routes(app, server_error_response)
    register_session_routes(app, services.get("session_store"), server_error_response)
