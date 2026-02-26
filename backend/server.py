from flask import Flask, jsonify, request
from flask_cors import CORS
from openai import OpenAI
from config import OPENAI_API_KEY, FLASK_CONFIG
from keyword_extractor import create_extractor
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
    提取关键词 API (AI 驱动 - OpenAI)
    """
    try:
        data = request.json
        text = data.get("text", "")
        top_k = data.get("top_k", 5)
        
        if not text or len(text) < 10:
            return jsonify({"keywords": []})
        
        print(f"[KEYWORDS] Extracting (text_len={len(text)})")
        
        keywords = keyword_extractor.extract_smart(text, top_k=top_k)
        result = {"keywords": keywords}
        
        print(f"[KEYWORDS] Success: {result}")
        return jsonify(result)
        
    except Exception as e:
        print(f"[ERROR] Keyword extraction: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}, 500


@app.route("/api/translate", methods=["POST"])
def translate():
    """
    翻译 API (GPT 驱动)
    支持两种模式：
    1. 普通文本翻译：返回 {"translation": "翻译结果"}
    2. 关键词列表翻译：返回 {"keywords": ["翻译1", "翻译2", ...]}
    """
    try:
        data = request.json
        text = data.get("text", "")
        target_lang = data.get("target_lang", "Chinese")
        is_keywords_mode = data.get("is_keywords", False)
        
        if not text or len(text) < 1:
            if is_keywords_mode:
                return jsonify({"keywords": []})
            else:
                return jsonify({"translation": ""})
        
        print(f"[TRANSLATE] Translating to {target_lang} (text_len={len(text)}, is_keywords={is_keywords_mode})")
        
        if is_keywords_mode:
            # 关键词翻译模式：发送关键词列表，要求逐个翻译，返回JSON数组
            keywords_list = [kw.strip() for kw in text.split(',') if kw.strip()]
            print(f"[TRANSLATE] Keywords mode: {len(keywords_list)} keywords detected")
            
            system_message = f"""You are a professional translator. You will receive a list of keywords/terms, one per line or comma-separated.
Your task: Translate EACH keyword/term to {target_lang}. 
CRITICAL: You must translate EVERY SINGLE keyword. Do not skip any or combine them.
Return ONLY a JSON array of translated keywords in the EXACT same order, nothing else.
Format: ["translation1", "translation2", "translation3", ...]"""
            
            user_message = ", ".join(keywords_list)
        else:
            # 普通文本翻译模式
            system_message = f"You are a professional translator. Translate the following text to {target_lang}. Only provide the translation, no explanations."
            user_message = text
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": system_message
                },
                {
                    "role": "user",
                    "content": user_message
                }
            ],
            temperature=0.3
        )
        
        result_text = response.choices[0].message.content.strip()
        print(f"[TRANSLATE] Raw response: {result_text[:100]}")
        
        if is_keywords_mode:
            # 尝试解析 JSON 数组
            try:
                import json
                translated_keywords = json.loads(result_text)
                if not isinstance(translated_keywords, list):
                    # 如果不是数组，尝试从文本中提取
                    raise ValueError("Response is not a JSON array")
                print(f"[TRANSLATE] Parsed {len(translated_keywords)} keywords")
                return jsonify({"keywords": translated_keywords})
            except (json.JSONDecodeError, ValueError) as e:
                # 降级：尝试从文本中分割
                print(f"[TRANSLATE] JSON parse failed: {e}, falling back to text parsing")
                # 尝试多种分隔符分割（Python正则表达式）
                import re
                keywords = [kw.strip() for kw in 
                           re.split(r'[,，、]', result_text.replace('"', '').replace('[', '').replace(']', ''))
                           if kw.strip()]
                print(f"[TRANSLATE] Fallback: parsed {len(keywords)} keywords")
                return jsonify({"keywords": keywords})
        else:
            return jsonify({"translation": result_text})
        
    except Exception as e:
        print(f"[ERROR] Translation: {e}")
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