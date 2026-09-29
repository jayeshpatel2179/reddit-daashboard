"use client";

import { useState } from "react";
import type { Thread } from "@/lib/types";
import { MiniMarkdown } from "./MiniMarkdown";

type Msg = { role: "user" | "assistant"; content: string };
export type AskDataset = { sub: string; hours: number; threads: Thread[] };

export function AskPanel({
  datasets,
  model,
  suggestions,
  onCost,
}: {
  datasets: AskDataset[];
  model: string;
  suggestions: string[];
  onCost?: (usd: number) => void;
}) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    const history = msgs;
    setMsgs([...history, { role: "user", content: question }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, history, datasets, model }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      onCost?.(data.usage?.cost ?? 0);
      setMsgs((m) => [...m, { role: "assistant", content: data.answer }]);
    } catch (err) {
      setMsgs((m) => [...m, { role: "assistant", content: `⚠️ ${(err as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <p className="text-xs text-muted">
        Answers come only from the threads already loaded on this page. No new Reddit requests are made.
      </p>
      <div className="mt-3 space-y-3">
        {msgs.map((m, i) => (
          <div
            key={i}
            className={
              m.role === "user"
                ? "ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm bg-accent px-3 py-2 text-sm text-white"
                : "max-w-full rounded-2xl rounded-bl-sm bg-chip px-3 py-2 text-sm leading-relaxed"
            }
          >
            {m.role === "user" ? m.content : <MiniMarkdown text={m.content} />}
          </div>
        ))}
        {busy && <div className="w-fit animate-pulse rounded-2xl bg-chip px-3 py-2 text-sm text-muted">Thinking…</div>}
      </div>

      {!msgs.length && (
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s} onClick={() => ask(s)} className="rounded-full border border-line px-3 py-1 text-xs hover:border-accent hover:text-accent">
              {s}
            </button>
          ))}
        </div>
      )}

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about today's discussions…"
          className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button disabled={busy || !input.trim()} className="rounded-lg bg-ink px-4 py-2 text-sm font-medium text-bg disabled:opacity-40">
          Ask
        </button>
      </form>
    </div>
  );
}
