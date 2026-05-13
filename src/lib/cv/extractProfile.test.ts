import { describe, expect, it } from "vitest";
import { extractProfile } from "./extractProfile";

describe("extractProfile", () => {
  it("extracts skills and search query from a developer CV", () => {
    const text = `
Jean Dupont
Développeur TypeScript / React
75011 Paris, France

Compétences
- Node.js, PostgreSQL, Docker
- Expérience en API REST
`;
    const p = extractProfile(text);
    expect(p.headline.length).toBeGreaterThan(2);
    expect(p.searchQuery.toLowerCase()).toMatch(/typescript|react|node/);
    expect(p.departement).toBe("75");
  });

  it("detects postal-based department outside Paris", () => {
    const text = "Adresse : 33000 Bordeaux\nDéveloppeur Java";
    const p = extractProfile(text);
    expect(p.departement).toBe("33");
  });

  it("skips spaced-letter name lines and builds a short API search query", () => {
    const text = `L O I C F O N G A N G
Développeur Python
Compétences : Docker, PostgreSQL, Spark
Master 2024 alternance laboratoire
`;
    const p = extractProfile(text);
    expect(p.headline.toLowerCase()).toContain("développeur");
    expect(p.searchQuery.split(/\s+/).length).toBeLessThanOrEqual(10);
    expect(p.searchQuery.length).toBeLessThanOrEqual(110);
    expect(p.searchQuery.toLowerCase()).toMatch(/python|docker|spark/);
    expect(p.cvKeywordsPreview.toLowerCase()).toMatch(/python/);
  });
});
