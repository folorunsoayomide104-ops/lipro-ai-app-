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

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const NVIDIA_MODEL = "meta/llama-3.3-70b-instruct";
const XAI_BASE_URL = "https://api.x.ai/v1/chat/completions";
const XAI_MODEL = "grok-4.5";

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
 * Returns `null` when neither a personal NVIDIA key nor the shared xAI key is
 * available.
 */
export async function resolveChatProvider(userId: string | null): Promise<ChatProvider | null> {
  const nvidiaKey = await userNvidiaKey(userId);
  if (nvidiaKey) {
    return {
      provider: "nvidia",
      apiKey: nvidiaKey,
      baseUrl: NVIDIA_BASE_URL,
      model: NVIDIA_MODEL,
      supportsJsonMode: false,
    };
  }
  const xaiKey = process.env.XAI_API_KEY;
  if (xaiKey) {
    return {
      provider: "xai",
      apiKey: xaiKey,
      baseUrl: XAI_BASE_URL,
      model: XAI_MODEL,
      supportsJsonMode: true,
    };
  }
  return null;
}
