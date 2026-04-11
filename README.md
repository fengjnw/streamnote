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

The server will run on `http://localhost:5500` by default.

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
- `PORT` - Server port (default: 5500)
- `FLASK_DEBUG` - Debug mode (default: false)

## Project Structure

### Backend (Flask)

- `backend/server.py`: Thin entrypoint (run only)
- `backend/app_factory.py`: App factory, CORS and no-cache headers, dependency wiring
- `backend/routes/static_routes.py`: Frontend static file routes (`/`, `/<path:path>`)
- `backend/routes/api_routes.py`: API route registrar (aggregates module routes)
- `backend/routes/ai_routes.py`: AI endpoints (`/api/transcribe`, `/api/translate`, `/api/summarize`, keyword extract/explain, `/health`)
- `backend/routes/file_routes.py`: File endpoint (`/api/upload-file`)
- `backend/keyword_manager.py`: Keyword extraction and explanation service
- `backend/translator.py`: Translation service
- `backend/summarizer.py`: Summarization service
- `backend/file_processor.py`: File upload validation and text extraction

### Frontend (Vanilla JS)

- `frontend/core/app.js`: Application orchestrator
- `frontend/core/executionContext.js`: Async operation validity and cancellation helpers
- `frontend/managers/sessionManager.js`: Session persistence and switching
- `frontend/managers/recordingManager.js`: Recording/transcript state
- `frontend/managers/translationManager.js`: Translation flow and cache updates
- `frontend/managers/keywordManager.js`: Keyword extraction/explanation state
- `frontend/managers/highlightManager.js`: Highlight lifecycle and rendering
- `frontend/managers/panelManager.js`: Panel layout and visibility states
- `frontend/managers/settingsPanel.js`: Settings modal and defaults management
- `frontend/services/apiClient.js`: Shared API request layer for frontend modules
- `frontend/services/textProcessor.js`: Frontend text/file conversion utilities
- `frontend/data/tutorialSession.js`: Built-in tutorial session dataset
- `frontend/styles.css`: CSS entry that aggregates style modules
- `frontend/styles/`: CSS modules (`tokens`, `base`, `layout`, `features`, `components`, `responsive`)
- `frontend/utils/dateTimeUtils.js`: Shared date/time formatting helpers

## Refactor Notes

- Backend routing is now modularized for easier onboarding and explanation.
- Service dependency creation is centralized in the app factory.
- Entry point and route logic are decoupled to reduce file-level complexity.
