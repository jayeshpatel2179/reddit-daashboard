import { z } from "zod";
import type { Comment, Overview, Post, Thread, ThreadAI, Usage } from "@/lib/types";
import { chat, chatJson, type ChatMessage } from "./openrouter";

// ---------- Schemas (lenient: bad enum values fall back instead of failing) ----------

const ThreadSchema = z.object({
  question: z.string().default(""),
  type: z
    .enum(["question", "discussion", "news", "help", "showcase", "rant", "meme", "other"])
    .catch("other"),
  summary: z.string().default(""),
  keyAnswers: z
    .array(z.object({ point: z.string(), support: z.enum(["many", "some", "one"]).catch("one") }))
    .catch([]),
  bestAnswer: z.string().catch(""),
  consensus: z.enum(["agreed", "mixed", "disputed", "no answers"]).catch("mixed"),
  sentiment: z.enum(["positive", "neutral", "negative"]).catch("neutral"),
  importance: z.coerce.number().transform((n) => Math.min(10, Math.max(1, Math.round(n)))).catch(5),
  importanceReason: z.string().catch(""),
  tags: z.array(z.string()).catch([]),
});

const OverviewSchema = z.object({
  headline: z.string().catch(""),
  overview: z.string().catch(""),
  topics: z
    .array(z.object({ name: z.string(), summary: z.string().catch(""), threadIds: z.array(z.string()).catch([]) }))
    .catch([]),
  trending: z.array(z.object({ term: z.string(), context: z.string().catch("") })).catch([]),
  importantThreads: z.array(z.object({ threadId: z.string(), why: z.string().catch("") })).catch([]),
  recurringProblems: z.array(z.string()).catch([]),
  mood: z.string().catch(""),
});

// ---------- Per-thread summary ----------

const THREAD_SYSTEM = `You summarize one Reddit thread for a dashboard. The post is the "question/topic"; the comments are the replies.
Rules:
- Use ONLY the given post and comments. Never invent answers, facts, or opinions.
- If there are no useful replies, set consensus to "no answers", keyAnswers to [], bestAnswer to "".
- "support" = how many commenters back that point: "many", "some", or "one".
- importance (1-10): 1-3 casual/meme/low value, 4-6 useful to some readers, 7-8 many people care or strong practical info, 9-10 urgent, breaking news, security issue, or high impact.
- Keep it short and concrete. Plain text, no markdown.
Reply with ONLY a JSON object:
{"question": string (what the OP is really asking or saying, one line),
 "type": "question"|"discussion"|"news"|"help"|"showcase"|"rant"|"meme"|"other",
 "summary": string (2-4 sentences on what people replied),
 "keyAnswers": [{"point": string, "support": "many"|"some"|"one"}] (max 5),
 "bestAnswer": string (the single most useful reply, paraphrased),
 "consensus": "agreed"|"mixed"|"disputed"|"no answers",
 "sentiment": "positive"|"neutral"|"negative",
 "importance": number,
 "importanceReason": string (one short sentence),
 "tags": string[] (2-5 lowercase keywords: tools, products, topics)}`;

const MAX_THREAD_CHARS = 24_000;

function threadPrompt(post: Post, body: string, comments: Comment[]): string {
  let text = `SUBREDDIT: r/${post.subreddit}\nTITLE: ${post.title}\nAUTHOR: ${post.author}\n`;
  if (post.linkUrl) text += `LINK: ${post.linkUrl}\n`;
  if (body) text += `POST:\n${body.slice(0, 6000)}\n`;
  text += `\nCOMMENTS (${comments.length}):\n`;
  for (const c of comments) {
    const line = `- ${c.author}: ${c.body.replace(/\s+/g, " ").slice(0, 1500)}\n`;
    if (text.length + line.length > MAX_THREAD_CHARS) {
      text += "(more comments truncated)\n";
      break;
    }
    text += line;
  }
  return text;
}

export async function summarizeThread(
  post: Post,
  body: string,
  comments: Comment[],
  model: string,
  usage: Usage,
  signal?: AbortSignal,
): Promise<ThreadAI> {
  return chatJson(
    model,
    [
      { role: "system", content: THREAD_SYSTEM },
      { role: "user", content: threadPrompt(post, body, comments) },
    ],
    (v) => ThreadSchema.parse(v) as ThreadAI,
    usage,
    { signal, maxTokens: 1200 },
  );
}

