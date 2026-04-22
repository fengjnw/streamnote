import io
from flask import jsonify, request, Response

from error_utils import api_error
from request_validation import require_json


def _stream_error(code: str, message: str) -> str:
    return f"[ERROR:{code}] {message}"


def _stream_text_response(stream_factory, logger, log_message: str, error_code: str, error_message: str):
    def generate():
        try:
            yield from stream_factory()
        except Exception:
            logger.exception(log_message)
            yield _stream_error(error_code, error_message)

    return Response(generate(), mimetype="text/plain")


def register_ai_routes(app, services, server_error_response):
    """Register AI-related endpoints."""

    client = services["client"]
    keyword_manager = services["keyword_manager"]
    translator = services["translator"]
    summarizer = services["summarizer"]
    logger = app.logger

    @app.route("/api/config", methods=["GET"])
    def get_config():
        return jsonify({"openai_api_key": "not-needed"})

    @app.route("/api/transcribe", methods=["POST"])
    def transcribe():
        try:
            audio_file = request.files.get("file")
            if not audio_file:
                return api_error("NO_AUDIO_FILE", "No audio file", 400)

            audio_data = audio_file.read()
            if len(audio_data) < 10000:
                return {"text": ""}, 200

            audio_buffer = io.BytesIO(audio_data)
            audio_buffer.name = "audio.webm"

            result = client.audio.transcriptions.create(
                model="gpt-4o-mini-transcribe",
                file=audio_buffer,
            )
            text = result.text.strip()
            return jsonify({"text": text})
        except Exception as e:
            return server_error_response(e)

    @app.route("/api/extract-keywords", methods=["POST"])
    @require_json
    def extract_keywords(data):
        try:
            text = data.get("text", "")

            if not text or len(text) < 10:
                return jsonify({"keywords": []})

            keywords = keyword_manager.extract_smart(text)
            return jsonify({"keywords": keywords})
        except Exception as e:
            return server_error_response(e)

    @app.route("/api/translate", methods=["POST"])
    @require_json
    def translate(data):
        try:
            text = data.get("text", "")
            target_lang = data.get("target_lang", "Chinese")
            context = data.get("context", "").strip()
            is_keywords_mode = data.get("is_keywords", False)

            if not text or len(text) < 1:
                if is_keywords_mode:
                    return jsonify({"keywords": []})
                return Response("", mimetype="text/plain")

            if is_keywords_mode:
                keywords_json = translator.translate_keywords(text, target_lang)
                return Response(keywords_json, mimetype="application/json")

            return _stream_text_response(
                lambda: translator.translate_text(text, target_lang, context),
                logger,
                "Translation stream failed",
                "TRANSLATION_FAILED",
                "Translation failed",
            )
        except Exception as e:
            return server_error_response(e)

    @app.route("/api/explain-keyword", methods=["POST"])
    @require_json
    def explain_keyword(data):
        try:
            keyword = data.get("keyword", "").strip()
            language = data.get("language", "English")
            context = data.get("context", "").strip()

            if not keyword:
                return Response("", mimetype="text/plain")

            return _stream_text_response(
                lambda: keyword_manager.explain(keyword, language, context),
                logger,
                "Keyword explanation stream failed",
                "EXPLANATION_FAILED",
                "Keyword explanation failed",
            )
        except Exception as e:
            return server_error_response(e)

    @app.route("/api/summarize", methods=["POST"])
    @require_json
    def summarize(data):
        try:
            text = data.get("text", "").strip()
            language = data.get("language", "English")
            style = data.get("style", "paragraph")

            if not text or len(text) < 50:
                return Response("", mimetype="text/plain")

            return _stream_text_response(
                lambda: summarizer.summarize(text, language, style),
                logger,
                "Summary stream failed",
                "SUMMARY_FAILED",
                "Summary failed",
            )
        except Exception as e:
            return server_error_response(e)

    @app.route("/health", methods=["GET"])
    def health_check():
        return {"status": "ok"}
