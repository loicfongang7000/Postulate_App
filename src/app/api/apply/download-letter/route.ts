import {
  Document,
  Paragraph,
  TextRun,
  AlignmentType,
  Packer,
} from "docx";

export const runtime = "nodejs";

// ─── Detect and extract closing formula + signature from letter body ───────────

const CLOSING_RE =
  /^(Cordialement|Veuillez agréer|Dans l'attente|Je vous prie d'agréer|Bien cordialement|Sincèrement|Respectueusement)/i;

function splitBody(
  letter: string,
): { bodyParas: string[]; closing: string; signature: string | null } {
  const paras = letter.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);

  const last = paras[paras.length - 1] ?? "";
  const secondLast = paras[paras.length - 2] ?? "";

  // Case 1 — last paragraph is "Cordialement,\nNom" (multiline)
  if (CLOSING_RE.test(last)) {
    const lines = last.split("\n");
    return {
      bodyParas: paras.slice(0, -1),
      closing: lines[0],
      signature: lines.slice(1).join(" ").trim() || null,
    };
  }

  // Case 2 — second-to-last is formula, last is the name
  if (CLOSING_RE.test(secondLast)) {
    return {
      bodyParas: paras.slice(0, -2),
      closing: secondLast,
      signature: last,
    };
  }

  // No closing detected — treat entire text as body
  return { bodyParas: paras, closing: "Cordialement,", signature: null };
}

// ─── TNR run factory ───────────────────────────────────────────────────────────

function tnr(text: string, opts: { bold?: boolean; size?: number } = {}): TextRun {
  return new TextRun({
    text,
    font: "Times New Roman",
    size: opts.size ?? 24, // 12 pt (half-points)
    bold: opts.bold ?? false,
    color: "000000",
  });
}

// ─── Build the document ────────────────────────────────────────────────────────

function buildLetterDoc({
  letter,
  senderName,
  senderCity,
  senderPhone,
  senderEmail,
  company,
  targetRole,
  recipientName,
  recipientPosition,
}: {
  letter: string;
  senderName: string;
  senderCity?: string;
  senderPhone?: string;
  senderEmail?: string;
  company?: string;
  targetRole?: string;
  recipientName?: string;
  recipientPosition?: string;
}): Document {
  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  // Capitalise first letter of weekday
  const dateStr = today.charAt(0).toUpperCase() + today.slice(1);

  const { bodyParas, closing, signature } = splitBody(letter);

  const paras: Paragraph[] = [];

  // 1 ── Date (right-aligned) ─────────────────────────────────────────────────
  paras.push(
    new Paragraph({
      children: [tnr(dateStr)],
      alignment: AlignmentType.RIGHT,
      spacing: { after: 0 },
    }),
  );

  // 2 ── Empty line ───────────────────────────────────────────────────────────
  paras.push(new Paragraph({ children: [tnr("")], spacing: { after: 0 } }));

  // 3 ── Sender block (left) ─────────────────────────────────────────────────
  const senderLines = [
    senderName,
    senderCity ?? null,
    senderPhone ? `N° Tél. ${senderPhone}` : null,
    senderEmail ? `Email : ${senderEmail}` : null,
  ].filter(Boolean) as string[];

  for (const line of senderLines) {
    paras.push(
      new Paragraph({
        children: [tnr(line)],
        alignment: AlignmentType.LEFT,
        spacing: { after: 0 },
      }),
    );
  }

  // 4 ── Recipient (right-aligned) ───────────────────────────────────────────
  const recipientLines: string[] = [];
  if (recipientName) recipientLines.push(recipientName);
  if (recipientPosition) recipientLines.push(recipientPosition);
  if (company)
    recipientLines.push(`À l'attention du service Recrutement – ${company}`);

  for (const line of recipientLines) {
    paras.push(
      new Paragraph({
        children: [tnr(line)],
        alignment: AlignmentType.RIGHT,
        spacing: { after: 0 },
      }),
    );
  }

  // 5 ── Blank spacer ────────────────────────────────────────────────────────
  paras.push(new Paragraph({ children: [tnr("")], spacing: { after: 400 } }));

  // 6 ── Subject (bold) ─────────────────────────────────────────────────────
  const subjectText = targetRole
    ? `Objet : Candidature – ${targetRole}`
    : "Objet : Candidature";

  paras.push(
    new Paragraph({
      children: [tnr(subjectText, { bold: true })],
      spacing: { after: 400 },
    }),
  );

  // 7 ── Body paragraphs (justified, TNR) ───────────────────────────────────
  for (const para of bodyParas) {
    const lines = para.split("\n");
    paras.push(
      new Paragraph({
        children: lines.map((line, i) =>
          i < lines.length - 1
            ? new TextRun({ text: line, font: "Times New Roman", size: 24, color: "000000", break: 1 })
            : tnr(line),
        ),
        alignment: AlignmentType.BOTH,
        spacing: { after: 240 },
      }),
    );
  }

  // 8 ── Closing formula (right-aligned, indented) ───────────────────────────
  paras.push(
    new Paragraph({
      children: [tnr(closing)],
      alignment: AlignmentType.RIGHT,
      indent: { left: 1416 },
      spacing: { after: 240 },
    }),
  );

  // 9 ── Signature — name bold (right-aligned, indented) ────────────────────
  const signatureName = signature ?? senderName;
  paras.push(
    new Paragraph({
      children: [tnr(signatureName, { bold: true })],
      alignment: AlignmentType.RIGHT,
      indent: { left: 1416 },
      spacing: { after: 240 },
    }),
  );

  return new Document({
    styles: {
      default: {
        document: {
          run: { font: "Times New Roman", size: 24, color: "000000" },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            // A4 (same as the template: 11906 × 16838 DXA)
            size: { width: 11906, height: 16838 },
            margin: { top: 1418, right: 1418, bottom: 1418, left: 1418 },
          },
        },
        children: paras,
      },
    ],
  });
}

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  let body: {
    letter?: string;
    senderName?: string;
    senderCity?: string;
    senderPhone?: string;
    senderEmail?: string;
    company?: string;
    targetRole?: string;
    recipientName?: string;
    recipientPosition?: string;
  };

  try {
    body = (await request.json()) as typeof body;
  } catch {
    return new Response("Corps JSON invalide.", { status: 400 });
  }

  if (!body.letter || !body.senderName) {
    return new Response("Champs requis : letter, senderName.", { status: 400 });
  }

  const doc = buildLetterDoc({
    letter: body.letter,
    senderName: body.senderName,
    senderCity: body.senderCity,
    senderPhone: body.senderPhone,
    senderEmail: body.senderEmail,
    company: body.company,
    targetRole: body.targetRole,
    recipientName: body.recipientName,
    recipientPosition: body.recipientPosition,
  });

  const buffer = await Packer.toBuffer(doc);

  const company = body.company ?? "candidature";
  const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="lettre-${slug}.docx"`,
    },
  });
}
