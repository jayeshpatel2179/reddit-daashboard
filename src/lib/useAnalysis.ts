"use client";

import { useCallback, useRef, useState } from "react";
import type { AnalyzeParams, Overview, Post, StreamEvent, Thread, Usage } from "@/lib/types";

export type AnalysisState = {
  params: AnalyzeParams | null;
  running: boolean;
  status: string;
  progress: { done: number; total: number } | null;
  posts: Post[];
  totalInWindow: number;
  threads: Thread[];
  overview: Overview | null;
  usage: Usage | null;
  errors: string[];
  finishedAt: string | null;
  cached: boolean;
};

const initial: AnalysisState = {
  params: null,
  running: false,
  status: "",
  progress: null,
  posts: [],
  totalInWindow: 0,
  threads: [],
  overview: null,
  usage: null,
  errors: [],
  finishedAt: null,
  cached: false,
};

function reduce(s: AnalysisState, ev: StreamEvent): AnalysisState {
  switch (ev.type) {
    case "status":
      return { ...s, status: ev.message, progress: ev.progress ?? s.progress };
    case "posts":
      return { ...s, posts: ev.posts, totalInWindow: ev.totalInWindow, progress: { done: 0, total: ev.posts.length } };
    case "thread":
      return { ...s, threads: [...s.threads.filter((t) => t.post.id !== ev.thread.post.id), ev.thread] };
    case "overview":
      return { ...s, overview: ev.overview };
    case "usage":
      return { ...s, usage: ev.usage };
    case "error":
      return { ...s, errors: [...s.errors, ev.message] };
    case "done":
      return { ...s, running: false, status: "", finishedAt: ev.finishedAt, cached: ev.cached };
  }
}

/** Runs one live analysis. All results live only in this React state. */
export function useAnalysis() {
  const [state, setState] = useState<AnalysisState>(initial);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback(async (params: AnalyzeParams, refresh = false) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setState({ ...initial, params, running: true, status: "Starting…" });

    const qs = new URLSearchParams({
      sub: params.sub,
      hours: String(params.hours),
      limit: String(params.limit),
      threadModel: params.threadModel,
      overviewModel: params.overviewModel,
      ...(refresh ? { refresh: "1" } : {}),
    });

    try {
      const res = await fetch(`/api/analyze?${qs}`, { signal: ac.signal });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop()!;
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line) as StreamEvent;
          setState((s) => reduce(s, ev));
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError")
        setState((s) => ({ ...s, errors: [...s.errors, (err as Error).message] }));
    } finally {
      if (abortRef.current === ac) setState((s) => ({ ...s, running: false, status: "" }));
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    setState((s) => ({ ...s, running: false, status: "Stopped." }));
  }, []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setState(initial);
  }, []);

  return { state, start, stop, clear };
}
