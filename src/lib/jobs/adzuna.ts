import type { NormalizedJob } from "@/lib/jobs/types";

const ADZUNA_HOST = "https://api.adzuna.com";

function getEnv() {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  return { appId, appKey };
}

export function isAdzunaConfigured(): boolean {
  const { appId, appKey } = getEnv();
  return Boolean(appId && appKey);
}

type AdzunaResult = {
  title?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  description?: string;
  redirect_url?: string;
  created?: string;
  id?: string | number;
};

type AdzunaSearchResponse = {
  results?: AdzunaResult[];
};

export type AdzunaSearchParams = {
  what: string;
  where?: string | null;
  page: number;
  resultsPerPage: number;
};

export async function searchAdzunaFr(
  params: AdzunaSearchParams,
): Promise<NormalizedJob[]> {
  const { appId, appKey } = getEnv();
  if (!appId || !appKey) {
    throw new Error("Adzuna: ADZUNA_APP_ID / ADZUNA_APP_KEY manquants.");
  }

  const url = new URL(
    `${ADZUNA_HOST}/v1/api/jobs/fr/search/${params.page}`,
  );
  url.searchParams.set("app_id", appId);
  url.searchParams.set("app_key", appKey);
  url.searchParams.set("results_per_page", String(params.resultsPerPage));
  url.searchParams.set("what", params.what);
  if (params.where?.trim()) {
    url.searchParams.set("where", params.where.trim());
  }

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Adzuna ${res.status}: ${errText.slice(0, 400) || res.statusText}`,
    );
  }

  const json = (await res.json()) as AdzunaSearchResponse;
  const rows = Array.isArray(json.results) ? json.results : [];

  return rows
    .map((r) => normalizeAdzunaResult(r))
    .filter((j): j is NormalizedJob => j !== null);
}

function normalizeAdzunaResult(r: AdzunaResult): NormalizedJob | null {
  const title = typeof r.title === "string" ? r.title.trim() : "";
  if (!title) return null;
  const id = r.id != null ? String(r.id) : title;
  const company = r.company?.display_name?.trim() || "—";
  const location = r.location?.display_name?.trim() || "";
  const desc = (r.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const url = r.redirect_url?.trim() || `https://www.adzuna.fr/details/${id}`;
  const created = r.created?.trim() ?? null;

  return {
    id: `adz:${id}`,
    title,
    company,
    location,
    descriptionSnippet: desc.slice(0, 600),
    url,
    source: "adzuna",
    publishedAt: created,
  };
}
