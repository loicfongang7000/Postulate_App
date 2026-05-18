export type JobSource = "france_travail" | "adzuna" | "jooble" | "arbeitnow" | "remotive";

export type NormalizedJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  descriptionSnippet: string;
  url: string;
  source: JobSource;
  publishedAt: string | null;
  contactEmail?: string | null;
  companyUrl?: string | null;
};

export type ScoredJob = NormalizedJob & {
  score: number;
  matchedTokens: string[];
};
