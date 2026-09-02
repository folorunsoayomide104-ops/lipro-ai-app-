import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { SignedIn, SignedOut, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Product" },
  { to: "/about", label: "About" },
] as const;

export function SiteShell({
  children,
  current,
}: {
  children: ReactNode;
  current?: "home" | "about";
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-5 md:h-[4.25rem] md:px-8">
          <Wordmark />
          <nav className="ml-auto flex items-center gap-1 sm:gap-2">
            {NAV.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                hash={item.label === "Product" ? "product" : undefined}
                className={cn(
                  "hidden h-9 items-center rounded-full px-3 text-sm text-muted transition-colors hover:text-fg sm:inline-flex",
                  current === "home" && item.label === "Product" && "text-fg",
                  current === "about" && item.label === "About" && "text-fg",
                )}
              >
                {item.label}
              </Link>
            ))}
            <SiteAuthActions />
          </nav>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-5 py-10 md:flex-row md:items-end md:justify-between md:px-8">
          <div>
            <p className="font-display text-2xl tracking-tight">LIPRO</p>
            <p className="mt-1 text-sm text-subtle">Life in progress.</p>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted">
            <Link to="/" className="hover:text-fg">
              Home
            </Link>
            <Link to="/about" className="hover:text-fg">
              About
            </Link>
            <Link to="/app" className="hover:text-fg">
              Studio
            </Link>
            <Link to="/admin" className="hover:text-fg">
              Admin
            </Link>
            <Link to="/login" className="hover:text-fg">
              Sign in
            </Link>
          </div>
          <p className="text-xs text-subtle">Private by default. Notes stay on this device.</p>
        </div>
      </footer>
    </div>
  );
}

function SiteAuthActions() {
  const { user, isPending } = useCurrentUserState();
  if (isPending) {
    return <div className="h-9 w-24 animate-pulse rounded-full bg-elevated" />;
  }
  return (
    <>
      <SignedOut>
        <Button asChild size="sm" variant="secondary">
          <Link to="/login">Sign in</Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/app" aria-label="Open studio">
            <span className="sm:hidden">Studio</span>
            <span className="hidden sm:inline">Open studio</span>
          </Link>
        </Button>
      </SignedOut>
      <SignedIn>
        {user ? <UserButton /> : null}
        <Button asChild size="sm">
          <Link to="/app">Studio</Link>
        </Button>
      </SignedIn>
    </>
  );
}
