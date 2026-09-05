import { getSql } from "@/lib/db";

/**
 * Which chat-completions backend a request should use, and how to call it.
 *
 * A signed-in user with their own NVIDIA key (saved in Settings, see
 * `@/lib/user-settings`) is switched to NVIDIA NIM for every text generation
 * call (Chat, Exam, Cards) — everyone else keeps using the shared xAI key.
 * Both APIs speak the same OpenAI-style `/chat/completions` shape, so callers
 * only need `baseUrl` + `model` + `apiKey` to swap providers; nothing else
 * about the request/response handling changes.
 */
export type ChatProvider = {
  provider: "nvidia" | "xai";
  apiKey: string;
  baseUrl: string;
  model: string;
  /** NIM's OpenAI-compatible endpoint doesn't reliably honor `response_format`
   *  across models, so JSON-mode callers (exam/cards) should skip that field
   *  on this provider and lean on their own fenced-JSON parsing instead. */
  supportsJsonMode: boolean;
};

export type ChatProviderResult =
  | { ok: true; value: ChatProvider }
  | { ok: false; error: string };

const NVIDIA_CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_MODELS_URL = "https://integrate.api.nvidia.com/v1/models";
const XAI_BASE_URL = "https://api.x.ai/v1/chat/completions";
const XAI_MODEL = "grok-4.5";

/**
 * Tie-break preference among whatever NVIDIA's *live* catalog actually
 * returns — NOT a hardcoded requirement. NVIDIA retires NIM models with as
 * little as ~2 weeks' notice (two different flagship families were pulled in
 * 2026 alone), so the model is always resolved from `GET /v1/models` at call
 * time; this list only picks a small, fast instruct model when more than one
 * live candidate is available, and is never relied on to exist.
 */
const PREFERRED_NVIDIA_MODELS = [
  "meta/llama-3.1-8b-instruct",
  "nvidia/llama-3.1-nemotron-nano-8b-v1",
  "mistralai/mistral-nemotron",
  "meta/llama-3.1-70b-instruct",
  "nvidia/llama-3.3-nemotron-super-49b-v1",
];

const NON_CHAT_HINTS =
  /embed|rerank|guard|vision|tts|asr|whisper|clip|ocr|moderat|safety|reward|classif/;
const CHAT_HINTS = /instruct|chat|nemotron/;

function looksLikeChatModel(id: string): boolean {
  const lower = id.toLowerCase();
  if (NON_CHAT_HINTS.test(lower)) return false;
  return CHAT_HINTS.test(lower);
}

type ModelCacheEntry = { model: string | null; expiresAt: number };
const nvidiaModelCache = new Map<string, ModelCacheEntry>();
const MODEL_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * Ask NVIDIA which chat-capable model is actually live for this key right
 * now, instead of trusting a hardcoded model id NVIDIA can (and does) retire
 * without much notice. Cached briefly per key so most requests skip the extra
 * round trip.
 */
async function resolveNvidiaModel(
  apiKey: string,
): Promise<{ model: string } | { error: string }> {
  const cached = nvidiaModelCache.get(apiKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.model
      ? { model: cached.model }
      : { error: "No usable chat model found in your NVIDIA account." };
  }

  const res = await fetch(NVIDIA_MODELS_URL, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const bodyText = await res.text().catch(() => "");
    console.error(`[ai-provider] NVIDIA /v1/models ${res.status}: ${bodyText.slice(0, 500)}`);
    if (res.status === 401 || res.status === 403) {
      return { error: "Your NVIDIA API key was rejected. Check it in Settings." };
    }
    return { error: `Could not reach NVIDIA (${res.status}).` };
  }

  const body = (await res.json()) as { data?: { id?: string }[] };
  const ids = (body.data ?? [])
    .map((m) => m.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);

  const chosen =
    PREFERRED_NVIDIA_MODELS.find((id) => ids.includes(id)) ?? ids.find(looksLikeChatModel) ?? null;

  nvidiaModelCache.set(apiKey, { model: chosen, expiresAt: Date.now() + MODEL_CACHE_TTL_MS });
  return chosen ? { model: chosen } : { error: "No usable chat model found in your NVIDIA account." };
}

async function userNvidiaKey(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const sql = await getSql();
  const rows = await sql<{ nvidia_api_key: string | null }>`
    select nvidia_api_key from user_settings where user_id = ${userId}
  `;
  return rows[0]?.nvidia_api_key ?? null;
}

/**
 * Resolve which provider to call for this request. `userId` is the caller's
 * verified session id, or `null` when signed out / unresolved — pass what
 * `getSessionUser()` / `auth.api.getSession()` gave you, never a client value.
 *
 * A saved NVIDIA key always wins for that user — a bad key surfaces a clear
 * error rather than silently billing the shared xAI key instead. With no
 * personal key, the shared xAI key is used; with neither, `ok: false`.
 */
export async function resolveChatProvider(userId: string | null): Promise<ChatProviderResult> {
  const nvidiaKey = await userNvidiaKey(userId);
  if (nvidiaKey) {
    const resolved = await resolveNvidiaModel(nvidiaKey);
    if ("error" in resolved) return { ok: false, error: resolved.error };
    return {
      ok: true,
      value: {
        provider: "nvidia",
        apiKey: nvidiaKey,
        baseUrl: NVIDIA_CHAT_URL,
        model: resolved.model,
        supportsJsonMode: false,
      },
    };
  }
  const xaiKey = process.env.XAI_API_KEY;
  if (xaiKey) {
    return {
      ok: true,
      value: {
        provider: "xai",
        apiKey: xaiKey,
        baseUrl: XAI_BASE_URL,
        model: XAI_MODEL,
        supportsJsonMode: true,
      },
    };
  }
  return { ok: false, error: "AI is not available right now." };
}
