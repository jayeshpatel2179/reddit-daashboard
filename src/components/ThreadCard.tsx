import type { Thread } from "@/lib/types";

export function importanceColor(n: number) {
  return n >= 7 ? "bg-hi text-white" : n >= 4 ? "bg-mid text-black" : "bg-lo text-white";
}

const SENTIMENT_DOT = { positive: "bg-pos", neutral: "bg-neu", negative: "bg-neg" } as const;
const SUPPORT_LABEL = { many: "many agree", some: "some agree", one: "one person" } as const;
const SHARE_LABEL: Record<string, string> = { most: "most people", many: "many people", some: "some people", few: "a few people", one: "one person" };
const SHARE_STYLE: Record<string, string> = {
  most: "bg-accent text-white",
  many: "bg-accent-soft text-accent",
  some: "bg-chip text-ink",
  few: "bg-chip text-muted",
  one: "bg-chip text-muted",
};

function timeAgo(iso: string) {
  const h = (Date.now() - new Date(iso).getTime()) / 3600_000;
  return h < 1 ? `${Math.max(1, Math.round(h * 60))}m ago` : h < 48 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`;
}

export function ThreadCard({ thread }: { thread: Thread }) {
  const { post, ai } = thread;
  return (
    <article id={`t-${post.id}`} className="scroll-mt-24 rounded-xl border border-line bg-panel p-4 sm:p-5">
      <div className="flex items-start gap-3">
        {ai ? (
          <div
            title={ai.importanceReason}
            className={`flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-lg text-sm font-bold ${importanceColor(ai.importance)}`}
          >
            {ai.importance}
            <span className="text-[9px] font-medium opacity-80">/10</span>
          </div>
        ) : (
          <div className="h-10 w-10 shrink-0 rounded-lg bg-chip" />
        )}
        <div className="min-w-0 flex-1">
          <a
            href={post.permalink}
            target="_blank"
            rel="noreferrer"
            className="font-semibold leading-snug break-words hover:text-accent"
          >
            {post.title}
          </a>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span>u/{post.author}</span>
            <span>·</span>
            <span>{timeAgo(post.published)}</span>
            <span>·</span>
            <span>{thread.commentCount} comments{thread.commentCount >= 100 ? "+" : ""}</span>
            {post.topRank && post.topRank <= 10 && (
              <span className="rounded bg-accent-soft px-1.5 py-0.5 font-medium text-accent">#{post.topRank} top today</span>
            )}
            {ai && (
              <>
                <span className="rounded bg-chip px-1.5 py-0.5">{ai.type}</span>
                <span className="inline-flex items-center gap-1">
                  <span className={`h-2 w-2 rounded-full ${SENTIMENT_DOT[ai.sentiment]}`} />
                  {ai.sentiment}
                </span>
                <span className={ai.consensus === "no answers" ? "font-medium text-neg" : ""}>{ai.consensus}</span>
              </>
            )}
          </div>
        </div>
      </div>

      {ai ? (
        <div className="mt-4 space-y-3 text-sm leading-relaxed">
          {ai.question && (
            <p>
              <span className="mr-1 font-semibold text-muted">Q.</span>
              {ai.question}
            </p>
          )}
          <p>{ai.summary}</p>
          {ai.detailedSummary?.length > 0 && (
            <details className="group rounded-lg border border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 font-medium select-none">
                <span>
                  Detailed summary{" "}
                  <span className="font-normal text-muted">· {ai.detailedSummary.length} viewpoints from {thread.commentCount} comments</span>
                </span>
                <span className="text-muted transition-transform group-open:rotate-180">▾</span>
              </summary>
              <div className="space-y-3 border-t border-line px-3 py-3">
                {ai.detailedSummary.map((v, i) => (
                  <div key={i}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{v.viewpoint}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[11px] ${SHARE_STYLE[v.share] ?? SHARE_STYLE.some}`}>{SHARE_LABEL[v.share] ?? v.share}</span>
                    </div>
                    <p className="mt-1 text-muted">{v.detail}</p>
                  </div>
                ))}
              </div>
            </details>
          )}
          {(ai.peopleConclusion || ai.aiConclusion) && (
            <div className="grid gap-2 sm:grid-cols-2">
              {ai.peopleConclusion && (
                <div className="rounded-lg bg-chip px-3 py-2">
                  <div className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">👥 People&apos;s conclusion</div>
                  {ai.peopleConclusion}
                </div>
              )}
              {ai.aiConclusion && (
                <div className="rounded-lg border border-accent/40 bg-accent-soft/40 px-3 py-2">
                  <div className="mb-1 text-xs font-semibold tracking-wide text-accent uppercase">🤖 AI&apos;s conclusion</div>
                  {ai.aiConclusion}
                </div>
              )}
            </div>
          )}
          {ai.keyAnswers.length > 0 && (
            <ul className="space-y-1.5">
              {ai.keyAnswers.map((k, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted" />
                  <span>
                    {k.point} <span className="text-xs text-muted">({SUPPORT_LABEL[k.support]})</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {ai.bestAnswer && (
            <div className="rounded-lg border-l-4 border-accent bg-accent-soft/60 px-3 py-2">
              <span className="mr-1 font-semibold text-accent">★ Best answer</span>
              {ai.bestAnswer}
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            {ai.tags.map((t) => (
              <span key={t} className="rounded-full bg-chip px-2 py-0.5 text-xs text-muted">
                {t}
              </span>
            ))}
            {ai.importanceReason && <span className="text-xs text-muted italic">· {ai.importanceReason}</span>}
          </div>
        </div>
      ) : (
        <p className="mt-3 text-sm text-neg">{thread.aiError ?? "Summarizing…"}</p>
      )}

      {(post.body || post.linkUrl) && (
        <details className="mt-3 text-sm text-muted">
          <summary className="cursor-pointer select-none text-xs">Original post</summary>
          {post.linkUrl && (
            <a href={post.linkUrl} target="_blank" rel="noreferrer" className="mt-2 block break-all text-accent underline">
              {post.linkUrl}
            </a>
          )}
          {post.body && <p className="mt-2 whitespace-pre-wrap break-words">{post.body.slice(0, 2000)}</p>}
        </details>
      )}
    </article>
  );
}
