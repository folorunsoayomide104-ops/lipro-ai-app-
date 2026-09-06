import { getSql } from "@/lib/db";

/**
 * Which chat-completions backend a request should use, and how to call it.
 *
 * A signed-in user with their own NVIDIA key (saved in Settings, see
 * `@/lib/user-settings`) is switched to NVIDIA NIM for every text generation
 * call (Chat, Exam, Cards) — everyone else keeps using the shared xAI key.
 * Both APIs speak the same OpenAI-style `/chat/completions` shape, so callers
 * only need `baseUrl` + `candidates` + `apiKey` to swap providers; nothing
 * else about the request/response handling changes.
 */
export type ChatProvider = {
  provider: "nvidia" | "xai";
  apiKey: string;
  baseUrl: string;
  /** Ordered, best-first. Always length >= 1. NVIDIA's catalog churns and
   *  individual models can be listed-but-broken, so callers must attempt
   *  these in order and fall back on failure — see `completeChatWithFallback`
   *  / `startChatStreamWithFallback` below. xAI always has exactly one. */
  candidates: string[];
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
 * 2026 alone), so the candidate list is always resolved from `GET /v1/models`
 * at call time; this list only ranks small/fast models first when more than
 * one live candidate is available, and is never relied on to exist.
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

/** Rough parameter-count hint parsed from a model id, used only to rank
 *  otherwise-unranked models small-first (small = faster responses). Lower
 *  is preferred. Unknown sizes sort in the middle, not last, since an
 *  unfamiliar id is not necessarily a large/slow model. */
function sizeRank(id: string): number {
  const lower = id.toLowerCase();
  if (/nano|mini|\b1b\b|\b2b\b|\b3b\b/.test(lower)) return 0;
  if (/\b7b\b|\b8b\b|\b9b\b/.test(lower)) return 1;
  if (/\b13b\b|\b14b\b|\b22b\b/.test(lower)) return 2;
  if (/super|ultra|\b49b\b|\b70b\b|\b72b\b|\b405b\b/.test(lower)) return 4;
  return 3;
}

const MAX_CANDIDATES = 8;

type ModelListCacheEntry = { models: string[] | null; expiresAt: number };
const nvidiaModelListCache = new Map<string, ModelListCacheEntry>();
const MODEL_LIST_CACHE_TTL_MS = 10 * 60 * 1000;

/** A model that just failed a real `/chat/completions` call is skipped for a
 *  short cooldown so the *next* request doesn't re-attempt (and re-pay the
 *  latency of) a model we already know is currently broken — NVIDIA's
 *  `/v1/models` listing can say a model exists while it 410s/404s on actual
 *  completion calls, which is what caused this to keep failing the first
 *  time around. In-memory only: on Vercel's serverless runtime this helps
 *  best-effort across warm instances, but correctness never depends on it —
 *  the per-request fallback loop below retries a fresh candidate regardless
 *  of whether this cache remembered anything. */
type ModelHealth = { brokenUntil: number };
const nvidiaModelHealth = new Map<string, ModelHealth>();
const MODEL_COOLDOWN_MS = 5 * 60 * 1000;

function healthKey(apiKey: string, model: string) {
  return `${apiKey}::${model}`;
}

function markModelBroken(apiKey: string, model: string) {
  nvidiaModelHealth.set(healthKey(apiKey, model), {
    brokenUntil: Date.now() + MODEL_COOLDOWN_MS,
  });
}

function isInCooldown(apiKey: string, model: string): boolean {
  const entry = nvidiaModelHealth.get(healthKey(apiKey, model));
  return Boolean(entry && entry.brokenUntil > Date.now());
}

const PROBE_POOL_SIZE = 100; // wider than NVIDIA's ~68-model catalog on purpose — probe everything, not a guessed subset
// Probes run in parallel, so worst case is ~one timeout, not the sum — but a
// dead model 404s in well under a second, so there's no reason for this to be
// as generous as a real-generation timeout; keep it short so a cache-miss
// discovery doesn't eat too much of the same 60s the actual generation needs.
const PROBE_TIMEOUT_MS = 6_000;

/**
 * `GET /v1/models` lists NVIDIA's whole hosted catalog, NOT what this key can
 * actually invoke — most catalog entries are NIM containers that need their
 * own deployment and 404 with `"Function '<id>' not found for account"` on a
 * real completion call even though they're listed. Ranking by name/size alone
 * (the previous approach) kept picking models that looked right but had never
 * once been callable by this key, so every real request burned its whole
 * fallback budget on guaranteed 404s. This probes a batch of ranked
 * candidates with a trivial real completion call and keeps only the ones
 * that actually answer — evidence, not a heuristic.
 */
