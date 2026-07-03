import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

export function resetOpenAIChatBudget() {
  // Pass-through compatibility hook for function handlers.
}

export async function callOpenAIChat(
  _apiKey: string | undefined,
  init: RequestInit
): Promise<Response> {
  return fetch(OPENAI_CHAT_URL, init);
}
