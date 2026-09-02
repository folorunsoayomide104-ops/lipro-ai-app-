import { Fragment } from "react";
import { cn } from "@/lib/utils";

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
          return (
            <strong key={i} className="font-semibold text-fg">
              {part.slice(2, -2)}
            </strong>
          );
        }
        if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
          return (
            <code
              key={i}
              className="rounded-xs bg-elevated px-1 py-0.5 font-mono text-sm text-primary"
            >
              {part.slice(1, -1)}
            </code>
          );
        }
        if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
          return (
            <em key={i} className="italic">
              {part.slice(1, -1)}
            </em>
          );
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </>
  );
}

function Paragraph({ text }: { text: string }) {
  const lines = text.split("\n");
  const isList = lines.every((l) => !l.trim() || /^[-*]\s+/.test(l) || /^\d+\.\s+/.test(l));
  if (isList && lines.some((l) => l.trim())) {
    return (
      <ul className="space-y-1.5 pl-5">
        {lines
          .filter((l) => l.trim())
          .map((l, i) => (
            <li key={i} className="list-disc text-pretty marker:text-subtle">
              <Inline text={l.replace(/^[-*]\s+/, "").replace(/^\d+\.\s+/, "")} />
            </li>
          ))}
      </ul>
    );
  }
  return (
    <p className="text-pretty leading-normal">
      <Inline text={text} />
    </p>
  );
}

export function MessageContent({
  text,
  streaming,
}: {
  text: string;
  streaming?: boolean;
}) {
  if (!text && streaming) {
    return <p className="shimmer-text text-sm">Listening</p>;
  }

  const chunks = text.split(/```/);
  return (
    <div className="space-y-3 text-sm leading-normal text-fg md:text-base">
      {chunks.map((chunk, i) => {
        if (i % 2 === 1) {
          const nl = chunk.indexOf("\n");
          const code = nl === -1 ? chunk : chunk.slice(nl + 1);
          return (
            <pre
              key={i}
              className={cn(
                "overflow-x-auto rounded-lg bg-elevated p-4 font-mono text-sm leading-snug text-primary",
                "shadow-[var(--shadow-border)]",
              )}
            >
              <code>{code.replace(/\n$/, "")}</code>
            </pre>
          );
        }
        const blocks = chunk.split(/\n{2,}/).filter((b) => b.trim());
        return blocks.map((block, j) => {
          const heading = /^(#{1,3})\s+(.+)$/.exec(block.trim());
          if (heading?.[1] && heading[2]) {
            const Tag = heading[1].length === 1 ? "h3" : "h4";
            return (
              <Tag
                key={`${i}-${j}`}
                className="font-display text-xl font-medium tracking-tight text-fg"
              >
                {heading[2]}
              </Tag>
            );
          }
          return <Paragraph key={`${i}-${j}`} text={block} />;
        });
      })}
      {streaming ? (
        <span className="caret-pulse ml-0.5 inline-block h-4 w-px translate-y-0.5 bg-primary" aria-hidden />
      ) : null}
    </div>
  );
}
