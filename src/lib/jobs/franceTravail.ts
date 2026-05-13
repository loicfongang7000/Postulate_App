import type { NormalizedJob } from "@/lib/jobs/types";

const DEFAULT_TOKEN_URL =
  "https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire";
const DEFAULT_API_BASE = "https://api.francetravail.io";
const DEFAULT_SCOPE = "api_offresdemploiv2 o2dsoffre";

type TokenResponse = {
  access_token: string;
  expires_in?: number;
  token_type?: string;
};

let tokenCache: { token: string; expiresAtMs: number } | null = null;

/** Avoid `res.json()` on empty/HTML bodies (clear error instead of JSON parse exception). */
async function readJsonBody<T>(res: Response, context: string): Promise<T> {
  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) {
    throw new Error(
      `${context}: corps de réponse vide (HTTP ${res.status} ${res.statusText}).`,
    );
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const formLike = /access_token=/i.test(trimmed);
    if (formLike) {
      const params = new URLSearchParams(trimmed);
      const access_token = params.get("access_token");
      const expires_in = params.get("expires_in");
      if (access_token) {
        return {
          access_token,
          expires_in: expires_in ? Number(expires_in) : undefined,
        } as T;
      }
    }
    throw new Error(
      `${context}: réponse non-JSON (HTTP ${res.status}). Début: ${trimmed.slice(0, 280)}`,
    );
  }
}

function getEnv() {
  const clientId = process.env.FRANCE_TRAVAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.FRANCE_TRAVAIL_CLIENT_SECRET?.trim();
  const tokenUrl = process.env.FRANCE_TRAVAIL_TOKEN_URL?.trim() ?? DEFAULT_TOKEN_URL;
  const apiBase = (process.env.FRANCE_TRAVAIL_API_BASE ?? DEFAULT_API_BASE).replace(
    /\/+$/,
    "",
  );
  const scope = process.env.FRANCE_TRAVAIL_SCOPE?.trim() ?? DEFAULT_SCOPE;
  return { clientId, clientSecret, tokenUrl, apiBase, scope };
}

export function isFranceTravailConfigured(): boolean {
  const { clientId, clientSecret } = getEnv();
  return Boolean(clientId && clientSecret);
}

async function fetchAccessToken(): Promise<string> {
  const now = Date.now();
  if (tokenCache && now < tokenCache.expiresAtMs - 30_000) {
    return tokenCache.token;
  }

  const { clientId, clientSecret, tokenUrl, scope } = getEnv();
  if (!clientId || !clientSecret) {
    throw new Error("France Travail: FRANCE_TRAVAIL_CLIENT_ID/SECRET manquants.");
  }

  const headersForm: HeadersInit = {
    "Content-Type": "application/x-www-form-urlencoded",
  };

  const bodyInForm = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope,
  });

  let res = await fetch(tokenUrl, {
    method: "POST",
    headers: headersForm,
    body: bodyInForm.toString(),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    const tryBasic =
      (res.status === 400 || res.status === 401) &&
      /invalid_client|Client authentication failed/i.test(errText);

    if (tryBasic) {
      const basic = Buffer.from(`${clientId}:${clientSecret}`, "utf8").toString(
        "base64",
      );
      const bodyBasicOnly = new URLSearchParams({
        grant_type: "client_credentials",
        scope,
      });
      res = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          ...headersForm,
          Authorization: `Basic ${basic}`,
        },
        body: bodyBasicOnly.toString(),
      });
    }

    if (!res.ok) {
      const errTextFinal = tryBasic
        ? ((await res.text().catch(() => "")) || errText)
        : errText;
      throw new Error(
        `France Travail OAuth ${res.status}: ${errTextFinal.slice(0, 400) || res.statusText}`,
      );
    }
  }

  const data = await readJsonBody<TokenResponse>(res, "France Travail OAuth");
  if (!data.access_token) {
    throw new Error("France Travail OAuth: réponse sans access_token.");
  }

  const ttlSec = data.expires_in ?? 3600;
  tokenCache = {
    token: data.access_token,
    expiresAtMs: now + ttlSec * 1000,
  };
  return data.access_token;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : null;
}

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function pickJobUrl(o: Record<string, unknown>): string {
  const contact = asRecord(o.contact);
  const origineOffre = asRecord(o.origineOffre);
  const originePe = asRecord(o.originePe);
  return (
    pickString(contact?.urlPostulation) ??
    pickString(origineOffre?.urlOrigine) ??
    pickString(originePe?.urlPourPostuler) ??
    `https://candidat.francetravail.fr/offres/recherche/detail/${pickString(o.id) ?? ""}`
  );
}

function normalizeFranceTravailOffer(raw: unknown): NormalizedJob | null {
  const o = asRecord(raw);
  if (!o) return null;
  const id = pickString(o.id);
  const title =
    pickString(o.intitule) ?? pickString(o.titre) ?? pickString(o.libelleMetier);
  if (!id || !title) return null;

  const entreprise = asRecord(o.entreprise);
  const lieu = asRecord(o.lieuTravail);
  const fromLibelle = pickString(lieu?.libelle);
  const fromParts = [pickString(lieu?.commune), pickString(lieu?.codePostal)]
    .filter(Boolean)
    .join(" ");
  const location = fromLibelle || fromParts || "";

  const html = pickString(o.texteHtml);
  const desc =
    pickString(o.description) ??
    (html ? html.replace(/<[^>]+>/g, " ") : null) ??
    "";

  const published =
    pickString(o.dateActualisation) ??
    pickString(o.dateCreation) ??
    pickString(o.datePublication);

  return {
    id: `ft:${id}`,
    title,
    company: pickString(entreprise?.nom) ?? "—",
    location,
    descriptionSnippet: desc.replace(/\s+/g, " ").trim().slice(0, 600),
    url: pickJobUrl(o),
    source: "france_travail",
    publishedAt: published,
  };
}

export type FranceTravailSearchParams = {
  motsCles: string;
  departement?: string | null;
  rangeStart: number;
  rangeEnd: number;
};

export async function searchFranceTravail(
  params: FranceTravailSearchParams,
): Promise<NormalizedJob[]> {
  const token = await fetchAccessToken();
  const { apiBase } = getEnv();

  const url = new URL(
    `${apiBase}/partenaire/offresdemploi/v2/offres/search`,
  );
  url.searchParams.set("motsCles", params.motsCles);
  if (params.departement) {
    url.searchParams.set("departement", params.departement);
  }

  const searchHeaders = (range: string | null) => {
    const h: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    };
    if (range) {
      h.Range = range;
    }
    return h;
  };

  let res = await fetch(url.toString(), {
    headers: searchHeaders(`offres=${params.rangeStart}-${params.rangeEnd}`),
  });

  if (res.status === 204) {
    res = await fetch(url.toString(), {
      headers: searchHeaders(null),
    });
  }

  if (res.status === 204) {
    return [];
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `France Travail recherche ${res.status}: ${errText.slice(0, 400) || res.statusText}`,
    );
  }

  const text = await res.text();
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  let json: { resultats?: unknown[] };
  try {
    json = JSON.parse(trimmed) as { resultats?: unknown[] };
  } catch {
    throw new Error(
      `France Travail recherche: JSON invalide (HTTP ${res.status}). Début: ${trimmed.slice(0, 280)}`,
    );
  }
  const rows = Array.isArray(json.resultats) ? json.resultats : [];
  const out: NormalizedJob[] = [];
  for (const row of rows) {
    const job = normalizeFranceTravailOffer(row);
    if (job) out.push(job);
  }
  return out;
}
