"use client";

import { useMemo, useState } from "react";
import { downloadText, toMarkdown } from "@/lib/exportMarkdown";
import type { AnalysisState } from "@/lib/useAnalysis";
import type { Thread } from "@/lib/types";
import { AskPanel } from "./AskPanel";
import { LinksList } from "./LinksList";
import { OverviewCard } from "./OverviewCard";
import { Stats } from "./Stats";
import { ThreadCard } from "./ThreadCard";

type Tab = "threads" | "unanswered" | "links" | "ask";
type Sort = "importance" | "comments" | "newest" | "top";

const isUnanswered = (t: Thread) => t.ai?.consensus === "no answers" || (!!t.ai && t.commentCount === 0);

export function SubredditPanel({
  state,
  askModel,
  onStop,
  onRefresh,
  compact,
}: {
  state: AnalysisState;
  askModel: string;
  onStop: () => void;
  onRefresh: () => void;
  compact?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("threads");
  const [sort, setSort] = useState<Sort>("importance");
  const [typeFilter, setTypeFilter] = useState("all");
  const [minImportance, setMinImportance] = useState(1);
  const [askCost, setAskCost] = useState(0);

  const { params, threads } = state;
  const pending = state.posts.filter((p) => !threads.some((t) => t.post.id === p.id));

  const sorted = useMemo(() => {
    const list = threads.filter(
      (t) => (typeFilter === "all" || t.ai?.type === typeFilter) && (t.ai?.importance ?? 10) >= minImportance,
    );
    const by: Record<Sort, (a: Thread, b: Thread) => number> = {
      importance: (a, b) => (b.ai?.importance ?? 0) - (a.ai?.importance ?? 0),
      comments: (a, b) => b.commentCount - a.commentCount,
      newest: (a, b) => +new Date(b.post.published) - +new Date(a.post.published),
      top: (a, b) => (a.post.topRank ?? 999) - (b.post.topRank ?? 999),
    };
    return list.sort(by[sort]);
  }, [threads, sort, typeFilter, minImportance]);

  const unanswered = threads.filter(isUnanswered);
  const linkCount = threads.reduce((a, t) => a + t.links.length, 0);
  const types = [...new Set(threads.map((t) => t.ai?.type).filter(Boolean))] as string[];
  const cost = (state.usage?.cost ?? 0) + askCost;

  if (!params) return null;
  const pct = state.progress?.total ? Math.round((state.progress.done / state.progress.total) * 100) : 0;

  const tabs: { id: Tab; label: string }[] = [
    { id: "threads", label: `Threads ${threads.length}` },
    { id: "unanswered", label: `Unanswered ${unanswered.length}` },
    { id: "links", label: `Links ${linkCount}` },
    { id: "ask", label: "Ask AI" },
  ];

  return (
    <div className="min-w-0 space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h2 className="text-lg font-bold">
          r/{params.sub} <span className="font-normal text-muted">· last {params.hours}h</span>
        </h2>
        {state.cached && (
          <span className="rounded bg-chip px-2 py-0.5 text-xs text-muted" title="Served from the 10-minute in-memory cache">
            cached
          </span>
        )}
        <span className="text-xs text-muted tabular-nums" title={state.usage ? `${state.usage.calls} AI calls · ${state.usage.promptTokens.toLocaleString()} in / ${state.usage.completionTokens.toLocaleString()} out tokens` : ""}>
          {state.usage && `${(state.usage.promptTokens + state.usage.completionTokens).toLocaleString()} tokens · $${cost.toFixed(4)}`}
        </span>
        <div className="no-print ml-auto flex gap-2">
          {state.running ? (
            <button onClick={onStop} className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-neg hover:text-neg">
              Stop
            </button>
          ) : (
            <>
              <button onClick={onRefresh} className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-accent">
                Refresh
              </button>
              {threads.length > 0 && (
                <>
                  <button
                    onClick={() => downloadText(`r-${params.sub}-${new Date().toISOString().slice(0, 10)}.md`, toMarkdown(state))}
                    className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-accent"
                  >
                    Export .md
                  </button>
                  <button onClick={() => window.print()} className="rounded-lg border border-line px-3 py-1.5 text-xs hover:border-accent">
                    PDF
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Progress */}
      {state.running && (
        <div className="no-print rounded-xl border border-line bg-panel p-4">
          <div className="flex justify-between gap-3 text-sm">
            <span className="truncate text-muted">{state.status}</span>
            {state.progress && (
              <span className="shrink-0 tabular-nums">
                {state.progress.done}/{state.progress.total}
              </span>
            )}
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-chip">
            <div className="h-full rounded-full bg-accent transition-all duration-500" style={{ width: `${Math.max(pct, 3)}%` }} />
          </div>
          {pending.length > 0 && (
            <p className="mt-2 text-xs text-muted">
              Reddit only allows a few requests per minute without login, so threads arrive one by one. About{" "}
              {Math.ceil(pending.length * 7.5 / 60)} min left.
            </p>
          )}
        </div>
      )}

      {state.errors.map((e, i) => (
        <div key={i} className="rounded-xl border border-neg/40 bg-neg/10 px-4 py-3 text-sm text-neg">
          {e}
        </div>
      ))}

      {state.overview && <OverviewCard overview={state.overview} threads={threads} sub={params.sub} />}
      {threads.length > 0 && !compact && <Stats threads={threads} totalInWindow={state.totalInWindow} hours={params.hours} />}
      {threads.length > 0 && compact && (
        <p className="text-sm text-muted">
          {state.totalInWindow} posts in window · {threads.length} analyzed · {threads.reduce((a, t) => a + t.commentCount, 0)} comments read
        </p>
      )}

      {/* Tabs */}
      {(threads.length > 0 || pending.length > 0) && (
        <>
          <div className="no-print flex gap-1 overflow-x-auto border-b border-line">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm ${
                  tab === t.id ? "border-accent font-semibold" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === "threads" && (
            <div className="space-y-3">
              <div className="no-print flex flex-wrap items-center gap-2 text-sm">
                <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="rounded-lg border border-line bg-panel px-2 py-1.5">
                  <option value="importance">Sort: Importance</option>
                  <option value="top">Sort: Reddit top</option>
                  <option value="comments">Sort: Most comments</option>
                  <option value="newest">Sort: Newest</option>
                </select>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="rounded-lg border border-line bg-panel px-2 py-1.5">
                  <option value="all">All types</option>
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <label className="flex items-center gap-2 text-muted">
                  Min importance
                  <input type="range" min={1} max={10} value={minImportance} onChange={(e) => setMinImportance(+e.target.value)} className="accent-[var(--accent)]" />
                  <span className="w-4 text-ink tabular-nums">{minImportance}</span>
                </label>
              </div>
              {sorted.map((t) => (
                <ThreadCard key={t.post.id} thread={t} />
              ))}
              {state.running &&
                pending.map((p) => (
                  <div key={p.id} className="flex animate-pulse items-center gap-3 rounded-xl border border-dashed border-line p-4">
                    <div className="h-10 w-10 shrink-0 rounded-lg bg-chip" />
                    <span className="truncate text-sm text-muted">{p.title}</span>
                  </div>
                ))}
            </div>
          )}

          {tab === "unanswered" && (
            <div className="space-y-3">
              {unanswered.length ? (
                unanswered.map((t) => <ThreadCard key={t.post.id} thread={t} />)
              ) : (
                <p className="py-8 text-center text-sm text-muted">Every analyzed question got at least one reply.</p>
              )}
            </div>
          )}

          {tab === "links" && <LinksList threads={threads} />}

          {tab === "ask" &&
            (state.running ? (
              <p className="py-8 text-center text-sm text-muted">Available when the analysis finishes.</p>
            ) : (
              <AskPanel
                datasets={[{ sub: params.sub, hours: params.hours, threads }]}
                model={askModel}
                onCost={(c) => setAskCost((x) => x + c)}
                suggestions={[
                  "What are the top 3 things people should know from today?",
                  "Which tools or products were recommended?",
                  "What are people frustrated about?",
                  ...(state.overview?.trending[0] ? [`What did people say about ${state.overview.trending[0].term}?`] : []),
                ]}
              />
            ))}
        </>
      )}
    </div>
  );
}
