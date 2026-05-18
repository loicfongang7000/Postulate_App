import { NextResponse } from "next/server";
import { sendCoverLetterEmail, isEmailConfigured } from "@/lib/email/sendEmail";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isEmailConfigured()) {
    return NextResponse.json(
      { error: "E-mail non configuré (GMAIL_USER / GMAIL_APP_PASSWORD)." },
      { status: 503 },
    );
  }

  let body: Record<string, string | undefined>;
  try {
    body = (await request.json()) as Record<string, string | undefined>;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const { recipientEmail, senderName, jobTitle, company, letter, cvBase64, cvFilename } = body;

  if (!recipientEmail || !senderName || !jobTitle || !letter) {
    return NextResponse.json(
      {
        error:
          "Champs requis manquants : recipientEmail, senderName, jobTitle, letter.",
      },
      { status: 400 },
    );
  }

  try {
    await sendCoverLetterEmail({
      recipientEmail,
      senderName,
      jobTitle,
      company: company ?? "",
      letter,
      cvBase64,
      cvFilename,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur lors de l'envoi.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
