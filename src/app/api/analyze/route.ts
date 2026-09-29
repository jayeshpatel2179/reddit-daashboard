import type { NextRequest } from "next/server";
import { getCached, setCached } from "@/lib/cache";
import { addUsage, emptyUsage } from "@/lib/ai/openrouter";
import { summarizeOverview, summarizeThread } from "@/lib/ai/summarize";
import { fetchComments, fetchNewPosts, fetchTopPosts, normalizeSub, selectPosts } from "@/lib/reddit/fetcher";
import type { StreamEvent, Thread } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 600;

const AI_CONCURRENCY = 4;

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const sub = normalizeSub(q.get("sub") ?? "");
  if (!sub) return Response.json({ error: "Invalid subreddit name." }, { status: 400 });

  const hours = Math.min(168, Math.max(1, Number(q.get("hours")) || 24));
  const limit = Math.min(50, Math.max(1, Number(q.get("limit")) || 20));
  const threadModel = q.get("threadModel") || process.env.DEFAULT_THREAD_MODEL || "google/gemini-3.1-flash-lite";
  const overviewModel = q.get("overviewModel") || process.env.DEFAULT_OVERVIEW_MODEL || "~google/gemini-flash-latest";
  const refresh = q.get("refresh") === "1";
  const cacheKey = [sub.toLowerCase(), hours, limit, threadModel, overviewModel].join("|");
  const signal = req.signal;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const log: StreamEvent[] = [];
      let closed = false;
      const send = (ev: StreamEvent) => {
        if (ev.type !== "status") log.push(ev);
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(ev) + "\n"));
        } catch {
          closed = true;
        }
      };
      const finish = () => {
        if (!closed) controller.close();
        closed = true;
      };

      const cached = refresh ? null : getCached(cacheKey);
      if (cached) {
        for (const ev of cached) send(ev.type === "done" ? { ...ev, cached: true } : ev);
        return finish();
      }

      const usage = emptyUsage();
      const onWait = (s: number) => send({ type: "status", message: `Reddit rate limit hit, waiting ${s}s…` });

      try {
        // 1. Find posts in the time window
        send({ type: "status", message: `Fetching top posts from r/${sub}…` });
        const top = await fetchTopPosts(sub, hours, { signal, onWait });
        send({ type: "status", message: `Fetching newest posts from r/${sub}…` });
        const fresh = await fetchNewPosts(sub, { signal, onWait });
        const { selected, totalInWindow } = selectPosts(top, fresh, hours, limit);
        send({ type: "posts", posts: selected, totalInWindow });

        if (!selected.length) {
          send({ type: "error", message: `No posts in r/${sub} in the last ${hours} hours (or the subreddit is empty/private).` });
          send({ type: "done", cached: false, finishedAt: new Date().toISOString() });
          return finish();
        }

        // 2. Fetch comments one by one (rate-limited) while the AI summarizes
        //    already-fetched threads in parallel.
        const threads: Thread[] = [];
        const running = new Set<Promise<void>>();
        let done = 0;
        const progress = () => ({ done, total: selected.length });

        for (const post of selected) {
          if (signal.aborted) throw new DOMException("Aborted", "AbortError");
          send({ type: "status", message: `Fetching comments: ${post.title.slice(0, 70)}`, progress: progress() });

          let thread: Thread;
          let body = post.body;
          try {
            const res = await fetchComments(post, { signal, onWait });
            body = res.body;
            thread = { post: { ...post, body }, comments: res.comments, commentCount: res.comments.length, links: res.links, ai: null };
          } catch (err) {
            if ((err as Error).name === "AbortError") throw err;
            thread = { post, comments: [], commentCount: 0, links: [], ai: null, aiError: `Comments unavailable: ${(err as Error).message}` };
          }

          while (running.size >= AI_CONCURRENCY) await Promise.race(running);
          const job = (async () => {
            const local = emptyUsage();
            try {
              thread.ai = await summarizeThread(thread.post, body, thread.comments, threadModel, local, signal);
            } catch (err) {
              thread.aiError = (err as Error).message;
            }
            addUsage(usage, local);
            threads.push(thread);
            done++;
            send({ type: "thread", thread });
            send({ type: "usage", usage: { ...usage } });
            send({ type: "status", message: `Summarized ${done}/${selected.length} threads`, progress: progress() });
          })();
          running.add(job);
          job.finally(() => running.delete(job));
        }
        await Promise.all(running);

        // 3. Whole-subreddit overview
        if (threads.some((t) => t.ai)) {
          send({ type: "status", message: "Writing the subreddit overview…", progress: progress() });
          try {
            const overview = await summarizeOverview(sub, hours, threads, overviewModel, usage, signal);
            send({ type: "overview", overview });
            send({ type: "usage", usage: { ...usage } });
          } catch (err) {
            if ((err as Error).name === "AbortError") throw err;
            send({ type: "error", message: `Overview failed: ${(err as Error).message}` });
          }
        } else {
          send({ type: "error", message: "The AI could not summarize any thread. Check your OpenRouter key and model." });
        }

        send({ type: "done", cached: false, finishedAt: new Date().toISOString() });
        if (log.some((e) => e.type === "overview")) setCached(cacheKey, log);
      } catch (err) {
        if ((err as Error).name !== "AbortError") send({ type: "error", message: (err as Error).message });
      } finally {
        finish();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
