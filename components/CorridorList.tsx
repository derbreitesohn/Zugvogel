"use client";

import { useState } from "react";
import {
  changesLabel,
  delayLabel,
  delayTone,
  durationLabel,
  hhmm,
  lineKind,
} from "@/lib/format";
import type { Corridor, Journey } from "@/lib/types";

function Lines({ journey }: { journey: Journey }) {
  const rides = journey.legs.filter((leg) => leg.kind === "ride");
  return (
    <div className="lines">
      {rides.map((leg, index) => (
        <span key={index} style={{ display: "contents" }}>
          {index > 0 && <span className="sep">›</span>}
          <span className="line" data-kind={lineKind(leg.productClass)}>
            {leg.line}
          </span>
        </span>
      ))}
    </div>
  );
}

function JourneyRow({ journey }: { journey: Journey }) {
  const [open, setOpen] = useState(false);
  const delay = delayLabel(journey);
  const rides = journey.legs.filter((leg) => leg.kind === "ride");

  return (
    <button
      type="button"
      className="journey"
      onClick={() => setOpen((v) => !v)}
      aria-expanded={open}
    >
      <div className="journey-top">
        <span className="clock tnum">{hhmm(journey.depPlanned)}</span>
        <span className="arrow">→</span>
        <span className="clock tnum">{hhmm(journey.arrPlanned)}</span>
        {delay && (
          <span className="delay tnum" data-tone={delay.tone}>
            {delay.text}
          </span>
        )}
        <span className="meta tnum">
          {durationLabel(journey.duration)} · {changesLabel(journey.changes)}
        </span>
      </div>

      <Lines journey={journey} />

      {/* A four minute change is where a plan quietly falls apart, so say it
          before the traveller finds out on the platform. */}
      {journey.minTransfer !== null && journey.minTransfer <= 5 && (
        <p className="tight">
          Nur {journey.minTransfer} min Umstieg in {journey.transferHubs[0]}
        </p>
      )}

      {open && (
        <div style={{ marginTop: 12, display: "grid", gap: 8 }}>
          {rides.map((leg, index) => (
            <div key={index} style={{ display: "flex", gap: 10, fontSize: 13.5 }}>
              <span
                className="tnum"
                style={{ color: "var(--ink-3)", minWidth: 92, flex: "none" }}
              >
                {hhmm(leg.depPlanned)}–{hhmm(leg.arrPlanned)}
              </span>
              <span style={{ minWidth: 0 }}>
                <strong style={{ fontWeight: 620 }}>{leg.line}</strong>
                {leg.direction ? " Richtung " + leg.direction : ""}
                <br />
                <span style={{ color: "var(--ink-2)" }}>
                  {leg.from}
                  {leg.depPlatform ? " (Gl. " + leg.depPlatform + ")" : ""} → {leg.to}
                  {leg.arrPlatform ? " (Gl. " + leg.arrPlatform + ")" : ""}
                </span>
                {leg.depActual !== null && leg.depDelay > 0 && (
                  <span
                    className="delay tnum"
                    data-tone={delayTone(leg.depDelay)}
                    style={{ marginLeft: 8 }}
                  >
                    +{leg.depDelay}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

export function CorridorList({ corridors }: { corridors: Corridor[] }) {
  return (
    <>
      {corridors.map((corridor, index) => (
        <section className="card corridor" key={corridor.key}>
          <header className="corridor-head">
            <h3>{corridor.label}</h3>
            <span className="badge tnum" data-tone={index === 0 ? "best" : undefined}>
              {index === 0
                ? durationLabel(corridor.fastest) + " · schnellste"
                : "+" + corridor.penalty + " min"}
            </span>
          </header>
          {corridor.journeys.map((journey) => (
            <JourneyRow key={journey.id} journey={journey} />
          ))}
        </section>
      ))}
    </>
  );
}
