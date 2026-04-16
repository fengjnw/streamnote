# StreamNote

StreamNote is a web app for classroom speech-to-text and AI-assisted learning support.
It captures or imports content, then provides transcription, keyword extraction, translation, summary, and keyword explanation in one interface.

## Live Demo

- https://streamnote-m1cf.onrender.com

## Features

- Audio transcription via OpenAI transcription API
- Smart keyword extraction from transcript/content
- Text translation and keyword translation
- AI summary generation with style options
- Keyword explanation generation
- Session persistence in browser local storage
- Built-in tutorial session data for guided first-run demo

## Tech Stack

- Frontend: Vanilla JavaScript, modular managers, CSS modules
- Backend: Flask API server
- AI services: OpenAI API

## Requirements

- Python 3.8+
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
Make sure `python` and `pip` point to the same environment before continuing.

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

### 5. Run backend server

From repository root (recommended):

```bash
npm start
```

Alternative (manual backend run):

```bash
cd backend
python server.py
```

Server default URL: http://localhost:5500

### 6. Open frontend

- Open http://localhost:5500
- Or use the deployed demo: https://streamnote-m1cf.onrender.com

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

If no external input is prepared, open the built-in Tutorial session and use its preloaded transcript content.

## Quality Checks

Run from repository root:

```bash
# Frontend lint
npm run lint

# Frontend smoke test
npm run test:frontend:smoke

# Backend tests
npm run test:backend
```

## API Error Contract

API errors are normalized as JSON:

```json
{
	"error": {
		"code": "ERROR_CODE",
		"message": "Human readable detail"
	}
}
```

## Known Limitations

- Most AI features depend on valid OpenAI API key and network connection.
- Live transcription quality varies with microphone quality and noise.
- Browser audio permissions are required for recording.
- No multi-user account/authentication workflow yet.
- Limited automated tests for full browser interaction and streaming edge cases.

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
- `frontend/data/tutorialSession.js`: built-in tutorial data
- `frontend/styles/`: style modules

