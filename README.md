# StreamNote

StreamNote is a web app for capturing, importing, and reviewing study content.
It combines transcription, translation, keyword extraction, summaries, and keyword explanations in one interface.

## Live Demo

- https://streamnote.up.railway.app

## Feedback

If you try StreamNote and would like to share feedback, suggestions, or comments, feel free to leave a message here:

- https://forms.gle/Xw7MDeb6DpchREfY8

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

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/fengjnw/streamnote
cd streamnote
```

### 2. Prepare Python

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

### 5. Run the app

From repository root (recommended):

```bash
npm start
```

Alternative:

```bash
cd backend
python3 server.py
```

### 6. Open the app

- Open http://localhost:5500 in your browser.

## Usage

The main user guide lives in [docs/user-guide.md](docs/user-guide.md). It covers session flow, import, transcription, translation, keyword extraction, summaries, and account sync.


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