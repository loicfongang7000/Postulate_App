"use client";

import { useCallback, useMemo, useState } from "react";

type MatchResponse = {
  profile: {
    headline: string;
    searchQuery: string;
    cvKeywordsPreview: string;
    departement: string | null;
    locationHint: string | null;
  };
  jobs: {
    id: string;
    title: string;
    company: string;
    location: string;
    descriptionSnippet: string;
    url: string;
    source: "france_travail" | "adzuna";
    publishedAt: string | null;
    score: number;
    matchedTokens: string[];
  }[];
  warnings: string[];
  meta: { totalRaw: number; totalDeduped: number; returned: number };
  error?: string;
};

export default function HomePage() {
  const [keywords, setKeywords] = useState("");
  const [where, setWhere] = useState("");
  const [departement, setDepartement] = useState("");
  const [maxResults, setMaxResults] = useState(45);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MatchResponse | null>(null);
  const [dragOver, setDragOver] = useState(false);

  const onSubmit = useCallback(
    async (file: File) => {
      setLoading(true);
      setError(null);
      setData(null);
      const fd = new FormData();
      fd.append("cv", file);
      if (keywords.trim()) fd.append("keywords", keywords.trim());
      if (where.trim()) fd.append("where", where.trim());
      if (departement.trim()) fd.append("departement", departement.trim());
      fd.append("maxResults", String(maxResults));

      const res = await fetch("/api/match", { method: "POST", body: fd });
      const json = (await res.json()) as MatchResponse & { error?: string };
      if (!res.ok) {
        setError(json.error ?? `Erreur HTTP ${res.status}`);
        setLoading(false);
        return;
      }
      setData(json);
      setLoading(false);
    },
    [keywords, where, departement, maxResults],
  );

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) void onSubmit(f);
      e.target.value = "";
    },
    [onSubmit],
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const f = e.dataTransfer.files?.[0];
      if (f) void onSubmit(f);
    },
    [onSubmit],
  );

  const sourceLabel = useMemo(
    () =>
      ({
        france_travail: "France Travail",
        adzuna: "Adzuna",
      }) as const,
    [],
  );

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Correspondance CV → offres en France
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
          Téléversez votre CV (PDF ou DOCX). Le texte sert à deux choses : une requête
          courte pour interroger France Travail et Adzuna (comme quelques mots-clés
          dans une barre de recherche), et le texte complet pour classer les offres
          (score). Les APIs gèrent mal les très longues listes de mots : le CV est
          donc résumé automatiquement. Le champ « mots-clés manuels » ne remplace cette
          requête que si vous le remplissez.
        </p>
      </header>

      <section className="grid gap-6 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6 md:grid-cols-2">
        <label
          htmlFor="cv-file"
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors ${
            dragOver
              ? "border-[var(--accent)] bg-blue-500/10"
              : "border-[var(--border)] hover:border-zinc-500"
          }`}
        >
          <span className="flex flex-col items-center gap-2 text-sm text-[var(--muted)]">
            <span className="font-medium text-white">
              Glisser-déposer le CV ici
            </span>
            <span>ou choisir un fichier</span>
          </span>
          <input
            id="cv-file"
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            onChange={onFileInput}
            disabled={loading}
          />
          {loading && (
            <p className="mt-4 text-sm text-[var(--accent)]">Analyse en cours…</p>
          )}
        </label>

        <div className="flex flex-col gap-4 text-sm">
          <div className="space-y-1">
            <label className="text-[var(--muted)]">
              Mots-clés manuels (optionnel)
            </label>
            <p className="text-xs text-zinc-500">
              Si rempli, remplace la requête courte déduite du CV pour France Travail
              et Adzuna. Laissez vide pour laisser le CV piloter la recherche.
            </p>
            <input
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="Ex. développeur Python (laisser vide = auto depuis le CV)"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-white outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-[var(--muted)]">Ville / région (Adzuna)</label>
            <input
              value={where}
              onChange={(e) => setWhere(e.target.value)}
              placeholder="Ex. Lyon, Paris, Bretagne…"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-white outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-[var(--muted)]">Département (2 chiffres)</label>
              <input
                value={departement}
                onChange={(e) => setDepartement(e.target.value)}
                placeholder="Ex. 75"
                maxLength={3}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-white outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[var(--muted)]">Nombre max. de résultats</label>
              <input
                type="number"
                min={5}
                max={80}
                value={maxResults}
                onChange={(e) => setMaxResults(Number(e.target.value))}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-white outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>
        </div>
      </section>

      {error && (
        <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-100">
          {error}
        </div>
      )}

      {data?.warnings?.length ? (
        <div className="rounded-lg border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-50">
          <p className="font-medium text-amber-200">Avertissements</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {data.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {data && (
        <section className="space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 text-sm">
            <p className="text-[var(--muted)]">Requête envoyée aux APIs (résumé auto)</p>
            <p className="mt-1 font-medium text-white">{data.profile.searchQuery}</p>
            <p className="mt-3 text-[var(--muted)]">Termes extraits du CV (aperçu)</p>
            <p className="mt-1 text-zinc-300">{data.profile.cvKeywordsPreview}</p>
            <dl className="mt-3 grid gap-2 text-[var(--muted)] md:grid-cols-2">
              <div>
                <dt className="text-xs uppercase tracking-wide">En-tête détecté</dt>
                <dd className="text-white">{data.profile.headline || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide">Département</dt>
                <dd className="text-white">{data.profile.departement ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide">Lieu (Adzuna)</dt>
                <dd className="text-white">{data.profile.locationHint ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase tracking-wide">Totaux</dt>
                <dd className="text-white">
                  {data.meta.totalRaw} brutes → {data.meta.totalDeduped} après
                  dédoublonnage → {data.meta.returned} affichées
                </dd>
              </div>
            </dl>
          </div>

          <div className="space-y-3">
            {data.jobs.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">
                Aucune offre trouvée. Vérifiez vos clés API ou élargissez les mots-clés.
              </p>
            ) : (
              data.jobs.map((job) => (
                <article
                  key={job.id}
                  className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h2 className="text-lg font-semibold text-white">{job.title}</h2>
                      <p className="text-sm text-[var(--muted)]">
                        {job.company}
                        {job.location ? ` · ${job.location}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-200">
                        {sourceLabel[job.source]}
                      </span>
                      <span className="rounded-full bg-blue-900/50 px-2 py-0.5 text-xs text-blue-100">
                        score {(job.score * 100).toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  {job.descriptionSnippet ? (
                    <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-zinc-300">
                      {job.descriptionSnippet}
                    </p>
                  ) : null}
                  {job.matchedTokens.length > 0 && (
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      Mots communs avec le CV :{" "}
                      <span className="text-zinc-200">
                        {job.matchedTokens.join(", ")}
                      </span>
                    </p>
                  )}
                  <a
                    href={job.url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-block text-sm font-medium text-[var(--accent)] hover:underline"
                  >
                    Voir l&apos;offre
                  </a>
                </article>
              ))
            )}
          </div>
        </section>
      )}
    </main>
  );
}
