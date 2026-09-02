import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  Flag,
  LoaderCircle,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { generateExamBatch } from "@/lib/exam-generate";
import {
  allocateFormats,
  chunkText,
  COUNT_PRESETS,
  defaultExamMinutes,
  EXAM_MINUTES,
  FORMAT_META,
  gapMatches,
  rebalancePaperKeys,
  scorePaper,
  type ExamPaper,
  type ExamQuestion,
  type QuestionKind,
  type SitMode,
} from "@/lib/exam-types";
import { useActiveExam, useStudioStore } from "@/lib/studio-store";
import { cardsFromPaper } from "@/lib/flash-types";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const LETTERS = ["A", "B", "C", "D"] as const;

function formatClock(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function ModePicker({
  sitMode,
  minutes,
  onMode,
  onMinutes,
}: {
  sitMode: SitMode;
  minutes: number;
  onMode: (mode: SitMode) => void;
  onMinutes: (n: number) => void;
}) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">Sit as</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => onMode("practice")}
          className={cn(
            "rounded-lg px-4 py-3 text-left shadow-[var(--shadow-border)] transition-colors",
            sitMode === "practice" ? "bg-primary text-primary-fg" : "bg-surface text-muted hover:text-fg",
          )}
        >
          <span className="block text-sm font-medium">Practice</span>
          <span className={cn("mt-1 block text-xs", sitMode === "practice" ? "text-primary-fg/70" : "text-subtle")}>
            No clock. Check each answer as you go.
          </span>
        </button>
        <button
          type="button"
          onClick={() => onMode("exam")}
          className={cn(
            "rounded-lg px-4 py-3 text-left shadow-[var(--shadow-border)] transition-colors",
            sitMode === "exam" ? "bg-primary text-primary-fg" : "bg-surface text-muted hover:text-fg",
          )}
        >
          <span className="block text-sm font-medium">Exam</span>
          <span className={cn("mt-1 block text-xs", sitMode === "exam" ? "text-primary-fg/70" : "text-subtle")}>
            Timed. Auto-submits when the clock hits zero.
          </span>
        </button>
      </div>
      {sitMode === "exam" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAM_MINUTES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onMinutes(n)}
              className={cn(
                "h-11 min-w-14 rounded-full px-4 text-sm font-medium transition-colors",
                minutes === n
                  ? "bg-primary text-primary-fg"
                  : "bg-surface text-muted shadow-[var(--shadow-border)] hover:text-fg",
              )}
            >
              {n} min
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function titleFromSource(name: string) {
  const base = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base ? `${base} paper` : "Exam paper";
}

function batchNeed(
  remaining: Record<QuestionKind, number>,
  cap = 10,
): Record<QuestionKind, number> {
  const total = remaining.mcq + remaining.gap + remaining.theory;
  if (total <= cap) return { ...remaining };
  const formats = (Object.keys(remaining) as QuestionKind[]).filter((k) => remaining[k] > 0);
  const out: Record<QuestionKind, number> = { mcq: 0, gap: 0, theory: 0 };
  let left = cap;
  for (const kind of formats) {
    const share = Math.max(1, Math.round((remaining[kind] / total) * cap));
    const take = Math.min(remaining[kind], share, left);
    out[kind] = take;
    left -= take;
  }
  if (left > 0) {
    for (const kind of formats) {
      const extra = Math.min(left, remaining[kind] - out[kind]);
      if (extra > 0) {
        out[kind] += extra;
        left -= extra;
      }
    }
  }
  return out;
}

async function extractFile(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/exam/extract", { method: "POST", body: form });
  const body = (await res.json()) as { text?: string; name?: string; error?: string };
  if (!res.ok || !body.text) throw new Error(body.error || "Could not read that file.");
  return { text: body.text, name: body.name || file.name };
}

function SetupForm({
  onBuilt,
}: {
  onBuilt: (paper: ExamPaper) => void;
}) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [extracted, setExtracted] = useState("");
  const [paste, setPaste] = useState("");
  const [formats, setFormats] = useState<QuestionKind[]>(["mcq", "gap", "theory"]);
  const [count, setCount] = useState(20);
  const [sitMode, setSitMode] = useState<SitMode>("exam");
  const [minutes, setMinutes] = useState(defaultExamMinutes(20));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const abortRef = useRef(false);

  const sourceText = extracted || paste.trim();

  function toggleFormat(kind: QuestionKind) {
    setFormats((current) =>
      current.includes(kind) ? current.filter((k) => k !== kind) : [...current, kind],
    );
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const result = await extractFile(file);
      setExtracted(result.text);
      setFileName(result.name);
      toast.success("Notes loaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setBusy(false);
    }
  }

  async function build() {
    if (!sourceText || busy) return;
    if (formats.length === 0) {
      toast.error("Pick at least one question format.");
      return;
    }
    abortRef.current = false;
    setBusy(true);
    setProgress({ done: 0, total: count });
    const chunks = chunkText(sourceText);
    const target = allocateFormats(count, formats);
    const got: Record<QuestionKind, number> = { mcq: 0, gap: 0, theory: 0 };
    const questions: ExamQuestion[] = [];
    let emptyStreak = 0;

    try {
      for (let round = 0; round < 16; round += 1) {
        if (abortRef.current) break;
        const remaining: Record<QuestionKind, number> = {
          mcq: Math.max(0, target.mcq - got.mcq),
          gap: Math.max(0, target.gap - got.gap),
          theory: Math.max(0, target.theory - got.theory),
        };
        const need = batchNeed(remaining);
        const needTotal = need.mcq + need.gap + need.theory;
        if (needTotal === 0) break;

        const excerpt = chunks[round % chunks.length];
        const result = await generateExamBatch({
          data: {
            excerpt,
            need,
            exclude: questions.map((q) => q.stem).slice(-24),
          },
        });

        if (!result.ok) {
          if (questions.length === 0) {
            toast.error(result.error);
            return;
          }
          break;
        }

        const before = questions.length;
        for (const q of result.questions) {
          if (got[q.kind] >= target[q.kind]) continue;
          if (questions.some((e) => e.stem === q.stem)) continue;
          questions.push(q);
          got[q.kind] += 1;
        }

        setProgress({ done: questions.length, total: count });
        if (questions.length === before) {
          emptyStreak += 1;
          if (emptyStreak >= 2) break;
        } else {
          emptyStreak = 0;
        }
      }

      if (questions.length === 0) {
        toast.error("Could not write a paper from those notes.");
        return;
      }

      const sourceName = fileName ?? "Pasted notes";
      onBuilt({
        id: crypto.randomUUID(),
        title: titleFromSource(sourceName),
        sourceName,
        formats,
        questions,
        createdAt: Date.now(),
        attempt: {
          answers: {},
          flagged: [],
          revealed: [],
          mode: sitMode,
          durationMs: sitMode === "exam" ? minutes * 60_000 : undefined,
          startedAt: Date.now(),
        },
      });
      toast.success(`${questions.length} questions ready.`);
    } catch {
      toast.error("Generation stopped. Try a smaller paper.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-10 pt-4 md:px-8">
      <header className="mb-8 aether-rise">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">Exam</p>
        <h2 className="mt-2 font-display text-3xl tracking-tight text-fg md:text-4xl">
          Sit a paper from your notes.
        </h2>
        <p className="mt-2 max-w-lg text-sm leading-normal text-muted">
          Upload a document. Pick MCQ, fill the gap, theory — or mix them. LIPRO writes
          exam-style questions from what you actually studied.
        </p>
      </header>

      <div
        className="rounded-xl bg-surface p-6 shadow-[var(--shadow-border)] aether-rise aether-rise-delay-1"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          void onFile(e.dataTransfer.files[0]);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.docx,.txt,.md,application/pdf,text/plain"
          className="hidden"
          onChange={(e) => void onFile(e.target.files?.[0])}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="flex w-full flex-col items-center rounded-lg border border-dashed border-border-strong px-4 py-10 text-center transition-colors hover:border-primary/50 hover:bg-elevated/40"
        >
          <Upload className="size-6 text-primary" />
          <span className="mt-3 text-sm font-medium text-fg">
            {fileName ?? "Drop a PDF, Word, or text file"}
          </span>
          <span className="mt-1 text-xs text-subtle">Up to 12 MB · or paste notes below</span>
        </button>

        <Textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          placeholder="Paste lecture notes if you have no file"
          rows={5}
          className="mt-4 max-h-48 min-h-28 rounded-md bg-elevated px-3 py-3 text-sm"
          disabled={busy}
        />
      </div>

      <div className="mt-8 aether-rise aether-rise-delay-2">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">Formats</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {FORMAT_META.map((item) => {
            const on = formats.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => toggleFormat(item.id)}
                className={cn(
                  "rounded-lg px-4 py-3 text-left shadow-[var(--shadow-border)] transition-colors",
                  on ? "bg-primary text-primary-fg" : "bg-surface text-muted hover:text-fg",
                )}
              >
                <span className="block text-sm font-medium">{item.label}</span>
                <span className={cn("mt-1 block text-xs", on ? "text-primary-fg/70" : "text-subtle")}>
                  {item.hint}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-8 aether-rise aether-rise-delay-3">
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">How many</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {COUNT_PRESETS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                setCount(n);
                setMinutes(defaultExamMinutes(n));
              }}
              className={cn(
                "h-11 min-w-14 rounded-full px-4 text-sm font-medium transition-colors",
                count === n ? "bg-primary text-primary-fg" : "bg-surface text-muted shadow-[var(--shadow-border)] hover:text-fg",
              )}
            >
              {n}
            </button>
          ))}
        </div>
        {count >= 50 ? (
          <p className="mt-3 text-xs text-subtle">
            {count} questions uses more Grok usage. 20 is a solid paper.
          </p>
        ) : null}
      </div>

      <div className="mt-8 aether-rise aether-rise-delay-3">
        <ModePicker
          sitMode={sitMode}
          minutes={minutes}
          onMode={setSitMode}
          onMinutes={setMinutes}
        />
      </div>

      <div className="mt-8 flex items-center gap-3">
        <Button
          type="button"
          onClick={() => void build()}
          disabled={busy || !sourceText || formats.length === 0}
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : null}
          {busy ? "Writing paper" : "Write paper"}
        </Button>
        {busy && progress.total > 0 ? (
          <p className="text-sm text-muted">
            {progress.done} / {progress.total}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function SitExam({ paper }: { paper: ExamPaper }) {
  const [index, setIndex] = useState(0);
  const setAnswer = useStudioStore((s) => s.setExamAnswer);
  const toggleFlag = useStudioStore((s) => s.toggleExamFlag);
  const submitExam = useStudioStore((s) => s.submitExam);
  const reveal = useStudioStore((s) => s.revealExamQuestion);
  const question = paper.questions[index];
  const attempt = paper.attempt;
  const isPractice = attempt?.mode === "practice";
  const durationMs = !isPractice ? attempt?.durationMs : undefined;
  const answered = question ? attempt?.answers[question.id] : undefined;
  const flagged = question ? Boolean(attempt?.flagged.includes(question.id)) : false;
  const shown = question ? Boolean(attempt?.revealed.includes(question.id)) : false;
  const unanswered = paper.questions.filter((q) => attempt?.answers[q.id] === undefined).length;
  const submittedRef = useRef(false);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!durationMs || !attempt?.startedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [durationMs, attempt?.startedAt]);

  const remaining =
    durationMs && attempt?.startedAt ? Math.max(0, attempt.startedAt + durationMs - now) : null;

  useEffect(() => {
    if (remaining !== 0 || submittedRef.current) return;
    submittedRef.current = true;
    submitExam(paper.id);
    toast.message("Time is up. Paper submitted.");
  }, [remaining, paper.id, submitExam]);

  if (!question) return null;

  function go(next: number) {
    setIndex(Math.max(0, Math.min(paper.questions.length - 1, next)));
  }

  function finish() {
    if (submittedRef.current) return;
    submittedRef.current = true;
    submitExam(paper.id);
    toast.success("Paper submitted.");
  }

  const lowTime = remaining !== null && remaining <= 60_000;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-8 pt-4 md:px-8">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">
            {isPractice ? "Practice" : "Exam"}
            {" · "}
            {question.kind === "mcq" ? "MCQ" : question.kind === "gap" ? "Fill the gap" : "Theory"}
            {question.marks ? ` · ${question.marks} marks` : ""}
          </p>
          <p className="mt-1 text-sm text-muted">
            Question {index + 1} of {paper.questions.length}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {remaining !== null ? (
            <span
              className={cn(
                "font-mono text-sm tabular-nums",
                lowTime ? "text-danger" : "text-fg",
              )}
            >
              {formatClock(remaining)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => toggleFlag(paper.id, question.id)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-medium",
              flagged ? "bg-primary text-primary-fg" : "bg-surface text-muted shadow-[var(--shadow-border)]",
            )}
          >
            <Flag className="size-3.5" />
            Flag
          </button>
        </div>
      </div>

      <div className="mb-6 h-1 overflow-hidden rounded-full bg-elevated">
        <div
          className="h-full bg-primary transition-[width] duration-200"
          style={{ width: `${((index + 1) / paper.questions.length) * 100}%` }}
        />
      </div>

      <h3 className="font-display text-2xl leading-snug tracking-tight text-fg md:text-3xl">
        {question.stem}
      </h3>

      <div className="mt-8 flex-1">
        {question.kind === "mcq" && question.options ? (
          <div className="flex flex-col gap-2">
            {question.options.map((option, i) => {
              const selected = answered === i;
              const isKey = shown && i === question.answerIndex;
              const isWrongPick = shown && selected && i !== question.answerIndex;
              return (
                <button
                  key={option}
                  type="button"
                  disabled={shown}
                  onClick={() => setAnswer(paper.id, question.id, i)}
                  className={cn(
                    "flex min-h-12 items-start gap-3 rounded-lg px-4 py-3 text-left text-sm leading-normal shadow-[var(--shadow-border)] transition-colors",
                    isKey && "bg-primary text-primary-fg",
                    isWrongPick && "bg-danger/15 text-danger",
                    !shown && selected && "bg-primary text-primary-fg",
                    !shown && !selected && "bg-surface text-fg hover:bg-elevated",
                    shown && !isKey && !isWrongPick && "bg-surface text-muted",
                  )}
                >
                  <span className="mt-0.5 font-mono text-xs">{LETTERS[i]}</span>
                  <span>{option}</span>
                </button>
              );
            })}
          </div>
        ) : null}

        {question.kind === "gap" ? (
          <input
            value={typeof answered === "string" ? answered : ""}
            onChange={(e) => setAnswer(paper.id, question.id, e.target.value)}
            placeholder="Type the missing term"
            disabled={shown}
            className="h-12 w-full rounded-lg bg-surface px-4 text-sm text-fg shadow-[var(--shadow-border)] outline-none placeholder:text-subtle disabled:opacity-70"
          />
        ) : null}

        {question.kind === "theory" ? (
          <Textarea
            value={typeof answered === "string" ? answered : ""}
            onChange={(e) => setAnswer(paper.id, question.id, e.target.value)}
            placeholder="Write your answer"
            rows={8}
            disabled={shown}
            className="min-h-40 rounded-lg bg-surface px-4 py-3 text-sm shadow-[var(--shadow-border)] disabled:opacity-70"
          />
        ) : null}

        {shown ? (
          <div className="mt-5 rounded-lg bg-elevated px-4 py-3 text-sm leading-normal text-muted">
            {question.kind === "mcq" ? (
              <p>
                {answered === question.answerIndex ? "Correct." : "Missed."} Key:{" "}
                <span className="text-fg">
                  {question.options?.[question.answerIndex ?? 0]}
                </span>
              </p>
            ) : null}
            {question.kind === "gap" ? (
              <p>
                {typeof answered === "string" && gapMatches(answered, question.answers ?? [])
                  ? "Correct. "
                  : "Missed. "}
                Accept: <span className="text-fg">{(question.answers ?? []).join(", ")}</span>
              </p>
            ) : null}
            {question.kind === "theory" && question.markingPoints?.length ? (
              <ul className="list-disc space-y-1 pl-5">
                {question.markingPoints.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            ) : null}
            {question.explanation ? <p className="mt-2">{question.explanation}</p> : null}
          </div>
        ) : null}
      </div>

      <div className="mt-8 flex items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Previous"
          disabled={index === 0}
          onClick={() => go(index - 1)}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="icon"
          aria-label="Next"
          disabled={index === paper.questions.length - 1}
          onClick={() => go(index + 1)}
        >
          <ChevronRight className="size-4" />
        </Button>
        {isPractice ? (
          <Button
            type="button"
            variant="secondary"
            disabled={shown}
            onClick={() => reveal(paper.id, question.id)}
          >
            <Eye className="size-4" />
            Check
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-3">
          <p className="hidden text-xs text-subtle sm:block">{unanswered} unanswered</p>
          <Button type="button" onClick={finish}>
            Submit paper
          </Button>
        </div>
      </div>
    </div>
  );
}

function ReviewExam({ paper }: { paper: ExamPaper }) {
  const reset = useStudioStore((s) => s.resetExamAttempt);
  const selectExam = useStudioStore((s) => s.selectExam);
  const saveDeck = useStudioStore((s) => s.saveDeck);
  const scored = useMemo(() => scorePaper(paper), [paper]);
  const pct =
    scored.autoTotal > 0 ? Math.round((scored.autoCorrect / scored.autoTotal) * 100) : null;
  const [minutes, setMinutes] = useState(
    () =>
      Math.round((paper.attempt?.durationMs ?? defaultExamMinutes(paper.questions.length) * 60_000) / 60_000),
  );
  const lastMode = paper.attempt?.mode ?? "exam";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-12 pt-4 md:px-8">
      <header className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">Review</p>
        <h2 className="mt-2 font-display text-3xl tracking-tight md:text-4xl">{paper.title}</h2>
        <p className="mt-3 text-base leading-normal text-fg">
          {lastMode === "practice" ? "Practice" : "Timed exam"}
          {" · "}
          {scored.autoTotal > 0
            ? `MCQ and gaps: ${scored.autoCorrect} / ${scored.autoTotal}${pct !== null ? ` (${pct}%)` : ""}`
            : "No auto-marked items."}
          {scored.theoryCount ? ` · Theory: ${scored.theoryCount} to check against the scheme` : ""}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button type="button" variant="secondary" onClick={() => reset(paper.id, "practice")}>
            Practice
          </Button>
          <Button
            type="button"
            onClick={() => reset(paper.id, "exam", minutes * 60_000)}
          >
            Timed exam · {minutes} min
          </Button>
          <Button type="button" variant="secondary" onClick={() => selectExam(null)}>
            New paper
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const cards = cardsFromPaper(paper);
              if (cards.length === 0) {
                toast.error("No cards in this paper.");
                return;
              }
              saveDeck({
                id: crypto.randomUUID(),
                title: `${paper.title.replace(/ paper$/i, "")} cards`,
                sourceName: paper.sourceName,
                cards,
                createdAt: Date.now(),
              });
              toast.success(`${cards.length} cards from this paper.`);
            }}
          >
            Make cards
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {EXAM_MINUTES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setMinutes(n)}
              className={cn(
                "h-9 rounded-full px-3 text-xs font-medium transition-colors",
                minutes === n
                  ? "bg-primary text-primary-fg"
                  : "bg-surface text-muted shadow-[var(--shadow-border)] hover:text-fg",
              )}
            >
              {n} min
            </button>
          ))}
        </div>
      </header>

      <ol className="flex flex-col gap-6">
        {paper.questions.map((q, i) => {
          const result = scored.results[q.id];
          const given = paper.attempt?.answers[q.id];
          return (
            <li key={q.id} className="rounded-xl bg-surface p-5 shadow-[var(--shadow-border)]">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">
                {i + 1} · {q.kind === "mcq" ? "MCQ" : q.kind === "gap" ? "Fill the gap" : "Theory"}
                {result === true ? " · Correct" : result === false ? " · Missed" : " · Marking scheme"}
              </p>
              <p className="mt-2 text-sm leading-normal text-fg">{q.stem}</p>

              {q.kind === "mcq" && q.options ? (
                <ul className="mt-3 flex flex-col gap-1.5">
                  {q.options.map((option, oi) => {
                    const isAnswer = oi === q.answerIndex;
                    const picked = given === oi;
                    return (
                      <li
                        key={option}
                        className={cn(
                          "rounded-md px-3 py-2 text-sm",
                          isAnswer && "bg-primary/15 text-fg",
                          picked && !isAnswer && "text-danger",
                        )}
                      >
                        <span className="mr-2 font-mono text-xs">{LETTERS[oi]}</span>
                        {option}
                        {isAnswer ? " — key" : picked ? " — your pick" : ""}
                      </li>
                    );
                  })}
                </ul>
              ) : null}

              {q.kind === "gap" ? (
                <p className="mt-3 text-sm text-muted">
                  You wrote:{" "}
                  <span className="text-fg">{typeof given === "string" && given ? given : "—"}</span>
                  <span className="mt-1 block">Accept: {(q.answers ?? []).join(", ")}</span>
                </p>
              ) : null}

              {q.kind === "theory" ? (
                <div className="mt-3 space-y-2 text-sm text-muted">
                  <p>
                    Your answer:{" "}
                    <span className="text-fg">
                      {typeof given === "string" && given.trim() ? given : "—"}
                    </span>
                  </p>
                  {q.markingPoints && q.markingPoints.length > 0 ? (
                    <ul className="list-disc space-y-1 pl-5">
                      {q.markingPoints.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                  ) : null}
                  {q.modelAnswer ? (
                    <p>
                      Model: <span className="text-fg">{q.modelAnswer}</span>
                    </p>
                  ) : null}
                </div>
              ) : null}

              {q.explanation ? (
                <p className="mt-3 flex gap-2 text-sm leading-normal text-muted">
                  <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  {q.explanation}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function CbtView() {
  const paper = useActiveExam();
  const saveExam = useStudioStore((s) => s.saveExam);

  useEffect(() => {
    if (!paper) return;
    const next = rebalancePaperKeys(paper);
    if (next !== paper) saveExam(next);
  }, [paper, saveExam]);

  if (!paper) return <SetupForm onBuilt={saveExam} />;
  if (paper.attempt?.submittedAt) return <ReviewExam paper={paper} />;
  return <SitExam paper={paper} />;
}
