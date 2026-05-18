import type { NormalizedJob } from "@/lib/jobs/types";

// Arbeitnow — API gratuite, sans clé. Spécialisé tech/international, inclut des offres en France.
// Doc : https://www.arbeitnow.com/api

type ArbeitnowJob = {
  slug?: string;
  company_name?: string;
  title?: string;
  description?: string;
  remote?: boolean;
  url?: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: number;
};

type ArbeitnowResponse = {
  data?: ArbeitnowJob[];
};

export type ArbeitnowSearchParams = {
  search: string;
  location?: string | null;
  page?: number;
};

export async function searchArbeitnow(
  params: ArbeitnowSearchParams,
): Promise<NormalizedJob[]> {
  const url = new URL("https://www.arbeitnow.com/api/job-board-api");
  if (params.search.trim()) url.searchParams.set("search", params.search.trim());
  // Arbeitnow location filter is basic — "france" works as a rough filter
  if (params.location?.trim()) url.searchParams.set("location", params.location.trim());
  if (params.page && params.page > 1) url.searchParams.set("page", String(params.page));

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Arbeitnow ${res.status}: ${res.statusText}`);
  }

  const data = (await res.json()) as ArbeitnowResponse;
  const rows = Array.isArray(data.data) ? data.data : [];

  return rows.map(normalizeArbeitnow).filter((j): j is NormalizedJob => j !== null);
}

function normalizeArbeitnow(r: ArbeitnowJob): NormalizedJob | null {
  const title = r.title?.trim();
  if (!title) return null;

  const id = r.slug ?? title.replace(/\s+/g, "-").slice(0, 60);
  const desc = (r.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  const publishedAt = r.created_at
    ? new Date(r.created_at * 1000).toISOString()
    : null;

  return {
    id: `arb:${id}`,
    title,
    company: r.company_name?.trim() || "—",
    location: r.remote ? `${r.location?.trim() || "France"} (télétravail)` : r.location?.trim() || "France",
    descriptionSnippet: desc.slice(0, 600),
    url: r.url?.trim() || "https://www.arbeitnow.com",
    source: "arbeitnow",
    publishedAt,
  };
}
