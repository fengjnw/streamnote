import io
from flask import jsonify, request, Response, current_app

from error_utils import api_error


def register_ai_routes(app, services, server_error_response):
    """Register AI-related endpoints."""

    client = services["client"]
    keyword_manager = services["keyword_manager"]
    translator = services["translator"]
    summarizer = services["summarizer"]

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
    def extract_keywords():
        try:
            data = request.get_json(silent=True)
            if not data:
                return api_error("INVALID_JSON", "Request body must be JSON", 400)

            text = data.get("text", "")

            if not text or len(text) < 10:
                return jsonify({"keywords": []})

            keywords = keyword_manager.extract_smart(text)
            return jsonify({"keywords": keywords})
        except Exception as e:
            return server_error_response(e)

    @app.route("/api/translate", methods=["POST"])
    def translate():
        try:
            data = request.get_json(silent=True)
            if not data:
                return api_error("INVALID_JSON", "Request body must be JSON", 400)

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

            def generate():
                try:
                    yield from translator.translate_text(text, target_lang, context)
                except Exception as e:
                    current_app.logger.exception("Translation stream failed")
                    yield "[ERROR] Translation failed"

            return Response(generate(), mimetype="text/plain")
        except Exception as e:
            return server_error_response(e)

    @app.route("/api/explain-keyword", methods=["POST"])
    def explain_keyword():
        try:
            data = request.get_json(silent=True)
            if not data:
                return api_error("INVALID_JSON", "Request body must be JSON", 400)

            keyword = data.get("keyword", "").strip()
            language = data.get("language", "English")
            context = data.get("context", "").strip()

            if not keyword:
                return Response("", mimetype="text/plain")

            def generate():
                try:
                    yield from keyword_manager.explain(keyword, language, context)
                except Exception as e:
                    current_app.logger.exception("Keyword explanation stream failed")
                    yield "[ERROR] Keyword explanation failed"

            return Response(generate(), mimetype="text/plain")
        except Exception as e:
            return server_error_response(e)

    @app.route("/api/summarize", methods=["POST"])
    def summarize():
        try:
            data = request.get_json(silent=True)
            if not data:
                return api_error("INVALID_JSON", "Request body must be JSON", 400)

            text = data.get("text", "").strip()
            language = data.get("language", "English")
            style = data.get("style", "paragraph")

            if not text or len(text) < 50:
                return Response("", mimetype="text/plain")

            def generate():
                try:
                    yield from summarizer.summarize(text, language, style)
                except Exception as e:
                    current_app.logger.exception("Summary stream failed")
                    yield "[ERROR] Summary failed"

            return Response(generate(), mimetype="text/plain")
        except Exception as e:
            return server_error_response(e)

    @app.route("/health", methods=["GET"])
    def health_check():
        return {"status": "ok"}
