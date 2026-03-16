from flask import Flask, jsonify, request, Response, send_from_directory
from flask_cors import CORS
from openai import OpenAI
from config import OPENAI_API_KEY, FLASK_CONFIG
from keyword_manager import create_keyword_manager
from translator import create_translator
from summarizer import create_summarizer
from file_processor import extract_text_from_file, validate_file
import io
import json
import os
import logging

app = Flask(__name__, static_folder='../frontend', static_url_path='')
CORS(app)

# 禁用 Werkzeug 的详细日志
log = logging.getLogger('werkzeug')
log.setLevel(logging.WARNING)  # 只显示 warning 和 error，不显示 INFO 级别的请求日志
client = OpenAI(api_key=OPENAI_API_KEY)
keyword_manager = create_keyword_manager(OPENAI_API_KEY)
translator = create_translator(OPENAI_API_KEY)
summarizer = create_summarizer(OPENAI_API_KEY)


def _refine_transcription(text: str, context: str) -> str:
    """用GPT根据上下文纠正转录错误 - 修正术语、专有名词、异常表述"""
    system_prompt = """You are a transcription error corrector. Your job is:
1. Use the context to identify and fix transcription errors
2. Correct misspelled technical terms, names, or domain-specific words based on context
3. Fix obvious speech-to-text mistakes (e.g., homophones, mishearings)
4. Keep the original meaning and structure - only fix errors
5. Return ONLY the corrected text"""
    user_message = f"Context (for reference):\n{context[:500]}\n\nTranscription to correct:\n{text}"
    
    try:
        refined = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            temperature=0.1,
            max_tokens=2000
        )
        return refined.choices[0].message.content.strip()
    except Exception as e:
        print(f"[ERROR] Refinement error: {e}")
        raise


@app.route("/", methods=["GET"])
def index():
    """Serve the frontend index.html"""
    return send_from_directory('../frontend', 'index.html')


@app.route("/<path:path>", methods=["GET"])
def serve_static(path):
    """Serve static files from frontend directory"""
    return send_from_directory('../frontend', path)


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

        # 后端处理：只过滤明显异常的音频
        if len(audio_data) < 10000:
            return {"text": ""}, 200

        audio_buffer = io.BytesIO(audio_data)
        audio_buffer.name = "audio.webm"

        # 获取上下文信息，用于转录后校准
        context = request.form.get("context", "").strip()
        
        # 构建Whisper API调用参数 - 不使用prompt，让转录干净自然
        transcribe_kwargs = {
            "model": "gpt-4o-mini-transcribe",  # 更快、更准确的新模型
            "file": audio_buffer,
        }

        result = client.audio.transcriptions.create(**transcribe_kwargs)
        text = result.text.strip()
        
        # 如果有上下文，用GPT校准转录结果（移除重复、纠正术语、确保连贯性）
        if context and len(context) > 0 and len(text) > 0:
            try:
                text = _refine_transcription(text, context)
            except Exception as e:
                # 校准失败时返回原始转录，不中断流程
                print(f"[WARNING] Transcription refinement failed: {e}")
        
        return jsonify({"text": text})

    except Exception as e:
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
        
        if not text or len(text) < 10:
            return jsonify({"keywords": []})
        
        keywords = keyword_manager.extract_smart(text)
        
        return jsonify({"keywords": keywords})
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}, 500


@app.route("/api/translate", methods=["POST"])
def translate():
    """
    翻译 API (GPT 驱动) - 流式响应版本
    支持两种模式：
    1. 普通文本翻译：流式返回翻译结果
    2. 关键词列表翻译：返回 {"keywords": ["翻译1", "翻译2", ...]}
    """
    try:
        data = request.json
        text = data.get("text", "")
        target_lang = data.get("target_lang", "Chinese")
        context = data.get("context", "").strip()  # 上下文信息，用于改进翻译准确率
        is_keywords_mode = data.get("is_keywords", False)
        
        if not text or len(text) < 1:
            if is_keywords_mode:
                return jsonify({"keywords": []})
            else:
                return Response('', mimetype='text/plain')
        
        if is_keywords_mode:
            # 关键词翻译模式：返回JSON数组
            keywords_json = translator.translate_keywords(text, target_lang)
            return Response(keywords_json, mimetype='application/json')
        else:
            # 普通文本翻译模式：使用流式响应
            def generate():
                try:
                    yield from translator.translate_text(text, target_lang, context)
                except Exception as e:
                    print(f"[ERROR] Stream error: {e}")
                    yield f"[ERROR] {str(e)}"
            
            return Response(generate(), mimetype='text/plain')
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}, 500


@app.route("/api/explain-keyword", methods=["POST"])
def explain_keyword():
    """
    解释关键词 API (AI 驱动 - OpenAI) - 流式响应版本
    支持基于上下文的解释
    """
    try:
        data = request.json
        keyword = data.get("keyword", "").strip()
        language = data.get("language", "English")
        context = data.get("context", "").strip()  # 关键词的前后文本上下文
        
        if not keyword:
            return Response('', mimetype='text/plain')
        
        def generate():
            try:
                yield from keyword_manager.explain(keyword, language, context)
            except Exception as e:
                print(f"[ERROR] Stream error: {e}")
                yield f"[ERROR] {str(e)}"
        
        return Response(generate(), mimetype='text/plain')
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}, 500


@app.route("/api/summarize", methods=["POST"])
def summarize():
    """
    生成文本总结 API (AI 驱动 - OpenAI) - 流式响应版本
    支持指定语言和风格的总结
    """
    try:
        data = request.json
        text = data.get("text", "").strip()
        language = data.get("language", "English")  # 用户选择的语言
        style = data.get("style", "paragraph")  # 总结风格
        
        if not text or len(text) < 50:
            return Response('', mimetype='text/plain')
        
        def generate():
            try:
                yield from summarizer.summarize(text, language, style)
            except Exception as e:
                print(f"[ERROR] Stream error: {e}")
                yield f"[ERROR] {str(e)}"
        
        return Response(generate(), mimetype='text/plain')
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": str(e)}, 500


@app.route("/health", methods=["GET"])
def health_check():
    return {"status": "ok"}


@app.route("/api/upload-file", methods=["POST"])
def upload_file():
    """
    上传文本文件 API
    支持格式：.txt, .md
    
    请求：
        - 方法：POST
        - 内容类型：multipart/form-data
        - 参数：file (必需)
        
    响应：
        - 成功 (200): {
            "text": "提取的文本内容",
            "fileName": "文件名",
            "fileSize": 文件大小(字节),
            "paragraphCount": 段落数
          }
        - 失败 (400/413): {
            "error": "错误信息"
          }
    """
    try:
        # 检查是否有文件
        if 'file' not in request.files:
            return {"error": "No file part in the request"}, 400
        
        file = request.files['file']
        
        # 验证文件
        validation = validate_file(file)
        if not validation['valid']:
            return {"error": validation['error']}, 400
        
        # 重置文件指针（在验证时被移动）
        file.seek(0)
        
        # 提取文本
        result = extract_text_from_file(file)
        
        return jsonify(result), 200
    
    except ValueError as e:
        return {"error": str(e)}, 400
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": f"Server error: {str(e)}"}, 500


if __name__ == "__main__":
    app.run(host=FLASK_CONFIG["host"], 
            port=FLASK_CONFIG["port"], 
            debug=FLASK_CONFIG["debug"])