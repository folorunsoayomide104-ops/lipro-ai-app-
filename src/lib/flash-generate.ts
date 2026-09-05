import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { resolveChatProvider } from "@/lib/ai-provider";
import type { FlashCard } from "@/lib/flash-types";

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no-json");
  return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}

function asString(value: unknown, max: number) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

export const generateFlashBatch = createServerFn({ method: "POST" })
  .validator(
    z.object({
      excerpt: z.string().trim().min(40).max(20000),
      count: z.number().int().min(1).max(12),
      exclude: z.array(z.string().trim().max(220)).max(30).optional(),
    }),
  )
  .handler(async ({ data }) => {
    // Dynamic import: verify.server.ts pulls in `@tanstack/react-start/server`,
    // which must never be statically imported into a createServerFn module (see
    // auth/middleware.ts) — this file also ships a client stub.
    const { getSessionUser } = await import("@/lib/auth/verify.server");
    const user = await getSessionUser();
    const chatProvider = await resolveChatProvider(user?.id ?? null);
    if (!chatProvider) return { ok: false as const, error: "AI is not available right now." };

    const avoid =
      data.exclude && data.exclude.length > 0
        ? `\nDo not repeat these fronts:\n${data.exclude.map((s) => `- ${s}`).join("\n")}`
        : "";

    const res = await fetch(chatProvider.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${chatProvider.apiKey}`,
      },
      body: JSON.stringify({
        model: chatProvider.model,
        stream: false,
        max_tokens: 2500,
        ...(chatProvider.supportsJsonMode ? { response_format: { type: "json_object" } } : {}),
        messages: [
          {
            role: "system",
            content: `You write high-yield revision flashcards from source notes for LIPRO.

Rules:
- Use ONLY facts in the notes.
- Front: a short prompt, term, or question a student should recall.
- Back: the answer, crisp. One idea per card.
- Prefer definitions, lists, mechanisms, distinctions, and exam traps.
- No true/false. No "what is this chapter about".
Return JSON only: {"cards":[{"front":"...","back":"..."}]}`,
          },
          {
            role: "user",
            content: `Write ${data.count} flashcards from these notes.${avoid}

NOTES:
"""
${data.excerpt}
"""`,
          },
        ],
      }),
    });

    if (!res.ok) {
      return { ok: false as const, error: `Could not write cards (${res.status}).` };
    }

    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return { ok: false as const, error: "No cards came back." };

    let parsed: unknown;
    try {
      parsed = extractJson(content);
    } catch {
      return { ok: false as const, error: "The deck came back in a bad format. Try again." };
    }

    const list =
      parsed && typeof parsed === "object" && Array.isArray((parsed as { cards?: unknown }).cards)
        ? ((parsed as { cards: unknown[] }).cards)
        : [];

    const cards: FlashCard[] = [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const row = item as { front?: unknown; back?: unknown };
      const front = asString(row.front, 280);
      const back = asString(row.back, 700);
      if (front.length < 4 || back.length < 2) continue;
      cards.push({ id: crypto.randomUUID(), front, back, box: 1 });
      if (cards.length >= data.count) break;
    }

    return { ok: true as const, cards };
  });
