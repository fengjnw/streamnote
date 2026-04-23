# StreamNote

StreamNote is a web app for classroom speech-to-text and AI-assisted learning support.
It captures or imports content, then provides transcription, keyword extraction, translation, summary, and keyword explanation in one interface.

## Live Demo

- https://streamnote.up.railway.app

## Features

- Audio transcription via OpenAI transcription API
- Smart keyword extraction from transcript/content
- Text translation and keyword translation
- AI summary generation with style options
- Keyword explanation generation
- Session persistence in browser local storage with backend database sync (anonymous device ID)
- Built-in welcome session data for guided first-run demo

## Tech Stack

- Frontend: Vanilla JavaScript, modular managers, CSS modules
- Backend: Flask API server
- AI services: OpenAI API

## Requirements

- Python 3.11
- Node.js 18+
- npm 9+
- OpenAI API key
- Modern browser with microphone access for live recording

## Quick Start

### 1. Clone and enter project

```bash
git clone <your-repo-url>
cd streamnote
```

### 2. Prepare your Python environment

Use your own Python environment (system Python, conda, poetry, pyenv, etc.).
Make sure `python3` and `pip` point to the same environment before continuing.

### 3. Install dependencies

```bash
pip install -r requirements.txt
npm install
```

### 4. Configure environment variables

Copy `.env.example` to `.env` and set your key:

```bash
cp .env.example .env
```

Required:

- OPENAI_API_KEY=your_real_key

Optional:

- PORT=5500
- FLASK_DEBUG=false
- SESSION_DB_PATH=data/streamnote.db

### 5. Run backend server

From repository root (recommended):

```bash
npm start
```

Alternative (manual backend run):

```bash
cd backend
python3 server.py
```

Server default URL: http://localhost:5500

### 6. Open frontend

- Open http://localhost:5500

## How To Use

1. Open StreamNote in the browser.
2. Start recording or import content.
3. Confirm transcript appears in the transcript panel.
4. Trigger keyword extraction and check keyword list.
5. Run translation and summary on the content.
6. Click a keyword to view explanation.
7. Switch sessions and confirm persistence.

## Sample Input

Use either of the following input paths for a stable end-to-end demo:

1. Record a short speech (15-30 seconds).

2. Upload a text/document file (supported: TXT, MD, DOCX, PDF).

If no external input is prepared, open the built-in Welcome session and use its preloaded transcript content.


## Known Limitations

- Most AI features depend on valid OpenAI API key and network connection.
- Live transcription quality varies with microphone quality and noise.
- Browser audio permissions are required for recording.
- No multi-user account/authentication workflow yet.
- Limited automated tests for full browser interaction and streaming edge cases.

## Session Persistence Architecture

- Current stage uses anonymous device-based persistence, not user login.
- Frontend keeps local state for resilience and instant UX.
- Backend stores the same session snapshot in SQLite via `/api/session-state`.
- Device identity is a generated `deviceId` stored locally in browser storage.
- This enables seamless migration toward full account-based sync later.

## Project Structure

### Backend (Flask)

- `backend/server.py`: thin run entrypoint
- `backend/app_factory.py`: app factory, wiring, CORS, no-cache headers
- `backend/routes/`: route registration and API endpoints
- `backend/file_processor.py`: upload validation and text extraction
- `backend/keyword_manager.py`: keyword extraction and explanation
- `backend/translator.py`: translation service
- `backend/summarizer.py`: summarization service

### Frontend (Vanilla JS)

- `frontend/core/app.js`: app orchestrator
- `frontend/managers/`: feature managers by domain
- `frontend/services/apiClient.js`: API request client
- `frontend/data/welcomeSession.js`: built-in welcome data
- `frontend/styles/`: style modules

