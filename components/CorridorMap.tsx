"use client";

import { useMemo } from "react";
import type { Corridor, LatLon } from "@/lib/types";

/**
 * Why a map at all, when a timetable is a list of times?
 *
 * Because the one thing this app does that others do not is spatial. "über
 * Westbahnhof" against "über St. Pölten" takes three sentences to explain and
 * one glance to see. So this draws the corridors against each other and nothing
 * else: no tiles, no basemap, no pan and zoom. Just the shapes, so the choice
 * becomes obvious.
 */

type Props = {
  corridors: Corridor[];
  /** Index of the corridor to draw solid; the others fade back. */
  focus?: number;
};

const WIDTH = 720;
const HEIGHT = 300;
const PAD = 26;

function project(points: LatLon[], meanLat: number): Array<[number, number]> {
  const k = Math.cos((meanLat * Math.PI) / 180);
  return points.map(([lat, lon]) => [lon * k, -lat]);
}

export function CorridorMap({ corridors, focus }: Props) {
  const drawn = useMemo(() => {
    // One representative journey per corridor: they share the same rails, so
    // drawing all four departures would just overprint the same line.
    const routes = corridors.map((c) => {
      const journey =
        c.journeys.find((j) => j.legs.some((l) => l.points.length > 1)) ?? c.journeys[0];
      return {
        key: c.key,
        label: c.label,
        legs: (journey?.legs ?? [])
          .filter((l) => l.points.length > 1)
          .map((l) => ({ walk: l.kind === "walk", points: l.points })),
      };
    });

    const all = routes.flatMap((r) => r.legs.flatMap((l) => l.points));
    if (all.length < 2) return null;

    const meanLat = all.reduce((s, p) => s + p[0], 0) / all.length;
    const flat = routes.map((r) => ({
      ...r,
      legs: r.legs.map((l) => ({ walk: l.walk, xy: project(l.points, meanLat) })),
    }));

    const xs = flat.flatMap((r) => r.legs.flatMap((l) => l.xy.map((p) => p[0])));
    const ys = flat.flatMap((r) => r.legs.flatMap((l) => l.xy.map((p) => p[1])));
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // Uniform scale, so the shape of the route is not stretched into a lie.
    const scale = Math.min(
      (WIDTH - PAD * 2) / Math.max(maxX - minX, 1e-9),
      (HEIGHT - PAD * 2) / Math.max(maxY - minY, 1e-9),
    );
    const offsetX = (WIDTH - (maxX - minX) * scale) / 2 - minX * scale;
    const offsetY = (HEIGHT - (maxY - minY) * scale) / 2 - minY * scale;

    const toPath = (xy: Array<[number, number]>) =>
      xy
        .map(
          ([x, y], i) =>
            (i === 0 ? "M" : "L") +
            (x * scale + offsetX).toFixed(1) +
            " " +
            (y * scale + offsetY).toFixed(1),
        )
        .join(" ");

    const ends = flat[0]?.legs;
    const start = ends?.[0]?.xy[0];
    const finish = ends?.[ends.length - 1]?.xy.at(-1);
    const dot = (p: [number, number] | undefined) =>
      p ? { cx: p[0] * scale + offsetX, cy: p[1] * scale + offsetY } : null;

    return {
      routes: flat.map((r) => ({
        key: r.key,
        label: r.label,
        paths: r.legs.map((l) => ({ walk: l.walk, d: toPath(l.xy) })),
        // Where one leg ends and the next begins: the changes. Without these
        // the lines are just shapes, and the whole point is where you get off.
        changes: r.legs
          .slice(0, -1)
          .map((l) => dot(l.xy.at(-1)))
          .filter((d): d is { cx: number; cy: number } => d !== null),
      })),
      start: dot(start),
      finish: dot(finish),
    };
  }, [corridors]);

  if (!drawn) return null;

  return (
    <figure className="card map">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label={
          "Streckenverlauf: " + corridors.map((c) => c.label).join(", ")
        }
      >
        {drawn.routes.map((route, index) => {
          const dim = focus !== undefined && focus !== index;
          return (
            <g
              key={route.key}
              className="route"
              data-index={index % 4}
              data-dim={dim}
            >
              {route.paths.map((p, i) => (
                <path
                  key={i}
                  d={p.d}
                  fill="none"
                  strokeWidth={p.walk ? 2 : 3.2}
                  strokeDasharray={p.walk ? "3 4" : undefined}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
              {route.changes.map((c, i) => (
                <circle key={"c" + i} className="change" r="3.4" {...c} />
              ))}
            </g>
          );
        })}
        {drawn.start && <circle className="pointA" r="5" {...drawn.start} />}
        {drawn.finish && <circle className="pointB" r="5" {...drawn.finish} />}
      </svg>
      <figcaption>
        {corridors.map((c, i) => (
          <span key={c.key} className="legend" data-index={i % 4}>
            <i />
            {c.label}
          </span>
        ))}
      </figcaption>
    </figure>
  );
}
