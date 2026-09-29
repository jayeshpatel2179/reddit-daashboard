// "Ask the dashboard": answers a question from the data the browser already
// holds. The browser sends the threads back with the question, so this makes
// zero Reddit requests and stores nothing.

import { z } from "zod";
import { askDashboard } from "@/lib/ai/summarize";
import type { Thread } from "@/lib/types";

export const dynamic = "force-dynamic";

const Body = z.object({
  question: z.string().min(1).max(2000),
  model: z.string().optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(20)
    .default([]),
  datasets: z
    .array(z.object({ sub: z.string(), hours: z.number(), threads: z.array(z.any()) }))
    .min(1)
    .max(2),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400 });
  const { question, history, datasets, model } = parsed.data;

  try {
    const { content, usage } = await askDashboard(
      datasets.map((d) => ({ ...d, threads: d.threads as Thread[] })),
      question,
      history,
      model || process.env.DEFAULT_OVERVIEW_MODEL || "~google/gemini-flash-latest",
      req.signal,
    );
    return Response.json({ answer: content, usage });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
