# StreamNote

Real-time classroom transcription with layered ASR approach.

## Architecture

- **Frontend**: Vanilla JS + WebSocket
- **Backend**: Flask + Flask-SocketIO + OpenAI Whisper API
- **Layers**:
  - Fast Layer: Real-time transcription (2s window)
  - Precise Layer: Final transcription (6s window)

## Setup

### Backend
```bash
cd backend
pip install -r requirements.txt
export OPENAI_API_KEY="your-api-key"
python server.py