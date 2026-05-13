import { NextResponse } from "next/server";
import { extractProfile } from "@/lib/cv/extractProfile";
import { parseCv, SUPPORTED_CV_MIME_TYPES } from "@/lib/cv/parseCv";
import { searchAdzunaFr, isAdzunaConfigured } from "@/lib/jobs/adzuna";
import {
  isFranceTravailConfigured,
  searchFranceTravail,
} from "@/lib/jobs/franceTravail";
import { dedupeJobs, scoreAndSort } from "@/lib/jobs/matchPipeline";
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

  const [ftJobs, adzJobs] = await Promise.all([
    isFranceTravailConfigured()
      ? searchFranceTravail({
          motsCles: profile.searchQuery,
          departement: profile.departement,
          rangeStart: 0,
          rangeEnd: ftRangeEnd,
        }).catch((e) => {
          const msg = e instanceof Error ? e.message : String(e);
          warnings.push(`France Travail: ${msg}`);
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
          const msg = e instanceof Error ? e.message : String(e);
          warnings.push(`Adzuna: ${msg}`);
          return [];
        })
      : Promise.resolve([]),
  ]);

  const merged = [...ftJobs, ...adzJobs];
  const deduped = dedupeJobs(merged);
  const scored = scoreAndSort(profile, deduped);
  const jobs: ScoredJob[] = scored.slice(0, maxResults);

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
    },
  });
}

function guessMimeFromName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  return "";
}
