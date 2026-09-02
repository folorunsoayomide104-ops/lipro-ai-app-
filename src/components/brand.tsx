import { Link } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function Mark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path
        d="M9 6v20h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

export function Wordmark({
  to = "/",
  compact = false,
}: {
  to?: string;
  compact?: boolean;
}) {
  return (
    <Link to={to} className="flex items-center gap-2.5 text-fg">
      <Mark className={cn("text-primary", compact ? "size-5" : "size-6")} />
      <span className={cn("font-display tracking-tight", compact ? "text-lg" : "text-xl leading-none")}>
        LIPRO
      </span>
    </Link>
  );
}
