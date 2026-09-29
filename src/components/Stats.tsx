import type { Thread } from "@/lib/types";

type Seg = { label: string; value: number; color: string };

function StackedBar({ segs }: { segs: Seg[] }) {
  const total = segs.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 gap-0.5 overflow-hidden rounded-full">
        {segs.filter((s) => s.value).map((s) => (
          <div key={s.label} className={s.color} style={{ width: `${(s.value / total) * 100}%` }} title={`${s.label}: ${s.value}`} />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
        {segs.map((s) => (
          <span key={s.label} className="inline-flex items-center gap-1">
            <span className={`h-2 w-2 rounded-full ${s.color}`} />
            {s.label} <span className="font-semibold text-ink tabular-nums">{s.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export function Stats({ threads, totalInWindow, hours }: { threads: Thread[]; totalInWindow: number; hours: number }) {
  const done = threads.filter((t) => t.ai);
  const count = (fn: (t: Thread) => boolean) => done.filter(fn).length;
  const comments = threads.reduce((a, t) => a + t.commentCount, 0);
  const unanswered = threads.filter((t) => t.ai?.consensus === "no answers" || (t.ai && t.commentCount === 0)).length;
  const avgImp = done.length ? (done.reduce((a, t) => a + t.ai!.importance, 0) / done.length).toFixed(1) : "–";

  const types = new Map<string, number>();
  for (const t of done) types.set(t.ai!.type, (types.get(t.ai!.type) ?? 0) + 1);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Tile label={`Posts in last ${hours}h`} value={totalInWindow} sub={`${threads.length} analyzed`} />
      <Tile label="Comments read" value={comments} />
      <Tile label="Unanswered" value={unanswered} />
      <Tile label="Avg importance" value={avgImp} sub="out of 10" />

      <div className="rounded-xl border border-line bg-panel p-4 sm:col-span-2">
        <div className="mb-3 text-xs text-muted">Sentiment</div>
        <StackedBar
          segs={[
            { label: "Positive", value: count((t) => t.ai!.sentiment === "positive"), color: "bg-pos" },
            { label: "Neutral", value: count((t) => t.ai!.sentiment === "neutral"), color: "bg-neu" },
            { label: "Negative", value: count((t) => t.ai!.sentiment === "negative"), color: "bg-neg" },
          ]}
        />
      </div>
      <div className="rounded-xl border border-line bg-panel p-4 sm:col-span-2">
        <div className="mb-3 text-xs text-muted">Thread types</div>
        <div className="flex flex-wrap gap-2">
          {[...types.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([type, n]) => (
              <span key={type} className="rounded-full bg-chip px-2.5 py-1 text-xs">
                {type} <span className="font-semibold tabular-nums">{n}</span>
              </span>
            ))}
          {!types.size && <span className="text-xs text-muted">–</span>}
        </div>
      </div>
    </div>
  );
}
