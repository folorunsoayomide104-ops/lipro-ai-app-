import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
import { Mark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth/client";
import {
  adminExists,
  matricToEmail,
  saveAdminProfile,
  saveStudentProfile,
} from "@/lib/profiles";
import { cn } from "@/lib/utils";

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium uppercase tracking-[0.16em] text-subtle">{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

const inputClass =
  "h-11 w-full rounded-md bg-elevated px-3 text-sm text-fg shadow-[var(--shadow-border)] outline-none placeholder:text-subtle";

function PasswordInput({
  value,
  onChange,
  autoComplete,
  minLength,
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  minLength?: number;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input
        className={cn(inputClass, "pr-12")}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        required
        minLength={minLength}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute inset-y-0 right-0 grid w-11 place-items-center text-subtle transition-colors hover:text-fg"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

export function StudentLoginForm() {
  const navigate = useNavigate();
  const [matric, setMatric] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await authClient.signIn.email({
        email: matricToEmail(matric),
        password,
      });
      if (err) throw new Error(err.message || "Could not sign in.");
      await navigate({ to: "/app" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
      <Field label="Matric number">
        <input
          className={inputClass}
          value={matric}
          onChange={(e) => setMatric(e.target.value)}
          autoComplete="username"
          required
        />
      </Field>
      <Field label="Password">
        <PasswordInput
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
      </Field>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={busy || !matric.trim() || !password}>
        {busy ? "Signing in…" : "Enter studio"}
      </Button>
    </form>
  );
}

export function StudentRegisterForm() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [matric, setMatric] = useState("");
  const [school, setSchool] = useState("");
  const [department, setDepartment] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await authClient.signUp.email({
        email: matricToEmail(matric),
        password,
        name: fullName.trim(),
      });
      if (err) throw new Error(err.message || "Could not create account.");
      await saveStudentProfile({
        data: { fullName, matric, school, department },
      });
      await navigate({ to: "/app" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create account.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
      <Field label="Full name">
        <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </Field>
      <Field label="Matric number">
        <input className={inputClass} value={matric} onChange={(e) => setMatric(e.target.value)} required />
      </Field>
      <Field label="School">
        <input
          className={inputClass}
          value={school}
          onChange={(e) => setSchool(e.target.value)}
          placeholder="University / college"
          required
        />
      </Field>
      <Field label="Department">
        <input
          className={inputClass}
          value={department}
          onChange={(e) => setDepartment(e.target.value)}
          placeholder="e.g. Physiology"
          required
        />
      </Field>
      <Field label="Password">
        <PasswordInput
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={8}
        />
      </Field>
      <p className="text-xs text-subtle">
        Your password is encrypted. Nobody — including admin — can read it later.
      </p>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Creating account…" : "Create student account"}
      </Button>
    </form>
  );
}

export function AdminLoginForm() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await authClient.signIn.email({ email, password });
      if (err) throw new Error(err.message || "Could not sign in.");
      await navigate({ to: "/admin" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
      <Field label="Admin email">
        <input
          className={inputClass}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          required
        />
      </Field>
      <Field label="Password">
        <PasswordInput
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
      </Field>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Signing in…" : "Open admin"}
      </Button>
    </form>
  );
}

export function AdminSetupForm() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: err } = await authClient.signUp.email({
        email: email.trim(),
        password,
        name: fullName.trim(),
      });
      if (err) throw new Error(err.message || "Could not create admin.");
      await saveAdminProfile({ data: { fullName } });
      await navigate({ to: "/admin" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create admin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={(e) => void onSubmit(e)}>
      <Field label="Your name">
        <input className={inputClass} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </Field>
      <Field label="Admin email">
        <input
          className={inputClass}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </Field>
      <Field label="Password">
        <PasswordInput
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          minLength={8}
        />
      </Field>
      <p className="text-xs text-subtle">
        First admin only. Password is encrypted and will never be shown on the monitor.
      </p>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <Button type="submit" disabled={busy}>
        {busy ? "Creating admin…" : "Create admin account"}
      </Button>
    </form>
  );
}

export function AuthCard({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-bg text-fg">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-12">
        <Link to="/" className="flex items-center gap-2.5 text-fg">
          <Mark className="size-6 text-primary" />
          <span className="font-display text-xl tracking-tight">LIPRO</span>
        </Link>
        <h1 className="mt-10 font-display text-4xl tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted">{hint}</p>
        <div className="mt-8">{children}</div>
      </div>
    </div>
  );
}

export function LoginTabs() {
  const [tab, setTab] = useState<"student" | "admin">("student");
  const [setup, setSetup] = useState<boolean | null>(null);

  useEffect(() => {
    void adminExists().then((r) => setSetup(!r.exists));
  }, []);

  return (
    <AuthCard
      title={tab === "student" ? "Sign in" : setup ? "Create admin" : "Admin"}
      hint={
        tab === "student"
          ? "Use your matric number and password."
          : setup
            ? "Set up the first admin so you can monitor the studio."
            : "Sign in to the directory."
      }
    >
      <div className="mb-6 grid grid-cols-2 rounded-md bg-elevated p-1 shadow-[var(--shadow-border)]">
        {(["student", "admin"] as const).map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={cn(
              "h-9 rounded-sm text-sm font-medium capitalize",
              tab === id ? "bg-primary text-primary-fg" : "text-muted hover:text-fg",
            )}
          >
            {id}
          </button>
        ))}
      </div>
      {tab === "student" ? (
        <>
          <StudentLoginForm />
          <p className="mt-6 text-sm text-muted">
            New student?{" "}
            <Link to="/register" className="text-fg underline-offset-4 hover:underline">
              Create an account
            </Link>
          </p>
        </>
      ) : setup ? (
        <AdminSetupForm />
      ) : setup === false ? (
        <AdminLoginForm />
      ) : (
        <p className="text-sm text-muted">Loading…</p>
      )}
    </AuthCard>
  );
}
