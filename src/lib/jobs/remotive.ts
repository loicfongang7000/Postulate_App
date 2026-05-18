import type { NormalizedJob } from "@/lib/jobs/types";

// Remotive — API gratuite, sans clé. Offres en télétravail du monde entier.
// Doc : https://remotive.com/api/remote-jobs

type RemotiveJob = {
  id?: number;
  url?: string;
  title?: string;
  company_name?: string;
  company_logo?: string;
  category?: string;
  tags?: string[];
  job_type?: string;
  publication_date?: string;
  candidate_required_location?: string;
  salary?: string;
  description?: string;
};

type RemotiveResponse = {
  "job-count"?: number;
  jobs?: RemotiveJob[];
};

export type RemotiveSearchParams = {
  search: string;
  limit?: number;
};

export async function searchRemotive(
  params: RemotiveSearchParams,
): Promise<NormalizedJob[]> {
  const url = new URL("https://remotive.com/api/remote-jobs");
  if (params.search.trim()) url.searchParams.set("search", params.search.trim());
  url.searchParams.set("limit", String(params.limit ?? 15));

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(10000),
  });

  if (!res.ok) {
    throw new Error(`Remotive ${res.status}: ${res.statusText}`);
  }

  const data = (await res.json()) as RemotiveResponse;
  const rows = Array.isArray(data.jobs) ? data.jobs : [];

  return rows.map(normalizeRemotive).filter((j): j is NormalizedJob => j !== null);
}

function normalizeRemotive(r: RemotiveJob): NormalizedJob | null {
  const title = r.title?.trim();
  if (!title) return null;

  const id = r.id != null ? String(r.id) : title.replace(/\s+/g, "-").slice(0, 60);
  const desc = (r.description ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  const location = r.candidate_required_location?.trim()
    ? `${r.candidate_required_location.trim()} (télétravail)`
    : "Télétravail";

  return {
    id: `rem:${id}`,
    title,
    company: r.company_name?.trim() || "—",
    location,
    descriptionSnippet: desc.slice(0, 600),
    url: r.url?.trim() || "https://remotive.com",
    source: "remotive",
    publishedAt: r.publication_date ?? null,
  };
}
