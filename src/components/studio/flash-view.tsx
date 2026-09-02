import { useRef, useState } from "react";
import { Layers, LoaderCircle, RotateCcw, Upload } from "lucide-react";
import { toast } from "sonner";
import { chunkText } from "@/lib/exam-types";
import { generateFlashBatch } from "@/lib/flash-generate";
import { CARD_COUNTS, dueCount, type FlashCard, type FlashDeck } from "@/lib/flash-types";
import { useActiveDeck, useStudioStore } from "@/lib/studio-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

function titleFromSource(name: string) {
  const base = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  return base ? `${base} cards` : "Flashcards";
}

async function extractFile(file: File) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/exam/extract", { method: "POST", body: form });
  const body = (await res.json()) as { text?: string; name?: string; error?: string };
  if (!res.ok || !body.text) throw new Error(body.error || "Could not read that file.");
  return { text: body.text, name: body.name || file.name };
}

function SetupDeck({ onBuilt }: { onBuilt: (deck: FlashDeck) => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [extracted, setExtracted] = useState("");
  const [paste, setPaste] = useState("");
  const [count, setCount] = useState(20);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const sourceText = extracted || paste.trim();

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
    setBusy(true);
    setProgress({ done: 0, total: count });
    const chunks = chunkText(sourceText);
    const cards: FlashCard[] = [];
    let empty = 0;
    try {
      for (let round = 0; round < 12 && cards.length < count; round += 1) {
        const need = Math.min(10, count - cards.length);
        const result = await generateFlashBatch({
          data: {
            excerpt: chunks[round % chunks.length],
            count: need,
            exclude: cards.map((c) => c.front).slice(-20),
          },
        });
        if (!result.ok) {
          if (cards.length === 0) {
            toast.error(result.error);
            return;
          }
          break;
        }
        const before = cards.length;
        for (const card of result.cards) {
          if (cards.some((c) => c.front === card.front)) continue;
          cards.push(card);
          if (cards.length >= count) break;
        }
        setProgress({ done: cards.length, total: count });
        if (cards.length === before) {
          empty += 1;
          if (empty >= 2) break;
        } else empty = 0;
      }
      if (cards.length === 0) {
        toast.error("Could not write cards from those notes.");
        return;
      }
      const sourceName = fileName ?? "Pasted notes";
      onBuilt({
        id: crypto.randomUUID(),
        title: titleFromSource(sourceName),
        sourceName,
        cards,
        createdAt: Date.now(),
      });
      toast.success(`${cards.length} cards ready.`);
    } catch {
      toast.error("Generation stopped. Try fewer cards.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-10 pt-4 md:px-8">
      <header className="mb-8 aether-rise">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">Cards</p>
        <h2 className="mt-2 font-display text-3xl tracking-tight text-fg md:text-4xl">
          Flip until it sticks.
        </h2>
        <p className="mt-2 max-w-lg text-sm leading-normal text-muted">
          Upload notes. LIPRO writes a deck. Front is the prompt, back is the answer.
          Rate Got it or Again.
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
          <span className="mt-1 text-xs text-subtle">Or paste notes below</span>
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
        <p className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">How many</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {CARD_COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setCount(n)}
              className={cn(
                "h-11 min-w-14 rounded-full px-4 text-sm font-medium transition-colors",
                count === n
                  ? "bg-primary text-primary-fg"
                  : "bg-surface text-muted shadow-[var(--shadow-border)] hover:text-fg",
              )}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-8 flex items-center gap-3">
        <Button type="button" onClick={() => void build()} disabled={busy || !sourceText}>
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Layers className="size-4" />}
          {busy ? "Writing deck" : "Write deck"}
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

function StudyDeck({ deck }: { deck: FlashDeck }) {
  const rateCard = useStudioStore((s) => s.rateCard);
  const resetDeck = useStudioStore((s) => s.resetDeck);
  const selectDeck = useStudioStore((s) => s.selectDeck);
  const [queue, setQueue] = useState(() =>
    [...deck.cards].sort((a, b) => a.box - b.box),
  );
  const [flipped, setFlipped] = useState(false);
  const card = queue[0];
  const remaining = queue.length;
  const known = deck.cards.filter((c) => c.box === 3).length;

  function advance(knew: boolean) {
    if (!card) return;
    rateCard(deck.id, card.id, knew);
    setFlipped(false);
    setQueue((q) => {
      const [, ...rest] = q;
      if (knew) return rest;
      return [...rest, { ...card, box: 1 }];
    });
  }

  if (!card) {
    return (
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-12 text-center">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">Deck done</p>
        <h2 className="mt-3 font-display text-4xl tracking-tight">That’s the set.</h2>
        <p className="mt-3 text-sm text-muted">
          {known} of {deck.cards.length} in the known box.
        </p>
        <div className="mt-8 flex justify-center gap-2">
          <Button type="button" onClick={() => resetDeck(deck.id)}>
            <RotateCcw className="size-4" />
            Study again
          </Button>
          <Button type="button" variant="secondary" onClick={() => selectDeck(null)}>
            New deck
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pb-10 pt-4 md:px-8">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">
            Box {card.box} · {remaining} left
          </p>
          <p className="mt-1 text-sm text-muted">{deck.title}</p>
        </div>
        <p className="text-xs text-subtle">{known} known</p>
      </div>

      <div className="mb-5 h-1 overflow-hidden rounded-full bg-elevated">
        <div
          className="h-full bg-primary transition-[width] duration-200"
          style={{
            width: `${((deck.cards.length - remaining + (flipped ? 0.5 : 0)) / deck.cards.length) * 100}%`,
          }}
        />
      </div>

      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        className="flex min-h-[320px] w-full flex-col justify-center rounded-xl bg-surface px-6 py-10 text-left shadow-[var(--shadow-border)] transition-colors md:px-10"
        aria-label={flipped ? "Show prompt" : "Show answer"}
      >
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">
          {flipped ? "Answer" : "Prompt"}
        </p>
        {flipped ? (
          <p className="mt-4 whitespace-pre-wrap text-base leading-relaxed text-fg md:text-lg">
            {card.back}
          </p>
        ) : (
          <p className="mt-4 font-display text-2xl leading-snug tracking-tight text-fg md:text-3xl">
            {card.front}
          </p>
        )}
        <p className="mt-8 text-xs text-subtle">{flipped ? "Tap to see prompt" : "Tap to flip"}</p>
      </button>

      <div className="mt-6 grid grid-cols-2 gap-2">
        <Button type="button" variant="secondary" disabled={!flipped} onClick={() => advance(false)}>
          Again
        </Button>
        <Button type="button" disabled={!flipped} onClick={() => advance(true)}>
          Got it
        </Button>
      </div>
    </div>
  );
}

export function FlashView() {
  const deck = useActiveDeck();
  const saveDeck = useStudioStore((s) => s.saveDeck);
  if (!deck) return <SetupDeck onBuilt={saveDeck} />;
  return <StudyDeck deck={deck} />;
}

export { dueCount };
