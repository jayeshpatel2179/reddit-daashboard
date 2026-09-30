// Daily Discord report: every thread from the last N hours in one subreddit,
// with only the question, people's conclusion, AI's conclusion and best answer.
// Nothing is stored: fetch → summarize → post to Discord → exit.
//
//   npm run report              send the report
//   npm run report -- --dry     print the Discord payload instead of sending
//
// On Railway this runs as a Cron service with schedule "30 4 * * *" (10:00 IST).

try {
  process.loadEnvFile(".env.local"); // local runs; on Railway the env comes from Variables
} catch {}

const DRY = process.argv.includes("--dry");

type Embed = {
  title: string;
  url?: string;
  description: string;
  color: number;
  footer?: { text: string };
};

const COLOR_ANSWERED = 0xe8491d;
const COLOR_UNANSWERED = 0x9a958b;
const COLOR_ERROR = 0xcf3d3d;

function cut(text: string, max: number) {
  const t = text.trim();
  return t.length <= max ? t : t.slice(0, max - 1).trimEnd() + "…";
}

async function sendToDiscord(webhook: string, payload: { content?: string; embeds?: Embed[] }) {
  if (DRY) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`${webhook}?wait=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "Reddit Daily Pulse", ...payload }),
    });
    if (res.ok) return;
    if (res.status === 429) {
      const data = await res.json().catch(() => ({}));
      await new Promise((r) => setTimeout(r, Math.ceil((data.retry_after ?? 2) * 1000)));
      continue;
    }
    throw new Error(`Discord webhook failed: HTTP ${res.status} ${await res.text()}`);
  }
  throw new Error("Discord webhook kept rate-limiting");
}

/** Discord allows 10 embeds and ~6000 characters per message; pack embeds into as few messages as fit. */
function packEmbeds(embeds: Embed[]): Embed[][] {
  const size = (e: Embed) => e.title.length + e.description.length + (e.footer?.text.length ?? 0);
  const batches: Embed[][] = [];
  let current: Embed[] = [];
  let chars = 0;
  for (const e of embeds) {
    if (current.length === 10 || chars + size(e) > 5500) {
      batches.push(current);
      current = [];
      chars = 0;
    }
    current.push(e);
    chars += size(e);
  }
  if (current.length) batches.push(current);
  return batches;
}

async function main() {
  const { fetchComments, fetchNewPosts, fetchTopPosts, normalizeSub, selectPosts } = await import("../src/lib/reddit/fetcher");
  const { summarizeThread } = await import("../src/lib/ai/summarize");
  const { emptyUsage } = await import("../src/lib/ai/openrouter");

  const webhook = process.env.DISCORD_WEBHOOK_URL;
  const sub = normalizeSub(process.env.REPORT_SUBREDDIT ?? "");
  const hours = Number(process.env.REPORT_HOURS) || 24;
  const model = process.env.DEFAULT_THREAD_MODEL || "google/gemini-3.1-flash-lite";
  if (!webhook && !DRY) throw new Error("DISCORD_WEBHOOK_URL is not set");
  if (!sub) throw new Error("REPORT_SUBREDDIT is not set or invalid");

  const log = (msg: string) => console.log(`[report] ${msg}`);
  const onWait = (s: number) => log(`Reddit rate limit, waiting ${s}s`);
  const usage = emptyUsage();

  log(`r/${sub}, last ${hours}h, model ${model}`);
  const top = await fetchTopPosts(sub, hours, { onWait });
  const fresh = await fetchNewPosts(sub, { onWait });
  const { selected } = selectPosts(top, fresh, hours, 100); // every thread in the window
  log(`${selected.length} threads found`);

  // Oldest first, so the report reads like the day's timeline.
  selected.sort((a, b) => +new Date(a.published) - +new Date(b.published));

  const embeds: Embed[] = [];
  let failed = 0;
  for (const post of selected) {
    log(`Thread: ${post.title}`);
    let comments: Awaited<ReturnType<typeof fetchComments>>["comments"] = [];
    let body = post.body;
    try {
      const res = await fetchComments(post, { onWait });
      comments = res.comments;
      body = res.body;
    } catch (err) {
      log(`  comments failed: ${(err as Error).message}`);
    }

    const title = cut(post.title, 250);

    if (!comments.length) {
      embeds.push({
        title,
        url: post.permalink,
        color: COLOR_UNANSWERED,
        description: `❓ **Question:** ${cut(body ? `${post.title}: ${body}` : post.title, 600)}\n\n💬 **No answers yet**`,
        footer: { text: `u/${post.author} · 0 comments` },
      });
      continue;
    }

    try {
      const ai = await summarizeThread({ ...post, body }, body, comments, model, usage);
      const noAnswers = ai.consensus === "no answers";
      embeds.push({
        title,
        url: post.permalink,
        color: noAnswers ? COLOR_UNANSWERED : COLOR_ANSWERED,
        description: [
          `❓ **Question:** ${cut(ai.question || post.title, 500)}`,
          `👥 **People's conclusion:** ${cut(ai.peopleConclusion || "No answers yet", 1000)}`,
          `🤖 **AI's conclusion:** ${cut(ai.aiConclusion || "-", 1000)}`,
          `⭐ **Best answer:** ${cut(ai.bestAnswer || "No answers yet", 800)}`,
        ].join("\n\n"),
        footer: { text: `u/${post.author} · ${comments.length}${comments.length >= 100 ? "+" : ""} comments` },
      });
    } catch (err) {
      failed++;
      embeds.push({
        title,
        url: post.permalink,
        color: COLOR_ERROR,
        description: `❓ **Question:** ${cut(post.title, 500)}\n\n⚠️ AI summary failed: ${cut((err as Error).message, 300)}`,
        footer: { text: `${comments.length} comments` },
      });
    }
  }

  const date = new Date().toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
  const header =
    `## 📊 r/${sub}: Daily Report (${date})\n` +
    (selected.length
      ? `${selected.length} thread${selected.length > 1 ? "s" : ""} in the last ${hours} hours`
      : `No new threads in the last ${hours} hours.`);

  const batches = packEmbeds(embeds);
  if (!batches.length) await sendToDiscord(webhook!, { content: header });
  for (const [i, batch] of batches.entries())
    await sendToDiscord(webhook!, { content: i === 0 ? header : `*(continued ${i + 1}/${batches.length})*`, embeds: batch });

  log(`Sent ${embeds.length} threads in ${Math.max(1, batches.length)} message(s). AI cost $${usage.cost.toFixed(4)}${failed ? `, ${failed} failed` : ""}`);
}

main().catch(async (err) => {
  console.error("[report] FAILED:", err);
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (webhook && !DRY) {
    await sendToDiscord(webhook, {
      embeds: [
        {
          title: `⚠️ Daily report for r/${process.env.REPORT_SUBREDDIT} failed`,
          description: cut(String((err as Error).message ?? err), 1500),
          color: COLOR_ERROR,
        },
      ],
    }).catch(() => {});
  }
  process.exit(1);
});
