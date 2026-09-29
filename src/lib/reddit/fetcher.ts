import type { Comment, Link, Post } from "@/lib/types";
import { redditFetch } from "./rateLimiter";
import { extractLinks, extractPostLink, extractSelfText, htmlToPlain, parseFeed } from "./rss";

const BASE = "https://www.reddit.com";

type FetchOpts = { signal?: AbortSignal; onWait?: (seconds: number) => void };

export function normalizeSub(input: string): string | null {
  const sub = input.trim().replace(/^\/?r\//i, "").replace(/\/$/, "");
  return /^[A-Za-z0-9_]{2,21}$/.test(sub) ? sub : null;
}

function postFromEntry(e: ReturnType<typeof parseFeed>[number], sub: string, topRank?: number): Post {
  return {
    id: e.id.replace(/^t3_/, ""),
    subreddit: sub,
    title: e.title,
    author: e.author,
    permalink: e.link,
    published: e.published,
    body: extractSelfText(e.html),
    linkUrl: extractPostLink(e.html),
    topRank,
  };
}

export async function fetchTopPosts(sub: string, hours: number, opts: FetchOpts): Promise<Post[]> {
  const t = hours <= 24 ? "day" : "week";
  const xml = await redditFetch(`${BASE}/r/${sub}/top/.rss?t=${t}&limit=100`, opts);
  return parseFeed(xml)
    .filter((e) => e.id.startsWith("t3_"))
    .map((e, i) => postFromEntry(e, sub, i + 1));
}

export async function fetchNewPosts(sub: string, opts: FetchOpts): Promise<Post[]> {
  const xml = await redditFetch(`${BASE}/r/${sub}/new/.rss?limit=100`, opts);
  return parseFeed(xml)
    .filter((e) => e.id.startsWith("t3_"))
    .map((e) => postFromEntry(e, sub));
}

export async function fetchComments(
  post: Post,
  opts: FetchOpts,
): Promise<{ comments: Comment[]; links: Link[]; body: string }> {
  const xml = await redditFetch(`${BASE}/r/${post.subreddit}/comments/${post.id}/.rss?limit=100`, opts);
  const entries = parseFeed(xml);
  const links: Link[] = [];
  const comments: Comment[] = [];
  let body = post.body;

  for (const e of entries) {
    if (e.id.startsWith("t3_")) {
      // The comments feed repeats the post itself; it sometimes has the fuller self-text.
      const full = extractSelfText(e.html);
      if (full.length > body.length) body = full;
      for (const l of extractLinks(e.html)) links.push({ ...l, postId: post.id });
      continue;
    }
    const text = htmlToPlain(e.html);
    if (!text || text === "[deleted]" || text === "[removed]") continue;
    comments.push({ id: e.id.replace(/^t1_/, ""), author: e.author, body: text, published: e.published });
    for (const l of extractLinks(e.html)) links.push({ ...l, postId: post.id });
  }

  const seen = new Set<string>();
  return {
    comments,
    body,
    links: links.filter((l) => !seen.has(l.url) && seen.add(l.url)),
  };
}

/**
 * Merge "top" and "new", keep only posts inside the time window, and pick
 * the N most worthwhile: top-ranked first (they're the ones people engaged
 * with), then the newest remaining posts.
 */
export function selectPosts(top: Post[], fresh: Post[], hours: number, limit: number) {
  const cutoff = Date.now() - hours * 3600_000;
  const inWindow = (p: Post) => new Date(p.published).getTime() >= cutoff;

  const byId = new Map<string, Post>();
  for (const p of top.filter(inWindow)) byId.set(p.id, p);
  for (const p of fresh.filter(inWindow)) if (!byId.has(p.id)) byId.set(p.id, p);

  const all = [...byId.values()].sort((a, b) => {
    if (a.topRank && b.topRank) return a.topRank - b.topRank;
    if (a.topRank) return -1;
    if (b.topRank) return 1;
    return new Date(b.published).getTime() - new Date(a.published).getTime();
  });
  return { selected: all.slice(0, limit), totalInWindow: all.length };
}
