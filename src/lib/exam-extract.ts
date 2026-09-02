import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

const MAX_CHARS = 100_000;

function asText(value: string | string[]) {
  return Array.isArray(value) ? value.join("\n\n") : value;
}

function tidy(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_CHARS);
}

export async function extractUpload(file: File): Promise<{ text: string; pages?: number }> {
  const name = file.name.toLowerCase();
  const type = file.type;
  const buf = Buffer.from(await file.arrayBuffer());

  if (type.startsWith("text/") || name.endsWith(".txt") || name.endsWith(".md")) {
    return { text: tidy(buf.toString("utf8")) };
  }

  if (type === "application/pdf" || name.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const result = await extractText(pdf, { mergePages: true });
    return { text: tidy(asText(result.text)), pages: result.totalPages };
  }

  if (
    type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    name.endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer: buf });
    return { text: tidy(result.value) };
  }

  throw new Error("Use a PDF, Word (.docx), or text file.");
}
