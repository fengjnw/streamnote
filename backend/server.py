from flask import Flask, jsonify, request
from flask_cors import CORS
from openai import OpenAI
from config import OPENAI_API_KEY, FLASK_CONFIG
from keyword_extractor import create_extractor, DOMAIN_KEYWORDS
import io

app = Flask(__name__)
CORS(app)
client = OpenAI(api_key=OPENAI_API_KEY)
keyword_extractor = create_extractor(OPENAI_API_KEY)


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

        # 后端兜底：只过滤明显异常的音频
        if len(audio_data) < 10000:
            print(f"[WARNING] Audio too short, skipping")
            return {"text": ""}, 200

        audio_buffer = io.BytesIO(audio_data)
        audio_buffer.name = "audio.webm"

        result = client.audio.transcriptions.create(
            model="gpt-4o-mini-transcribe",  # 更快、更准确的新模型
            file=audio_buffer,
        )

        text = result.text.strip()
        print(f"[TRANSCRIBE] Success: {text[:60]}")
        return jsonify({"text": text})

    except Exception as e:
        print(f"[ERROR] Transcription: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}, 500


@app.route("/api/extract-keywords", methods=["POST"])
def extract_keywords():
    """
    提取关键词 API
    支持四种方法：fast (TF-IDF), smart (OpenAI), domain (领域匹配), combined (组合)
    """
    try:
        data = request.json
        text = data.get("text", "")
        method = data.get("method", "combined")
        top_k = data.get("top_k", 5)
        domain = data.get("domain")
        
        if not text or len(text) < 10:
            return jsonify({"keywords": []})
        
        print(f"[KEYWORDS] Extracting with method={method}, text_len={len(text)}")
        
        if method == "fast":
            keywords = keyword_extractor.extract_fast(text, top_k)
            result = {"method": "fast", "keywords": keywords}
            
        elif method == "smart":
            keywords = keyword_extractor.extract_smart(text, context=domain, top_k=top_k)
            result = {"method": "smart", "keywords": keywords}
            
        elif method == "domain":
            domain_kws = {domain: DOMAIN_KEYWORDS.get(domain, [])} if domain else DOMAIN_KEYWORDS
            keywords = keyword_extractor.extract_domain_keywords(text, domain_kws, top_k)
            result = {"method": "domain", "keywords": keywords}
            
        elif method == "combined":
            results = keyword_extractor.extract_combined(
                text,
                use_openai=True,
                domain_keywords=DOMAIN_KEYWORDS if not domain else {domain: DOMAIN_KEYWORDS.get(domain, [])},
                top_k=top_k
            )
            result = {"method": "combined", "keywords": results["combined"], "details": results}
        else:
            return {"error": f"Unknown method: {method}"}, 400
        
        print(f"[KEYWORDS] Success: {result}")
        return jsonify(result)
        
    except Exception as e:
        print(f"[ERROR] Keyword extraction: {e}")
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