import { createFileRoute } from "@tanstack/react-router";
import { extractUpload } from "@/lib/exam-extract";

const MAX_BYTES = 12 * 1024 * 1024;

export const Route = createFileRoute("/api/exam/extract")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return Response.json({ error: "Could not read the file." }, { status: 400 });
        }

        const file = form.get("file");
        if (!(file instanceof File) || file.size === 0) {
          return Response.json({ error: "Choose a file first." }, { status: 400 });
        }
        if (file.size > MAX_BYTES) {
          return Response.json({ error: "File is over 12 MB." }, { status: 413 });
        }

        try {
          const result = await extractUpload(file);
          if (!result.text || result.text.length < 80) {
            return Response.json(
              { error: "That file had too little readable text. Paste the notes instead." },
              { status: 422 },
            );
          }
          return Response.json({
            text: result.text,
            pages: result.pages ?? null,
            name: file.name,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Could not read that file.";
          return Response.json({ error: message }, { status: 422 });
        }
      },
    },
  },
});
