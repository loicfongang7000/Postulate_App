import { NextResponse } from "next/server";
import { extractProfile } from "@/lib/cv/extractProfile";
import { parseCv, SUPPORTED_CV_MIME_TYPES } from "@/lib/cv/parseCv";
import { searchAdzunaFr, isAdzunaConfigured } from "@/lib/jobs/adzuna";
import {
  isFranceTravailConfigured,
  searchFranceTravail,
} from "@/lib/jobs/franceTravail";
import { searchJooble, isJoobleConfigured } from "@/lib/jobs/jooble";
import { searchArbeitnow } from "@/lib/jobs/arbeitnow";
import { searchRemotive } from "@/lib/jobs/remotive";
import { dedupeJobs, scoreAndSort, sampleWithDiversity } from "@/lib/jobs/matchPipeline";
import type { ScoredJob } from "@/lib/jobs/types";

export const runtime = "nodejs";

const MAX_RESULTS_CAP = 80;
const DEFAULT_MAX = 45;

function clampInt(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === "string" ? parseInt(v, 10) : typeof v === "number" ? v : NaN;
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

export async function POST(request: Request) {
  const warnings: string[] = [];

  if (!isFranceTravailConfigured()) {
    warnings.push(
      "France Travail non configuré (FRANCE_TRAVAIL_CLIENT_ID / SECRET).",
    );
  }
  if (!isAdzunaConfigured()) {
    warnings.push("Adzuna non configuré (ADZUNA_APP_ID / ADZUNA_APP_KEY).");
  }
  if (!isJoobleConfigured()) {
    warnings.push("Jooble non configuré (JOOBLE_API_KEY) — offres Indeed.fr/Monster.fr non incluses.");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Corps de requête invalide (multipart attendu)." },
      { status: 400 },
    );
  }

  const file = form.get("cv");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Fichier « cv » manquant dans le formulaire." },
      { status: 400 },
    );
  }

  const mimeFromName = guessMimeFromName(file.name);
  const mime = file.type || mimeFromName;
  const allowed = new Set<string>(SUPPORTED_CV_MIME_TYPES);
  if (!mime || !allowed.has(mime)) {
    return NextResponse.json(
      {
        error: `Type MIME non supporté: ${mime || "inconnu"}. Envoyez un PDF ou un DOCX.`,
      },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let cvText: string;
  try {
    cvText = await parseCv(buffer, mime);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur lecture CV.";
    return NextResponse.json({ error: msg }, { status: 422 });
  }

  if (cvText.length < 40) {
    return NextResponse.json(
      { error: "Le CV semble trop court pour extraire des mots-clés." },
      { status: 422 },
    );
  }

  const maxResults = clampInt(
    form.get("maxResults"),
    DEFAULT_MAX,
    5,
    MAX_RESULTS_CAP,
  );

  const keywordsOverride = String(form.get("keywords") ?? "").trim();
  const whereOverride = String(form.get("where") ?? "").trim();
  const deptOverride = String(form.get("departement") ?? "").trim();

  let profile = extractProfile(cvText);
  if (keywordsOverride) {
    const q = keywordsOverride.slice(0, 200);
    profile = {
      ...profile,
      searchQuery: q,
      cvKeywordsPreview: q,
    };
  }
  if (whereOverride) {
    profile = { ...profile, locationHint: whereOverride };
  }
  if (/^\d{2}$/.test(deptOverride)) {
    profile = { ...profile, departement: deptOverride };
  }

  const ftRangeEnd = Math.min(49, maxResults + 14);
  const perSource = Math.min(25, maxResults + 10);

  const [ftJobs, adzJobs, joobleJobs, arbeitnowJobs, remotiveJobs] = await Promise.all([
    isFranceTravailConfigured()
      ? searchFranceTravail({
          motsCles: profile.searchQuery,
          departement: profile.departement,
          rangeStart: 0,
          rangeEnd: ftRangeEnd,
        }).catch((e) => {
          warnings.push(`France Travail: ${e instanceof Error ? e.message : String(e)}`);
          return [];
        })
      : Promise.resolve([]),

    isAdzunaConfigured()
      ? searchAdzunaFr({
          what: profile.searchQuery,
          where: profile.locationHint,
          page: 1,
          resultsPerPage: Math.min(50, maxResults + 15),
        }).catch((e) => {
          warnings.push(`Adzuna: ${e instanceof Error ? e.message : String(e)}`);
          return [];
        })
      : Promise.resolve([]),

    isJoobleConfigured()
      ? searchJooble({
          keywords: profile.searchQuery,
          location: profile.locationHint ?? "France",
          page: 1,
          count: perSource,
        }).catch((e) => {
          warnings.push(`Jooble: ${e instanceof Error ? e.message : String(e)}`);
          return [];
        })
      : Promise.resolve([]),

    searchArbeitnow({
      search: profile.searchQuery,
      page: 1,
    }).catch((e) => {
      warnings.push(`Arbeitnow: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }),

    searchRemotive({
      search: profile.searchQuery,
      limit: perSource,
    }).catch((e) => {
      warnings.push(`Remotive: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }),
  ]);

  const merged = [...ftJobs, ...adzJobs, ...joobleJobs, ...arbeitnowJobs, ...remotiveJobs];
  const deduped = dedupeJobs(merged);
  const scored = scoreAndSort(profile, deduped);
  // Garantit au moins 5 offres par source active pour ne pas écraser
  // les sources en langue étrangère (Remotive, Arbeitnow) par le scoring Jaccard.
  const jobs: ScoredJob[] = sampleWithDiversity(scored, maxResults, 5);

  return NextResponse.json({
    profile: {
      headline: profile.headline,
      searchQuery: profile.searchQuery,
      cvKeywordsPreview: profile.cvKeywordsPreview,
      departement: profile.departement,
      locationHint: profile.locationHint,
    },
    jobs,
    warnings,
    meta: {
      totalRaw: merged.length,
      totalDeduped: deduped.length,
      returned: jobs.length,
      sources: {
        france_travail: ftJobs.length,
        adzuna: adzJobs.length,
        jooble: joobleJobs.length,
        arbeitnow: arbeitnowJobs.length,
        remotive: remotiveJobs.length,
      },
    },
    cvText: cvText.slice(0, 6000),
  });
}

function guessMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "";
}
