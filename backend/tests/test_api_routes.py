from io import BytesIO

from flask import Flask

from routes.ai_routes import register_ai_routes
from routes.file_routes import register_file_routes


class DummyTranscriptions:
    def create(self, model, file):
        class Result:
            text = "hello world"

        return Result()


class DummyAudio:
    transcriptions = DummyTranscriptions()


class DummyClient:
    audio = DummyAudio()


class DummyKeywordManager:
    def extract_smart(self, text):
        return ["keyword"]

    def explain(self, keyword, language, context):
        yield "explanation"


class DummyTranslator:
    def translate_keywords(self, text, target_lang):
        return '{"keywords":["translated"]}'

    def translate_text(self, text, target_lang, context):
        yield "translated"


class DummySummarizer:
    def summarize(self, text, language, style):
        yield "summary"


def make_test_app():
    app = Flask(__name__)
    services = {
        "client": DummyClient(),
        "keyword_manager": DummyKeywordManager(),
        "translator": DummyTranslator(),
        "summarizer": DummySummarizer(),
    }

    def server_error_response(error, prefix=""):
        return {"error": {"code": "INTERNAL_SERVER_ERROR", "message": f"{prefix}{error}"}}, 500

    register_ai_routes(app, services, server_error_response)
    register_file_routes(app, server_error_response)
    return app


def test_health_check_ok():
    app = make_test_app()
    client = app.test_client()

    response = client.get("/health")

    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


def test_transcribe_without_file_returns_structured_error():
    app = make_test_app()
    client = app.test_client()

    response = client.post("/api/transcribe", data={})

    assert response.status_code == 400
    payload = response.get_json()
    assert payload["error"]["code"] == "NO_AUDIO_FILE"


def test_transcribe_small_audio_returns_empty_text():
    app = make_test_app()
    client = app.test_client()

    audio = (BytesIO(b"0" * 100), "audio.webm")
    response = client.post("/api/transcribe", data={"file": audio}, content_type="multipart/form-data")

    assert response.status_code == 200
    assert response.get_json() == {"text": ""}


def test_summarize_short_text_returns_empty_stream():
    app = make_test_app()
    client = app.test_client()

    response = client.post(
        "/api/summarize",
        json={"text": "too short", "language": "English", "style": "paragraph"},
    )

    assert response.status_code == 200
    assert response.get_data(as_text=True) == ""


def test_upload_file_without_file_returns_structured_error():
    app = make_test_app()
    client = app.test_client()

    response = client.post("/api/upload-file", data={})

    assert response.status_code == 400
    payload = response.get_json()
    assert payload["error"]["code"] == "NO_FILE_PART"