async function probeModel(apiKey: string, model: string): Promise<boolean> {
  try {
    const res = await fetchWithTimeout(
      NVIDIA_CHAT_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          stream: false,
          max_tokens: 1,
          messages: [{ role: "user", content: "hi" }],
        }),
      },
      PROBE_TIMEOUT_MS,
    );
    if (!res.ok) {
      const bodyText = await res.text().catch(() => "");
      console.error(`[ai-provider] probe ${model} ${res.status}: ${bodyText.slice(0, 300)}`);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Ask NVIDIA which chat-capable models are actually live for this key right
 * now, instead of trusting hardcoded model ids NVIDIA can (and does) retire
 * without much notice — AND instead of trusting the catalog listing at all,
 * since being *listed* doesn't mean this key can *call* it (see `probeModel`).
 * Returns a ranked, real-probe-validated list (small/fast first), not a
 * single pick, so callers can fall back across it. Cached briefly per key so
 * most requests skip the extra round trip — the catalog itself, and which
 * models are actually provisioned for this key, both change far less often
 * than an individual model's moment-to-moment health.
 */
async function resolveNvidiaModels(
  apiKey: string,
): Promise<{ models: string[] } | { error: string }> {
  const cached = nvidiaModelListCache.get(apiKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.models
      ? { models: cached.models }
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

  // Nemotron (NVIDIA's own model family) first — several diverse publishers
  // (IBM, Mistral, DeepSeek, Microsoft, ...) have already come back
  // "not provisioned for this account" in practice, so trying every Nemotron
  // variant the catalog lists is worth doing before falling through to a
  // generic size-ranked sweep of everything else.
  const nemotron = ids.filter((id) => /nemotron/i.test(id) && looksLikeChatModel(id));
  const preferred = PREFERRED_NVIDIA_MODELS.filter(
    (id) => ids.includes(id) && !nemotron.includes(id),
  );
  const rest = ids
    .filter((id) => !nemotron.includes(id) && !preferred.includes(id) && looksLikeChatModel(id))
    .sort((a, b) => sizeRank(a) - sizeRank(b));
  // Probe the WHOLE live catalog, not just a ranked slice — this account has
  // already 404'd on every model tried across every publisher so far, so
  // narrowing the pool before probing risks missing the one that actually
  // works. PROBE_POOL_SIZE is generous enough to cover NVIDIA's full catalog.
  const rankedPool = [...nemotron, ...preferred, ...rest].slice(0, PROBE_POOL_SIZE);

  const probeResults = await Promise.all(
    rankedPool.map(async (model) => ({ model, ok: await probeModel(apiKey, model) })),
  );
  const ranked = probeResults.filter((r) => r.ok).map((r) => r.model).slice(0, MAX_CANDIDATES);

  nvidiaModelListCache.set(apiKey, {
    models: ranked.length ? ranked : null,
    expiresAt: Date.now() + MODEL_LIST_CACHE_TTL_MS,
  });
  return ranked.length
    ? { models: ranked }
    : {
        error:
          "No NVIDIA model in your account could be reached (all returned 404/not-provisioned). Check your NVIDIA API Catalog access.",
      };
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
    const resolved = await resolveNvidiaModels(nvidiaKey);
    if ("error" in resolved) return { ok: false, error: resolved.error };
    const live = resolved.models.filter((m) => !isInCooldown(nvidiaKey, m));
    const candidates = live.length ? live : resolved.models;
    return {
      ok: true,
      value: {
        provider: "nvidia",
        apiKey: nvidiaKey,
        baseUrl: NVIDIA_CHAT_URL,
        candidates,
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
        candidates: [XAI_MODEL],
        supportsJsonMode: true,
      },
    };
  }
  return { ok: false, error: "AI is not available right now." };
}

/**
 * The whole Vercel function has a 60s hard cap (`maxDuration`, set post-build
 * by `scripts/set-function-duration.mjs` — Nitro's Vercel preset doesn't set
 * one itself, which is what caused the 504s: the function was being killed at
 * the platform default before a slow/broken model could even time out here).
 *
 * A *fixed* per-attempt timeout doesn't work for the non-streaming path
 * either, which is why the values below aren't just "how long until we give
 * up" — they budget total wall-clock time across all attempts instead. A dead
 * (404/not-provisioned) candidate fails in well under a second regardless of
 * the timeout, while a genuinely working model generating `max_tokens: 3500`
 * of JSON can legitimately take 20-40s; an earlier fixed 8s cap here killed
 * real, working generations before they could finish and mislabeled them as
 * failures — the actual bug behind a "Could not write questions (504)"
 * report even after a valid model was found.
 */
const NON_STREAM_TOTAL_BUDGET_MS = 45_000; // leaves ~15s of the 60s cap for DB/session + a cache-miss discovery probe
const NON_STREAM_PER_ATTEMPT_CAP_MS = 35_000; // generous for one real generation, but leaves room to fall back once
const NON_STREAM_MIN_ATTEMPT_MS = 12_000; // don't start an attempt that can't possibly finish
const NON_STREAM_MAX_ATTEMPTS = 3;
const STREAM_MAX_ATTEMPTS = 4;
/** Streaming only needs to bound time-to-*first-byte* — once a candidate's
 *  headers/body arrive we commit to it for the rest of the generation, no
 *  matter how long a genuine answer takes to finish. */
const STREAM_TTFB_TIMEOUT_MS = 6_000; // worst case 4 x 6s = 24s, ~35s left to stream the answer

function candidatesToTry(provider: ChatProvider, maxAttempts: number): string[] {
  return provider.candidates.slice(0, maxAttempts);
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

type FallbackBody = {
  max_tokens: number;
  response_format?: { type: "json_object" };
  messages: { role: string; content: string }[];
};

function logAttemptFailure(
  label: string,
  provider: ChatProvider,
  model: string,
  status: number,
  bodyText: string,
) {
  console.error(
    `[${label}] ${provider.provider} ${model} ${status} ${provider.baseUrl}: ${bodyText.slice(0, 2000)}`,
  );
}

/**
 * Non-streaming chat completion (exam/cards) with automatic fallback across
 * `provider.candidates` when a candidate's request fails outright. Safe to
 * retry freely here — nothing has been shown to the user yet.
 */
export async function completeChatWithFallback(
  label: string,
  provider: ChatProvider,
  body: FallbackBody,
): Promise<{ ok: true; json: unknown; modelUsed: string } | { ok: false; status: number; error: string }> {
  const models = candidatesToTry(provider, NON_STREAM_MAX_ATTEMPTS);
  const deadline = Date.now() + NON_STREAM_TOTAL_BUDGET_MS;
  let lastStatus = 503;

  for (const model of models) {
    const remaining = deadline - Date.now();
    if (remaining < NON_STREAM_MIN_ATTEMPT_MS) break;
    const attemptTimeout = Math.min(remaining, NON_STREAM_PER_ATTEMPT_CAP_MS);

    let res: Response;
    try {
      res = await fetchWithTimeout(
        provider.baseUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify({
            model,
            stream: false,
            ...(provider.supportsJsonMode ? { response_format: body.response_format } : {}),
            max_tokens: body.max_tokens,
            messages: body.messages,
          }),
        },
        attemptTimeout,
      );
    } catch {
      lastStatus = 504;
      if (provider.provider === "nvidia") markModelBroken(provider.apiKey, model);
      continue;
    }

    if (!res.ok) {
      lastStatus = res.status;
      const bodyText = await res.text().catch(() => "");
      logAttemptFailure(label, provider, model, res.status, bodyText);
      if (provider.provider === "nvidia") markModelBroken(provider.apiKey, model);
      continue;
    }

    const json = await res.json();
    return { ok: true, json, modelUsed: model };
  }

  return { ok: false, status: lastStatus, error: `AI is unavailable (${lastStatus}).` };
}

/**
 * Streaming chat completion (Chat) with automatic fallback across
 * `provider.candidates`. Fallback ONLY happens before any bytes have been
 * handed back to the caller — i.e. based solely on the upstream fetch's
 * status, or a pre-first-byte timeout. Once a candidate returns `res.ok`
 * with a body, that candidate is final: the caller starts reading/forwarding
 * its stream immediately, and this function never retries after that point.
 * Retrying post-first-byte would mean mixing two models' output in one reply
 * (or restarting content the user may already be seeing), which is strictly
 * worse than a clean error — do not "improve" this into a mid-stream retry.
 */
export async function startChatStreamWithFallback(
  label: string,
  provider: ChatProvider,
  body: { max_tokens: number; messages: { role: string; content: string }[] },
): Promise<
  | { ok: true; response: Response; modelUsed: string }
  | { ok: false; status: number; error: string }
> {
  const models = candidatesToTry(provider, STREAM_MAX_ATTEMPTS);
  let lastStatus = 503;

  for (const model of models) {
    let res: Response;
    try {
      res = await fetchWithTimeout(
        provider.baseUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${provider.apiKey}`,
          },
          body: JSON.stringify({
            model,
            stream: true,
            max_tokens: body.max_tokens,
            messages: body.messages,
          }),
        },
        STREAM_TTFB_TIMEOUT_MS,
      );
    } catch {
      lastStatus = 504;
      if (provider.provider === "nvidia") markModelBroken(provider.apiKey, model);
      continue;
    }

    if (!res.ok || !res.body) {
      lastStatus = res.status;
      const bodyText = await res.text().catch(() => "");
      logAttemptFailure(label, provider, model, res.status, bodyText);
      if (provider.provider === "nvidia") markModelBroken(provider.apiKey, model);
      continue;
    }

    return { ok: true, response: res, modelUsed: model };
  }

  return { ok: false, status: lastStatus, error: `AI is unavailable (${lastStatus}).` };
}
