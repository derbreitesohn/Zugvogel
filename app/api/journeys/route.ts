import { NextResponse } from "next/server";
import { findCorridors } from "@/lib/corridors";
import { nowInVienna } from "@/lib/clock";

export const dynamic = "force-dynamic";
// The timetable backend sits in Austria: every hop from another continent
// is paid twice, once out and once back.
export const preferredRegion = "fra1";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  const when = params.get("when") || nowInVienna();
  const quick = params.get("quick") === "1";
  const backward = params.get("dir") === "bwd";

  if (!from || !to) {
    return NextResponse.json(
      { corridors: [], error: "from und to sind erforderlich" },
      { status: 400 },
    );
  }

  try {
    const corridors = await findCorridors(
      { fromLid: from, toLid: to, when },
      { quick, backward },
    );
    return NextResponse.json(
      { corridors, when },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    return NextResponse.json({ corridors: [], error: message }, { status: 502 });
  }
}
