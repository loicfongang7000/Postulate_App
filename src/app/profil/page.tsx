"use client";

import { useCallback, useRef, useState } from "react";
import type { StructuredProfile } from "@/app/api/cv/parse-structured/route";

// ──────────────────────────────────────────────
// Copy button
// ──────────────────────────────────────────────
function CopyBtn({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    if (!value.trim()) return;
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }, [value]);

  if (!value.trim()) return null;

  return (
    <button
      onClick={copy}
      title="Copier"
      className={`ml-2 px-2 py-0.5 rounded text-xs font-medium transition-colors ${
        copied
          ? "bg-green-100 text-green-700 border border-green-300"
          : "bg-gray-100 text-gray-500 border border-gray-200 hover:bg-blue-50 hover:text-blue-600 hover:border-blue-300"
      }`}
    >
      {copied ? "✓ Copié" : "📋 Copier"}
    </button>
  );
}

// ──────────────────────────────────────────────
// Field row
// ──────────────────────────────────────────────
function Field({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  if (!value.trim()) return null;
  return (
    <div className="flex items-start gap-2 py-2 border-b border-gray-100 last:border-0">
      <span className="text-gray-500 text-sm w-36 shrink-0 pt-0.5">{label}</span>
      {multiline ? (
        <span className="text-gray-800 text-sm flex-1 whitespace-pre-wrap leading-relaxed">
          {value}
        </span>
      ) : (
        <span className="text-gray-800 text-sm flex-1 font-medium">{value}</span>
      )}
      <CopyBtn value={value} />
    </div>
  );
}

// ──────────────────────────────────────────────
// Section card
// ──────────────────────────────────────────────
function Section({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 bg-gray-50 border-b border-gray-200">
        <span className="text-lg">{icon}</span>
        <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">{title}</h2>
      </div>
      <div className="px-5 py-1">{children}</div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────
export default function ProfilPage() {
  const [profile, setProfile] = useState<StructuredProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setProfile(null);
    setLoading(true);
    try {
      const form = new FormData();
      form.append("cv", file);
      const res = await fetch("/api/cv/parse-structured", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erreur serveur.");
      setProfile(data.profile as StructuredProfile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inconnue.");
    } finally {
      setLoading(false);
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) handleFile(f);
    },
    [handleFile],
  );

  const p = profile;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-800">📋 Profil rapide</h1>
          <p className="text-gray-500 text-sm mt-1">
            Dépose ton CV — chaque champ sera extracté avec un bouton{" "}
            <span className="font-medium">Copier</span> pour remplir Workday ou tout autre
            formulaire en quelques secondes.
          </p>
        </div>

        {/* Upload zone */}
        {!profile && (
          <div
            onDrop={onDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-blue-300 bg-white rounded-2xl p-10 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
          >
            <div className="text-4xl mb-3">📄</div>
            <p className="text-gray-600 font-medium">
              Glisse ton CV ici ou clique pour choisir
            </p>
            <p className="text-gray-400 text-sm mt-1">PDF ou DOCX</p>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center shadow-sm">
            <div className="inline-block w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-gray-600 font-medium">Analyse du CV en cours…</p>
            <p className="text-gray-400 text-sm mt-1">Claude extrait tes informations</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-sm">
            ⚠️ {error}
          </div>
        )}

        {/* Results */}
        {p && (
          <>
            {/* Nouveau CV button */}
            <div className="flex justify-between items-center">
              <p className="text-green-600 text-sm font-medium">✅ CV analysé avec succès</p>
              <button
                onClick={() => {
                  setProfile(null);
                  setError(null);
                  if (fileRef.current) fileRef.current.value = "";
                }}
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Analyser un autre CV
              </button>
            </div>

            {/* Informations personnelles */}
            <Section icon="👤" title="Informations personnelles">
              <Field label="Prénom" value={p.personal.firstName} />
              <Field label="Nom" value={p.personal.lastName} />
              <Field label="E-mail" value={p.personal.email} />
              <Field label="Téléphone" value={p.personal.phone} />
              <Field label="Adresse" value={p.personal.address} />
              <Field label="Ville" value={p.personal.city} />
              <Field label="Code postal" value={p.personal.postalCode} />
              <Field label="Pays" value={p.personal.country} />
              <Field label="Nationalité" value={p.personal.nationality} />
              <Field label="LinkedIn" value={p.personal.linkedin} />
              <Field label="GitHub" value={p.personal.github} />
              <Field label="Site web" value={p.personal.website} />
            </Section>

            {/* Résumé */}
            {p.summary.trim() && (
              <Section icon="📝" title="Résumé / Profil">
                <div className="py-3">
                  <div className="flex items-start gap-2">
                    <p className="text-gray-800 text-sm flex-1 whitespace-pre-wrap leading-relaxed">
                      {p.summary}
                    </p>
                    <CopyBtn value={p.summary} />
                  </div>
                </div>
              </Section>
            )}

            {/* Formations */}
            {p.education.length > 0 && (
              <Section icon="🎓" title="Formations">
                {p.education.map((edu, i) => (
                  <div
                    key={i}
                    className={`py-3 ${i < p.education.length - 1 ? "border-b border-gray-100" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-gray-800 text-sm">
                        {edu.degree}{edu.field ? ` — ${edu.field}` : ""}
                      </span>
                      {(edu.startDate || edu.endDate) && (
                        <span className="text-gray-400 text-xs shrink-0 ml-2">
                          {edu.startDate && edu.endDate
                            ? `${edu.startDate} → ${edu.endDate}`
                            : edu.startDate || edu.endDate}
                        </span>
                      )}
                    </div>
                    <Field label="Diplôme" value={edu.degree} />
                    <Field label="Domaine" value={edu.field} />
                    <Field label="École" value={edu.school} />
                    <Field label="Ville" value={edu.city} />
                    <Field label="Date début" value={edu.startDate} />
                    <Field label="Date fin" value={edu.endDate} />
                    <Field label="Mention / GPA" value={edu.gpa} />
                    <Field label="Description" value={edu.description} multiline />
                  </div>
                ))}
              </Section>
            )}

            {/* Expériences */}
            {p.experience.length > 0 && (
              <Section icon="💼" title="Expériences professionnelles">
                {p.experience.map((exp, i) => (
                  <div
                    key={i}
                    className={`py-3 ${i < p.experience.length - 1 ? "border-b border-gray-100" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-gray-800 text-sm">
                        {exp.title} — {exp.company}
                      </span>
                      <span className="text-gray-400 text-xs shrink-0 ml-2">
                        {exp.startDate}
                        {exp.current ? " → Présent" : exp.endDate ? ` → ${exp.endDate}` : ""}
                      </span>
                    </div>
                    <Field label="Poste" value={exp.title} />
                    <Field label="Entreprise" value={exp.company} />
                    <Field label="Ville" value={exp.city} />
                    <Field label="Pays" value={exp.country} />
                    <Field label="Date début" value={exp.startDate} />
                    <Field
                      label="Date fin"
                      value={exp.current ? "Présent (actuel)" : exp.endDate}
                    />
                    <Field label="Description" value={exp.description} multiline />
                  </div>
                ))}
              </Section>
            )}

            {/* Compétences */}
            {p.skills.length > 0 && (
              <Section icon="⚙️" title="Compétences">
                <div className="py-3 flex flex-wrap gap-2">
                  {p.skills.map((skill, i) => (
                    <button
                      key={i}
                      onClick={async () => {
                        await navigator.clipboard.writeText(skill);
                      }}
                      title={`Copier "${skill}"`}
                      className="px-3 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-sm hover:bg-blue-100 transition-colors"
                    >
                      {skill}
                    </button>
                  ))}
                </div>
                <div className="pb-2">
                  <CopyBtn value={p.skills.join(", ")} />
                  <span className="text-gray-400 text-xs ml-2">Copier toutes les compétences</span>
                </div>
              </Section>
            )}

            {/* Langues */}
            {p.languages.length > 0 && (
              <Section icon="🌍" title="Langues">
                {p.languages.map((lang, i) => (
                  <Field
                    key={i}
                    label={lang.name}
                    value={lang.level}
                  />
                ))}
              </Section>
            )}

            {/* Certifications */}
            {p.certifications.filter((c) => c.name.trim()).length > 0 && (
              <Section icon="🏅" title="Certifications">
                {p.certifications
                  .filter((c) => c.name.trim())
                  .map((cert, i) => (
                    <div key={i} className="py-2 border-b border-gray-100 last:border-0">
                      <Field label="Certification" value={cert.name} />
                      {cert.issuer && <Field label="Émetteur" value={cert.issuer} />}
                      {cert.date && <Field label="Date" value={cert.date} />}
                    </div>
                  ))}
              </Section>
            )}

            {/* Navigation */}
            <div className="flex justify-between items-center pt-2 pb-6">
              <a
                href="/"
                className="text-sm text-blue-600 hover:underline"
              >
                ← Matching offres
              </a>
              <a
                href="/spontaneous"
                className="text-sm text-blue-600 hover:underline"
              >
                Candidature spontanée →
              </a>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
