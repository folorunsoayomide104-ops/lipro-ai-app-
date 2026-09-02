import * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full resize-none bg-transparent text-base leading-normal text-fg placeholder:text-subtle",
        "outline-none",
        className,
      )}
      {...props}
    />
  );
}
