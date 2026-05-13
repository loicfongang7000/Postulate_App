export type CvProfile = {
  /** Full normalized text (for scoring) */
  fullText: string;
  /** Short line likely to be job title / headline */
  headline: string;
  /**
   * Short phrase sent to France Travail / Adzuna (`motsCles` / `what`).
   * Job APIs often return nothing if this string is too long or noisy.
   */
  searchQuery: string;
  /** Broader list of terms extracted from the CV (transparency in UI, not sent as one blob). */
  cvKeywordsPreview: string;
  /** French department code (2 digits) if detected */
  departement: string | null;
  /** City or region hint for Adzuna `where` */
  locationHint: string | null;
};

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
    "dans",
    "sur",
    "par",
    "the",
    "a",
    "an",
    "and",
    "or",
    "of",
    "to",
    "in",
    "on",
    "at",
    "from",
    "as",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "must",
    "can",
    "this",
    "that",
    "these",
    "those",
    "i",
    "you",
    "he",
    "she",
    "we",
    "they",
    "my",
    "your",
    "our",
    "their",
    "cv",
    "curriculum",
    "vitae",
    "resume",
    "profil",
    "expérience",
    "experience",
    "formation",
    "compétences",
    "competences",
    "projets",
    "contact",
    "email",
    "téléphone",
    "telephone",
  ].map((w) => w.toLowerCase()),
);

const SKILL_HINTS = [
  "typescript",
  "javascript",
  "react",
  "next",
  "node",
  "python",
  "java",
  "kotlin",
  "swift",
  "go",
  "rust",
  "sql",
  "postgresql",
  "mysql",
  "mongodb",
  "redis",
  "docker",
  "kubernetes",
  "aws",
  "azure",
  "gcp",
  "terraform",
  "ansible",
  "linux",
  "git",
  "graphql",
  "rest",
  "api",
  "django",
  "flask",
  "fastapi",
  "spring",
  "angular",
  "vue",
  "svelte",
  "php",
  "symfony",
  "laravel",
  "csharp",
  ".net",
  "dotnet",
  "scala",
  "spark",
  "kafka",
  "elasticsearch",
  "machine learning",
  "deep learning",
  "nlp",
  "data",
  "analytics",
  "devops",
  "sre",
  "cybersecurity",
  "agile",
  "scrum",
];

/** Terms that inflate API queries but rarely help job search endpoints. */
const QUERY_NOISE = new Set(
  [
    "alternance",
    "stage",
    "master",
    "doctorat",
    "licence",
    "laboratoire",
    "laboratoires",
    "université",
    "universite",
    "universitaire",
    "annee",
    "année",
    "années",
    "cv",
    "curriculum",
    "vitae",
    "recherche",
    "chercheur",
    "chercheuse",
    "publication",
    "publications",
    "conference",
    "conférence",
  ].map((w) => w.toLowerCase()),
);

const MAX_API_QUERY_CHARS = 100;
const MAX_API_TERMS = 8;

function isYearToken(t: string): boolean {
  return /^(19|20)\d{2}$/.test(t);
}

function isGarbageHeadline(line: string): boolean {
  const t = line.trim();
  if (t.length < 4) return false;
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length < 4) return false;
  const singleChar = parts.filter((p) => p.replace(/[^a-zà-ÿ]/gi, "").length === 1)
    .length;
  if (singleChar / parts.length >= 0.55) return true;
  if (parts.every((p) => p.length <= 2) && parts.length >= 5) return true;
  return false;
}

function filterFrequentForApi(tokens: string[]): string[] {
  return tokens.filter((t) => {
    const tl = t.toLowerCase();
    if (isYearToken(tl)) return false;
    if (QUERY_NOISE.has(tl)) return false;
    return true;
  });
}

function buildShortApiSearchQuery(parts: {
  skills: string[];
  headlineWords: string[];
  frequent: string[];
}): string {
  const out: string[] = [];
  const push = (w: string) => {
    const x = w.trim();
    if (x.length < 2) return;
    if (out.some((o) => o.toLowerCase() === x.toLowerCase())) return;
    const candidate = [...out, x].join(" ");
    if (candidate.length > MAX_API_QUERY_CHARS) return;
    out.push(x);
  };

  for (const s of parts.skills) {
    if (out.length >= 5) break;
    push(s);
  }
  for (const w of parts.headlineWords) {
    if (out.length >= MAX_API_TERMS) break;
    push(w);
  }
  for (const w of parts.frequent) {
    if (out.length >= MAX_API_TERMS) break;
    push(w);
  }

  let q = out.join(" ").trim();
  if (q.length > MAX_API_QUERY_CHARS) {
    q = q.slice(0, MAX_API_QUERY_CHARS).replace(/\s+\S*$/, "").trim();
  }
  return q || "emploi";
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9àâäéèêëïîôùûüç.#+\-]+/i)
    .map((t) => t.replace(/^\.+|\.+$/g, ""))
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

function uniqueKeepOrder(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of items) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}

