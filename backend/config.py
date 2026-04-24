import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

FLASK_CONFIG = {
    "host": "0.0.0.0",
    "port": int(os.getenv("PORT", 5500)),
    "debug": os.getenv("FLASK_DEBUG", "False").lower() == "true",
}


def _parse_bool(value):
    if value is None:
        return None
    normalized = str(value).strip().lower()
    if normalized in ("1", "true", "yes", "on"):
        return True
    if normalized in ("0", "false", "no", "off"):
        return False
    return None


_cookie_secure_override = _parse_bool(os.getenv("AUTH_COOKIE_SECURE"))
AUTH_COOKIE_SECURE = _cookie_secure_override if _cookie_secure_override is not None else not FLASK_CONFIG["debug"]

SESSION_DB_PATH = os.getenv("SESSION_DB_PATH", "data/streamnote.db")