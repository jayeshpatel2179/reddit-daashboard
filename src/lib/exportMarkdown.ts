import type { AnalysisState } from "@/lib/useAnalysis";

/** Builds a Markdown report in the browser; nothing is sent to or kept on the server. */
export function toMarkdown(s: AnalysisState): string {
  if (!s.params) return "";
  const { sub, hours } = s.params;
  const lines: string[] = [];
  const threads = [...s.threads].sort((a, b) => (b.ai?.importance ?? 0) - (a.ai?.importance ?? 0));
  const title = (id: string) => s.threads.find((t) => t.post.id === id)?.post.title ?? id;

  lines.push(`# r/${sub}: last ${hours} hours`, "");
  lines.push(`_Generated ${new Date(s.finishedAt ?? Date.now()).toLocaleString()} · ${threads.length} threads_`, "");

  const o = s.overview;
  if (o) {
    lines.push(`## ${o.headline}`, "", o.overview, "", `**Mood:** ${o.mood}`, "");
    if (o.topics.length) {
      lines.push("### Topics");
      for (const t of o.topics) lines.push(`- **${t.name}**: ${t.summary}`);
      lines.push("");
    }
    if (o.importantThreads.length) {
      lines.push("### Most important");
      for (const t of o.importantThreads) lines.push(`- **${title(t.threadId)}**: ${t.why}`);
      lines.push("");
    }
    if (o.trending.length) lines.push("### Trending", o.trending.map((t) => `\`${t.term}\``).join(" · "), "");
    if (o.recurringProblems.length) {
      lines.push("### Recurring problems");
      for (const p of o.recurringProblems) lines.push(`- ${p}`);
      lines.push("");
    }
  }

  lines.push("## Threads", "");
  for (const t of threads) {
    lines.push(`### [${t.post.title}](${t.post.permalink})`);
    if (!t.ai) {
      lines.push(`_Not summarized: ${t.aiError ?? "unknown error"}_`, "");
      continue;
    }
    const a = t.ai;
    lines.push(
      `**Importance ${a.importance}/10** · ${a.type} · ${a.sentiment} · ${a.consensus} · ${t.commentCount} comments`,
      "",
      `**Question:** ${a.question}`,
      "",
      a.summary,
      "",
    );
    if (a.keyAnswers.length) {
      for (const k of a.keyAnswers) lines.push(`- ${k.point} _(${k.support})_`);
      lines.push("");
    }
    if (a.bestAnswer) lines.push(`> ★ ${a.bestAnswer}`, "");
  }

  const unanswered = threads.filter((t) => t.ai?.consensus === "no answers" || t.commentCount === 0);
  if (unanswered.length) {
    lines.push("## Unanswered questions");
    for (const t of unanswered) lines.push(`- [${t.post.title}](${t.post.permalink})`);
    lines.push("");
  }

  const links = s.threads.flatMap((t) => t.links);
  if (links.length) {
    lines.push("## Links shared");
    for (const l of links) lines.push(`- ${l.label ? `[${l.label}](${l.url})` : l.url}`);
    lines.push("");
  }
  return lines.join("\n");
}

export function downloadText(filename: string, text: string, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
