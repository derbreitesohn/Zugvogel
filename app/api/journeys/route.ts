import { NextResponse } from "next/server";
import { findCorridors } from "@/lib/corridors";

export const dynamic = "force-dynamic";

/** "YYYY-MM-DDTHH:MM" in Austrian local time, which is what the upstream speaks. */
function nowInVienna(): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Vienna",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  return parts.replace(" ", "T");
}

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");
  const when = params.get("when") || nowInVienna();
  const quick = params.get("quick") === "1";

  if (!from || !to) {
    return NextResponse.json(
      { corridors: [], error: "from und to sind erforderlich" },
      { status: 400 },
    );
  }

  try {
    const corridors = await findCorridors({ fromLid: from, toLid: to, when }, { quick });
    return NextResponse.json(
      { corridors, when },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unbekannter Fehler";
    return NextResponse.json({ corridors: [], error: message }, { status: 502 });
  }
}
