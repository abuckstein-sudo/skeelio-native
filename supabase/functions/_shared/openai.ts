import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";
const DEFAULT_MAX_TOKENS = 2000;
const DEFAULT_MAX_CALLS = 12;

let openAIChatCalls = 0;

export function resetOpenAIChatBudget() {
  openAIChatCalls = 0;
}

export async function callOpenAIChat(
  apiKey: string | undefined,
  init: RequestInit,
  options: { maxTokens?: number; maxCalls?: number } = {}
): Promise<Response> {
  const maxCalls = options.maxCalls ?? DEFAULT_MAX_CALLS;
  if (openAIChatCalls >= maxCalls) {
    return new Response(
      JSON.stringify({ error: "OpenAI per-invocation call cap exceeded", maxCalls }),
      { status: 429, headers: { "Content-Type": "application/json" } }
    );
  }
  openAIChatCalls += 1;

  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const body = typeof init.body === "string" ? JSON.parse(init.body) : {};
  const requested = Number(body.max_tokens ?? maxTokens);
  body.max_tokens = Math.min(Number.isFinite(requested) ? requested : maxTokens, maxTokens);
  delete body.max_completion_tokens;

  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Authorization", `Bearer ${apiKey ?? ""}`);

  return fetch(OPENAI_CHAT_URL, {
    ...init,
    headers,
    body: JSON.stringify(body),
  });
}
