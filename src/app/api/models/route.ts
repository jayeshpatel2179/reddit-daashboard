// Live list of OpenRouter models for the model picker (kept in RAM for 1 hour).

export const dynamic = "force-dynamic";

type ModelInfo = { id: string; name: string; context: number; promptPrice: number; completionPrice: number };

const g = globalThis as unknown as { __models?: { at: number; models: ModelInfo[] } };

const defaults = () => ({
  thread: process.env.DEFAULT_THREAD_MODEL || "google/gemini-3.1-flash-lite",
  overview: process.env.DEFAULT_OVERVIEW_MODEL || "~google/gemini-flash-latest",
});

export async function GET() {
  if (g.__models && Date.now() - g.__models.at < 3600_000)
    return Response.json({ models: g.__models.models, defaults: defaults() });

  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", { cache: "no-store" });
    const data = await res.json();
    const models: ModelInfo[] = (data.data ?? [])
      .filter((m: { architecture?: { output_modalities?: string[] } }) =>
        (m.architecture?.output_modalities ?? ["text"]).includes("text"),
      )
      .map((m: { id: string; name: string; context_length: number; pricing: { prompt: string; completion: string } }) => ({
        id: m.id,
        name: m.name,
        context: m.context_length,
        promptPrice: Number(m.pricing?.prompt ?? 0) * 1e6,
        completionPrice: Number(m.pricing?.completion ?? 0) * 1e6,
      }))
      .sort((a: ModelInfo, b: ModelInfo) => a.id.localeCompare(b.id));
    g.__models = { at: Date.now(), models };
    return Response.json({ models, defaults: defaults() });
  } catch {
    return Response.json({ models: [], defaults: defaults(), error: "Could not load models from OpenRouter." }, { status: 502 });
  }
}
