"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Station } from "@/lib/types";

type Props = {
  label: string;
  placeholder: string;
  value: Station | null;
  onChange: (station: Station | null) => void;
};

export function StationField({ label, placeholder, value, onChange }: Props) {
  const id = useId();
  const [text, setText] = useState(value?.name ?? "");
  const [options, setOptions] = useState<Station[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  // Set when a suggestion is picked, so the resulting text change does not
  // immediately trigger another lookup for the name we just filled in.
  const picked = useRef(false);

  useEffect(() => {
    setText(value?.name ?? "");
  }, [value]);

  useEffect(() => {
    if (picked.current) {
      picked.current = false;
      return;
    }
    const q = text.trim();
    if (q.length < 2) {
      setOptions([]);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/locations?q=" + encodeURIComponent(q), {
          signal: controller.signal,
        });
        const data = await res.json();
        setOptions(data.stations ?? []);
        setActive(0);
        setOpen(true);
      } catch {
        // Aborted or offline: keep whatever is on screen.
      }
    }, 180);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [text]);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!box.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  function pick(station: Station) {
    picked.current = true;
    setText(station.name);
    setOptions([]);
    setOpen(false);
    onChange(station);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || options.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (i + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (i - 1 + options.length) % options.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      pick(options[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="field" ref={box}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        value={text}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-expanded={open}
        aria-controls={id + "-list"}
        onChange={(event) => {
          setText(event.target.value);
          if (value) onChange(null);
        }}
        onFocus={() => options.length > 0 && setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {open && options.length > 0 && (
        <div className="suggestions" id={id + "-list"} role="listbox">
          {options.map((station, index) => (
            <button
              key={station.id}
              type="button"
              role="option"
              aria-selected={index === active}
              data-active={index === active}
              onMouseEnter={() => setActive(index)}
              onClick={() => pick(station)}
            >
              <span className="kind" aria-hidden="true">
                {station.kind === "S" ? "⏵" : station.kind === "A" ? "⌂" : "◎"}
              </span>
              {station.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
