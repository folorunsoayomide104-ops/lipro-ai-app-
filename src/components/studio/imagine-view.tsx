import { useState } from "react";
import { ImageIcon, LoaderCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { generateImage } from "@/lib/ai";
import {
  IMAGE_STARTERS,
  useStudioStore,
  type AspectRatio,
} from "@/lib/studio-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const RATIOS: { id: AspectRatio; label: string }[] = [
  { id: "1:1", label: "1:1" },
  { id: "16:9", label: "16:9" },
  { id: "3:2", label: "3:2" },
  { id: "9:16", label: "9:16" },
];

export function ImagineView() {
  const images = useStudioStore((s) => s.images);
  const aspectRatio = useStudioStore((s) => s.aspectRatio);
  const setAspectRatio = useStudioStore((s) => s.setAspectRatio);
  const addImage = useStudioStore((s) => s.addImage);
  const removeImage = useStudioStore((s) => s.removeImage);
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(nextPrompt: string) {
    const trimmed = nextPrompt.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const result = await generateImage({
        data: { prompt: trimmed, aspectRatio },
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      addImage({
        id: crypto.randomUUID(),
        prompt: trimmed,
        url: result.url,
        aspectRatio,
        createdAt: Date.now(),
      });
      setPrompt("");
    } catch {
      toast.error("Image generation failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-6 pt-4 md:px-8">
      <header className="mb-6 aether-rise">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">Imagine</p>
        <h2 className="mt-2 font-display text-3xl tracking-tight text-fg md:text-4xl">
          See it before you say it.
        </h2>
        <p className="mt-2 max-w-md text-sm leading-normal text-muted">
          One image at a time. Quiet, specific prompts work better than long ones.
        </p>
      </header>

      <form
        className="rounded-xl bg-surface p-2 shadow-[var(--shadow-border)] aether-rise aether-rise-delay-1"
        onSubmit={(e) => {
          e.preventDefault();
          void run(prompt);
        }}
      >
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="A still room, late light, one open book"
          rows={3}
          maxLength={1500}
          className="min-h-20 px-3 py-2"
          disabled={busy}
        />
        <div className="flex flex-wrap items-center gap-2 px-1 pb-1 pt-2">
          <div className="flex rounded-md bg-elevated p-1 shadow-[var(--shadow-border)]">
            {RATIOS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setAspectRatio(r.id)}
                className={cn(
                  "h-8 rounded-sm px-2.5 text-xs font-medium transition-colors duration-150",
                  aspectRatio === r.id
                    ? "bg-primary text-primary-fg"
                    : "text-muted hover:text-fg",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <div className="ml-auto">
            <Button type="submit" disabled={busy || !prompt.trim()} size="sm">
              {busy ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  Making
                </>
              ) : (
                <>
                  <ImageIcon className="size-4" />
                  Generate
                </>
              )}
            </Button>
          </div>
        </div>
      </form>

      {images.length === 0 && !busy ? (
        <div className="mt-6 flex flex-col gap-2 aether-rise aether-rise-delay-2">
          {IMAGE_STARTERS.map((starter) => (
            <button
              key={starter}
              type="button"
              onClick={() => {
                setPrompt(starter);
                void run(starter);
              }}
              className="rounded-lg bg-surface px-4 py-3 text-left text-sm text-muted shadow-[var(--shadow-border)] transition-[color,box-shadow] duration-150 hover:text-fg hover:shadow-[var(--shadow-border-hover)]"
            >
              {starter}
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {busy ? (
            <div className="flex aspect-square items-center justify-center rounded-xl bg-surface shadow-[var(--shadow-border)]">
              <p className="shimmer-text text-sm">Composing the frame</p>
            </div>
          ) : null}
          {images.map((img) => (
            <figure
              key={img.id}
              className="group relative overflow-hidden rounded-xl bg-surface shadow-[var(--shadow-border)]"
            >
              <img
                src={img.url}
                alt={img.prompt}
                crossOrigin="anonymous"
                className="aspect-square w-full object-cover outline outline-1 -outline-offset-1 outline-fg/10"
              />
              <figcaption className="flex items-start justify-between gap-3 px-3 py-3">
                <p className="line-clamp-2 text-xs leading-normal text-muted">{img.prompt}</p>
                <button
                  type="button"
                  aria-label="Remove image"
                  onClick={() => removeImage(img.id)}
                  className="size-9 shrink-0 rounded-sm text-subtle transition-colors hover:bg-elevated hover:text-fg"
                >
                  <Trash2 className="mx-auto size-4" />
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