// ---------- Subreddit overview ----------

const OVERVIEW_SYSTEM = `You write the daily briefing for a Reddit community dashboard. You get short JSON summaries of the threads.
Rules:
- Base everything only on the given summaries. Refer to threads by their "id".
- topics: group related threads into 3-7 themes.
- trending: 5-10 tools, products, names or terms that come up a lot, each with a few words of context.
- importantThreads: the 3-6 threads that matter most today and why.
- recurringProblems: problems or questions that several people raise (empty if none).
- mood: one sentence on the community's overall mood.
Reply with ONLY a JSON object:
{"headline": string (one catchy line), "overview": string (3-5 sentences),
 "topics": [{"name": string, "summary": string, "threadIds": string[]}],
 "trending": [{"term": string, "context": string}],
 "importantThreads": [{"threadId": string, "why": string}],
 "recurringProblems": string[], "mood": string}`;

export async function summarizeOverview(
  sub: string,
  hours: number,
  threads: Thread[],
  model: string,
  usage: Usage,
  signal?: AbortSignal,
): Promise<Overview> {
  const compact = threads
    .filter((t) => t.ai)
    .map((t) => ({
      id: t.post.id,
      title: t.post.title,
      comments: t.commentCount,
      type: t.ai!.type,
      question: t.ai!.question,
      summary: t.ai!.summary,
      consensus: t.ai!.consensus,
      sentiment: t.ai!.sentiment,
      importance: t.ai!.importance,
      tags: t.ai!.tags,
    }));
  return chatJson(
    model,
    [
      { role: "system", content: OVERVIEW_SYSTEM },
      { role: "user", content: `r/${sub}, last ${hours} hours, ${compact.length} threads:\n${JSON.stringify(compact)}` },
    ],
    (v) => OverviewSchema.parse(v) as Overview,
    usage,
    { signal, maxTokens: 2500 },
  );
}

// ---------- "Ask the dashboard" + compare ----------

export type AskDataset = { sub: string; hours: number; threads: Thread[] };

const ASK_SYSTEM = `You answer questions about Reddit discussions using ONLY the thread data provided (summaries and raw comments).
- If the data doesn't cover the question, say so plainly.
- Mention which thread(s) your answer comes from by title, and quote short comment snippets when useful.
- Be concise. Markdown is allowed (short lists, bold).`;

const MAX_ASK_CHARS = 90_000;

function datasetText(ds: AskDataset, budget: number): string {
  let out = `=== r/${ds.sub} (last ${ds.hours}h, ${ds.threads.length} threads) ===\n`;
  // Summaries first for every thread, then raw comments while budget allows.
  for (const t of ds.threads) {
    out += `\n[${t.post.id}] ${t.post.title}\n`;
    if (t.ai) out += `Summary: ${t.ai.summary} | Best answer: ${t.ai.bestAnswer} | Tags: ${t.ai.tags.join(", ")}\n`;
  }
  out += `\n--- Raw comments ---\n`;
  for (const t of ds.threads) {
    const header = `\n[${t.post.id}] ${t.post.title}\n`;
    if (out.length + header.length > budget) break;
    out += header;
    for (const c of t.comments) {
      const line = `- ${c.author}: ${c.body.replace(/\s+/g, " ").slice(0, 600)}\n`;
      if (out.length + line.length > budget) break;
      out += line;
    }
  }
  return out;
}

export async function askDashboard(
  datasets: AskDataset[],
  question: string,
  history: ChatMessage[],
  model: string,
  signal?: AbortSignal,
) {
  const budget = Math.floor(MAX_ASK_CHARS / datasets.length);
  const context = datasets.map((d) => datasetText(d, budget)).join("\n\n");
  return chat(
    model,
    [
      { role: "system", content: `${ASK_SYSTEM}\n\nDATA:\n${context}` },
      ...history.slice(-6),
      { role: "user", content: question },
    ],
    { signal, maxTokens: 1500 },
  );
}
