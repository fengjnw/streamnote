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
    fail_stream = False

    def translate_keywords(self, text, target_lang):
        return '{"keywords":["translated"]}'

    def translate_text(self, text, target_lang, context):
        if self.fail_stream:
            raise RuntimeError("translator down")
        yield "translated"


class DummySummarizer:
    fail_stream = False

    def summarize(self, text, language, style):
        if self.fail_stream:
            raise RuntimeError("summarizer down")
        yield "summary"


class DummyFailingKeywordManager(DummyKeywordManager):
    def explain(self, keyword, language, context):
        raise RuntimeError("keyword service down")


class DummyFailingTranslator(DummyTranslator):
    fail_stream = True


class DummyFailingSummarizer(DummySummarizer):
    fail_stream = True


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


def make_failing_stream_app(failing_part: str):
    app = Flask(__name__)
    services = {
        "client": DummyClient(),
        "keyword_manager": DummyKeywordManager(),
        "translator": DummyTranslator(),
        "summarizer": DummySummarizer(),
    }

    if failing_part == "translation":
        services["translator"] = DummyFailingTranslator()
    elif failing_part == "explanation":
        services["keyword_manager"] = DummyFailingKeywordManager()
    elif failing_part == "summary":
        services["summarizer"] = DummyFailingSummarizer()

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


def test_extract_keywords_non_json_returns_structured_error():
    app = make_test_app()
    client = app.test_client()

    response = client.post(
        "/api/extract-keywords",
        data="plain-text",
        content_type="text/plain",
    )

    assert response.status_code == 400
    payload = response.get_json()
    assert payload["error"]["code"] == "INVALID_JSON"


def test_translate_non_json_returns_structured_error():
    app = make_test_app()
    client = app.test_client()

    response = client.post(
        "/api/translate",
        data="plain-text",
        content_type="text/plain",
    )

    assert response.status_code == 400
    payload = response.get_json()
    assert payload["error"]["code"] == "INVALID_JSON"


def test_explain_keyword_non_json_returns_structured_error():
    app = make_test_app()
    client = app.test_client()

    response = client.post(
        "/api/explain-keyword",
        data="plain-text",
        content_type="text/plain",
    )

    assert response.status_code == 400
    payload = response.get_json()
    assert payload["error"]["code"] == "INVALID_JSON"


def test_summarize_non_json_returns_structured_error():
    app = make_test_app()
    client = app.test_client()

    response = client.post(
        "/api/summarize",
        data="plain-text",
        content_type="text/plain",
    )

    assert response.status_code == 400
    payload = response.get_json()
    assert payload["error"]["code"] == "INVALID_JSON"


def test_translate_stream_failure_returns_standard_error_token():
    app = make_failing_stream_app("translation")
    client = app.test_client()

    response = client.post(
        "/api/translate",
        json={"text": "hello", "target_lang": "Chinese", "context": ""},
    )

    assert response.status_code == 200
    body = response.get_data(as_text=True)
    assert "[ERROR:TRANSLATION_FAILED]" in body


def test_explain_stream_failure_returns_standard_error_token():
    app = make_failing_stream_app("explanation")
    client = app.test_client()

    response = client.post(
        "/api/explain-keyword",
        json={"keyword": "test", "language": "English", "context": ""},
    )

    assert response.status_code == 200
    body = response.get_data(as_text=True)
    assert "[ERROR:EXPLANATION_FAILED]" in body


def test_summarize_stream_failure_returns_standard_error_token():
    app = make_failing_stream_app("summary")
    client = app.test_client()

    response = client.post(
        "/api/summarize",
        json={"text": "x" * 80, "language": "English", "style": "paragraph"},
    )

    assert response.status_code == 200
    body = response.get_data(as_text=True)
    assert "[ERROR:SUMMARY_FAILED]" in body
