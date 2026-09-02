export type SitMode = "practice" | "exam";
export type QuestionKind = "mcq" | "gap" | "theory";

export type ExamQuestion = {
  id: string;
  kind: QuestionKind;
  stem: string;
  explanation: string;
  options?: string[];
  answerIndex?: number;
  answers?: string[];
  marks?: number;
  markingPoints?: string[];
  modelAnswer?: string;
};

export type ExamAttempt = {
  answers: Record<string, string | number>;
  flagged: string[];
  revealed: string[];
  mode: SitMode;
  durationMs?: number;
  startedAt: number;
  submittedAt?: number;
};

export type ExamPaper = {
  id: string;
  title: string;
  sourceName: string;
  sourceText?: string;
  engine?: "grok" | "local" | "mixed";
  formats: QuestionKind[];
  questions: ExamQuestion[];
  createdAt: number;
  attempt: ExamAttempt | null;
};

export const FORMAT_META: {
  id: QuestionKind;
  label: string;
  hint: string;
}[] = [
  { id: "mcq", label: "MCQ", hint: "Four options, one best answer" },
  { id: "gap", label: "Fill the gap", hint: "A missing term or short phrase" },
  { id: "theory", label: "Theory", hint: "Written answer with a marking scheme" },
];

export const COUNT_PRESETS = [10, 20, 50, 100] as const;
export const EXAM_MINUTES = [10, 20, 30, 45, 60] as const;

export function defaultExamMinutes(count: number) {
  const raw = Math.max(10, Math.round(count * 0.8));
  return (EXAM_MINUTES as readonly number[]).includes(raw)
    ? raw
    : EXAM_MINUTES.reduce((best, n) => (Math.abs(n - raw) < Math.abs(best - raw) ? n : best));
}

export function allocateFormats(count: number, formats: QuestionKind[]) {
  const out: Record<QuestionKind, number> = { mcq: 0, gap: 0, theory: 0 };
  if (formats.length === 0 || count <= 0) return out;
  const base = Math.floor(count / formats.length);
  const remaining = count % formats.length;
  formats.forEach((kind, i) => {
    out[kind] = base + (i < remaining ? 1 : 0);
  });
  return out;
}

export function chunkText(text: string, size = 6500, overlap = 350) {
  const clean = text.replace(/\r/g, "").trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    chunks.push(clean.slice(i, i + size));
    i += size - overlap;
  }
  return chunks;
}

export function normalizeGap(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function gapMatches(given: string, accepted: string[]) {
  const g = normalizeGap(given);
  if (!g) return false;
  return accepted.some((a) => {
    const n = normalizeGap(a);
    if (!n) return false;
    return g === n || n.includes(g) || g.includes(n);
  });
}

export function scorePaper(paper: ExamPaper) {
  const attempt = paper.attempt;
  let autoTotal = 0;
  let autoCorrect = 0;
  let theoryCount = 0;
  const results: Record<string, boolean | "theory"> = {};

  for (const q of paper.questions) {
    if (q.kind === "theory") {
      theoryCount += 1;
      results[q.id] = "theory";
      continue;
    }
    autoTotal += 1;
    const raw = attempt?.answers[q.id];
    let ok = false;
    if (q.kind === "mcq") {
      ok = typeof raw === "number" && raw === q.answerIndex;
    } else if (q.kind === "gap") {
      ok = typeof raw === "string" && gapMatches(raw, q.answers ?? []);
    }
    if (ok) autoCorrect += 1;
    results[q.id] = ok;
  }

  return { autoTotal, autoCorrect, theoryCount, results };
}

function shuffleOrder(n: number) {
  const order = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  return order;
}

export function shuffleMcqQuestion(question: ExamQuestion): ExamQuestion {
  if (question.kind !== "mcq" || !question.options || question.answerIndex == null) {
    return question;
  }
  const n = question.options.length;
  if (n < 2) return question;
  const order = shuffleOrder(n);
  return {
    ...question,
    options: order.map((i) => question.options![i]),
    answerIndex: order.indexOf(question.answerIndex),
  };
}

/** If the writer parked most keys on A, scatter them. Remaps saved picks. */
export function rebalancePaperKeys(paper: ExamPaper): ExamPaper {
  const mcqs = paper.questions.filter((q) => q.kind === "mcq" && q.options?.length);
  if (mcqs.length < 1) return paper;
  const parkedOnA = mcqs.filter((q) => q.answerIndex === 0).length;
  if (parkedOnA / mcqs.length < 0.6) return paper;

  const remapped = new Map<string, number[]>();
  const questions = paper.questions.map((q) => {
    if (q.kind !== "mcq" || !q.options || q.answerIndex == null) return q;
    const order = shuffleOrder(q.options.length);
    remapped.set(q.id, order);
    return {
      ...q,
      options: order.map((i) => q.options![i]),
      answerIndex: order.indexOf(q.answerIndex),
    };
  });

  const attempt = paper.attempt
    ? {
        ...paper.attempt,
        answers: Object.fromEntries(
          Object.entries(paper.attempt.answers).map(([id, value]) => {
            const order = remapped.get(id);
            if (!order || typeof value !== "number") return [id, value];
            return [id, order.indexOf(value)];
          }),
        ),
      }
    : paper.attempt;

  return { ...paper, questions, attempt };
}
