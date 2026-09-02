import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";

export type ProfileRole = "student" | "admin";

export type StudentRow = {
  userId: string;
  fullName: string;
  matric: string | null;
  school: string | null;
  department: string | null;
  role: ProfileRole;
  lastSeenAt: string | null;
  createdAt: string;
};

const profileInput = z.object({
  fullName: z.string().trim().min(2).max(80),
  matric: z.string().trim().min(3).max(40),
  school: z.string().trim().min(2).max(80),
  department: z.string().trim().min(2).max(80),
});

const adminSetupInput = z.object({
  fullName: z.string().trim().min(2).max(80),
});

export function matricToEmail(matric: string) {
  const slug = matric
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug}@students.lipro.app`;
}

export const adminExists = createServerFn({ method: "GET" }).handler(async () => {
  const sql = await getSql();
  const rows = await sql<{ n: number }>`select count(*)::int as n from profiles where role = 'admin'`;
  return { exists: (rows[0]?.n ?? 0) > 0 };
});

export const saveStudentProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(profileInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const matric = data.matric.toUpperCase();
    const taken = await sql<{ user_id: string }>`
      select user_id from profiles where matric = ${matric} and user_id <> ${context.userId}
    `;
    if (taken[0]) throw new Error("That matric number is already registered.");
    await sql`
      insert into profiles (user_id, full_name, matric, school, department, role, last_seen_at)
      values (${context.userId}, ${data.fullName}, ${matric}, ${data.school}, ${data.department}, 'student', now())
      on conflict (user_id) do update set
        full_name = excluded.full_name,
        matric = excluded.matric,
        school = excluded.school,
        department = excluded.department,
        last_seen_at = now()
    `;
    return { ok: true as const };
  });

export const saveAdminProfile = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(adminSetupInput)
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    const existing = await sql<{ n: number }>`select count(*)::int as n from profiles where role = 'admin'`;
    if ((existing[0]?.n ?? 0) > 0) {
      throw new Error("An admin account already exists.");
    }
    await sql`
      insert into profiles (user_id, full_name, role, last_seen_at)
      values (${context.userId}, ${data.fullName}, 'admin', now())
      on conflict (user_id) do update set
        full_name = excluded.full_name,
        role = 'admin',
        last_seen_at = now()
    `;
    return { ok: true as const };
  });

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{
      user_id: string;
      full_name: string;
      matric: string | null;
      school: string | null;
      department: string | null;
      role: ProfileRole;
      last_seen_at: string | null;
      created_at: string;
    }>`
      select user_id, full_name, matric, school, department, role,
             last_seen_at::text, created_at::text
      from profiles
      where user_id = ${context.userId}
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      userId: row.user_id,
      fullName: row.full_name,
      matric: row.matric,
      school: row.school,
      department: row.department,
      role: row.role,
      lastSeenAt: row.last_seen_at,
      createdAt: row.created_at,
    } satisfies StudentRow;
  });

export const touchLastSeen = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await sql`update profiles set last_seen_at = now() where user_id = ${context.userId}`;
    return { ok: true as const };
  });

export const listDirectory = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const me = await sql<{ role: string }>`select role from profiles where user_id = ${context.userId}`;
    if (me[0]?.role !== "admin") throw new Error("Forbidden");

    const rows = await sql<{
      user_id: string;
      full_name: string;
      matric: string | null;
      school: string | null;
      department: string | null;
      role: ProfileRole;
      last_seen_at: string | null;
      created_at: string;
    }>`
      select user_id, full_name, matric, school, department, role,
             last_seen_at::text, created_at::text
      from profiles
      order by created_at desc
    `;

    const students = rows.filter((r) => r.role === "student");
    const schools = new Set(students.map((r) => r.school).filter(Boolean));
    const departments = new Set(students.map((r) => r.department).filter(Boolean));

    return {
      people: rows.map(
        (row) =>
          ({
            userId: row.user_id,
            fullName: row.full_name,
            matric: row.matric,
            school: row.school,
            department: row.department,
            role: row.role,
            lastSeenAt: row.last_seen_at,
            createdAt: row.created_at,
          }) satisfies StudentRow,
      ),
      stats: {
        total: rows.length,
        students: students.length,
        admins: rows.length - students.length,
        schools: schools.size,
        departments: departments.size,
      },
    };
  });
