import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Mark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { RedirectToSignIn, UserButton } from "@/lib/auth/gates";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { getMyProfile, listDirectory, type StudentRow } from "@/lib/profiles";

function formatWhen(value: string | null) {
  if (!value) return "Never";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function AdminPage() {
  const { user, isPending } = useCurrentUserState();
  const [rows, setRows] = useState<StudentRow[] | null>(null);
  const [stats, setStats] = useState<{
    total: number;
    students: number;
    admins: number;
    schools: number;
    departments: number;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (isPending || !user) return;
    let cancelled = false;
    void (async () => {
      try {
        const profile = await getMyProfile();
        if (cancelled) return;
        if (profile?.role !== "admin") {
          setIsAdmin(false);
          setReady(true);
          return;
        }
        setIsAdmin(true);
        const dir = await listDirectory();
        if (cancelled) return;
        setRows(dir.people);
        setStats(dir.stats);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load directory.");
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPending, user]);

  const filtered = useMemo(() => {
    if (!rows) return [];
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.fullName, r.matric, r.school, r.department, r.role]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [rows, query]);

  if (isPending) {
    return <div className="min-h-dvh bg-bg" />;
  }
  if (!user) return <RedirectToSignIn />;

  if (ready && !isAdmin) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center bg-bg px-5 text-fg">
        <p className="font-display text-3xl tracking-tight">Admin only.</p>
        <p className="mt-2 text-sm text-muted">This directory is for LIPRO admins.</p>
        <Button asChild className="mt-6">
          <Link to="/app">Back to studio</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-bg text-fg">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-5 md:px-8">
          <Link to="/" className="flex items-center gap-2.5">
            <Mark className="size-6 text-primary" />
            <span className="font-display text-xl tracking-tight">LIPRO</span>
          </Link>
          <p className="hidden text-sm text-subtle sm:block">Admin</p>
          <div className="ml-auto flex items-center gap-4">
            <Link to="/app" className="text-sm text-muted hover:text-fg">
              Studio
            </Link>
            <UserButton />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-5 py-10 md:px-8">
        <h1 className="font-display text-4xl tracking-tight md:text-5xl">Who is using LIPRO.</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
          Students sign in with matric number, school, department, and a password.
          Passwords are encrypted. They cannot be viewed or recovered from here.
        </p>

        {stats ? (
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ["Students", stats.students],
              ["Admins", stats.admins],
              ["Schools", stats.schools],
              ["Departments", stats.departments],
            ].map(([label, n]) => (
              <div key={label} className="rounded-xl bg-surface px-4 py-4 shadow-[var(--shadow-border)]">
                <p className="text-xs uppercase tracking-[0.16em] text-subtle">{label}</p>
                <p className="mt-2 font-display text-3xl">{n}</p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-8">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, matric, school, department"
            className="h-11 w-full max-w-md rounded-md bg-surface px-3 text-sm shadow-[var(--shadow-border)] outline-none placeholder:text-subtle"
          />
        </div>

        {error ? <p className="mt-6 text-sm text-danger">{error}</p> : null}

        <div className="mt-6 overflow-x-auto rounded-xl bg-surface shadow-[var(--shadow-border)]">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.14em] text-subtle">
              <tr className="border-b border-border">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Matric</th>
                <th className="px-4 py-3 font-medium">School</th>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.userId} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-fg">{row.fullName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-muted">{row.matric ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{row.school ?? "—"}</td>
                  <td className="px-4 py-3 text-muted">{row.department ?? "—"}</td>
                  <td className="px-4 py-3 capitalize text-muted">{row.role}</td>
                  <td className="px-4 py-3 text-muted">{formatWhen(row.lastSeenAt)}</td>
                </tr>
              ))}
              {ready && filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted">
                    No students yet. They appear here after they register.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
