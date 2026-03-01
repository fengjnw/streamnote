# StreamNote

Real-time classroom transcription with AI-powered keyword extraction, translation, and summarization.

## Features

- Real-time audio transcription using OpenAI Whisper API
- Automatic keyword extraction with AI analysis
- Multi-language translation support
- Text summarization and keyword explanation
- Session management with local storage
- Split-view interface for transcript and translation

## Installation

### Backend
```bash
cd backend
pip install -r requirements.txt
export OPENAI_API_KEY="your-api-key"
python server.py
```

The server will run on `http://localhost:5001`

### Frontend
Open `frontend/index.html` in your browser or visit the server URL above.

## Usage

1. Click the record button to start capturing audio
2. Transcription appears in real-time on screen
3. Keywords are automatically extracted
4. Use the translation and summarization features as needed
5. Sessions are automatically saved

## Requirements

- Python 3.8+
- OpenAI API key
- Modern web browser with microphone access

## Configuration

Set environment variables in the backend:
- `OPENAI_API_KEY` - Your OpenAI API key (required)
- `PORT` - Server port (default: 5001)
- `FLASK_DEBUG` - Debug mode (default: false)
