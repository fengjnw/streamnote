# StreamNote Evaluation Mode

This is a lightweight technical evaluation mode for dissertation evidence, not a research-grade NLP benchmark.

## Fixtures

Keep real evaluation materials outside the product UI and pass them in at runtime.
The audio and reference scripts can be loaded from URLs, for example local private files served only during testing, a temporary signed URL, or a private university/cloud link.

Each fixture needs:

```js
{
    id: "photosynthesis",
    title: "Photosynthesis",
    audioUrl: "https://example.com/private/photosynthesis.mp3",
    referenceUrl: "https://example.com/private/photosynthesis.txt"
}
```

`expectedConcepts` is optional. If it is not provided, the evaluator automatically selects up to 10 frequent content words from the reference script and uses those as lightweight reference concepts for the summary metric. If you want tighter control, you can still provide a short manual list:

```js
expectedConcepts: ["sunlight", "chlorophyll", "carbon dioxide", "glucose", "oxygen"]
```

The automatic concept extraction uses a built-in English stopword fallback. If you prefer a library list, pass it in when running the evaluator:

```js
const stopword = await import("https://cdn.jsdelivr.net/npm/stopword/+esm");
await import("/evaluation/evaluationManager.js");
await runStreamNoteEvaluation(lectures, { stopwords: stopword.eng });
```

## Running

Evaluation mode is not loaded by the normal product page. Start the app normally, open the app, then run this in the browser console:

```js
await import("/evaluation/evaluationManager.js");

const lectures = [
    {
        id: "climate",
        title: "Paleoclimate Reconstruction",
        audioUrl: "/evaluation/assets/climate.m4a",
        referenceUrl: "/evaluation/assets/climate.txt"
    },
    {
        id: "memory",
        title: "Memory Hierarchy and Cache Locality",
        audioUrl: "/evaluation/assets/memory.m4a",
        referenceUrl: "/evaluation/assets/memory.txt"
    }
];

const stopword = await import("https://cdn.jsdelivr.net/npm/stopword/+esm");
await runStreamNoteEvaluation(lectures, { stopwords: stopword.eng });
```

Some browsers block automatic media playback until the page receives a user gesture. If that happens, click once anywhere on the page and run:

```js
streamNoteEvaluation.run()
```

## What It Measures

The mode plays each lecture recording through a browser `<audio>` element and routes that playback into the existing `RecordingManager`. The backend still receives normal recorded webm chunks, so the real streaming/chunking transcription path is preserved.

This keeps the test harness out of the normal UI. It is still a frontend testing helper, so any URL you pass to it must already be appropriate for browser access. For sensitive material, use temporary or access-controlled URLs and avoid committing them to the repository.

It prints objective indicators to the console:

- transcription latency, failed chunks, missing chunks, approximate WER
- translation latency and failures
- keyword latency, keyword count, generic keyword ratio, transcript presence rate
- explanation latency and failures
- summary latency, compression ratio, expected concept presence
- API success rate, uncaught errors, total completion time
