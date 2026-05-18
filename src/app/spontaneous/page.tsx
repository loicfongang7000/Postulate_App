"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type Contact = {
  email: string;
  firstName: string;
  lastName: string;
  position: string;
  department: string;
  confidence: number;
  source: "hunter" | "apollo";
};

type SearchResult = {
  domain: string | null;
  organization: string;
  contacts: Contact[];
  error?: string;
  notice?: string | null;
  warnings?: string[];
  debug?: { hunterCount: number; apolloCount: number };
};

type SendStep = "idle" | "generating" | "review" | "sending" | "done" | "error";

const HR_DEPARTMENTS = new Set([
  "human_resources", "management", "executive", "recruiting", "talent", "people",
]);

const departmentLabel: Record<string, string> = {
  human_resources: "RH", management: "Management", executive: "Direction",
  recruiting: "Recrutement", talent: "Talent", it: "IT",
  finance: "Finance", marketing: "Marketing", sales: "Commercial",
};

function SpontaneousInner() {
  const params = useSearchParams();

  const [cvText, setCvText] = useState("");
  const [cvBase64, setCvBase64] = useState<string | null>(null);
  const [cvFilename, setCvFilename] = useState("");
  const [cvLoaded, setCvLoaded] = useState(false);
  const [targetRole, setTargetRole] = useState("");
  const [companyName, setCompanyName] = useState(params.get("company") ?? "");
  const [domainOverride, setDomainOverride] = useState(params.get("domain") ?? "");
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [searchError, setSearchError] = useState("");

  const [senderCity, setSenderCity] = useState("");
  const [senderPhone, setSenderPhone] = useState("");
  const [senderContactEmail, setSenderContactEmail] = useState("");

  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [manualEmail, setManualEmail] = useState("");
  const [manualFirstName, setManualFirstName] = useState("");
  const [manualLastName, setManualLastName] = useState("");
  const [senderName, setSenderName] = useState("");
  const [sendStep, setSendStep] = useState<SendStep>("idle");
  const [letter, setLetter] = useState("");
  const [sendError, setSendError] = useState("");

  const onCvFile = useCallback(async (file: File) => {
    // Extract text for letter generation
    const fd = new FormData();
    fd.append("cv", file);
    const res = await fetch("/api/match", { method: "POST", body: fd });
    const json = (await res.json()) as { cvText?: string; error?: string };
    if (json.cvText) {
      setCvText(json.cvText);
      setCvLoaded(true);
    }
    // Store as base64 for email attachment
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    setCvBase64(btoa(binary));
    setCvFilename(file.name);
  }, []);

  const onFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) void onCvFile(f);
      e.target.value = "";
    },
    [onCvFile],
  );

  const searchCompany = useCallback(async (nameOverride?: string, domOverride?: string) => {
    const name = (nameOverride ?? companyName).trim();
    if (!name) return;
    setSearching(true);
    setSearchError("");
    setResult(null);
    setSelectedContact(null);
    setSendStep("idle");

    const res = await fetch("/api/spontaneous/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        companyName: name,
        domain: (domOverride ?? domainOverride).trim() || undefined,
      }),
    });
    const json = (await res.json()) as SearchResult & { error?: string };
    if (!res.ok || json.error) {
      setSearchError(json.error ?? `Erreur ${res.status}`);
    } else {
      setResult(json);
    }
    setSearching(false);
  }, [companyName, domainOverride]);

  // Auto-search when arriving from a job card via URL params
  useEffect(() => {
    const fromCard = params.get("company");
    if (fromCard) {
      void searchCompany(fromCard, params.get("domain") ?? undefined);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const downloadDocx = useCallback(async (letterText: string) => {
    const recipientName = selectedContact
      ? [selectedContact.firstName, selectedContact.lastName].filter(Boolean).join(" ")
      : undefined;
    const company = result?.organization ?? companyName;
    const res = await fetch("/api/apply/download-letter", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        letter: letterText,
        senderName: senderName.trim(),
        senderCity: senderCity.trim() || undefined,
        senderPhone: senderPhone.trim() || undefined,
        senderEmail: senderContactEmail.trim() || undefined,
        company,
        targetRole: targetRole.trim() || undefined,
        recipientName: recipientName || undefined,
        recipientPosition: selectedContact?.position || undefined,
      }),
    });
    if (!res.ok) return;
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lettre-${company.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40)}.docx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, [selectedContact, senderName, senderCity, senderPhone, senderContactEmail, result, companyName, targetRole]);

  const generateLetter = useCallback(async () => {
    if (!selectedContact || !senderName.trim()) return;
    setSendStep("generating");
    setSendError("");

    const recipientName = [selectedContact.firstName, selectedContact.lastName].filter(Boolean).join(" ");
    const res = await fetch("/api/apply/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        cvText,
        company: result?.organization ?? companyName,
        senderName: senderName.trim(),
        spontaneous: true,
        targetRole: targetRole.trim() || undefined,
        recipientName: recipientName || undefined,
        recipientPosition: selectedContact.position || undefined,
      }),
    });
    const json = (await res.json()) as { letter?: string; error?: string };
    if (!res.ok || json.error) {
      setSendError(json.error ?? `Erreur ${res.status}`);
      setSendStep("error");
      return;
    }
    const generatedLetter = json.letter ?? "";
    setLetter(generatedLetter);
    setSendStep("review");
    // Téléchargement automatique du .docx dès que la lettre est prête
    void downloadDocx(generatedLetter);
  }, [selectedContact, senderName, cvText, result, companyName, targetRole, downloadDocx]);

  const sendEmail = useCallback(async () => {
    if (!selectedContact) return;
    setSendStep("sending");

    const company = result?.organization ?? companyName;
    const subject = targetRole.trim()
      ? `Candidature spontanée – ${targetRole.trim()} – ${senderName}`
      : `Candidature spontanée – ${company} – ${senderName}`;

    const res = await fetch("/api/apply/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipientEmail: selectedContact.email,
        senderName,
        jobTitle: subject,
        company,
        letter,
        cvBase64: cvBase64 ?? undefined,
        cvFilename: cvFilename || undefined,
      }),
    });
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!res.ok || json.error) {
      setSendError(json.error ?? `Erreur ${res.status}`);
      setSendStep("error");
      return;
    }
    setSendStep("done");
  }, [selectedContact, senderName, result, companyName, letter]);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-10">
      {/* Navigation */}
      <nav className="flex gap-3 text-sm flex-wrap">
        <a
          href="/"
          className="px-3 py-1 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/20 transition-colors"
        >
          🔍 Matching offres
        </a>
        <span className="px-3 py-1 rounded-full bg-white/10 text-white font-medium border border-white/20">
          ✉️ Candidature spontanée
        </span>
        <a
          href="/profil"
          className="px-3 py-1 rounded-full text-zinc-400 hover:text-white hover:bg-white/10 border border-transparent hover:border-white/20 transition-colors"
        >
          📋 Profil rapide (Workday)
        </a>
      </nav>

      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-white">
          Candidature spontanée
        </h1>
        <p className="text-sm text-[var(--muted)]">
          Trouvez les contacts RH d&apos;une entreprise via Hunter.io et envoyez une
          candidature personnalisée — même sans offre publiée.
        </p>
      </header>

      {/* CV upload */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-white">Votre CV</p>
            <p className="text-xs text-[var(--muted)]">
              {cvLoaded
                ? "CV chargé — utilisé pour personnaliser la lettre"
                : "Chargez votre CV pour personnaliser la lettre générée"}
            </p>
          </div>
          <label className="cursor-pointer rounded-md border border-[var(--border)] px-4 py-2 text-sm text-zinc-300 transition-colors hover:border-zinc-500 hover:text-white">
            {cvLoaded ? "Changer de CV" : "Charger le CV"}
            <input
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="sr-only"
              onChange={onFileInput}
            />
          </label>
        </div>
        {cvLoaded && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-green-950/30 px-3 py-2 text-xs text-green-400">
            <span>✓</span>
            <span>CV chargé et prêt à l&apos;emploi</span>
          </div>
        )}
      </section>

      {/* Company search */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
        <p className="text-sm font-medium text-white">Rechercher une entreprise</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs text-[var(--muted)]">Nom de l&apos;entreprise *</label>
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void searchCompany()}
              placeholder="Ex. Société Générale, Decathlon…"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-[var(--muted)]">
              Domaine (optionnel — si la recherche échoue)
            </label>
            <input
              value={domainOverride}
              onChange={(e) => setDomainOverride(e.target.value)}
              placeholder="Ex. societe-generale.fr"
              className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
            />
          </div>
        </div>
        <button
          onClick={() => void searchCompany()}
          disabled={!companyName.trim() || searching}
          className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {searching ? "Recherche en cours…" : "Trouver les contacts RH"}
        </button>

        {searchError && (
          <div className="rounded-md border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-100">
            {searchError}
          </div>
        )}
      </section>

      {/* Results */}
      {result && (
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-white">{result.organization}</p>
              <p className="text-xs text-[var(--muted)]">{result.domain}</p>
            </div>
            <span className="rounded-full bg-zinc-800 px-3 py-1 text-xs text-zinc-300">
              {result.contacts.length} contact{result.contacts.length !== 1 ? "s" : ""} trouvé{result.contacts.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Domain used + per-source count */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500">
            <span>Domaine interrogé : <span className="font-mono text-zinc-300">{result.domain}</span></span>
            {result.debug && (
              <>
                <span>· Hunter.io : {result.debug.hunterCount} contact{result.debug.hunterCount !== 1 ? "s" : ""}</span>
                <span>· Apollo.io : {result.debug.apolloCount} contact{result.debug.apolloCount !== 1 ? "s" : ""}</span>
              </>
            )}
          </div>

          {result.notice && (
            <div className="rounded-md border border-amber-900/50 bg-amber-950/20 px-4 py-2 text-xs text-amber-300">
              ℹ {result.notice}
            </div>
          )}

          {result.warnings?.map((w, i) => (
            <div key={i} className="rounded-md border border-amber-900/50 bg-amber-950/20 px-4 py-2 text-xs text-amber-300">
              ⚠ {w}
            </div>
          ))}

          {result.contacts.length === 0 && (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-4 py-6 text-center text-sm text-[var(--muted)]">
              Aucun contact trouvé pour ce domaine dans la base Hunter.io.
            </div>
          )}

          {result.contacts.length > 0 && (
            <div className="space-y-2">
              {result.contacts.map((c) => (
                <button
                  key={c.email}
                  onClick={() => {
                    setSelectedContact(c);
                    setSendStep("idle");
                    setLetter("");
                  }}
                  className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-colors ${
                    selectedContact?.email === c.email
                      ? "border-blue-600 bg-blue-950/30"
                      : "border-[var(--border)] bg-[var(--card)] hover:border-zinc-500"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                        HR_DEPARTMENTS.has(c.department)
                          ? "bg-blue-900/50 text-blue-200"
                          : "bg-zinc-800 text-zinc-400"
                      }`}>
                        {c.firstName?.[0] ?? c.email[0].toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-white">
                          {c.firstName || c.lastName
                            ? `${c.firstName} ${c.lastName}`.trim()
                            : c.email}
                        </p>
                        <p className="text-xs text-[var(--muted)]">
                          {c.email}{c.position ? ` · ${c.position}` : ""}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {c.department && (
                        <span className={`rounded-full px-2 py-0.5 text-xs ${
                          HR_DEPARTMENTS.has(c.department)
                            ? "bg-blue-900/50 text-blue-200"
                            : "bg-zinc-800 text-zinc-400"
                        }`}>
                          {departmentLabel[c.department] ?? c.department}
                        </span>
                      )}
                      <span className={`text-xs ${
                        c.confidence >= 80 ? "text-green-400" :
                        c.confidence >= 50 ? "text-amber-400" : "text-zinc-500"
                      }`}>
                        {c.confidence}% fiabilité
                      </span>
                      <span className="text-xs text-zinc-600">
                        {c.source === "apollo" ? "Apollo.io" : "Hunter.io"}
                      </span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Manual email entry — toujours visible */}
      <details className="group rounded-xl border border-[var(--border)] bg-[var(--card)]">
        <summary className="cursor-pointer select-none px-5 py-3 text-sm text-zinc-400 hover:text-white list-none flex items-center justify-between">
          <span>Saisir un e-mail manuellement</span>
          <span className="text-xs text-zinc-600 group-open:hidden">▸ vous avez déjà l&apos;adresse du recruteur ?</span>
        </summary>
        <div className="border-t border-[var(--border)] px-5 py-4 space-y-3">
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1">
              <label className="text-xs text-[var(--muted)]">Prénom</label>
              <input
                value={manualFirstName}
                onChange={(e) => setManualFirstName(e.target.value)}
                placeholder="Ex. Sophie"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-[var(--muted)]">Nom</label>
              <input
                value={manualLastName}
                onChange={(e) => setManualLastName(e.target.value)}
                placeholder="Ex. Martin"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-[var(--muted)]">E-mail *</label>
              <input
                type="email"
                value={manualEmail}
                onChange={(e) => setManualEmail(e.target.value)}
                placeholder="recruteur@entreprise.fr"
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
              />
            </div>
          </div>
          <button
            disabled={!manualEmail.trim() || !manualEmail.includes("@")}
            onClick={() => {
              setSelectedContact({
                email: manualEmail.trim().toLowerCase(),
                firstName: manualFirstName.trim(),
                lastName: manualLastName.trim(),
                position: "",
                department: "",
                confidence: 100,
                source: "hunter",
              });
              setSendStep("idle");
              setLetter("");
            }}
            className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Utiliser cet e-mail
          </button>
        </div>
      </details>

      {/* Send flow — visible dès qu'un contact est sélectionné (liste ou manuel) */}
      {selectedContact && (
        <section className="space-y-4">
          {sendStep === "idle" && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
              <p className="text-sm font-medium text-white">
                Postuler auprès de{" "}
                <span className="text-blue-400">
                  {selectedContact.firstName
                    ? `${selectedContact.firstName} ${selectedContact.lastName}`.trim()
                    : selectedContact.email}
                </span>
                {selectedContact.position && (
                  <span className="ml-1 text-xs text-[var(--muted)]">· {selectedContact.position}</span>
                )}
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label className="text-xs text-[var(--muted)]">Votre nom complet *</label>
                  <input
                    value={senderName}
                    onChange={(e) => setSenderName(e.target.value)}
                    placeholder="Ex. Marie Dupont"
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-[var(--muted)]">Poste visé (optionnel)</label>
                  <input
                    value={targetRole}
                    onChange={(e) => setTargetRole(e.target.value)}
                    placeholder="Ex. Chargé de communication, Dev React…"
                    className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)]"
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <label className="text-xs text-[var(--muted)]">Ville</label>
                  <input
                    value={senderCity}
                    onChange={(e) => setSenderCity(e.target.value)}
                    placeholder="Ex. Paris"
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
              {!cvLoaded && (
                <p className="text-xs text-amber-400">
                  ⚠ Chargez votre CV en haut — il sera joint à l&apos;e-mail et personnalisera la lettre.
                </p>
              )}
              {cvLoaded && (
                <p className="text-xs text-green-400">
                  ✓ CV chargé — il sera joint automatiquement à l&apos;e-mail
                </p>
              )}
              <button
                onClick={() => void generateLetter()}
                disabled={!senderName.trim()}
                className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Générer la lettre de motivation
              </button>
            </div>
          )}

          {sendStep === "generating" && (
            <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-8 justify-center text-sm text-[var(--muted)]">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-blue-400" />
              Génération de la lettre…
            </div>
          )}

          {sendStep === "review" && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-white">Lettre de motivation</p>
                <span className="text-xs text-[var(--muted)]">
                  À envoyer à{" "}
                  <span className="font-mono text-zinc-300">{selectedContact.email}</span>
                </span>
              </div>
              <textarea
                value={letter}
                onChange={(e) => setLetter(e.target.value)}
                rows={14}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm leading-relaxed text-white outline-none focus:border-[var(--accent)]"
              />
              <div className="flex flex-wrap justify-between gap-3">
                <button
                  onClick={() => setSendStep("idle")}
                  className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-zinc-300 hover:text-white"
                >
                  ← Retour
                </button>
                <div className="flex gap-3">
                  <button
                    onClick={() => void downloadDocx(letter)}
                    className="rounded-md border border-zinc-600 px-4 py-2 text-sm text-zinc-300 hover:border-zinc-400 hover:text-white"
                  >
                    ↓ Re-télécharger .docx
                  </button>
                  <button
                    onClick={() => void sendEmail()}
                    className="rounded-md bg-blue-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
                  >
                    Envoyer par e-mail
                  </button>
                </div>
              </div>
            </div>
          )}

          {sendStep === "sending" && (
            <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--card)] px-5 py-8 justify-center text-sm text-[var(--muted)]">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--border)] border-t-blue-400" />
              Envoi de l&apos;e-mail…
            </div>
          )}

          {sendStep === "done" && (
            <div className="flex flex-col items-center gap-3 rounded-xl border border-green-900/50 bg-green-950/20 px-5 py-8 text-center">
              <span className="text-3xl text-green-400">✓</span>
              <div>
                <p className="font-medium text-white">Candidature envoyée !</p>
                <p className="mt-1 text-sm text-[var(--muted)]">
                  E-mail envoyé à{" "}
                  <span className="font-mono text-zinc-300">{selectedContact.email}</span>
                </p>
                {cvFilename && (
                  <p className="mt-0.5 text-xs text-zinc-500">
                    Pièce jointe : {cvFilename}
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setSendStep("idle");
                  setSelectedContact(null);
                  setLetter("");
                }}
                className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-zinc-300 hover:text-white"
              >
                Postuler à une autre entreprise
              </button>
            </div>
          )}

          {sendStep === "error" && (
            <div className="rounded-xl border border-red-900/60 bg-red-950/40 px-5 py-4 space-y-3">
              <p className="text-sm text-red-100">{sendError}</p>
              <button
                onClick={() => setSendStep("idle")}
                className="rounded-md border border-[var(--border)] px-4 py-2 text-sm text-zinc-300 hover:text-white"
              >
                Réessayer
              </button>
            </div>
          )}
        </section>
      )}
    </main>
  );
}

export default function SpontaneousPage() {
  return (
    <Suspense>
      <SpontaneousInner />
    </Suspense>
  );
}
