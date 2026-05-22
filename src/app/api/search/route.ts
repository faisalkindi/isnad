import { type NextRequest, NextResponse } from "next/server";
import { findCandidates } from "@/lib/match/candidates";

// GET /api/search?name=... — fuzzy narrator name search.
export async function GET(request: NextRequest) {
  const name = request.nextUrl.searchParams.get("name");

  if (!name || name.trim().length === 0) {
    return NextResponse.json(
      { error: "يجب تمرير المعامل name." },
      { status: 400 },
    );
  }

  const candidates = await findCandidates(name);
  return NextResponse.json({ candidates });
}
