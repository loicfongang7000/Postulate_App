import type { NormalizedJob } from "@/lib/jobs/types";

// Jooble est un agrégateur qui indexe Indeed.fr, Monster.fr, Cadremploi, JobTeaser…
// Clé gratuite : https://jooble.org/api/about (500 requêtes/jour)

export function isJoobleConfigured(): boolean {
  return Boolean(process.env.JOOBLE_API_KEY);
}

type JoobleJob = {
  title?: string;
  location?: string;
  snippet?: string;
  salary?: string;
  source?: string;
  type?: string;
  link?: string;
  company?: string;
  updated?: string;
  id?: string;
};

type JoobleResponse = {
  totalCount?: number;
  jobs?: JoobleJob[];
};

export type JoobleSearchParams = {
  keywords: string;
  location?: string | null;
  page?: number;
  count?: number;
};

export async function searchJooble(
  params: JoobleSearchParams,
): Promise<NormalizedJob[]> {
  const apiKey = process.env.JOOBLE_API_KEY;
  if (!apiKey) throw new Error("JOOBLE_API_KEY manquant.");

  const res = await fetch(`https://jooble.org/api/${apiKey}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
    },
    body: JSON.stringify({
      keywords: params.keywords,
      location: params.location?.trim() || "France",
      page: String(params.page ?? 1),
      SearchJobsCountOnPage: params.count ?? 20,
    }),
    signal: AbortSignal.timeout(12000),
  });

  if (res.status === 403) {
    throw new Error(
      "Clé Jooble invalide ou en attente d'approbation. " +
      "Vérifiez votre clé sur https://jooble.org/api/about (l'activation peut prendre 1-2 jours).",
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Jooble ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as JoobleResponse;
  const rows = Array.isArray(data.jobs) ? data.jobs : [];

  return rows.map(normalizeJoobleJob).filter((j): j is NormalizedJob => j !== null);
}

function normalizeJoobleJob(r: JoobleJob): NormalizedJob | null {
  const title = r.title?.trim();
  if (!title) return null;

  const id = r.id ?? `${title}-${r.company ?? ""}`.replace(/\s+/g, "-").slice(0, 60);
  const desc = (r.snippet ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  return {
    id: `jooble:${id}`,
    title,
    company: r.company?.trim() || "—",
    location: r.location?.trim() || "France",
    descriptionSnippet: desc.slice(0, 600),
    url: r.link?.trim() || "https://fr.jooble.org",
    source: "jooble",
    publishedAt: r.updated ?? null,
  };
}
