import { NextResponse } from "next/server";
import { getNarrator } from "@/lib/narrator";

// GET /api/narrator/[id] — one narrator's full record.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const numericId = Number(id);

  if (!Number.isInteger(numericId) || numericId <= 0) {
    return NextResponse.json({ error: "معرّف الراوي غير صالح." }, { status: 400 });
  }

  const narrator = await getNarrator(numericId);
  if (!narrator) {
    return NextResponse.json({ error: "لم يُعثر على هذا الراوي." }, { status: 404 });
  }

  return NextResponse.json(narrator);
}
