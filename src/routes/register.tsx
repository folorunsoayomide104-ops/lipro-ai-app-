import { createFileRoute, Link } from "@tanstack/react-router";
import { AuthCard, StudentRegisterForm } from "@/components/auth/auth-forms";

export const Route = createFileRoute("/register")({
  component: Register,
  head: () => ({ meta: [{ title: "Register — LIPRO" }] }),
});

function Register() {
  return (
    <AuthCard
      title="Join LIPRO"
      hint="Matric, school, department, and a password only you can see."
    >
      <StudentRegisterForm />
      <p className="mt-6 text-sm text-muted">
        Already have an account?{" "}
        <Link to="/login" className="text-fg underline-offset-4 hover:underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
