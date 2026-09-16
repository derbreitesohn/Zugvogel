"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Corridor, LatLon } from "@/lib/types";

/**
 * Why a map at all, when a timetable is a list of times?
 *
 * Because the one thing this app does that others do not is spatial. "über
 * Westbahnhof" against "über St. Pölten" takes three sentences to explain and
 * one glance to see.
 *
 * It draws OpenStreetMap tiles under the routes by hand rather than pulling in a
 * map library: the map never pans or zooms, it only ever frames one search, so a
 * projection, a handful of tile images and an SVG overlay do the whole job for a
 * fraction of the weight.
 */

const TILE = 256;
const PAD = 34;

type Props = {
  corridors: Corridor[];
  /** Index drawn solid; the others fade back. */
  focus?: number;
  onSelect?: (index: number) => void;
};

/* Web Mercator, in pixels at the given zoom. */
function projectPx(lat: number, lon: number, zoom: number): [number, number] {
  const scale = TILE * Math.pow(2, zoom);
  const x = ((lon + 180) / 360) * scale;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * scale;
  return [x, y];
}

type Marked = { x: number; y: number; name: string };

export function CorridorMap({ corridors, focus, onSelect }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.round(entry.contentRect.width)),
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const height = Math.max(200, Math.min(360, Math.round(width * 0.52)));

  const view = useMemo(() => {
    if (width < 80) return null;

    /* One representative journey per corridor: they share the same rails, so
       drawing all four departures would only overprint the same line. */
    const routes = corridors.map((c) => {
      const journey =
        c.journeys.find((j) => j.legs.some((l) => l.points.length > 1)) ?? c.journeys[0];
      const legs = (journey?.legs ?? []).filter((l) => l.points.length > 1);
      return { key: c.key, label: c.label, legs };
    });

    const all: LatLon[] = routes.flatMap((r) => r.legs.flatMap((l) => l.points));
    if (all.length < 2) return null;

    const lats = all.map((p) => p[0]);
    const lons = all.map((p) => p[1]);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);

    /* Largest zoom at which the whole search still fits inside the frame. */
    let zoom = 16;
    for (; zoom > 4; zoom--) {
      const [x0, y1] = projectPx(minLat, minLon, zoom);
      const [x1, y0] = projectPx(maxLat, maxLon, zoom);
      if (x1 - x0 <= width - PAD * 2 && y1 - y0 <= height - PAD * 2) break;
    }

    const corners = [
      projectPx(minLat, minLon, zoom),
      projectPx(maxLat, maxLon, zoom),
    ];
    const centreX = (corners[0][0] + corners[1][0]) / 2;
    const centreY = (corners[0][1] + corners[1][1]) / 2;
    const originX = centreX - width / 2;
    const originY = centreY - height / 2;

    const toLocal = ([lat, lon]: LatLon): [number, number] => {
      const [x, y] = projectPx(lat, lon, zoom);
      return [x - originX, y - originY];
    };

    /* The tiles that cover the frame. */
    const tiles: Array<{ key: string; url: string; left: number; top: number }> = [];
    const count = Math.pow(2, zoom);
    const firstX = Math.floor(originX / TILE);
    const firstY = Math.floor(originY / TILE);
    const lastX = Math.floor((originX + width) / TILE);
    const lastY = Math.floor((originY + height) / TILE);
    for (let tx = firstX; tx <= lastX; tx++) {
      for (let ty = firstY; ty <= lastY; ty++) {
        if (ty < 0 || ty >= count) continue;
        const wrapped = ((tx % count) + count) % count;
        tiles.push({
          key: zoom + "/" + tx + "/" + ty,
          url: "https://tile.openstreetmap.org/" + zoom + "/" + wrapped + "/" + ty + ".png",
          left: tx * TILE - originX,
          top: ty * TILE - originY,
        });
      }
    }

    const drawn = routes.map((r) => {
      const paths = r.legs.map((l) => ({
        walk: l.kind === "walk",
        d: l.points
          .map(toLocal)
          .map(([x, y], i) => (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(1))
          .join(" "),
      }));
      /* Where one leg ends and the next begins: the changes. Without these the
         lines are just shapes, and the whole point is where you get off. */
      const changes: Marked[] = r.legs.slice(0, -1).map((l) => {
        const [x, y] = toLocal(l.points[l.points.length - 1]);
        return { x, y, name: l.to };
      });
      return { key: r.key, label: r.label, paths, changes };
    });

    const first = routes[0]?.legs;
    const startLeg = first?.[0];
    const endLeg = first?.[first.length - 1];
    const mark = (point: LatLon | undefined, name: string): Marked | null => {
      if (!point) return null;
      const [x, y] = toLocal(point);
      return { x, y, name };
    };

    return {
      zoom,
      tiles,
      routes: drawn,
      start: mark(startLeg?.points[0], startLeg?.from ?? ""),
      finish: mark(endLeg?.points.at(-1), endLeg?.to ?? ""),
    };
  }, [corridors, width, height]);

  return (
    <figure className="card map">
      <div className="map-frame" ref={box} style={{ height }}>
        {view && (
          <>
            <div className="tiles" aria-hidden="true">
              {view.tiles.map((t) => (
                <img
                  key={t.key}
                  src={t.url}
                  alt=""
                  width={TILE}
                  height={TILE}
                  loading="lazy"
                  style={{ left: t.left, top: t.top }}
                />
              ))}
            </div>

            <svg
              viewBox={`0 0 ${width} ${height}`}
              width={width}
              height={height}
              role="img"
              aria-label={"Streckenverlauf: " + corridors.map((c) => c.label).join(", ")}
            >
              {view.routes.map((route, index) => {
                const dim = focus !== undefined && focus !== index;
                return (
                  <g
                    key={route.key}
                    className="route"
                    data-index={index % 4}
                    data-dim={dim}
                    data-clickable={Boolean(onSelect)}
                    onClick={() => onSelect?.(index)}
                  >
                    <title>{route.label}</title>
                    {/* A wide transparent copy underneath, so the line is easy
                        to hit with a finger without being drawn fat. */}
                    {route.paths.map((p, i) => (
                      <path key={"hit" + i} d={p.d} className="hit" />
                    ))}
                    {route.paths.map((p, i) => (
                      <path
                        key={i}
                        d={p.d}
                        fill="none"
                        strokeWidth={p.walk ? 2.4 : 3.6}
                        strokeDasharray={p.walk ? "3 4" : undefined}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))}
                    {route.changes.map((c, i) => (
                      <g key={"c" + i}>
                        <circle className="change" cx={c.x} cy={c.y} r="4" />
                        {!dim && (
                          <text className="label" x={c.x + 8} y={c.y + 4}>
                            {c.name}
                          </text>
                        )}
                      </g>
                    ))}
                  </g>
                );
              })}

              {view.start && (
                <g className="endpoint">
                  <circle className="pointA" cx={view.start.x} cy={view.start.y} r="5.5" />
                  <text className="label strong" x={view.start.x + 10} y={view.start.y - 7}>
                    {view.start.name}
                  </text>
                </g>
              )}
              {view.finish && (
                <g className="endpoint">
                  <circle className="pointB" cx={view.finish.x} cy={view.finish.y} r="5.5" />
                  <text
                    className="label strong"
                    x={view.finish.x + 10}
                    y={view.finish.y - 7}
                  >
                    {view.finish.name}
                  </text>
                </g>
              )}
            </svg>
          </>
        )}
      </div>

      <figcaption>
        {corridors.map((c, i) => (
          <button
            key={c.key}
            type="button"
            className="legend"
            data-index={i % 4}
            data-dim={focus !== undefined && focus !== i}
            onClick={() => onSelect?.(i)}
          >
            <i />
            {c.label}
          </button>
        ))}
        <span className="attribution">© OpenStreetMap</span>
      </figcaption>
    </figure>
  );
}
