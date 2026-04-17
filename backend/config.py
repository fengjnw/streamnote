import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

FLASK_CONFIG = {
    "host": "0.0.0.0",
    "port": int(os.getenv("PORT", 5500)),
    "debug": os.getenv("FLASK_DEBUG", "False").lower() == "true",
}

SESSION_DB_PATH = os.getenv("SESSION_DB_PATH", "backend/data/streamnote.db")