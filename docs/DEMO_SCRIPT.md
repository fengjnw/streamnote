# StreamNote Demo Script (About 5 Minutes)

## 1) Intro (20-30s)

- Project: StreamNote
- Goal: show a working end-to-end classroom support flow
- Core features demonstrated: transcription/content handling, keyword extraction, translation or summary, and session persistence

## 2) Start System (30-45s)

Run from repository root:

```bash
source .venv/bin/activate
cd backend
python server.py
```

Open browser at:

- http://localhost:5500

Say clearly that backend is running and UI is loaded.

## 3) Show Input Content (40-60s)

Option A (safe): use built-in tutorial session content.

Option B: record a short 15-30 second speech sample.

Expected visible result:

- transcript/content panel contains meaningful text

## 4) End-to-End Feature Path (2-2.5 min)

Do this sequence in one continuous flow:

1. Trigger keyword extraction.
2. Show extracted keyword list.
3. Trigger summary generation (or translation).
4. Show generated output in the corresponding panel.
5. Click one keyword and show explanation output.

Narrate input and output explicitly so marker can follow cause-effect.

## 5) Persistence Check (40-60s)

- Switch session or refresh page.
- Show content/results remain available from saved session state.

## 6) Limitations and Close (30-40s)

State honestly:

- AI features require valid OpenAI API key and network.
- Accuracy varies with recording quality and speech clarity.
- Some edge cases and full E2E tests are future work.

Finish by restating that one meaningful feature path works end-to-end.
