/**
 * Small line icons, drawn rather than pulled from an emoji font. Emoji render
 * differently on every platform, sit off the baseline and read as decoration;
 * these inherit the text colour and line up with it.
 */

type Props = { size?: number };

function Frame({ size = 13, children }: Props & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ flex: "none", verticalAlign: "-2px" }}
    >
      {children}
    </svg>
  );
}

export function WalkIcon(props: Props) {
  return (
    <Frame {...props}>
      <circle cx="9" cy="2.6" r="1.4" fill="currentColor" stroke="none" />
      <path d="M8.6 5.2 6.6 6.6l-.9 2.6" />
      <path d="M8.6 5.2 10.9 6.4l.8 2.2" />
      <path d="m8.4 5.4-.2 3.4 1.7 1.9.5 3.1" />
      <path d="m8.2 8.8-2 2.1-.4 3.1" />
    </Frame>
  );
}

export function BikeIcon(props: Props) {
  return (
    <Frame {...props}>
      <circle cx="3.9" cy="11.2" r="2.7" />
      <circle cx="12.1" cy="11.2" r="2.7" />
      <path d="M6.2 5.6h2.4l2.1 5.6" />
      <path d="M4.2 11.2 7 5.6" />
      <circle cx="10.6" cy="2.9" r="1.1" fill="currentColor" stroke="none" />
    </Frame>
  );
}

export function StepFreeIcon(props: Props) {
  return (
    <Frame {...props}>
      <circle cx="9.4" cy="2.9" r="1.3" fill="currentColor" stroke="none" />
      <path d="M8.6 5.6v3.2h3" />
      <path d="M11.8 13.6 10.6 8.8" />
      <path d="M11.2 10.2a3.6 3.6 0 1 1-4.3-1.2" />
    </Frame>
  );
}

export function PinIcon(props: Props) {
  return (
    <Frame {...props}>
      <path d="M8 14s5-4.2 5-7.6A5 5 0 0 0 3 6.4C3 9.8 8 14 8 14Z" />
      <circle cx="8" cy="6.4" r="1.7" />
    </Frame>
  );
}

export function StarIcon({ filled = false, ...props }: Props & { filled?: boolean }) {
  return (
    <Frame {...props}>
      <path
        d="m8 2 1.85 3.9 4.15.6-3 3 .71 4.25L8 11.75 4.29 13.75 5 9.5l-3-3 4.15-.6Z"
        fill={filled ? "currentColor" : "none"}
      />
    </Frame>
  );
}
