"use client";

import { useEffect, useState } from "react";
import { AskPanel } from "@/components/AskPanel";
import { SubredditPanel } from "@/components/SubredditPanel";
import { useAnalysis } from "@/lib/useAnalysis";
import type { AnalyzeParams } from "@/lib/types";

type ModelInfo = { id: string; name: string; promptPrice: number; completionPrice: number };

const WINDOWS = [
  { hours: 6, label: "6 hours" },
  { hours: 12, label: "12 hours" },
  { hours: 24, label: "24 hours" },
  { hours: 72, label: "3 days" },
  { hours: 168, label: "7 days" },
];

const PREFS_KEY = "reddit-pulse-prefs"; // only UI preferences, never Reddit data

function ModelField({ label, value, onChange, models }: { label: string; value: string; onChange: (v: string) => void; models: ModelInfo[] }) {
  const m = models.find((x) => x.id === value);
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-muted">
      {label}
      <input
        list="or-models"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-xs text-ink outline-none focus:border-accent"
      />
      <span className="h-4 truncate">{m ? `$${m.promptPrice.toFixed(2)} in / $${m.completionPrice.toFixed(2)} out per 1M tokens` : models.length ? "Unknown model id" : ""}</span>
    </label>
  );
}

export default function Home() {
  const a = useAnalysis();
  const b = useAnalysis();

  const [sub, setSub] = useState("");
  const [sub2, setSub2] = useState("");
  const [compare, setCompare] = useState(false);
  const [hours, setHours] = useState(24);
  const [limit, setLimit] = useState(20);
  const [threadModel, setThreadModel] = useState("");
  const [overviewModel, setOverviewModel] = useState("");
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    let prefs: Partial<{ hours: number; limit: number; threadModel: string; overviewModel: string }> = {};
    try {
      prefs = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}");
    } catch {}
    fetch("/api/models")
      .then((r) => r.json())
      .then((d) => {
        if (prefs.hours) setHours(prefs.hours);
        if (prefs.limit) setLimit(prefs.limit);
        setModels(d.models ?? []);
        setThreadModel(prefs.threadModel || d.defaults?.thread || "");
        setOverviewModel(prefs.overviewModel || d.defaults?.overview || "");
      })
      .catch(() => {});
  }, []);

  const params = (s: string): AnalyzeParams => ({ sub: s.trim().replace(/^\/?r\//i, ""), hours, limit, threadModel, overviewModel });

  function run(e?: React.FormEvent) {
    e?.preventDefault();
    if (!sub.trim()) return;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ hours, limit, threadModel, overviewModel }));
    } catch {}
    a.start(params(sub));
    if (compare && sub2.trim()) b.start(params(sub2));
    else b.clear();
  }

  const both = compare && a.state.params && b.state.params;
  const bothDone = both && !a.state.running && !b.state.running && a.state.threads.length && b.state.threads.length;
  const anyRunning = a.state.running || b.state.running;
  const reqs = (limit + 2) * (compare && sub2.trim() ? 2 : 1);

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10">
      <header className="no-print mb-6">
        <h1 className="text-2xl font-bold sm:text-3xl">
          Reddit <span className="text-accent">Live Pulse</span>
        </h1>
        <p className="mt-1 text-sm text-muted">
          Type a subreddit and see what people asked and answered, summarized by AI. Data is fetched live and never stored.
        </p>
      </header>

      <form onSubmit={run} className="no-print rounded-2xl border border-line bg-panel p-4 sm:p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-end">
          <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
            Subreddit
            <div className="flex items-center rounded-lg border border-line bg-bg focus-within:border-accent">
              <span className="pl-3 text-ink">r/</span>
              <input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="webdev" autoFocus className="w-full bg-transparent px-1 py-2.5 text-base text-ink outline-none" />
            </div>
          </label>
          {compare && (
            <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
              Compare with
              <div className="flex items-center rounded-lg border border-line bg-bg focus-within:border-accent">
                <span className="pl-3 text-ink">r/</span>
                <input value={sub2} onChange={(e) => setSub2(e.target.value)} placeholder="Frontend" className="w-full bg-transparent px-1 py-2.5 text-base text-ink outline-none" />
              </div>
            </label>
          )}
          <label className="flex flex-col gap-1 text-xs text-muted">
            Time window
            <select value={hours} onChange={(e) => setHours(+e.target.value)} className="rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink">
              {WINDOWS.map((w) => (
                <option key={w.hours} value={w.hours}>
                  {w.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Threads
            <select value={limit} onChange={(e) => setLimit(+e.target.value)} className="rounded-lg border border-line bg-bg px-3 py-2.5 text-sm text-ink">
              {[5, 10, 15, 20, 30, 50].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button disabled={!sub.trim() || !threadModel} className="rounded-lg bg-accent px-6 py-2.5 font-semibold text-white disabled:opacity-40">
            {anyRunning ? "Restart" : "Analyze"}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} className="accent-[var(--accent)]" />
            Compare two subreddits
          </label>
          <button type="button" onClick={() => setShowSettings((s) => !s)} className="text-muted underline underline-offset-2 hover:text-ink">
            {showSettings ? "Hide" : "AI models"}
          </button>
          <span className="text-xs text-muted">≈ {reqs} Reddit requests · ~{Math.ceil((reqs * 7.5) / 60)} min</span>
        </div>

        {showSettings && (
          <div className="mt-4 grid gap-4 border-t border-line pt-4 md:grid-cols-2">
            <ModelField label="Thread model (runs once per thread; pick a cheap, fast one)" value={threadModel} onChange={setThreadModel} models={models} />
            <ModelField label="Overview, ask and compare model (runs a few times; can be smarter)" value={overviewModel} onChange={setOverviewModel} models={models} />
          </div>
        )}
        <datalist id="or-models">
          {models.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </datalist>
      </form>

      <div className={`mt-8 grid gap-8 ${both ? "lg:grid-cols-2" : ""}`}>
        <SubredditPanel state={a.state} askModel={overviewModel} onStop={a.stop} onRefresh={() => a.state.params && a.start(a.state.params, true)} compact={!!both} />
        {both && (
          <SubredditPanel state={b.state} askModel={overviewModel} onStop={b.stop} onRefresh={() => b.state.params && b.start(b.state.params, true)} compact />
        )}
      </div>

      {bothDone && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">
            Compare r/{a.state.params!.sub} vs r/{b.state.params!.sub}
          </h2>
          <AskPanel
            model={overviewModel}
            datasets={[
              { sub: a.state.params!.sub, hours: a.state.params!.hours, threads: a.state.threads },
              { sub: b.state.params!.sub, hours: b.state.params!.hours, threads: b.state.threads },
            ]}
            suggestions={[
              "Compare the two communities: main topics, mood, and what's different",
              "Which topics appear in both subreddits?",
              "Where do the two communities disagree?",
            ]}
          />
        </section>
      )}

      {!a.state.params && (
        <div className="no-print mt-16 text-center text-sm text-muted">
          <p>Try r/webdev, r/LocalLLaMA, r/personalfinance, r/nba…</p>
        </div>
      )}
    </main>
  );
}
