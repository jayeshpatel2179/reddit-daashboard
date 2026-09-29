# Reddit Live Pulse

Type a subreddit name and get a live AI briefing of what people asked and answered.
Every post is treated as a question or topic and its comments as the replies. Each thread gets its own
summary, key answers, best answer and an importance score. The subreddit also gets an overall briefing.

**Nothing is stored.** No database and no files. Data is fetched live from Reddit RSS and kept only in
your browser tab (plus an optional 10-minute RAM cache on the server, off with `CACHE_MINUTES=0`).

## Run it

```bash
npm install
cp .env.example .env.local   # then put your OpenRouter key in OPENROUTER_API_KEY
npm run dev                  # http://localhost:3000
```

Run it locally or on a VPS. Reddit often blocks serverless/cloud IPs (Vercel, AWS Lambda) with 403.

## Features

- Per-thread AI summary: question, summary, key answers (with how many agree), best answer,
  consensus, sentiment, importance 1–10 with a reason, and tags
- Subreddit overview: headline, topics (grouped threads), trending terms, most important threads,
  recurring problems, and mood
- Live streaming: threads show up one by one with a progress bar and time estimate
- Time window: 6h / 12h / 24h / 3d / 7d; 5–50 threads
- Tabs: Threads (sort by importance, Reddit top, comments or newest; filter by type and min importance),
  Unanswered, Links shared (grouped by domain), and Ask AI (chat over the loaded data, no extra Reddit calls)
- Compare mode: two subreddits side by side, plus an AI comparison chat
- Stats: sentiment bar, thread types, unanswered count, average importance
- Cost display: tokens and USD per run (from OpenRouter usage)
- Export: Markdown download or print to PDF, both made in the browser
- Model picker: live OpenRouter model list with prices, with separate models for threads and overview

## How it works

```
Browser ──GET /api/analyze?sub=…──▶ Next.js route (NDJSON stream)
                                     1. top/.rss?t=day + new/.rss  → filter to window → pick top N
                                     2. for each post: comments/.rss (rate-limited, one at a time)
                                        └─ AI thread summary runs in parallel (max 4 at once)
                                     3. AI overview from all thread summaries
        ◀── status / posts / thread / usage / overview / done events ──
```

- `src/lib/reddit/rateLimiter.ts`: one shared queue for every Reddit call. It spaces requests by
  `REDDIT_RPM` and follows Reddit's `x-ratelimit-*` headers on 429.
- `src/lib/reddit/rss.ts`, `fetcher.ts`: Atom parsing, HTML→text, link extraction, post selection
- `src/lib/ai/openrouter.ts`: OpenRouter client, JSON parsing with one self-repair retry, usage/cost
- `src/lib/ai/summarize.ts`: prompts and zod schemas for thread, overview and ask
- `src/app/api/{analyze,ask,models}`: API routes
- `src/lib/useAnalysis.ts`: client hook that reads the stream
- `src/components/*`: UI

## Limits to know

- Logged-out RSS is heavily rate-limited (around one request every 8–10 s, sometimes stricter).
  A 20-thread run is about 22 requests, so expect a few minutes. Results stream in as they arrive.
- RSS has no upvote counts, and comments come flat (no reply tree). Importance is judged by the AI,
  helped by the thread's rank in Reddit's "top" feed.
- The comments feed returns at most about 100 comments per thread.
