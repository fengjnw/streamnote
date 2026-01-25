from flask import Flask, jsonify, request
from flask_cors import CORS
from openai import OpenAI
from config import OPENAI_API_KEY, FLASK_CONFIG
import io

app = Flask(__name__)
CORS(app)
client = OpenAI(api_key=OPENAI_API_KEY)


@app.route("/api/config", methods=["GET"])
def get_config():
    return jsonify({
        "openai_api_key": "not-needed"
    })


@app.route("/api/transcribe", methods=["POST"])
def transcribe():
    try:
        audio_file = request.files.get("file")
        if not audio_file:
            return {"error": "No audio file"}, 400

        audio_data = audio_file.read()
        print(f"[TRANSCRIBE] Received {len(audio_data)} bytes")

        # 提高最小音频大小要求（约2秒的音频）
        if len(audio_data) < 60000:
            print(f"[WARNING] Audio too short ({len(audio_data)} bytes), skipping")
            return {"text": ""}, 200

        audio_buffer = io.BytesIO(audio_data)
        audio_buffer.seek(0)  # 确保从开头读
        audio_buffer.name = "audio.webm"

        result = client.audio.transcriptions.create(
            model="whisper-1",
            file=audio_buffer,
            language="en",
        )

        text = result.text.strip()
        print(f"[TRANSCRIBE] Success: {text[:60]}")
        return jsonify({"text": text})

    except Exception as e:
        print(f"[ERROR] Transcription: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}, 500


@app.route("/health", methods=["GET"])
def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    print("[START] StreamNote Backend")
    print(f"[INFO] http://{FLASK_CONFIG['host']}:{FLASK_CONFIG['port']}")
    app.run(host=FLASK_CONFIG["host"], 
            port=FLASK_CONFIG["port"], 
            debug=FLASK_CONFIG["debug"])