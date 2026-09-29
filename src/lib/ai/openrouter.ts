import type { Usage } from "@/lib/types";

const API = "https://openrouter.ai/api/v1";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export const emptyUsage = (): Usage => ({ promptTokens: 0, completionTokens: 0, cost: 0, calls: 0 });

export function addUsage(total: Usage, u: Usage) {
  total.promptTokens += u.promptTokens;
  total.completionTokens += u.completionTokens;
  total.cost += u.cost;
  total.calls += u.calls;
}

export async function chat(
  model: string,
  messages: ChatMessage[],
  opts: { json?: boolean; signal?: AbortSignal; maxTokens?: number } = {},
): Promise<{ content: string; usage: Usage }> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set in .env.local");

  const res = await fetch(`${API}/chat/completions`, {
    method: "POST",
    signal: opts.signal,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:3000",
      "X-Title": "Reddit Live Dashboard",
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2,
      max_tokens: opts.maxTokens ?? 2000,
      usage: { include: true },
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.choices?.length) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    throw new Error(`OpenRouter (${model}): ${msg}`);
  }

  return {
    content: String(data.choices[0].message?.content ?? ""),
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      cost: data.usage?.cost ?? 0,
      calls: 1,
    },
  };
}

/** Models don't always return clean JSON: strip code fences and grab the outermost object. */
export function parseJsonLoose(raw: string): unknown {
  const cleaned = raw.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("No JSON object in model output");
  return JSON.parse(cleaned.slice(start, end + 1));
}

/** Ask for JSON, validate it, and retry once with the error if the model got it wrong. */
export async function chatJson<T>(
  model: string,
  messages: ChatMessage[],
  validate: (v: unknown) => T,
  usage: Usage,
  opts: { signal?: AbortSignal; maxTokens?: number } = {},
): Promise<T> {
  let lastErr: unknown;
  let convo = messages;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { content, usage: u } = await chat(model, convo, { ...opts, json: true });
    addUsage(usage, u);
    try {
      return validate(parseJsonLoose(content));
    } catch (err) {
      lastErr = err;
      convo = [
        ...messages,
        { role: "assistant", content },
        { role: "user", content: `That was not valid JSON for the schema (${String(err).slice(0, 300)}). Reply with ONLY the corrected JSON object.` },
      ];
    }
  }
  throw lastErr;
}
