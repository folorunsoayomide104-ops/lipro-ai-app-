import { createFileRoute } from "@tanstack/react-router";
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
        const apiKey = process.env.XAI_API_KEY;
        if (!apiKey) {
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

        const xaiRes = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: "grok-4.5",
            stream: true,
            max_tokens: 1200,
            messages: [
              { role: "system", content: systemPromptFor(parsed.mode) },
              ...parsed.messages,
            ],
          }),
        });

        if (!xaiRes.ok || !xaiRes.body) {
          return Response.json(
            { error: `Grok is unavailable (${xaiRes.status}).` },
            { status: 502 },
          );
        }

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();
        const upstream = xaiRes.body.getReader();

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
