import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { authMiddleware } from "@/lib/auth/middleware";
import { getSql } from "@/lib/db";

function maskKey(key: string) {
  const tail = key.slice(-4);
  return `••••••••${tail}`;
}

export const getNvidiaKeyStatus = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    const rows = await sql<{ nvidia_api_key: string | null }>`
      select nvidia_api_key from user_settings where user_id = ${context.userId}
    `;
    const key = rows[0]?.nvidia_api_key ?? null;
    return { configured: Boolean(key), masked: key ? maskKey(key) : null };
  });

export const saveNvidiaKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .validator(z.object({ apiKey: z.string().trim().min(20).max(200) }))
  .handler(async ({ context, data }) => {
    const sql = await getSql();
    await sql`
      insert into user_settings (user_id, nvidia_api_key, updated_at)
      values (${context.userId}, ${data.apiKey}, now())
      on conflict (user_id) do update set
        nvidia_api_key = excluded.nvidia_api_key,
        updated_at = now()
    `;
    return { ok: true as const, masked: maskKey(data.apiKey) };
  });

export const clearNvidiaKey = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const sql = await getSql();
    await sql`
      update user_settings set nvidia_api_key = null, updated_at = now()
      where user_id = ${context.userId}
    `;
    return { ok: true as const };
  });
