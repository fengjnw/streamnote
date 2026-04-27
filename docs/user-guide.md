# StreamNote User Guide

## Overview

StreamNote is a real-time, AI-assisted learning workspace. Its focus is live support during study: capture, understand, annotate, and review in one flow.

## Core Features

- Session lifecycle: create, switch, persist, import, and export sessions
- Audio recording and transcription workflow
- Text/file import workflow
- Translation with configurable language preferences
- Keyword extraction and keyword explanation
- Summary generation with selectable style
- Manual highlight and explanation from transcript/translation selection
- Optional account sign-in and cross-device sync behavior

## Setup and Run

### Prerequisites

- Python 3.11
- Node.js 18+
- npm 9+
- OpenAI API key
- A modern browser (microphone permission needed for recording)

### Installation

1. Open a terminal in the project root.
2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   npm install
   ```

### Environment Configuration

1. Create environment file:

   ```bash
   cp .env.example .env
   ```

2. Set OPENAI_API_KEY in .env.

### Start the App

1. Start from project root:

   ```bash
   npm start
   ```

   Alternative:

   ```bash
   cd backend
   python3 server.py
   ```

2. Open http://localhost:5500 in your browser.

## Use StreamNote

### Start a Session

- Open StreamNote in the browser.
- Use New Session when you want a clean workspace.
- Use Sessions to switch between saved study contexts.

### Sign In and Sync

- Use Sign In in the header to create or attach an account.
- When signed in, session data can sync across devices through the backend.
- When not signed in, session data stays in browser local storage.

### Add Content

- Use Record to capture live speech.
- Use Import to bring in text, files, or session JSON.
- Use Edit to refine transcript text before analysis.
- Use Export if you want to save the current session or all sessions as JSON.

### Understand the Content

- Use Translate to switch the transcript into your reading language.
- Use Keywords to extract the main concepts.
- Use the language selectors when you want translation and explanation in different languages.
- Select any word or phrase in the transcript or translation, then use the floating menu to Highlight or Explain it.

### Generate Output

- Use Summary to create a compact study recap.
- Choose a summary style before refreshing the summary.
- Use the refresh buttons to regenerate keywords or summary after you change content.

### Clean Up and Settings

- Use the Clear buttons in the keyword, highlight, explanation, and summary panels to reset a section.
- Use the sidebar menu button if labels are hidden on a narrow screen.
- Open Settings to change default translation and explanation language.

## First-Run Flow

1. Open the Welcome session.
2. Record a short sample or import the included [sample.txt](../sample.txt).
3. Translate the content.
4. Extract keywords.
5. Select a phrase and open the explanation panel.
6. Generate a summary.
7. Switch sessions and confirm your data is still there.

Note: You do not need a pre-created test account. If you want to test auth/sync, register with any valid email and a password of at least 6 characters.

## Known Limitations

- Most features depend on valid OpenAI API key and network connection.
- Live transcription quality varies with microphone quality and noise.
- Browser audio permissions are required for recording.
- Account authentication is available but simple and not secure for production use.
- Session data is stored in browser local storage, which may not be ideal for all use cases.
- Import and export features are basic and may not handle all file formats or edge cases.