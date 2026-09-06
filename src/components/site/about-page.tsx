import { Link } from "@tanstack/react-router";
import { SiteShell } from "@/components/site/site-shell";
import { Button } from "@/components/ui/button";

export function AboutPage() {
  return (
    <SiteShell current="about">
      <article className="mx-auto w-full max-w-3xl px-5 py-16 md:px-8 md:py-24">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">About</p>
        <h1 className="mt-4 font-display text-4xl tracking-tight md:text-6xl">Life in progress.</h1>
        <div className="mt-10 space-y-6 text-base leading-relaxed text-muted md:text-lg">
          <p className="text-fg">
            LIPRO is a private studio for people who would rather work than perform.
          </p>
          <p>
            Chat when you need a mind in the room. Exam when the notes have to become a paper.
            Cards when they have to stick. Imagine when the sentence is not enough.
          </p>
          <p>
            Papers and decks are written from what you upload — not from a generic bank. Practice
            lets you check as you go. Exam is timed, and it submits when the clock is done.
          </p>
          <p>
            Nothing here is a social product. Threads, scores, and cards live in this browser until
            you clear them. That is the point.
          </p>
        </div>
        <div className="mt-12 flex flex-wrap gap-3">
          <Button asChild>
            <Link to="/app">Open studio</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/">Back home</Link>
          </Button>
        </div>
      </article>
    </SiteShell>
  );
}
