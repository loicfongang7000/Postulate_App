import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

export async function generateCoverLetter({
  cvText,
  jobTitle,
  company,
  jobDescription,
  senderName,
  spontaneous = false,
  targetRole,
  recipientName,
  recipientPosition,
}: {
  cvText: string;
  jobTitle?: string;
  company: string;
  jobDescription?: string;
  senderName: string;
  spontaneous?: boolean;
  targetRole?: string;
  recipientName?: string;
  recipientPosition?: string;
}): Promise<string> {
  const greeting = recipientName
    ? `Madame, Monsieur ${recipientName.split(" ").at(-1)},`
    : "Madame, Monsieur,";

  const diplomaNote = `RÈGLE IMPORTANTE — Diplômes et formations :
Traite TOUTES les formations listées dans le CV comme déjà obtenues et terminées, sauf si le CV mentionne explicitement une date future (ex. "en cours", "attendu 2025", "à venir").
N'écris JAMAIS que le candidat est "actuellement en", "encore en train de" ou "en cours de" formation/diplôme — utilise toujours le passé ou le présent d'état ("titulaire de", "diplômé de", "fort d'un Master 2 en…", "après l'obtention de mon Master 2…").`;

  const content = spontaneous
    ? `Rédige une lettre de candidature spontanée (3-4 paragraphes, environ 260 mots).

**Candidat :** ${senderName}
**Entreprise ciblée :** ${company}
${targetRole ? `**Poste visé :** ${targetRole}` : ""}
${recipientName ? `**Destinataire :** ${recipientName}${recipientPosition ? `, ${recipientPosition}` : ""}` : ""}

**Extrait du CV du candidat :**
${cvText.slice(0, 2500)}

Instructions :
- Commence par "${greeting}"
- ${targetRole ? `Le candidat cible un poste de ${targetRole} au sein de cette entreprise.` : "Pas de poste précis : présente le profil global et sa valeur ajoutée."}
- Mets en avant 2-3 compétences clés tirées du CV qui correspondent au secteur de ${company}.
- Montre une connaissance ou un intérêt réel pour ${company} (secteur, valeurs, réputation).
- Termine par une phrase d'appel à l'action (demande d'entretien) et une formule de politesse courte, suivie du nom du candidat.
- Rédige uniquement le corps de la lettre, sans objet ni en-têtes d'adresse.
- ${diplomaNote}`
    : `Rédige une lettre de motivation (3-4 paragraphes, environ 250 mots) pour le poste suivant.

**Candidat :** ${senderName}
**Poste :** ${jobTitle ?? ""}
**Entreprise :** ${company}

**Description du poste :**
${(jobDescription ?? "").slice(0, 800)}

**Extrait du CV du candidat :**
${cvText.slice(0, 2500)}

Instructions :
- Rédige uniquement le corps de la lettre.
- Commence par "Madame, Monsieur," et termine par une formule de politesse courte suivie du nom du candidat.
- Ne mets ni objet, ni en-têtes d'adresse.
- ${diplomaNote}`;

  const msg = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system:
      "Tu es un expert en rédaction de lettres de motivation professionnelles en français. Rédige des lettres concises, personnalisées et percutantes.",
    messages: [{ role: "user", content }],
  });

  const block = msg.content[0];
  if (block.type !== "text") throw new Error("Réponse inattendue du modèle.");
  return block.text.trim();
}

export function isAnthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}
