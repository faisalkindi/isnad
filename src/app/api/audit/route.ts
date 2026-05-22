import { type NextRequest, NextResponse } from "next/server";
import { matchChain } from "@/lib/match/matcher";
import { checkRate } from "@/lib/ratelimit";
import { BudgetExceededError } from "@/lib/claude";
import { ParseError } from "@/lib/match/segment";

const MAX_LENGTH = 4000;

// POST /api/audit — paste an isnād, get each narrator identified.
export async function POST(request: NextRequest) {
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!checkRate(ip)) {
    return NextResponse.json(
      { error: "Too many requests — please wait a moment and try again." },
      { status: 429 },
    );
  }

  let body: { isnad?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const isnad = body.isnad;
  if (typeof isnad !== "string" || isnad.trim().length === 0) {
    return NextResponse.json({ error: "Please paste an isnād." }, { status: 400 });
  }
  if (isnad.length > MAX_LENGTH) {
    return NextResponse.json(
      { error: `Isnād is too long (limit ${MAX_LENGTH} characters).` },
      { status: 400 },
    );
  }

  try {
    const result = await matchChain(isnad);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      return NextResponse.json(
        { error: "The service is busy right now. Please try again later." },
        { status: 503 },
      );
    }
    if (err instanceof ParseError) {
      return NextResponse.json(
        { error: "This does not look like an isnād. Please check the text." },
        { status: 422 },
      );
    }
    throw err;
  }
}
