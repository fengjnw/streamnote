import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "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")

FAST_LAYER = {
    "model": "whisper-1",
    "language": "en",
    "window_seconds": 2,
}

PRECISE_LAYER = {
    "model": "whisper-1",
    "language": "en",
    "window_seconds": 6,
}

FLASK_CONFIG = {
    "host": "0.0.0.0",
    "port": 5001,
    "debug": True,
}