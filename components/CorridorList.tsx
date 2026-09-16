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
import { BikeIcon, StepFreeIcon, WalkIcon } from "./Icons";
import type { BikeCarriage, Corridor, Journey, Leg } from "@/lib/types";

const BIKE_LABEL: Record<Exclude<BikeCarriage, null>, string> = {
  yes: "Rad",
  limited: "Rad begrenzt",
  reservation: "Rad, Reservierung",
  no: "kein Rad",
};

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

function LegDetail({ leg }: { leg: Leg }) {
  if (leg.kind === "walk") {
    return (
      <div className="leg leg-walk">
        <span className="tnum leg-time">
          {hhmm(leg.depPlanned)}–{hhmm(leg.arrPlanned)}
        </span>
        <span>
          <strong>Zu Fuß</strong>
          {leg.distance !== null && " · " + leg.distance + " m"}
          {leg.walkMinutes !== null && " · " + leg.walkMinutes + " min"}
          <br />
          <span className="muted">
            {leg.from} → {leg.to}
          </span>
        </span>
      </div>
    );
  }

  return (
    <div className="leg">
      <span className="tnum leg-time">
        {hhmm(leg.depPlanned)}–{hhmm(leg.arrPlanned)}
      </span>
      <span>
        <strong>{leg.line}</strong>
        {leg.direction ? " Richtung " + leg.direction : ""}
        {leg.depActual !== null && leg.depDelay > 0 && (
          <span
            className="delay tnum"
            data-tone={delayTone(leg.depDelay)}
            style={{ marginLeft: 8 }}
          >
            +{leg.depDelay}
          </span>
        )}
        <br />
        <span className="muted">
          {leg.from}
          {leg.depPlatform ? " (Gl. " + leg.depPlatform + ")" : ""} → {leg.to}
          {leg.arrPlatform ? " (Gl. " + leg.arrPlatform + ")" : ""}
        </span>
        {leg.attributes.length > 0 && (
          <span className="facilities">
            {leg.attributes.slice(0, 4).map((a) => (
              <span key={a}>{a}</span>
            ))}
          </span>
        )}
      </span>
    </div>
  );
}

function JourneyRow({ journey }: { journey: Journey }) {
  const [open, setOpen] = useState(false);
  const delay = delayLabel(journey);

  return (
    <div className="journey-wrap">
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

        <div className="chips">
          {journey.walkMinutes > 0 && (
            <span className="chip">
              <WalkIcon /> {journey.walkMinutes} min
            </span>
          )}
          {journey.bike && (
            <span className="chip" data-warn={journey.bike === "no"}>
              <BikeIcon /> {BIKE_LABEL[journey.bike]}
            </span>
          )}
          {journey.stepFree && (
            <span className="chip">
              <StepFreeIcon /> stufenfrei
            </span>
          )}
        </div>

        {/* A four minute change is where a plan quietly falls apart, so say it
            before the traveller finds out on the platform. */}
        {journey.minTransfer !== null && journey.minTransfer <= 5 && (
          <p className="tight">
            {journey.minTransfer} min Umstieg in {journey.transferHubs[0]}
          </p>
        )}
      </button>

      {open && (
        <div className="legs">
          {journey.legs.map((leg, index) => (
            <LegDetail key={index} leg={leg} />
          ))}
        </div>
      )}
    </div>
  );
}

export function CorridorList({
  corridors,
  onFocus,
}: {
  corridors: Corridor[];
  onFocus?: (index: number | undefined) => void;
}) {
  return (
    <>
      {corridors.map((corridor, index) => (
        <section
          className="card corridor"
          key={corridor.key}
          data-index={index % 4}
          onMouseEnter={() => onFocus?.(index)}
          onMouseLeave={() => onFocus?.(undefined)}
        >
          <header className="corridor-head">
            <i className="swatch" data-index={index % 4} />
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
