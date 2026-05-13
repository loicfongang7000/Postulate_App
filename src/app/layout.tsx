import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CV → Offres France",
  description: "Correspondance CV et offres (France Travail + Adzuna)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
