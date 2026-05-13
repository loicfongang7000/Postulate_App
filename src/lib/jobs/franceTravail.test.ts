import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("searchFranceTravail (fetch mock)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.FRANCE_TRAVAIL_CLIENT_ID = "test-id";
    process.env.FRANCE_TRAVAIL_CLIENT_SECRET = "test-secret";
    process.env.FRANCE_TRAVAIL_TOKEN_URL =
      "https://example.test/oauth/token?realm=/partenaire";
    process.env.FRANCE_TRAVAIL_API_BASE = "https://api.example.test";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FRANCE_TRAVAIL_CLIENT_ID;
    delete process.env.FRANCE_TRAVAIL_CLIENT_SECRET;
    delete process.env.FRANCE_TRAVAIL_TOKEN_URL;
    delete process.env.FRANCE_TRAVAIL_API_BASE;
  });

  it("fetches token then search and normalizes offers", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/oauth/token")) {
          return new Response(
            JSON.stringify({ access_token: "abc", expires_in: 3600 }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("/offres/search")) {
          const auth = init?.headers
            ? new Headers(init.headers as HeadersInit).get("Authorization")
            : null;
          expect(auth).toBe("Bearer abc");
          return new Response(
          JSON.stringify({
            resultats: [
              {
                id: "ft1",
                intitule: "Développeur React",
                entreprise: { nom: "ACME" },
                lieuTravail: { libelle: "Paris" },
                description: "TypeScript",
                contact: { urlPostulation: "https://apply.example" },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    },
    );
    vi.stubGlobal("fetch", fetchMock);

    const { searchFranceTravail } = await import("./franceTravail");
    const jobs = await searchFranceTravail({
      motsCles: "react",
      departement: "75",
      rangeStart: 0,
      rangeEnd: 9,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe("Développeur React");
    expect(jobs[0].source).toBe("france_travail");
    expect(jobs[0].url).toBe("https://apply.example");
  });

  it("returns empty array on 204 No Content (no retry body)", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/oauth/token")) {
          return new Response(
            JSON.stringify({ access_token: "abc", expires_in: 3600 }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("/offres/search")) {
          const hasRange = Boolean(
            init?.headers &&
              new Headers(init.headers as HeadersInit).get("Range"),
          );
          if (hasRange) {
            return new Response(null, { status: 204 });
          }
          return new Response(null, { status: 204 });
        }
        throw new Error(`Unexpected fetch: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const { searchFranceTravail } = await import("./franceTravail");
    const jobs = await searchFranceTravail({
      motsCles: "rare-keyword-xyz",
      departement: null,
      rangeStart: 0,
      rangeEnd: 9,
    });

    expect(jobs).toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("retries without Range when first response is 204", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.includes("/oauth/token")) {
          return new Response(
            JSON.stringify({ access_token: "abc", expires_in: 3600 }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        if (url.includes("/offres/search")) {
          const range = init?.headers
            ? new Headers(init.headers as HeadersInit).get("Range")
            : null;
          if (range) {
            return new Response(null, { status: 204 });
          }
          return new Response(
            JSON.stringify({
              resultats: [
                {
                  id: "ft2",
                  intitule: "Ingénieur data",
                  entreprise: { nom: "Co" },
                  lieuTravail: { commune: "Lille" },
                  description: "Python",
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }
        throw new Error(`Unexpected fetch: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const { searchFranceTravail } = await import("./franceTravail");
    const jobs = await searchFranceTravail({
      motsCles: "python",
      departement: null,
      rangeStart: 0,
      rangeEnd: 9,
    });

    expect(jobs).toHaveLength(1);
    expect(jobs[0].title).toBe("Ingénieur data");
  });
});
