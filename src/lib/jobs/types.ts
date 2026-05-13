export type JobSource = "france_travail" | "adzuna";

export type NormalizedJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  descriptionSnippet: string;
  url: string;
  source: JobSource;
  publishedAt: string | null;
};

export type ScoredJob = NormalizedJob & {
  score: number;
  matchedTokens: string[];
};
