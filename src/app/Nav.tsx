"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Nav() {
  const path = usePathname();
  const tab =
    "rounded-md px-4 py-2 text-sm font-medium transition-colors";
  const active = `${tab} bg-blue-600 text-white`;
  const inactive = `${tab} text-[var(--muted)] hover:text-white`;

  return (
    <nav className="border-b border-[var(--border)] bg-[var(--card)]">
      <div className="mx-auto flex max-w-5xl gap-2 px-4 py-3">
        <Link href="/" className={path === "/" ? active : inactive}>
          Matching d&apos;offres
        </Link>
        <Link
          href="/spontaneous"
          className={path === "/spontaneous" ? active : inactive}
        >
          Candidature spontanée
        </Link>
      </div>
    </nav>
  );
}
