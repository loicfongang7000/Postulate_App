import { NextResponse } from "next/server";
import {
  generateCoverLetter,
  isAnthropicConfigured,
} from "@/lib/email/generateCoverLetter";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isAnthropicConfigured()) {
    return NextResponse.json(
      { error: "Clé API Anthropic non configurée (ANTHROPIC_API_KEY)." },
      { status: 503 },
    );
  }

  let body: Record<string, string>;
  try {
    body = (await request.json()) as Record<string, string>;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const { cvText, jobTitle, company, jobDescription, senderName, spontaneous, targetRole, recipientName, recipientPosition } =
    body as Record<string, string> & { spontaneous?: boolean };

  if (!cvText || !senderName || (!spontaneous && !jobTitle)) {
    return NextResponse.json(
      { error: "Champs requis manquants : cvText, senderName (+ jobTitle si non spontanée)." },
      { status: 400 },
    );
  }

  try {
    const letter = await generateCoverLetter({
      cvText,
      jobTitle: jobTitle ?? "",
      company: company ?? "",
      jobDescription: jobDescription ?? "",
      senderName,
      spontaneous: Boolean(spontaneous),
      targetRole: targetRole || undefined,
      recipientName: recipientName || undefined,
      recipientPosition: recipientPosition || undefined,
    });
    return NextResponse.json({ letter });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur lors de la génération.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
