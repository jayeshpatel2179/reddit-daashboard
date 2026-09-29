// One shared queue for every Reddit request made by this server process.
// Logged-out RSS access is limited far below the 100/min OAuth quota, so we
// space requests evenly and back off when Reddit answers 429.

const RPM = Math.max(1, Number(process.env.REDDIT_RPM) || 8);
const INTERVAL_MS = Math.ceil(60_000 / RPM);
const MAX_RETRIES = 5;
const USER_AGENT =
  process.env.REDDIT_USER_AGENT || "web:reddit-live-dashboard:v1.0 (local summary tool)";

type LimiterState = { nextSlot: number; chain: Promise<void> };

// Survive Next.js hot reloads in dev so we don't end up with two limiters.
const g = globalThis as unknown as { __redditLimiter?: LimiterState };
const state: LimiterState = (g.__redditLimiter ??= { nextSlot: 0, chain: Promise.resolve() });

export class RedditError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function sleep(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException("Aborted", "AbortError"));
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/** Reserve the next free request slot and wait until it arrives. */
async function waitForSlot(signal?: AbortSignal): Promise<void> {
  const turn = state.chain.then(async () => {
    const wait = state.nextSlot - Date.now();
    state.nextSlot = Math.max(Date.now(), state.nextSlot) + INTERVAL_MS;
    if (wait > 0) await sleep(wait);
  });
  state.chain = turn.catch(() => {});
  await turn;
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

/** Push every queued request back (used after a 429 so all callers pause). */
function pauseAll(ms: number) {
  state.nextSlot = Math.max(state.nextSlot, Date.now() + ms);
}

export function queueWaitMs() {
  return Math.max(0, state.nextSlot - Date.now());
}

export async function redditFetch(
  url: string,
  opts: { signal?: AbortSignal; onWait?: (seconds: number) => void } = {},
): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    await waitForSlot(opts.signal);
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/atom+xml, application/xml" },
      signal: opts.signal,
      cache: "no-store",
      redirect: "manual",
    });

    // Reddit reports its budget in headers; follow them instead of guessing.
    const remaining = Number(res.headers.get("x-ratelimit-remaining") ?? NaN);
    const resetSec = Number(res.headers.get("x-ratelimit-reset") ?? NaN);

    if (res.ok) {
      if (remaining < 1 && resetSec > 0) pauseAll(resetSec * 1000 + 500);
      return res.text();
    }

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = Math.min(
        90_000,
        resetSec > 0 ? resetSec * 1000 + 1000 : retryAfter > 0 ? retryAfter * 1000 : 10_000 * 2 ** attempt,
      );
      pauseAll(waitMs);
      opts.onWait?.(Math.round(waitMs / 1000));
      continue;
    }

    if (res.status === 429) throw new RedditError("Reddit rate limit hit repeatedly. Wait a minute and try again.", 429);
    if (res.status === 404 || (res.status >= 300 && res.status < 400))
      throw new RedditError("Subreddit or post not found.", 404);
    if (res.status === 403)
      throw new RedditError(
        "Reddit refused the request (403). The subreddit may be private/banned, or Reddit is blocking this network (common on cloud hosts).",
        403,
      );
    throw new RedditError(`Reddit returned HTTP ${res.status}.`, res.status);
  }
}
