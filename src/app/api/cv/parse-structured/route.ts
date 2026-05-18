import { NextResponse } from "next/server";
import { parseCv, SUPPORTED_CV_MIME_TYPES } from "@/lib/cv/parseCv";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";

const client = new Anthropic();

export type StructuredProfile = {
  personal: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    address: string;
    city: string;
    postalCode: string;
    country: string;
    linkedin: string;
    github: string;
    website: string;
    nationality: string;
  };
  summary: string;
  education: Array<{
    degree: string;
    field: string;
    school: string;
    city: string;
    startDate: string;
    endDate: string;
    gpa: string;
    description: string;
  }>;
  experience: Array<{
    title: string;
    company: string;
    city: string;
    country: string;
    startDate: string;
    endDate: string;
    current: boolean;
    description: string;
  }>;
  skills: string[];
  languages: Array<{ name: string; level: string }>;
  certifications: Array<{ name: string; issuer: string; date: string }>;
};

function guessMime(name: string, type: string): string {
  if (type) return type;
  const l = name.toLowerCase();
  if (l.endsWith(".pdf")) return "application/pdf";
  if (l.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "";
}

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Requête multipart invalide." }, { status: 400 });
  }

  const file = form.get("cv");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier « cv » manquant." }, { status: 400 });
  }

  const mime = guessMime(file.name, file.type);
  if (!new Set<string>(SUPPORTED_CV_MIME_TYPES).has(mime)) {
    return NextResponse.json(
      { error: `Type non supporté: ${mime || "inconnu"}. Envoyez un PDF ou DOCX.` },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let cvText: string;
  try {
    cvText = await parseCv(buffer, mime);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur lecture CV." },
      { status: 422 },
    );
  }

  if (cvText.length < 40) {
    return NextResponse.json({ error: "CV trop court pour être analysé." }, { status: 422 });
  }

  const prompt = `Analyse ce CV et extrais TOUTES les informations dans le JSON suivant.
Règles importantes :
- Pour les formations : elles sont TOUTES obtenues/terminées, utilise le passé (ex. endDate = année de fin).
- Si une information n'est pas présente dans le CV, laisse le champ vide ("").
- Les dates : format libre tel qu'écrit dans le CV (ex. "Septembre 2022", "2021-2023", "2024").
- Pour "current" dans experience : true seulement si le CV dit explicitement "actuel", "present", "aujourd'hui" ou pas de date de fin.
- Ne rien inventer : copie exactement ce qui est dans le CV.

CV :
${cvText.slice(0, 4000)}

Réponds UNIQUEMENT avec le JSON valide suivant, sans aucun texte avant ou après :
{
  "personal": {
    "firstName": "",
    "lastName": "",
    "email": "",
    "phone": "",
    "address": "",
    "city": "",
    "postalCode": "",
    "country": "",
    "linkedin": "",
    "github": "",
    "website": "",
    "nationality": ""
  },
  "summary": "",
  "education": [
    {
      "degree": "",
      "field": "",
      "school": "",
      "city": "",
      "startDate": "",
      "endDate": "",
      "gpa": "",
      "description": ""
    }
  ],
  "experience": [
    {
      "title": "",
      "company": "",
      "city": "",
      "country": "",
      "startDate": "",
      "endDate": "",
      "current": false,
      "description": ""
    }
  ],
  "skills": [],
  "languages": [
    { "name": "", "level": "" }
  ],
  "certifications": [
    { "name": "", "issuer": "", "date": "" }
  ]
}`;

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    system:
      "Tu es un parseur de CV expert. Tu extrais les informations structurées d'un CV et tu retournes uniquement du JSON valide, sans aucun commentaire.",
    messages: [{ role: "user", content: prompt }],
  });

  const block = msg.content[0];
  if (block.type !== "text") {
    return NextResponse.json({ error: "Réponse inattendue du modèle." }, { status: 500 });
  }

  let profile: StructuredProfile;
  try {
    // Extraire le JSON même si le modèle ajoute du texte autour
    const jsonMatch = block.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Pas de JSON trouvé dans la réponse.");
    profile = JSON.parse(jsonMatch[0]) as StructuredProfile;
  } catch {
    return NextResponse.json(
      { error: "Impossible de parser la réponse du modèle." },
      { status: 500 },
    );
  }

  return NextResponse.json({ profile });
}