/** Derive mainland department from a French postal code (avoids false positives from years). */
function extractDepartement(text: string): string | null {
  const m = text.match(/\b(0[1-9]\d{3}|[1-8]\d{4}|9[0-5]\d{3})\b/);
  if (!m) return null;
  const cp = m[1];
  const dept = cp.slice(0, 2);
  if (dept === "20") {
    const third = cp[2];
    if (third === "0" || third === "1") return "2A";
    if (third === "2") return "2B";
    return null;
  }
  if (dept.startsWith("97") || dept.startsWith("98")) return null;
  return dept;
}

/** Heuristic: line after address-like pattern or explicit "ville" */
function extractLocationHint(text: string): string | null {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < Math.min(lines.length, 12); i++) {
    const l = lines[i];
    if (/france/i.test(l) && /\d{5}/.test(l)) {
      const parts = l.split(/[,•·]/).map((p) => p.trim());
      const cityPart = parts.find((p) => /^\d{5}\s+/.test(p) || /^[A-Za-zÀ-ÿ\-\s]+$/.test(p));
      if (cityPart) {
        const city = cityPart.replace(/^\d{5}\s*/, "").trim();
        if (city.length > 2) return city;
      }
    }
  }
  const villeLine = lines.find((l) => /^ville\s*:/i.test(l));
  if (villeLine) {
    const v = villeLine.replace(/^ville\s*:\s*/i, "").trim();
    if (v.length > 2) return v;
  }
  return null;
}

function headlineFromLines(lines: string[]): string {
  const skip = /^(email|tél|tel|phone|linkedin|github|adresse)/i;
  for (const l of lines.slice(0, 15)) {
    if (l.length < 3 || skip.test(l)) continue;
    if (isGarbageHeadline(l)) continue;
    if (l.length > 120) return l.slice(0, 120).trim();
    return l;
  }
  return lines[0]?.slice(0, 120) ?? "";
}

/**
 * Build profile: full CV text drives **scoring**; a **short** `searchQuery` is built for job APIs.
 */
export function extractProfile(fullText: string): CvProfile {
  const collapsed = fullText.replace(/\s+/g, " ").trim();
  const lines = fullText.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const headline = headlineFromLines(lines);
  const lower = collapsed.toLowerCase();

  const tokens = tokenize(collapsed);
  const skillHits = SKILL_HINTS.filter((s) => lower.includes(s.toLowerCase())).sort(
    (a, b) => {
      const ia = lower.indexOf(a.toLowerCase());
      const ib = lower.indexOf(b.toLowerCase());
      return (ia === -1 ? 99999 : ia) - (ib === -1 ? 99999 : ib);
    },
  );

  const topFreq = new Map<string, number>();
  for (const t of tokens) {
    if (t.length < 3) continue;
    topFreq.set(t, (topFreq.get(t) ?? 0) + 1);
  }
  const frequent = [...topFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 28)
    .map(([w]) => w);

  const headlineWords =
    headline && !isGarbageHeadline(headline)
      ? tokenize(headline).filter((t) => !STOPWORDS.has(t))
      : [];

  const rawMerged = uniqueKeepOrder([
    ...skillHits,
    ...headlineWords,
    ...frequent,
  ]);
  const cvKeywordsPreview = rawMerged.slice(0, 24).join(" ").slice(0, 320);

  const searchQuery = buildShortApiSearchQuery({
    skills: skillHits,
    headlineWords: headlineWords.slice(0, 4),
    frequent: filterFrequentForApi(frequent),
  });

  return {
    fullText: collapsed,
    headline: headline.slice(0, 200),
    searchQuery,
    cvKeywordsPreview: cvKeywordsPreview || searchQuery,
    departement: extractDepartement(fullText),
    locationHint: extractLocationHint(fullText),
  };
}
