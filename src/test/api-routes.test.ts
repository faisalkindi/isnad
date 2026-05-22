import { describe, it, expect, afterAll } from "vitest";
import { NextRequest } from "next/server";
import { GET as narratorRoute } from "@/app/api/narrator/[id]/route";
import { GET as searchRoute } from "@/app/api/search/route";
import { pool } from "@/lib/db";

describe("GET /api/narrator/[id]", () => {
  it("returns a known narrator", async () => {
    const res = await narratorRoute(new Request("http://localhost/"), {
      params: Promise.resolve({ id: "320" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.full_name).toBe("سعيد بن سماك بن حرب");
  });

  it("404s for a missing narrator", async () => {
    const res = await narratorRoute(new Request("http://localhost/"), {
      params: Promise.resolve({ id: "999999999" }),
    });
    expect(res.status).toBe(404);
  });

  it("400s for a non-numeric id", async () => {
    const res = await narratorRoute(new Request("http://localhost/"), {
      params: Promise.resolve({ id: "abc" }),
    });
    expect(res.status).toBe(400);
  });
});

describe("GET /api/search", () => {
  it("returns candidates for a name", async () => {
    const res = await searchRoute(
      new NextRequest("http://localhost/api/search?name=الزهري"),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.candidates)).toBe(true);
    expect(body.candidates.length).toBeGreaterThan(0);
  });

  it("400s when name is missing", async () => {
    const res = await searchRoute(
      new NextRequest("http://localhost/api/search"),
    );
    expect(res.status).toBe(400);
  });
});

afterAll(async () => {
  await pool.end();
});
