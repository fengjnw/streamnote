from flask import Flask, request
from flask_socketio import SocketIO, emit
from flask_cors import CORS
from openai import OpenAI
import io
from config import OPENAI_API_KEY, FAST_LAYER, PRECISE_LAYER, FLASK_CONFIG

app = Flask(__name__)
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")
client = OpenAI(api_key=OPENAI_API_KEY)

session_confirmed_text = {}
session_audio_buffer = {}


@socketio.on("connect")
def handle_connect():
    sid = request.sid
    print(f"[CONNECT] {sid}")
    session_confirmed_text[sid] = ""
    session_audio_buffer[sid] = b""


@socketio.on("disconnect")
def handle_disconnect():
    sid = request.sid
    print(f"[DISCONNECT] {sid}")
    session_confirmed_text.pop(sid, None)
    session_audio_buffer.pop(sid, None)


def transcribe_audio(audio_bytes, is_fast_layer=True):
    try:
        config = FAST_LAYER if is_fast_layer else PRECISE_LAYER
        
        audio_file = io.BytesIO(audio_bytes)
        audio_file.name = "audio.wav"
        
        result = client.audio.transcriptions.create(
            model=config["model"],
            file=audio_file,
            language=config["language"],
        )
        
        return result.text.strip()
    except Exception as e:
        print(f"[ERROR] Transcription: {e}")
        return ""


@socketio.on("audio_chunk")
def handle_audio_chunk(data):
    sid = request.sid
    audio_bytes = bytes(data["audio"])
    chunk_index = data.get("chunk_index", 0)
    is_checkpoint = data.get("is_checkpoint", False)
    is_final = data.get("is_final", False)
    
    print(f"[CHUNK] index={chunk_index}, checkpoint={is_checkpoint}, final={is_final}, size={len(audio_bytes)}")
    
    if is_checkpoint:
        text = transcribe_audio(audio_bytes, is_fast_layer=True)
        if text:
            emit("fast_result", {
                "text": text,
                "chunk_index": chunk_index,
                "temporary": True
            })
            print(f"[FAST] {text[:60]}")
    
    if is_final:
        session_audio_buffer[sid] += audio_bytes
        text = transcribe_audio(session_audio_buffer[sid], is_fast_layer=False)
        
        if text:
            if session_confirmed_text[sid]:
                confirmed_words = session_confirmed_text[sid].split()
                current_words = text.split()
                
                overlap = 0
                for i in range(1, min(len(current_words), len(confirmed_words)) + 1):
                    if (' '.join(current_words[:i]).lower() == 
                        ' '.join(confirmed_words[-i:]).lower()):
                        overlap = i
                    else:
                        break
                
                if overlap >= 2:
                    text = ' '.join(current_words[overlap:]).strip()
            
            if text:
                session_confirmed_text[sid] += (' ' + text if session_confirmed_text[sid] else text)
                
                emit("precise_result", {
                    "text": session_confirmed_text[sid],
                    "chunk_index": chunk_index,
                    "temporary": False
                })
                print(f"[PRECISE] {text[:60]}")
        
        session_audio_buffer[sid] = b""


@app.route("/health", methods=["GET"])
def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    print("[START] StreamNote Backend")
    print(f"[INFO] http://{FLASK_CONFIG['host']}:{FLASK_CONFIG['port']}")
    socketio.run(app, 
                 host=FLASK_CONFIG["host"], 
                 port=FLASK_CONFIG["port"], 
                 debug=FLASK_CONFIG["debug"])