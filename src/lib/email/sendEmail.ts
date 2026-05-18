import nodemailer from "nodemailer";

function createTransporter() {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error(
      "GMAIL_USER ou GMAIL_APP_PASSWORD non configuré dans .env.local.",
    );
  }
  return nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
}

function letterToHtml(text: string, senderName: string): string {
  const paragraphs = text
    .split(/\n\n+/)
    .map((p) => `<p style="margin:0 0 1.2em;line-height:1.7">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="font-family:Georgia,serif;font-size:15px;color:#1a1a1a;max-width:620px;margin:0 auto;padding:32px 24px">
${paragraphs}
<hr style="border:none;border-top:1px solid #ddd;margin:2em 0">
<p style="margin:0;font-size:12px;color:#888">Envoyé via Postulate — candidature de ${senderName}</p>
</body></html>`;
}

export async function sendCoverLetterEmail({
  recipientEmail,
  senderName,
  jobTitle,
  company,
  letter,
  cvBase64,
  cvFilename,
}: {
  recipientEmail: string;
  senderName: string;
  jobTitle: string;
  company: string;
  letter: string;
  cvBase64?: string;
  cvFilename?: string;
}): Promise<void> {
  const transporter = createTransporter();

  const attachments = cvBase64 && cvFilename
    ? [{ filename: cvFilename, content: cvBase64, encoding: "base64" as const }]
    : [];

  await transporter.sendMail({
    from: `"${senderName}" <${process.env.GMAIL_USER}>`,
    to: recipientEmail,
    subject: jobTitle.startsWith("Candidature") ? jobTitle : `Candidature – ${jobTitle} – ${company}`,
    text: letter,
    html: letterToHtml(letter, senderName),
    attachments,
  });
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}
