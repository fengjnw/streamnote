# StreamNote

StreamNote is a web app for classroom speech-to-text and AI-assisted learning support.
It captures or imports content, then provides transcription, keyword extraction, translation, summary, and keyword explanation in one interface.

## Live Demo

- https://streamnote.up.railway.app

## Tech Stack

- Backend: Python Flask API server
- Frontend: Vanilla JavaScript with HTML/CSS
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
git clone https://github.com/fengjnw/streamnote
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

### 6. Open frontend

- Open http://localhost:5500


## User Guide

User guidance is documented separately in [docs/user-guide.md](docs/user-guide.md).

## Testing

Run the project checks from the repository root:

```bash
npm run test:all
```

You can also run narrower checks when needed:

```bash
npm run test:backend
npm run test:frontend:unit
npm run test:frontend:smoke
```
 

## Known Limitations

- Most features depend on valid OpenAI API key and network connection.
- Live transcription quality varies with microphone quality and noise.
- Browser audio permissions are required for recording.
- Account authentication is available but simple and not secure for production use.
- Session data is stored in browser local storage, which may not be ideal for all use cases.
- Import and export features are basic and may not handle all file formats or edge cases.

## Project Structure

### Backend (Python Flask)

- `backend/server.py`: run entrypoint
- `backend/app_factory.py`: app factory, service wiring, CORS and response headers
- `backend/config.py`: environment loading and runtime config
- `backend/routes/`: endpoint modules (ai, file, auth, session, api aggregation)
- `backend/ai_service.py`: OpenAI integration for transcription and AI tasks
- `backend/file_processor.py`: upload validation and text extraction
- `backend/keyword_manager.py`: keyword extraction and explanation
- `backend/translator.py`: translation service
- `backend/summarizer.py`: summarization service
- `backend/session_store.py`: session persistence and state storage
- `backend/auth_store.py`: account and auth session storage
- `backend/tests/`: backend unit and API tests
- `backend/tools/`: maintenance scripts (backup/reset)

### Frontend (Vanilla JavaScript)

- `frontend/index.html`: main page structure
- `frontend/core/`: app bootstrap and shared runtime context
- `frontend/managers/`: feature managers (recording, session, keyword, translation, UI, panel)
- `frontend/services/apiClient.js`: API request client
- `frontend/services/textProcessor.js`: shared text processing helpers
- `frontend/data/welcomeSession.js`: built-in welcome data
- `frontend/utils/`: common formatting and guard utilities
- `frontend/styles/`: split style layers (tokens, layout, components, features, responsive)

### Test and Dev Scripts

- `scripts/test-all.cjs`: run lint + frontend tests + backend tests in sequence
- `scripts/frontend-smoke.cjs`: DOM/script wiring smoke checks
- `scripts/frontend-unit-*.cjs`: focused frontend unit checks
- `eslint.config.cjs`: frontend lint config