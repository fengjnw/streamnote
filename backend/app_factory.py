import logging
import traceback

from flask import Flask
from flask_cors import CORS
from openai import OpenAI

from config import OPENAI_API_KEY, SESSION_DB_PATH
from error_utils import api_exception
from keyword_manager import create_keyword_manager
from session_store import create_session_store
from summarizer import create_summarizer
from translator import create_translator
from routes.api_routes import register_api_routes
from routes.static_routes import register_static_routes


log = logging.getLogger("werkzeug")
log.setLevel(logging.WARNING)


def create_app():
    """Application factory for StreamNote backend."""

    app = Flask(__name__, static_folder="../frontend", static_url_path="")
    CORS(app)

    if not OPENAI_API_KEY:
        raise RuntimeError("Missing OPENAI_API_KEY. Set it in your environment or .env file.")

    @app.after_request
    def disable_caching(response):
        response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate, max-age=0, public"
        response.headers["Pragma"] = "no-cache"
        response.headers["Expires"] = "0"
        response.headers["X-Content-Type-Options"] = "nosniff"
        return response

    services = {
        "client": OpenAI(api_key=OPENAI_API_KEY),
        "keyword_manager": create_keyword_manager(OPENAI_API_KEY),
        "translator": create_translator(OPENAI_API_KEY),
        "summarizer": create_summarizer(OPENAI_API_KEY),
        "session_store": create_session_store(SESSION_DB_PATH),
    }

    def server_error_response(error: Exception, prefix: str = ""):
        traceback.print_exc()
        return api_exception(error, prefix=prefix, expose_message=app.debug)

    register_static_routes(app)
    register_api_routes(app, services, server_error_response)

    return app
