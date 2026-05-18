import { NextResponse } from "next/server";

export const runtime = "nodejs";

export type Contact = {
  email: string;
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  confidence: number;
  source: "hunter" | "apollo";
};

const HR_DEPARTMENTS = new Set([
  "human_resources", "management", "executive",
  "recruiting", "talent", "people",
]);

// ─── Domain helpers ────────────────────────────────────────────────────────────

function toHostname(raw: string): string | null {
  try {
    const url = raw.includes("://") ? raw : `https://${raw}`;
    const host = new URL(url).hostname.replace(/^www\./, "");
    return host || null;
  } catch {
    return null;
  }
}

// ─── Domain lookup ─────────────────────────────────────────────────────────────

async function findDomain(company: string): Promise<string | null> {
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
    if (official?.value) { const h = toHostname(official.value); if (h) return h; }
    for (const r of data.Results ?? []) {
      if (r.FirstURL && !r.FirstURL.includes("wikipedia")) {
        const h = toHostname(r.FirstURL); if (h) return h;
      }
    }
    if (data.AbstractURL && !data.AbstractURL.includes("wikipedia")) {
      const h = toHostname(data.AbstractURL); if (h) return h;
    }
  } catch { /* ignore */ }
  return null;
}

// ─── Hunter.io ─────────────────────────────────────────────────────────────────

type HunterEmail = {
  value: string;
  confidence: number;
  first_name?: string;
  last_name?: string;
  position?: string;
  department?: string;
};

type HunterResponse = {
  data?: { domain?: string; organization?: string; emails?: HunterEmail[] };
  errors?: { details: string }[];
};

async function searchHunter(domain: string): Promise<{ contacts: Contact[]; notice: string | null }> {
  const apiKey = process.env.HUNTER_API_KEY;
  if (!apiKey) return { contacts: [], notice: null };

  try {
    const res = await fetch(
      `https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&api_key=${apiKey}&limit=20`,
      { signal: AbortSignal.timeout(10000) },
    );
    const data = (await res.json()) as HunterResponse;
    const emails = data.data?.emails ?? [];
    const notice = data.errors?.find((e) =>
      e.details.toLowerCase().includes("limited to"),
    )?.details ?? null;

    const contacts: Contact[] = emails.map((e) => ({
      email: e.value.toLowerCase(),
      firstName: e.first_name ?? "",
      lastName: e.last_name ?? "",
      position: e.position ?? "",
      department: e.department ?? "",
      confidence: e.confidence,
      source: "hunter",
    }));

    return { contacts, notice };
  } catch {
    return { contacts: [], notice: null };
  }
}

// ─── Apollo.io ─────────────────────────────────────────────────────────────────

type ApolloPerson = {
  first_name?: string;
  last_name?: string;
  title?: string;
  email?: string;
  email_status?: string;
  departments?: string[];
  organization?: { primary_domain?: string };
};

type ApolloResponse = {
  people?: ApolloPerson[];
  error?: string;
};

const HR_TITLES = [
  "recrutement", "recruteur", "recruiter", "recruiting",
  "talent acquisition", "human resources", "ressources humaines",
  "rh", "hr", "people", "drh", "drha",
  "chargé de recrutement", "responsable rh", "hr manager",
  "talent manager", "people manager",
];

async function searchApollo(domain: string): Promise<{ contacts: Contact[]; error: string | null }> {
  const apiKey = process.env.APOLLO_API_KEY;
  if (!apiKey) return { contacts: [], error: null };

  try {
    const res = await fetch("https://api.apollo.io/v1/people/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "X-Api-Key": apiKey,
      },
      body: JSON.stringify({
        api_key: apiKey,
        organization_domains: [domain],
        person_titles: HR_TITLES,
        per_page: 15,
        page: 1,
      }),
      signal: AbortSignal.timeout(12000),
    });

    const data = (await res.json()) as ApolloResponse;
    if (res.status === 403) {
      // Free plan: search API requires a paid Apollo subscription — fail silently
      return { contacts: [], error: null };
    }
    if (!res.ok) {
      return { contacts: [], error: `Apollo HTTP ${res.status}: ${data.error ?? ""}` };
    }
    if (data.error) {
      return { contacts: [], error: `Apollo: ${data.error}` };
    }

    const contacts = (data.people ?? [])
      .filter((p) => p.email && p.email_status !== "invalid")
      .map((p) => ({
        email: (p.email ?? "").toLowerCase(),
        firstName: p.first_name ?? "",
        lastName: p.last_name ?? "",
        position: p.title ?? "",
        department: p.departments?.[0] ?? "",
        confidence: p.email_status === "verified" ? 95 : 70,
        source: "apollo" as const,
      }));

    return { contacts, error: null };
  } catch (e) {
    return { contacts: [], error: e instanceof Error ? e.message : "Erreur Apollo" };
  }
}

// ─── Merge & rank ──────────────────────────────────────────────────────────────

function mergeAndRank(hunterContacts: Contact[], apolloContacts: Contact[]): Contact[] {
  const seen = new Set<string>();
  const all: Contact[] = [];

  for (const c of [...hunterContacts, ...apolloContacts]) {
    if (!c.email || seen.has(c.email)) continue;
    seen.add(c.email);
    all.push(c);
  }

  return all.sort((a, b) => {
    const aHr = HR_DEPARTMENTS.has(a.department) ? 1 : 0;
    const bHr = HR_DEPARTMENTS.has(b.department) ? 1 : 0;
    if (aHr !== bHr) return bHr - aHr;
    return b.confidence - a.confidence;
  });
}

// ─── Main handler ──────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  if (!process.env.HUNTER_API_KEY && !process.env.APOLLO_API_KEY) {
    return NextResponse.json(
      { error: "Aucune clé API configurée (HUNTER_API_KEY ou APOLLO_API_KEY)." },
      { status: 503 },
    );
  }

  let body: { companyName?: string; domain?: string };
  try {
    body = (await request.json()) as { companyName?: string; domain?: string };
  } catch {
    return NextResponse.json({ error: "Corps JSON invalide." }, { status: 400 });
  }

  const companyName = body.companyName?.trim();
  if (!companyName) {
    return NextResponse.json({ error: "Nom d'entreprise manquant." }, { status: 400 });
  }

  // Resolve domain — normalize in case caller passes a full URL
  let domain: string | null = body.domain?.trim()
    ? (toHostname(body.domain.trim()) ?? body.domain.trim())
    : null;
  if (!domain) domain = await findDomain(companyName);

  if (!domain) {
    return NextResponse.json({
      domain: null,
      contacts: [],
      notice: null,
      error: "Domaine introuvable. Entrez le domaine manuellement (ex: entreprise.fr).",
    });
  }

  // Run Hunter.io and Apollo.io in parallel
  const [
    { contacts: hunterContacts, notice },
    { contacts: apolloContacts, error: apolloError },
  ] = await Promise.all([
    searchHunter(domain),
    searchApollo(domain),
  ]);

  const contacts = mergeAndRank(hunterContacts, apolloContacts);

  // Collect non-blocking diagnostics for the UI
  const warnings: string[] = [];
  if (apolloError) warnings.push(`Apollo.io : ${apolloError}`);
  if (hunterContacts.length === 0 && apolloContacts.length === 0) {
    warnings.push(`Aucun contact trouvé pour le domaine « ${domain} ». Si ce domaine est incorrect, entrez-le manuellement.`);
  }

  return NextResponse.json({
    domain,
    organization: companyName,
    contacts,
    notice,
    warnings,
    debug: { hunterCount: hunterContacts.length, apolloCount: apolloContacts.length },
  });
}
