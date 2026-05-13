import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("searchAdzunaFr (fetch mock)", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.ADZUNA_APP_ID = "app-id";
    process.env.ADZUNA_APP_KEY = "app-key";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ADZUNA_APP_ID;
    delete process.env.ADZUNA_APP_KEY;
  });

  it("parses Adzuna FR search response", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          results: [
            {
              id: 99,
              title: "Data engineer",
              company: { display_name: "BigCo" },
              location: { display_name: "Toulouse, France" },
              description: "Python <b>SQL</b>",
              redirect_url: "https://adzuna.example/job",
              created: "2026-01-01",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { searchAdzunaFr } = await import("./adzuna");
    const jobs = await searchAdzunaFr({
      what: "python",
      where: "Toulouse",
      page: 1,
      resultsPerPage: 20,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("api.adzuna.com");
    expect(calledUrl).toContain("app_id=app-id");
    expect(jobs[0].title).toBe("Data engineer");
    expect(jobs[0].source).toBe("adzuna");
    expect(jobs[0].descriptionSnippet).toContain("Python");
  });
});
