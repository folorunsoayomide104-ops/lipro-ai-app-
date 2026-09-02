import type { ExamQuestion, QuestionKind } from "@/lib/exam-types";
import { allocateFormats } from "@/lib/exam-types";

const STOP = new Set(
  "the a an and or of to in on at by for from with as is are was were be been being this that these those which their there then than into onto over under not but also it its you your we our they them his her who what when where how".split(
    " ",
  ),
);

function uid() {
  return crypto.randomUUID();
}

function sentencesOf(text: string) {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z(“"])/)
    .map((s) => s.trim().replace(/^[-•]\s+/, ""))
    .filter((s) => s.length >= 32 && s.length <= 340);
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function shuffle<T>(list: T[], seed: number) {
  const out = [...list];
  let s = seed || 1;
  for (let i = out.length - 1; i > 0; i -= 1) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

type Fact = { subject: string; verb: string; object: string; sentence: string };

const FACT =
  /^(?:The |A |An )?(.{3,90}?) (is|are|was|were|prevents|contains|supplies|divides into|drains into|bounded by|gives|continues as) (.+)$/i;

function factsOf(sentences: string[]): Fact[] {
  const out: Fact[] = [];
  for (const sentence of sentences) {
    const trimmed = sentence.replace(/[.]+$/, "");
    const match = trimmed.match(FACT);
    if (!match) continue;
    const subject = match[1].trim();
    const object = match[3].trim();
    if (subject.length < 3 || object.length < 3) continue;
    if (STOP.has(subject.toLowerCase())) continue;
    out.push({
      subject,
      verb: match[2].toLowerCase(),
      object,
      sentence,
    });
  }
  return out;
}

function blankNoun(sentence: string) {
  const words = sentence.replace(/[.?!]$/, "").split(" ");
  const candidates = words
    .map((w, i) => ({ w: w.replace(/[^A-Za-z-]/g, ""), i }))
    .filter((x) => x.w.length >= 6 && !STOP.has(x.w.toLowerCase()));
  if (candidates.length === 0) return null;
  const pick = candidates.sort((a, b) => b.w.length - a.w.length)[0];
  const blanked = words.map((w, i) => (i === pick.i ? "_____" : w)).join(" ");
  return { stem: `${blanked}.`, answer: pick.w.replace(/s$/, "") };
}

function uniquePush(list: ExamQuestion[], q: ExamQuestion, seen: Set<string>) {
  const key = q.stem.toLowerCase();
  if (seen.has(key)) return false;
  seen.add(key);
  list.push(q);
  return true;
}

function mcqFromFact(fact: Fact, others: Fact[]): ExamQuestion | null {
  const distractors = shuffle(
    others
      .filter((f) => f.object.toLowerCase() !== fact.object.toLowerCase())
      .map((f) => f.object),
    hash(fact.subject),
  )
    .filter((d, i, arr) => arr.findIndex((x) => x.toLowerCase() === d.toLowerCase()) === i)
    .slice(0, 3);
  if (distractors.length < 3) return null;
  const options = shuffle([fact.object, ...distractors], hash(fact.object));
  return {
    id: uid(),
    kind: "mcq",
    stem: `${fact.subject} ${fact.verb}:`,
    options,
    answerIndex: options.findIndex((o) => o === fact.object),
    explanation: fact.sentence,
  };
}

function mcqFromSentence(trueOne: string, others: string[]): ExamQuestion | null {
  const distractors = others.filter((s) => s !== trueOne).slice(0, 3);
  if (distractors.length < 3) return null;
  const options = shuffle([trueOne, ...distractors], hash(trueOne));
  return {
    id: uid(),
    kind: "mcq",
    stem: "Which statement is correct from the notes?",
    options,
    answerIndex: options.findIndex((o) => o === trueOne),
    explanation: trueOne,
  };
}

export function writeLocalPaper(
  text: string,
  formats: QuestionKind[],
  count: number,
  existing: ExamQuestion[] = [],
): ExamQuestion[] {
  const target = allocateFormats(count, formats);
  const got: Record<QuestionKind, number> = { mcq: 0, gap: 0, theory: 0 };
  for (const q of existing) got[q.kind] += 1;

  const sentences = sentencesOf(text);
  const facts = factsOf(sentences);
  const seen = new Set(existing.map((q) => q.stem.toLowerCase()));
  const out: ExamQuestion[] = [];

  if (formats.includes("mcq")) {
    for (const fact of facts) {
      if (got.mcq >= target.mcq) break;
      const q = mcqFromFact(fact, facts);
      if (!q) continue;
      if (uniquePush(out, q, seen)) got.mcq += 1;
    }
    const unused = sentences.filter((s) => !seen.has(s.toLowerCase()));
    for (const s of unused) {
      if (got.mcq >= target.mcq) break;
      const q = mcqFromSentence(
        s,
        unused.filter((x) => x !== s),
      );
      if (!q) continue;
      if (uniquePush(out, q, seen)) got.mcq += 1;
    }
  }

  if (formats.includes("gap")) {
    for (const fact of facts) {
      if (got.gap >= target.gap) break;
      const q: ExamQuestion = {
        id: uid(),
        kind: "gap",
        stem: `${fact.subject} ${fact.verb} _____.`,
        answers: [fact.object, fact.object.replace(/^the /i, "")],
        explanation: fact.sentence,
      };
      if (uniquePush(out, q, seen)) got.gap += 1;
    }
    for (const s of sentences) {
      if (got.gap >= target.gap) break;
      const blank = blankNoun(s);
      if (!blank) continue;
      const q: ExamQuestion = {
        id: uid(),
        kind: "gap",
        stem: blank.stem,
        answers: [blank.answer, blank.answer.toLowerCase()],
        explanation: s,
      };
      if (uniquePush(out, q, seen)) got.gap += 1;
    }
  }

  if (formats.includes("theory")) {
    const usedSubjects = new Set<string>();
    for (const fact of facts) {
      if (got.theory >= target.theory) break;
      const key = fact.subject.toLowerCase();
      if (usedSubjects.has(key)) continue;
      usedSubjects.add(key);
      const q: ExamQuestion = {
        id: uid(),
        kind: "theory",
        stem: `Describe ${fact.subject}.`,
        marks: 5,
        markingPoints: [fact.sentence],
        modelAnswer: fact.sentence,
        explanation: "Taken from your notes.",
      };
      if (uniquePush(out, q, seen)) got.theory += 1;
    }
    for (const s of sentences) {
      if (got.theory >= target.theory) break;
      const q: ExamQuestion = {
        id: uid(),
        kind: "theory",
        stem: `Explain this point from the notes: “${s.slice(0, 140)}${s.length > 140 ? "…" : ""}”`,
        marks: 5,
        markingPoints: [s],
        modelAnswer: s,
        explanation: "Taken from your notes.",
      };
      if (uniquePush(out, q, seen)) got.theory += 1;
    }
  }

  return out;
}

export function answerFromNotes(query: string, sources: string[]) {
  const terms = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 3 && !STOP.has(t));
  if (terms.length === 0 || sources.length === 0) return null;
  const scored: { s: string; n: number }[] = [];
  for (const source of sources) {
    for (const s of sentencesOf(source)) {
      const low = s.toLowerCase();
      const n = terms.reduce((acc, t) => acc + (low.includes(t) ? 1 : 0), 0);
      if (n > 0) scored.push({ s, n });
    }
  }
  scored.sort((a, b) => b.n - a.n);
  const unique: string[] = [];
  for (const row of scored) {
    if (unique.includes(row.s)) continue;
    unique.push(row.s);
    if (unique.length >= 4) break;
  }
  if (unique.length === 0) return null;
  return `Grok usage is paused, so this is from your uploaded notes:\n\n${unique.map((s) => `• ${s}`).join("\n\n")}`;
}

export const OFFLINE_CHAT =
  "Grok usage is paused on this plan, but LIPRO is still open.\n\n**Still works with no Grok quota**\n- Exam → Practice and Exam modes\n- Papers already on this device\n- New papers from pasted notes (written on-device)\n- Saved images and threads\n\nOpen **Exam** to keep studying.";
