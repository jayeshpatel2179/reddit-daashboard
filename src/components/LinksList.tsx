import type { Thread } from "@/lib/types";

export function LinksList({ threads }: { threads: Thread[] }) {
  // Group by domain so the most-shared sites come first.
  const byDomain = new Map<string, { url: string; label: string; thread: string }[]>();
  for (const t of threads)
    for (const l of t.links) {
      let domain = l.url;
      try {
        domain = new URL(l.url).hostname.replace(/^www\./, "");
      } catch {}
      const list = byDomain.get(domain) ?? [];
      list.push({ url: l.url, label: l.label, thread: t.post.title });
      byDomain.set(domain, list);
    }

  const groups = [...byDomain.entries()].sort((a, b) => b[1].length - a[1].length);
  if (!groups.length) return <p className="py-8 text-center text-sm text-muted">No links were shared in these threads.</p>;

  return (
    <div className="space-y-3">
      {groups.map(([domain, links]) => (
        <div key={domain} className="rounded-xl border border-line bg-panel p-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="font-semibold">{domain}</span>
            <span className="text-xs text-muted">{links.length} link{links.length > 1 ? "s" : ""}</span>
          </div>
          <ul className="space-y-1.5 text-sm">
            {links.map((l, i) => (
              <li key={i} className="min-w-0">
                <a href={l.url} target="_blank" rel="noreferrer" className="break-all text-accent underline underline-offset-2">
                  {l.label || l.url}
                </a>
                <span className="block truncate text-xs text-muted">in: {l.thread}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
