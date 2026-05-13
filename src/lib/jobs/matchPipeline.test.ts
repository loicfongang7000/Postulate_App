import { describe, expect, it } from "vitest";
import type { CvProfile } from "@/lib/cv/extractProfile";
import type { NormalizedJob } from "@/lib/jobs/types";
import { dedupeJobs, scoreAgainstCv, tokenizeForMatch } from "./matchPipeline";

describe("matchPipeline", () => {
  it("tokenizeForMatch removes short tokens and stopwords", () => {
    const t = tokenizeForMatch("Le dev React et TypeScript");
    expect(t).toContain("react");
    expect(t).toContain("typescript");
    expect(t).not.toContain("le");
  });

  it("dedupeJobs removes near duplicates", () => {
    const a: NormalizedJob = {
      id: "1",
      title: "Développeur React",
      company: "ACME",
      location: "Paris",
      descriptionSnippet: "Nous cherchons un dev React senior pour nos produits.",
      url: "https://a.example",
      source: "adzuna",
      publishedAt: null,
    };
    const b: NormalizedJob = {
      ...a,
      id: "2",
      url: "https://b.example",
      source: "france_travail",
    };
    const out = dedupeJobs([a, b]);
    expect(out).toHaveLength(1);
  });

  it("scoreAgainstCv rewards overlapping technical terms", () => {
    const profile: CvProfile = {
      fullText: "typescript react node développeur frontend",
      headline: "développeur frontend",
      searchQuery: "typescript react",
      cvKeywordsPreview: "typescript react node",
      departement: null,
      locationHint: null,
    };
    const job: NormalizedJob = {
      id: "j1",
      title: "Développeur TypeScript / React",
      company: "StartUp",
      location: "Lyon",
      descriptionSnippet: "Stack Node.js et API REST.",
      url: "https://example",
      source: "adzuna",
      publishedAt: null,
    };
    const { score, matchedTokens } = scoreAgainstCv(profile, job);
    expect(score).toBeGreaterThan(0.05);
    expect(matchedTokens.length).toBeGreaterThan(0);
  });
});
