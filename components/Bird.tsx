export function Bird({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      {/* A swift on the wing: one long upstroke, one folded wing, one eye. */}
      <path
        d="M2.4 20.4c5.4.4 9.8-1.8 13.2-6.6 2.1-2.9 4.6-4.4 7.4-4.4 1.2 0 2.2.2 3 .7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M11.6 15.8c.9 2.3.5 4.3-1.1 6-1.6 1.7-3.9 2.5-6.9 2.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
      />
      <circle cx="23.1" cy="7.7" r="2.5" fill="currentColor" />
    </svg>
  );
}
