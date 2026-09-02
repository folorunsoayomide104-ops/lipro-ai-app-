import { Link } from "@tanstack/react-router";
import { Mark } from "@/components/brand";
import { SiteShell } from "@/components/site/site-shell";
import { Button } from "@/components/ui/button";

const FEATURES = [
  {
    kicker: "Chat",
    title: "Think with a lens.",
    body: "LIPRO, Muse, Scholar, Maker, Confidant. Grok answers in the voice you pick — clear, not theatrical.",
  },
  {
    kicker: "Exam",
    title: "Sit a paper from your notes.",
    body: "Upload a lecture. Choose MCQ, fill the gap, theory, or a mix. Practice with checks, or a timed exam that submits itself.",
  },
  {
    kicker: "Cards",
    title: "Flip until it sticks.",
    body: "Decks from the same notes — or from a paper you just sat. Got it, or again. Weak cards keep coming back.",
  },
  {
    kicker: "Imagine",
    title: "See it before you say it.",
    body: "One image at a time. Quiet prompts. Keep what you make.",
  },
];

const STEPS = [
  { n: "01", title: "Bring the material", body: "PDF, Word, or paste. The engine reads what you actually studied." },
  { n: "02", title: "Write the work", body: "A paper of 10 to 100, or a deck. Exam-style items, not trivia." },
  { n: "03", title: "Sit it. Flip it.", body: "Timed or practice. Cards in boxes. Review the scheme when you’re done." },
];

export function HomePage() {
  return (
    <SiteShell current="home">
      <section className="mx-auto flex w-full max-w-6xl flex-col px-5 pb-20 pt-16 md:px-8 md:pb-28 md:pt-24">
        <Mark className="size-10 text-primary aether-rise" />
        <h1 className="mt-8 max-w-3xl font-display text-6xl leading-[0.92] tracking-tight text-fg aether-rise aether-rise-delay-1 md:text-8xl">
          Life in
          <br />
          progress.
        </h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-muted aether-rise aether-rise-delay-2 md:text-lg">
          LIPRO is a private studio for thinking, examining, and remembering — with Grok in the
          room. Built for people who study like it matters.
        </p>
        <div className="mt-10 flex flex-wrap gap-3 aether-rise aether-rise-delay-3">
          <Button asChild>
            <Link to="/app">Open studio</Link>
          </Button>
          <Button asChild variant="secondary">
            <a href="#product">See the product</a>
          </Button>
        </div>
      </section>

      <section
        id="product"
        className="border-t border-border scroll-mt-20"
      >
        <div className="mx-auto w-full max-w-6xl px-5 py-20 md:px-8 md:py-24">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">Product</p>
          <h2 className="mt-3 max-w-lg font-display text-4xl tracking-tight md:text-5xl">
            Four rooms. One studio.
          </h2>
          <div className="mt-12 grid gap-3 md:grid-cols-2">
            {FEATURES.map((item) => (
              <article
                key={item.kicker}
                className="rounded-xl bg-surface px-6 py-7 shadow-[var(--shadow-border)] md:px-8 md:py-8"
              >
                <p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">
                  {item.kicker}
                </p>
                <h3 className="mt-4 font-display text-2xl tracking-tight md:text-3xl">{item.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-muted md:text-base">{item.body}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 md:px-8 md:py-24">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-subtle">Method</p>
          <h2 className="mt-3 font-display text-4xl tracking-tight md:text-5xl">How a session goes.</h2>
          <ol className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
            {STEPS.map((step) => (
              <li key={step.n}>
                <p className="font-mono text-xs text-primary">{step.n}</p>
                <h3 className="mt-3 font-display text-2xl tracking-tight">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start gap-6 px-5 py-20 md:flex-row md:items-end md:justify-between md:px-8 md:py-24">
          <div className="max-w-xl">
            <p className="font-display text-3xl tracking-tight md:text-4xl">
              Threads, papers, and decks stay on this device.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-muted">
              No account. No feed. Open the studio when you are ready to work.
            </p>
          </div>
          <Button asChild>
            <Link to="/app">Open studio</Link>
          </Button>
        </div>
      </section>
    </SiteShell>
  );
}
