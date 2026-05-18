import { NextResponse } from "next/server";

export const runtime = "nodejs";

// ─── Email scoring helpers ────────────────────────────────────────────────────

const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

const NOISE_LOCALS = new Set([
  "noreply", "no-reply", "donotreply", "do-not-reply", "ne-pas-repondre",
  "support", "hello", "team", "mailer", "bounce", "bounces",
  "webmaster", "postmaster", "admin", "administrator",
  "notifications", "notification", "alert", "alerts",
  "sentry", "github", "example", "test", "demo",
  "privacy", "legal", "dpo", "rgpd", "unsubscribe",
  "newsletter", "marketing", "press", "media", "presse",
]);

const NOISE_DOMAINS = new Set([
  "francetravail.fr", "pole-emploi.fr", "adzuna.fr", "adzuna.com",
  "sentry.io", "github.com", "google.com", "googleapis.com",
  "gstatic.com", "googletagmanager.com", "facebook.com",
  "twitter.com", "linkedin.com", "w3.org", "schema.org",
  "example.com", "cloudflare.com", "amazonaws.com",
  "wikipedia.org", "wikimedia.org",
]);

const CONTACT_KEYWORDS =
  /candidature|recrutement|recruteur|contact|postuler|rh\b|ressources.humaines|apply|career|emploi|job/i;

const CAREER_PATHS = [
  "/recrutement", "/emploi", "/careers", "/career", "/jobs",
  "/rejoindre-nous", "/nous-rejoindre", "/join-us", "/rh", "/talent",
];

function stripNonContent(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
}

function scoreEmail(email: string, context: string): number {
  const [local, domain] = email.toLowerCase().split("@");
  if (!domain) return -1;
  if (NOISE_LOCALS.has(local)) return -1;
  if (NOISE_DOMAINS.has(domain)) return -1;
  if (local.length > 40 || /^[0-9a-f]{16,}$/.test(local)) return -1;

  let score = 0;
  if (CONTACT_KEYWORDS.test(context)) score += 3;
  if (/^(rh|recrutement|jobs?|careers?|emploi|talent|hiring)/.test(local)) score += 2;
  if (/^[a-z]+[.\-_][a-z]+$/.test(local)) score += 1;
  return score;
}

function extractBestEmail(html: string): string | null {
  const cleaned = stripNonContent(html);
  const candidates: { email: string; score: number }[] = [];
  const re = new RegExp(EMAIL_RE.source, "g");
  let match: RegExpExecArray | null;

  while ((match = re.exec(cleaned)) !== null) {
    const email = match[0].toLowerCase();
    const start = Math.max(0, match.index - 100);
    const end = Math.min(cleaned.length, match.index + email.length + 100);
    const score = scoreEmail(email, cleaned.slice(start, end));
    if (score >= 0) candidates.push({ email, score });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].score > 0 ? candidates[0].email : null;
}

async function fetchHtml(url: string, timeoutMs = 8000): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; Postulate/1.0)" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

// ─── Step: find company domain ────────────────────────────────────────────────

async function findCompanyDomain(company: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.duckduckgo.com/?q=${encodeURIComponent(company)}&format=json&no_html=1&skip_disambig=1`,
      {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; Postulate/1.0)" },
        signal: AbortSignal.timeout(6000),
      },
    );
    const data = (await res.json()) as {
      AbstractURL?: string;
      Results?: { FirstURL?: string }[];
      Infobox?: { content?: { data_type?: string; value?: string }[] };
    };

    const official = data.Infobox?.content?.find((c) => c.data_type === "official_site");
    if (official?.value) return new URL(official.value).hostname;

    for (const r of data.Results ?? []) {
      if (r.FirstURL && !r.FirstURL.includes("wikipedia"))
        return new URL(r.FirstURL).hostname;
    }

    if (data.AbstractURL && !data.AbstractURL.includes("wikipedia"))
      return new URL(data.AbstractURL).hostname;
  } catch { /* ignore */ }
  return null;
}

// ─── Step: job page scan ──────────────────────────────────────────────────────

async function stepJobPage(url: string): Promise<string | null> {
  const html = await fetchHtml(url);
  return html ? extractBestEmail(html) : null;
}

// ─── Step: Hunter.io ──────────────────────────────────────────────────────────

type HunterEmail = { value: string; confidence: number; department?: string };
type HunterResponse = { data?: { emails?: HunterEmail[] } };
const HR_DEPARTMENTS = new Set(["human_resources", "management", "executive"]);

async function stepHunter(domain: string): Promise<string | null> {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(
      `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${apiKey}&limit=10`,
      { signal: AbortSignal.timeout(8000) },
    );
    const data = (await res.json()) as HunterResponse;
    const emails = data.data?.emails ?? [];
    if (!emails.length) return null;
    const hrEmails = emails.filter((e) => e.department && HR_DEPARTMENTS.has(e.department));
    const pool = hrEmails.length ? hrEmails : emails;
    pool.sort((a, b) => b.confidence - a.confidence);
    return pool[0].value.toLowerCase();
  } catch { return null; }
}

// ─── Step: company website scraping ──────────────────────────────────────────

async function stepWebsite(domain: string): Promise<string | null> {
  const origin = `https://${domain}`;
  const pathsToTry = [origin, ...CAREER_PATHS.map((p) => origin + p)];

  for (let i = 0; i < pathsToTry.length; i += 3) {
    const results = await Promise.all(
      pathsToTry.slice(i, i + 3).map(async (u) => {
        const html = await fetchHtml(u);
        return html ? extractBestEmail(html) : null;
      }),
    );
    const found = results.find(Boolean);
    if (found) return found;
  }
  return null;
}

// ─── Main handler ─────────────────────────────────────────────────────────────

type RequestBody = {
  method: "job-page" | "find-domain" | "hunter" | "website";
  url?: string;
  company?: string;
  companyUrl?: string | null;
  domain?: string;
};

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  switch (body.method) {
    case "job-page": {
      if (!body.url) return NextResponse.json({ email: null });
      const email = await stepJobPage(body.url);
      return NextResponse.json({ email });
    }

    case "find-domain": {
      // Use known companyUrl first, fall back to DuckDuckGo search
      let domain: string | null = null;
      if (body.companyUrl) {
        try { domain = new URL(body.companyUrl).hostname; } catch { /* ignore */ }
      }
      if (!domain && body.company?.trim()) {
        domain = await findCompanyDomain(body.company.trim());
      }
      return NextResponse.json({ domain });
    }

    case "hunter": {
      if (!body.domain) return NextResponse.json({ email: null });
      const email = await stepHunter(body.domain);
      return NextResponse.json({ email });
    }

    case "website": {
      if (!body.domain) return NextResponse.json({ email: null });
      const email = await stepWebsite(body.domain);
      return NextResponse.json({ email });
    }

    default:
      return NextResponse.json({ error: "Méthode inconnue." }, { status: 400 });
  }
}
