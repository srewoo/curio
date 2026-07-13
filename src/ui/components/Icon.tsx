// Minimal inline-SVG icon set (CSP forbids the remote Tabler webfont used in the
// mockups). Stroke-based, 24x24 viewBox, currentColor.
import type { CSSProperties } from 'react';

export type IconName =
  | 'book'
  | 'settings'
  | 'upload'
  | 'photo'
  | 'file'
  | 'check'
  | 'arrow-up'
  | 'paperclip'
  | 'bulb'
  | 'eye'
  | 'clock'
  | 'lock';

const PATHS: Record<IconName, string> = {
  book: 'M3 19a9 9 0 0 1 9 0 9 9 0 0 1 9 0M3 6a9 9 0 0 1 9 0 9 9 0 0 1 9 0M3 6v13M12 6v13M21 6v13',
  // Feather-style cog. An inner circle is added by the component for 'settings'.
  settings:
    'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V15z',
  upload: 'M12 15V4M8 8l4-4 4 4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3',
  photo: 'M4 5h16v14H4zM4 15l4-4 4 4M14 13l2-2 4 4M9 9a1 1 0 1 0 0 .01',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4',
  check: 'M5 12l5 5 9-9',
  'arrow-up': 'M12 19V5M6 11l6-6 6 6',
  paperclip: 'M21 11l-8.5 8.5a4 4 0 0 1-6-6L14 5a2.7 2.7 0 0 1 4 4l-8.5 8.5a1.3 1.3 0 0 1-2-2L15 8',
  bulb: 'M9 18h6M10 21h4M8 11a4 4 0 1 1 8 0c0 2-2 3-2 5h-4c0-2-2-3-2-5z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  clock: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
};

interface IconProps {
  readonly name: IconName;
  readonly size?: number;
  readonly style?: CSSProperties;
  readonly className?: string;
}

export function Icon({ name, size = 16, style, className }: IconProps): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      className={className}
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
      {name === 'settings' && <circle cx="12" cy="12" r="3" />}
    </svg>
  );
}
