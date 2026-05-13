import mammoth from "mammoth";
import pdfParse from "pdf-parse";

const PDF_MIME = "application/pdf";
const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function parseCv(buffer: Buffer, mimeType: string): Promise<string> {
  if (mimeType === PDF_MIME || mimeType === "application/x-pdf") {
    const res = await pdfParse(buffer);
    return normalizeText(res.text);
  }
  if (mimeType === DOCX_MIME) {
    const { value } = await mammoth.extractRawText({ buffer });
    return normalizeText(value);
  }
  throw new Error(
    `Format non supporté (${mimeType}). Utilisez un PDF ou un DOCX.`,
  );
}

function normalizeText(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\u00a0/g, " ").trim();
}

export const SUPPORTED_CV_MIME_TYPES = [PDF_MIME, DOCX_MIME] as const;
