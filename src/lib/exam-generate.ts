import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { ExamQuestion, QuestionKind } from "@/lib/exam-types";
import { shuffleMcqQuestion } from "@/lib/exam-types";

const needSchema = z.object({
  mcq: z.number().int().min(0).max(12),
  gap: z.number().int().min(0).max(12),
  theory: z.number().int().min(0).max(12),
});

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no-json");
  return JSON.parse(candidate.slice(start, end + 1)) as unknown;
}

function asString(value: unknown, max = 2000) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function asStringList(value: unknown, maxItems: number, maxLen: number) {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const s = asString(item, maxLen);
    if (s) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

function normalizeQuestion(raw: unknown): ExamQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const kind = row.kind;
  if (kind !== "mcq" && kind !== "gap" && kind !== "theory") return null;
  const stem = asString(row.stem, 900);
  if (stem.length < 8) return null;
  const explanation = asString(row.explanation, 800) || "See the source notes.";
  const id = crypto.randomUUID();

  if (kind === "mcq") {
    const options = asStringList(row.options, 4, 220);
    if (options.length !== 4) return null;
    const unique = new Set(options.map((o) => o.toLowerCase()));
    if (unique.size < 4) return null;
    const answerIndex = parseAnswerIndex(row);
    if (answerIndex == null) return null;
    return shuffleMcqQuestion({ id, kind, stem, options, answerIndex, explanation });
  }

  if (kind === "gap") {
    const answers = asStringList(row.answers, 6, 80);
    if (answers.length === 0) return null;
    const gapStem = stem.includes("___") || stem.includes("_____") ? stem : `${stem} _____`;
    return { id, kind, stem: gapStem, answers, explanation };
  }

  const markingPoints = asStringList(row.markingPoints, 8, 240);
  const modelAnswer = asString(row.modelAnswer, 1200);
  const marks =
    typeof row.marks === "number" && row.marks >= 2 && row.marks <= 20
      ? Math.round(row.marks)
      : Math.max(5, markingPoints.length * 2);
  if (!modelAnswer && markingPoints.length === 0) return null;
  return {
    id,
    kind,
    stem,
    marks,
    markingPoints: markingPoints.length ? markingPoints : [modelAnswer.slice(0, 240)],
    modelAnswer: modelAnswer || markingPoints.join(" "),
    explanation,
  };
}

function parseAnswerIndex(row: Record<string, unknown>): number | null {
  const raw = row.answerIndex ?? row.answer ?? row.correctIndex;
  if (typeof raw === "number" && Number.isInteger(raw)) {
    if (raw >= 0 && raw <= 3) return raw;
    if (raw >= 1 && raw <= 4) return raw - 1;
  }
  if (typeof raw === "string") {
    const t = raw.trim().toUpperCase();
    if (/^[A-D]$/.test(t)) return t.charCodeAt(0) - 65;
    const n = Number(t);
    if (Number.isInteger(n) && n >= 0 && n <= 3) return n;
    if (Number.isInteger(n) && n >= 1 && n <= 4) return n - 1;
  }
  return null;
}

function systemPrompt() {
  return `You are LIPRO Exam, an examiner writing a realistic computer-based test from source notes.

Rules:
- Use ONLY facts, lists, definitions, mechanisms, and applications that appear in the notes.
- Prefer high-yield exam items: definitions, classifications, pathways, exceptions, clinical or applied use, comparisons.
- Do not invent numbers, names, or claims that are not in the notes.
- MCQ: four DISTINCT options. One best answer. Distractors must be plausible nearby concepts, not jokes, not "all of the above".
- Scatter the key. answerIndex must be 0, 1, 2, or 3 — mix them. Never put every correct option first.
- Fill-the-gap stems must contain a blank as _____. The blank is a key term or short phrase.
- Theory questions need a mark total, discrete marking points, and a concise model answer.
- If the notes cannot support the requested count, return fewer questions. Never pad.

Return a JSON object only, shape:
{"questions":[{
  "kind":"mcq"|"gap"|"theory",
  "stem":"...",
  "options":["...","...","...","..."],
  "answerIndex":2,
  "answers":["accepted","alias"],
  "marks":10,
  "markingPoints":["point (2 marks)"],
  "modelAnswer":"...",
  "explanation":"why this is the answer, from the notes"
}]}`;
}

function userPrompt(
  excerpt: string,
  need: { mcq: number; gap: number; theory: number },
  exclude: string[],
) {
  const parts: string[] = [];
  (Object.keys(need) as QuestionKind[]).forEach((kind) => {
    if (need[kind] > 0) parts.push(`${need[kind]} ${kind}`);
  });
  const avoid =
    exclude.length > 0
      ? `\nDo not repeat or paraphrase these stems:\n${exclude.map((s) => `- ${s}`).join("\n")}`
      : "";
  return `Write ${parts.join(", ")} question(s) from these notes.${avoid}

NOTES:
"""
${excerpt}
"""`;
}

export const generateExamBatch = createServerFn({ method: "POST" })
  .validator(
    z
      .object({
        excerpt: z.string().trim().min(40).max(20000),
        need: needSchema,
        exclude: z.array(z.string().trim().max(220)).max(30).optional(),
      })
      .refine((d) => {
        const total = d.need.mcq + d.need.gap + d.need.theory;
        return total >= 1 && total <= 12;
      }, "Need 1–12 questions."),
  )
  .handler(async ({ data }) => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return { ok: false as const, error: "AI is not available right now." };

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        stream: false,
        max_tokens: 3500,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: systemPrompt() },
          {
            role: "user",
            content: userPrompt(data.excerpt, data.need, data.exclude ?? []),
          },
        ],
      }),
    });

    if (!res.ok) {
      return { ok: false as const, error: `Could not write questions (${res.status}).` };
    }

    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return { ok: false as const, error: "No questions came back." };

    let parsed: unknown;
    try {
      parsed = extractJson(content);
    } catch {
      return { ok: false as const, error: "The paper came back in a bad format. Try again." };
    }

    const list =
      parsed && typeof parsed === "object" && Array.isArray((parsed as { questions?: unknown }).questions)
        ? ((parsed as { questions: unknown[] }).questions)
        : [];

    const allowed = new Set<QuestionKind>(
      (Object.keys(data.need) as QuestionKind[]).filter((k) => data.need[k] > 0),
    );
    const counts: Record<QuestionKind, number> = { mcq: 0, gap: 0, theory: 0 };
    const questions: ExamQuestion[] = [];
    for (const item of list) {
      const q = normalizeQuestion(item);
      if (!q || !allowed.has(q.kind)) continue;
      if (counts[q.kind] >= data.need[q.kind]) continue;
      counts[q.kind] += 1;
      questions.push(q);
    }

    return { ok: true as const, questions };
  });
