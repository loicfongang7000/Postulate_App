import type { CvProfile } from "@/lib/cv/extractProfile";
import type { NormalizedJob, ScoredJob } from "@/lib/jobs/types";

const STOPWORDS = new Set(
  [
    "le",
    "la",
    "les",
    "un",
    "une",
    "des",
    "de",
    "du",
    "et",
    "en",
    "au",
    "aux",
    "pour",
    "avec",
    "sans",
    "chez",
    "dans",
    "sur",
    "par",
    "the",
    "and",
    "or",
    "of",
    "to",
    "in",
    "on",
    "at",
    "from",
    "h/f",
    "f/h",
    "cdi",
    "cdd",
    "stage",
    "alternance",
    "temps",
    "plein",
    "partiel",
  ].map((w) => w.toLowerCase()),
);

export function tokenizeForMatch(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9àâäéèêëïîôùûüç.#+]+/i)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}

function slugKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function dedupeKey(job: NormalizedJob): string {
  const head = slugKey(job.title).slice(0, 80);
  const comp = slugKey(job.company).slice(0, 40);
  const loc = slugKey(job.location).slice(0, 40);
  const desc = slugKey(job.descriptionSnippet).slice(0, 60);
  return `${head}|${comp}|${loc}|${desc}`;
}

export function dedupeJobs(jobs: NormalizedJob[]): NormalizedJob[] {
  const seen = new Set<string>();
  const out: NormalizedJob[] = [];
  for (const j of jobs) {
    const k = dedupeKey(j);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(j);
  }
  return out;
}

export function scoreAgainstCv(
  profile: CvProfile,
  job: NormalizedJob,
): { score: number; matchedTokens: string[] } {
  const cvTokens = new Set(tokenizeForMatch(profile.fullText));
  const jobText = `${job.title}\n${job.company}\n${job.location}\n${job.descriptionSnippet}`;
  const jobTokens = new Set(tokenizeForMatch(jobText));

  let inter = 0;
  const matched: string[] = [];
  for (const t of jobTokens) {
    if (cvTokens.has(t)) {
      inter += 1;
      if (matched.length < 12) matched.push(t);
    }
  }

  const union = cvTokens.size + jobTokens.size - inter;
  const jaccard = union > 0 ? inter / union : 0;

  const headlineTokens = new Set(tokenizeForMatch(profile.headline));
  let headHits = 0;
  for (const t of jobTokens) {
    if (headlineTokens.has(t)) headHits += 1;
  }
  const headBoost =
    headlineTokens.size > 0
      ? Math.min(0.35, headHits / headlineTokens.size)
      : 0;

  const score = Math.min(1, jaccard * 0.85 + headBoost);
  matched.sort();
  return { score, matchedTokens: matched };
}

export function scoreAndSort(
  profile: CvProfile,
  jobs: NormalizedJob[],
): ScoredJob[] {
  const scored = jobs.map((job) => {
    const { score, matchedTokens } = scoreAgainstCv(profile, job);
    return { ...job, score, matchedTokens };
  });
  scored.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  return scored;
}
