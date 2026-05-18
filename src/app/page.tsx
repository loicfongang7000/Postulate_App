"use client";

import { useCallback, useMemo, useState } from "react";

type Job = {
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
  contactEmail?: string | null;
  companyUrl?: string | null;
};

type MatchResponse = {
  profile: {
    headline: string;
    searchQuery: string;
    cvKeywordsPreview: string;
    departement: string | null;
    locationHint: string | null;
  };
  jobs: Job[];
  warnings: string[];
  meta: {
    totalRaw: number;
    totalDeduped: number;
    returned: number;
    sources?: Record<string, number>;
  };
  error?: string;
  cvText: string;
};

type ApplyStep =
  | "form"
  | "generating"
  | "review"
  | "sending"
  | "done"
  | "error";

export default function HomePage() {
  const [keywords, setKeywords] = useState("");
  const [where, setWhere] = useState("");
  const [departement, setDepartement] = useState("");
  const [maxResults, setMaxResults] = useState(45);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MatchResponse | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Apply modal state
  const [applyJob, setApplyJob] = useState<Job | null>(null);
  const [applyStep, setApplyStep] = useState<ApplyStep>("form");
  const [senderName, setSenderName] = useState("");
  const [senderCity, setSenderCity] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [senderContactEmail, setSenderContactEmail] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  type StepStatus = "idle" | "searching" | "found" | "not_found";
  type EmailStep = { label: string; status: StepStatus };
  const [emailSteps, setEmailSteps] = useState<EmailStep[]>([]);
  const [emailExtracting, setEmailExtracting] = useState(false);
  const [emailSource, setEmailSource] = useState<"offre" | "hunter" | "entreprise" | null>(null);
  const [letter, setLetter] = useState("");
  const [applyError, setApplyError] = useState("");

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

  const sourceLabel: Record<string, string> = useMemo(
    () => ({
      france_travail: "France Travail",
      adzuna: "Adzuna",
      jooble: "Jooble",
      arbeitnow: "Arbeitnow",
      remotive: "Remotive",
    }),
    [],
  );

  const sourceBadgeColor: Record<string, string> = useMemo(
    () => ({
      france_travail: "bg-blue-900/50 text-blue-200",
      adzuna: "bg-purple-900/50 text-purple-200",
      jooble: "bg-orange-900/50 text-orange-200",
      arbeitnow: "bg-teal-900/50 text-teal-200",
      remotive: "bg-green-900/50 text-green-200",
    }),
    [],
  );

  const openApplyModal = useCallback((job: Job) => {
    setApplyJob(job);
    setApplyStep("form");
    setLetter("");
    setApplyError("");
    setEmailSource(null);
    setEmailSteps([]);
    setRecipientEmail("");

    // France Travail sometimes includes the email directly in the API response
    if (job.contactEmail) {
      setRecipientEmail(job.contactEmail);
      setEmailSource("offre");
      setEmailExtracting(false);
      setEmailSteps([{ label: "Données de l'offre France Travail", status: "found" }]);
      return;
    }

    setEmailExtracting(true);

    const post = async (body: Record<string, unknown>) => {
      const r = await fetch("/api/apply/extract-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return r.json() as Promise<Record<string, unknown>>;
    };

    const updateStep = (index: number, status: StepStatus) =>
      setEmailSteps((prev) =>
        prev.map((s, i) => (i === index ? { ...s, status } : s)),
      );

    void (async () => {
      // 4 visible steps: job page / domain / hunter / website
      setEmailSteps([
        { label: "Page de l'offre", status: "idle" },
        { label: "Recherche du domaine de l'entreprise", status: "idle" },
        { label: "Hunter.io (base de contacts)", status: "idle" },
        { label: "Site web de l'entreprise", status: "idle" },
      ]);

      const setStep = (i: number, status: StepStatus) =>
        setEmailSteps((p) => p.map((s, idx) => (idx === i ? { ...s, status } : s)));

      try {
        // Step 0 — job page
        setStep(0, "searching");
        const r0 = await post({ method: "job-page", url: job.url });
        if (typeof r0.email === "string" && r0.email.trim()) {
          setStep(0, "found");
          setRecipientEmail(r0.email.trim());
          setEmailSource("offre");
          return;
        }
        setStep(0, "not_found");

        // Step 1 — find company domain
        setStep(1, "searching");
        const rd = await post({
          method: "find-domain",
          company: job.company,
          companyUrl: job.companyUrl ?? null,
        });
        const domain = typeof rd.domain === "string" ? rd.domain : null;
        setStep(1, domain ? "found" : "not_found");

        if (!domain) {
          // No domain → steps 2 & 3 are impossible
          setStep(2, "not_found");
          setStep(3, "not_found");
          return;
        }

        // Step 2 — Hunter.io
        setStep(2, "searching");
        const r2 = await post({ method: "hunter", domain });
        if (typeof r2.email === "string" && r2.email.trim()) {
          setStep(2, "found");
          setRecipientEmail(r2.email.trim());
          setEmailSource("hunter");
          return;
        }
        setStep(2, "not_found");

        // Step 3 — company website scraping
        setStep(3, "searching");
        const r3 = await post({ method: "website", domain });
        if (typeof r3.email === "string" && r3.email.trim()) {
          setStep(3, "found");
          setRecipientEmail(r3.email.trim());
          setEmailSource("entreprise");
          return;
        }
        setStep(3, "not_found");
      } catch { /* ignore */ } finally {
        setEmailExtracting(false);
      }
    })();
  }, []);

  const closeApplyModal = useCallback(() => {
    setApplyJob(null);
  }, []);

  const downloadDocx = useCallback(async (letterText: string, job: Job) => {
    const res = await fetch("/api/apply/download-letter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        letter: letterText,
        senderName: senderName.trim(),
        senderCity: senderCity.trim() || undefined,
        senderPhone: senderPhone.trim() || undefined,
        senderEmail: senderContactEmail.trim() || undefined,
        company: job.company,
        targetRole: job.title,
      }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lettre-${job.company.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [senderName, senderCity, senderPhone, senderContactEmail]);

  const generateLetter = useCallback(async () => {
    if (!applyJob || !data) return;
    setApplyStep("generating");
    try {
      const res = await fetch("/api/apply/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cvText: data.cvText,
          jobTitle: applyJob.title,
          company: applyJob.company,
          jobDescription: applyJob.descriptionSnippet,
          senderName,
        }),
      });
      const json = (await res.json()) as { letter?: string; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
      const generatedLetter = json.letter ?? "";
      setLetter(generatedLetter);
      setApplyStep("review");
      // Téléchargement automatique du .docx
      void downloadDocx(generatedLetter, applyJob);
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : "Erreur inconnue.");
      setApplyStep("error");
    }
  }, [applyJob, data, senderName, downloadDocx]);

  const sendEmail = useCallback(async () => {
    if (!applyJob) return;
    setApplyStep("sending");
    try {
      const res = await fetch("/api/apply/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientEmail,
          senderName,
          jobTitle: applyJob.title,
          company: applyJob.company,
          letter,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(json.error ?? `Erreur ${res.status}`);
      setApplyStep("done");
    } catch (e) {
      setApplyError(e instanceof Error ? e.message : "Erreur inconnue.");
      setApplyStep("error");
    }
  }, [applyJob, recipientEmail, senderName, letter]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-4 py-10">
      {/* Navigation */}
      <nav className="flex gap-3 text-sm flex-wrap">
        <span className="px-3 py-1 rounded-full bg-white/10 text-white font-medium border border-white/20">
          🔍 Matching offres
        </span>
        <a
          href="/spontaneous"
          className="px-3 py-1 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/20 transition-colors"
        >
          ✉️ Candidature spontanée
        </a>
        <a
          href="/profil"
          className="px-3 py-1 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/20 transition-colors"
        >
          📋 Profil rapide (Workday)
        </a>
      </nav>

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
                  {data.meta.totalRaw} brutes → {data.meta.totalDeduped} dédoublonnées → {data.meta.returned} affichées
                </dd>
              </div>
              {data.meta.sources && (
                <div className="col-span-full">
                  <dt className="text-xs uppercase tracking-wide mb-1">Par source</dt>
                  <dd className="flex flex-wrap gap-2">
                    {Object.entries(data.meta.sources)
                      .filter(([, n]) => n > 0)
                      .map(([src, n]) => (
                        <span key={src} className={`rounded-full px-2 py-0.5 text-xs ${sourceBadgeColor[src] ?? "bg-zinc-800 text-zinc-200"}`}>
                          {sourceLabel[src] ?? src} : {n}
                        </span>
                      ))}
                  </dd>
                </div>
              )}
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
                      <span className={`rounded-full px-2 py-0.5 text-xs ${sourceBadgeColor[job.source] ?? "bg-zinc-800 text-zinc-200"}`}>
                        {sourceLabel[job.source] ?? job.source}
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
                  <div className="mt-3 flex items-center gap-4">
                    <a
                      href={job.url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm font-medium text-[var(--accent)] hover:underline"
                    >
                      Voir l&apos;offre
                    </a>
                    <button
                      onClick={() => openApplyModal(job)}
                      className="rounded-md bg-blue-600 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-blue-500"
                    >
                      Postuler
                    </button>
                    {job.company && job.company !== "—" && (
                      <a
                        href={`/spontaneous?company=${encodeURIComponent(job.company)}${job.companyUrl ? `&domain=${encodeURIComponent(new URL(job.companyUrl).hostname)}` : ""}`}
                        className="text-sm font-medium text-zinc-400 transition-colors hover:text-white"
                      >
                        Cibler l&apos;entreprise →
                      </a>
                    )}
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      )}

      {/* Apply modal */}
      {applyJob && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) closeApplyModal();
          }}
        >
          <div className="flex w-full max-w-2xl flex-col gap-5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Postuler à ce poste
                </h2>
                <p className="mt-0.5 text-sm text-[var(--muted)]">
                  {applyJob.title}
                  {applyJob.company ? ` · ${applyJob.company}` : ""}
                </p>
              </div>
              <button
                onClick={closeApplyModal}
                className="shrink-0 text-zinc-400 hover:text-white"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            {applyStep === "form" && (
              <div className="flex flex-col gap-4 text-sm">
                <div className="space-y-1">
                  <label className="text-[var(--muted)]">Votre nom complet *</label>
                  <input
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="Ex. Marie Dupont"
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-white outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1">
                    <label className="text-xs text-[var(--muted)]">Ville</label>
                    <input
                      value={senderCity}
                      onChange={(e) => setSenderCity(e.target.value)}
                      placeholder="Ex. Lyon"
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-[var(--muted)]">Téléphone</label>
                    <input
                      value={senderPhone}
                      onChange={(e) => setSenderPhone(e.target.value)}
                      placeholder="Ex. 06 12 34 56 78"
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs text-[var(--muted)]">Votre e-mail</label>
                    <input
                      type="email"
                      value={senderContactEmail}
                      onChange={(e) => setSenderContactEmail(e.target.value)}
                      placeholder="Ex. marie@email.com"
                      className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
                    />
                  </div>
                </div>

                {/* Email search steps */}
                {emailSteps.length > 0 && (
                  <div className="rounded-lg border border-[var(--border)] bg-[var(--background)] p-3 space-y-2">
                    <p className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">
                      Recherche de l&apos;email du recruteur
                    </p>
                    {emailSteps.map((step, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {step.status === "searching" && (
                          <div className="h-3 w-3 shrink-0 animate-spin rounded-full border border-[var(--border)] border-t-blue-400" />
                        )}
                        {step.status === "found" && (
                          <span className="shrink-0 text-green-400">✓</span>
                        )}
                        {step.status === "not_found" && (
                          <span className="shrink-0 text-zinc-600">✗</span>
                        )}
                        {step.status === "idle" && (
                          <span className="shrink-0 text-zinc-700">·</span>
                        )}
                        <span className={
                          step.status === "found" ? "text-green-400" :
                          step.status === "searching" ? "text-white" :
                          step.status === "not_found" ? "text-zinc-600" : "text-zinc-700"
                        }>
                          {step.label}
                        </span>
                        {step.status === "found" && recipientEmail && i >= 2 && (
                          <span className="ml-auto font-mono text-green-300">{recipientEmail}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-end gap-3">
                  <button
                    onClick={closeApplyModal}
                    className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-zinc-300 hover:text-white"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={() => void generateLetter()}
                    disabled={!senderName.trim()}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Générer la lettre de motivation
                  </button>
                </div>
              </div>
            )}

            {applyStep === "generating" && (
              <div className="flex flex-col items-center gap-3 py-8 text-sm text-[var(--muted)]">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-blue-400" />
                <p>Génération de la lettre par l&apos;IA…</p>
              </div>
            )}

            {applyStep === "review" && (
              <div className="flex flex-col gap-4 text-sm">
                <div className="space-y-1">
                  <label className="text-[var(--muted)]">
                    Lettre de motivation — modifiez-la si besoin
                  </label>
                  <textarea
                    value={letter}
                    onChange={(e) => setLetter(e.target.value)}
                    rows={12}
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm leading-relaxed text-white outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <label className="text-[var(--muted)]">
                      E-mail du recruteur (pour l&apos;envoi)
                    </label>
                    {emailExtracting && (
                      <span className="text-xs text-zinc-500 italic">Recherche…</span>
                    )}
                    {!emailExtracting && recipientEmail && (
                      <span className="text-xs text-amber-400">
                        ⚠ Trouvé{emailSource === "hunter" ? " via Hunter.io" : emailSource === "entreprise" ? " sur le site de l'entreprise" : " sur l'offre"} :{" "}
                        <span className="font-mono">{recipientEmail}</span> — vérifiez avant d&apos;envoyer
                      </span>
                    )}
                  </div>
                  {!emailExtracting && !recipientEmail && (
                    <p className="text-xs text-zinc-500">
                      Non trouvé — consultez la page de l&apos;offre ou laissez vide pour copier la lettre manuellement.
                    </p>
                  )}
                  <input
                    type="email"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder="recruteur@entreprise.fr (optionnel)"
                    disabled={emailExtracting}
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-white outline-none focus:border-[var(--accent)] disabled:opacity-50"
                  />
                </div>
                <div className="flex flex-wrap justify-between gap-3">
                  <button
                    onClick={closeApplyModal}
                    className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-zinc-300 hover:text-white"
                  >
                    Fermer
                  </button>
                  <div className="flex gap-3">
                    {applyJob && (
                      <button
                        onClick={() => void downloadDocx(letter, applyJob)}
                        disabled={!letter.trim()}
                        className="rounded-md border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-400 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        ↓ Re-télécharger .docx
                      </button>
                    )}
                    <button
                      onClick={() => void sendEmail()}
                      disabled={!letter.trim() || !recipientEmail.trim()}
                      className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Envoyer par e-mail
                    </button>
                  </div>
                </div>
              </div>
            )}

            {applyStep === "sending" && (
              <div className="flex flex-col items-center gap-3 py-8 text-sm text-[var(--muted)]">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border)] border-t-blue-400" />
                <p>Envoi de l&apos;e-mail…</p>
              </div>
            )}

            {applyStep === "done" && (
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-900/40 text-2xl text-green-400">
                  ✓
                </div>
                <div>
                  <p className="font-medium text-white">Candidature envoyée !</p>
                  <p className="mt-1 text-sm text-[var(--muted)]">
                    Votre lettre a été envoyée à{" "}
                    <span className="text-zinc-200">{recipientEmail}</span>.
                  </p>
                </div>
                <button
                  onClick={closeApplyModal}
                  className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-zinc-300 hover:text-white"
                >
                  Fermer
                </button>
              </div>
            )}

            {applyStep === "error" && (
              <div className="flex flex-col gap-4">
                <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-100">
                  {applyError}
                </div>
                <div className="flex justify-end gap-3">
                  <button
                    onClick={closeApplyModal}
                    className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-zinc-300 hover:text-white"
                  >
                    Fermer
                  </button>
                  <button
                    onClick={() => setApplyStep("form")}
                    className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
                  >
                    Réessayer
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
