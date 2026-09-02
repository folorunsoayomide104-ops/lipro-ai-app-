import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const aspectSchema = z.enum(["1:1", "16:9", "9:16", "3:2"]);

export const generateImage = createServerFn({ method: "POST" })
  .validator(
    z.object({
      prompt: z.string().trim().min(1).max(1500),
      aspectRatio: aspectSchema.default("1:1"),
    }),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "AI is not available right now." };

    const res = await fetch("https://api.x.ai/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-imagine-image",
        prompt: data.prompt,
        n: 1,
        aspect_ratio: data.aspectRatio,
        resolution: "1k",
        response_format: "url",
      }),
    });

    if (!res.ok) {
      return { ok: false as const, error: `Image generation failed (${res.status}).` };
    }

    const body = (await res.json()) as {
      data?: { url?: string }[];
    };
    const url = body.data?.[0]?.url;
    if (!url) return { ok: false as const, error: "No image was returned." };
    return { ok: true as const, url };
  });

export const speakText = createServerFn({ method: "POST" })
  .validator(z.object({ text: z.string().trim().min(1).max(800) }))
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "AI is not available right now." };

    const res = await fetch("https://api.x.ai/v1/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        text: data.text.slice(0, 800),
        voice_id: "eve",
      }),
    });

    if (!res.ok) {
      return { ok: false as const, error: `Voice failed (${res.status}).` };
    }

    const buf = Buffer.from(await res.arrayBuffer());
    return {
      ok: true as const,
      audio: buf.toString("base64"),
      mime: res.headers.get("content-type") || "audio/mpeg",
    };
  });
