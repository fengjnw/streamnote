import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

FLASK_CONFIG = {
    "host": "0.0.0.0",
    "port": 5001,
    "debug": True,
}