import type { Overview, Thread } from "@/lib/types";

function jumpTo(id: string) {
  document.getElementById(`t-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function OverviewCard({ overview, threads, sub }: { overview: Overview; threads: Thread[]; sub: string }) {
  const title = (id: string) => threads.find((t) => t.post.id === id)?.post.title;

  return (
    <section className="rounded-xl border border-line bg-panel p-5 sm:p-6">
      <p className="text-xs font-semibold tracking-wider text-accent uppercase">Today in r/{sub}</p>
      <h2 className="mt-1 text-xl font-bold text-balance sm:text-2xl">{overview.headline}</h2>
      <p className="mt-3 leading-relaxed">{overview.overview}</p>
      {overview.mood && (
        <p className="mt-3 text-sm text-muted">
          <span className="font-semibold text-ink">Mood:</span> {overview.mood}
        </p>
      )}

      {overview.trending.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold">Trending</h3>
          <div className="flex flex-wrap gap-2">
            {overview.trending.map((t) => (
              <span key={t.term} title={t.context} className="cursor-help rounded-full border border-line bg-chip px-3 py-1 text-sm">
                {t.term}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {overview.importantThreads.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">Most important</h3>
            <ol className="space-y-2">
              {overview.importantThreads.map((t, i) => (
                <li key={t.threadId} className="flex gap-2 text-sm">
                  <span className="font-bold text-accent">{i + 1}.</span>
                  <span>
                    <button onClick={() => jumpTo(t.threadId)} className="text-left font-medium underline decoration-line underline-offset-2 hover:text-accent">
                      {title(t.threadId) ?? t.threadId}
                    </button>
                    <span className="block text-muted">{t.why}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {overview.topics.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold">Topics</h3>
            <div className="space-y-2">
              {overview.topics.map((t) => (
                <details key={t.name} className="rounded-lg bg-chip px-3 py-2 text-sm">
                  <summary className="cursor-pointer font-medium">
                    {t.name} <span className="font-normal text-muted">· {t.threadIds.length} threads</span>
                  </summary>
                  <p className="mt-1 text-muted">{t.summary}</p>
                  <ul className="mt-1 space-y-0.5">
                    {t.threadIds.map((id) =>
                      title(id) ? (
                        <li key={id}>
                          <button onClick={() => jumpTo(id)} className="text-left text-xs underline underline-offset-2 hover:text-accent">
                            {title(id)}
                          </button>
                        </li>
                      ) : null,
                    )}
                  </ul>
                </details>
              ))}
            </div>
          </div>
        )}
      </div>

      {overview.recurringProblems.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-semibold">Recurring problems</h3>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {overview.recurringProblems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
