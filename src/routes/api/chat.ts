import { createFileRoute } from "@tanstack/react-router";
import { resolveChatProvider } from "@/lib/ai-provider";
import { auth } from "@/lib/auth/server";
import { systemPromptFor } from "@/lib/prompts";
import type { StudioMode } from "@/lib/studio-store";

const MODES = new Set<StudioMode>(["lipro", "muse", "scholar", "maker", "confidant"]);
const MAX_MESSAGES = 16;
const MAX_CHARS = 4000;

type Incoming = {
  role: "user" | "assistant";
  content: string;
};

function parseBody(raw: unknown): { messages: Incoming[]; mode: StudioMode } | null {
  if (!raw || typeof raw !== "object") return null;
  const body = raw as { messages?: unknown; mode?: unknown };
  if (!Array.isArray(body.messages)) return null;
  const mode = MODES.has(body.mode as StudioMode) ? (body.mode as StudioMode) : "lipro";
  const messages: Incoming[] = [];
  for (const item of body.messages.slice(-MAX_MESSAGES)) {
    if (!item || typeof item !== "object") continue;
    const row = item as { role?: unknown; content?: unknown };
    if (row.role !== "user" && row.role !== "assistant") continue;
    if (typeof row.content !== "string") continue;
    const content = row.content.slice(0, MAX_CHARS);
    if (!content.trim()) continue;
    messages.push({ role: row.role, content });
  }
  if (messages.length === 0) return null;
  return { messages, mode };
}

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
        const chatProvider = await resolveChatProvider(session?.user?.id ?? null);
        if (!chatProvider) {
          return Response.json({ error: "AI is not available right now." }, { status: 503 });
        }

        let json: unknown;
        try {
          json = await request.json();
        } catch {
          return Response.json({ error: "Invalid request." }, { status: 400 });
        }

        const parsed = parseBody(json);
        if (!parsed) {
          return Response.json({ error: "Say something first." }, { status: 400 });
        }

        const upstreamRes = await fetch(chatProvider.baseUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${chatProvider.apiKey}`,
          },
          body: JSON.stringify({
            model: chatProvider.model,
            stream: true,
            max_tokens: 1200,
            messages: [
              { role: "system", content: systemPromptFor(parsed.mode) },
              ...parsed.messages,
            ],
          }),
        });

        if (!upstreamRes.ok || !upstreamRes.body) {
          return Response.json(
            { error: `AI is unavailable (${upstreamRes.status}).` },
            { status: 502 },
          );
        }

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const upstream = upstreamRes.body.getReader();

        const stream = new ReadableStream({
          async start(controller) {
            let buffer = "";
            try {
              while (true) {
                const { done, value } = await upstream.read();
                if (done) break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop() ?? "";
                for (const line of lines) {
                  const trimmed = line.trim();
                  if (!trimmed.startsWith("data:")) continue;
                  const data = trimmed.slice(5).trim();
                  if (!data || data === "[DONE]") continue;
                  try {
                    const chunk = JSON.parse(data) as {
                      choices?: { delta?: { content?: string } }[];
                    };
                    const delta = chunk.choices?.[0]?.delta?.content;
                    if (typeof delta === "string" && delta) {
                      controller.enqueue(encoder.encode(delta));
                    }
                  } catch {
                    // skip malformed sse lines
                  }
                }
              }
            } catch {
              // client aborted or upstream dropped
            } finally {
              controller.close();
              upstream.releaseLock();
            }
          },
          cancel() {
            void upstream.cancel();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
