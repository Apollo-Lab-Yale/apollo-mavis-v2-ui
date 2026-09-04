/** Hand-drawn inline SVG icons (phase-11 §4): 24 px grid, 1.5 px stroke,
 * round caps/joins, `currentColor`. No icon library. Decorative by default
 * (`aria-hidden`); pass `title` for a labelled `role="img"`. */
import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "camera"
  | "camera-off"
  | "mic"
  | "mic-off"
  | "joystick"
  | "record"
  | "branch"
  | "play"
  | "check"
  | "close"
  | "info"
  | "chevron"
  | "chevron-down"
  | "warning"
  | "error"
  | "lock"
  | "target"
  | "bookmark";

const PATHS: Record<IconName, ReactNode> = {
  camera: (
    <>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.2-1.8a1 1 0 0 1 .8-.45h4a1 1 0 0 1 .8.45L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" />
      <circle cx="12" cy="13" r="3.25" />
    </>
  ),
  "camera-off": (
    <>
      <path d="M20 15.5v-7A1.5 1.5 0 0 0 18.5 7H16l-2-2.25h-4L9.5 6" />
      <path d="M4 8.5v9A1.5 1.5 0 0 0 5.5 19h11.3" />
      <path d="M9.7 10.7a3.25 3.25 0 0 0 4.6 4.6" />
      <path d="M3 3l18 18" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3.5" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 18v2.5M9 20.5h6" />
    </>
  ),
  "mic-off": (
    <>
      <path d="M15 9.5v-3a3 3 0 0 0-6 0v1" />
      <path d="M9 9.5v2a3 3 0 0 0 5.1 2.1" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 10.9 4.8M18.5 11.5c0 1-.25 2-.7 2.9" />
      <path d="M12 18v2.5M9 20.5h6" />
      <path d="M3 3l18 18" />
    </>
  ),
  joystick: (
    <>
      <circle cx="12" cy="5.5" r="2.5" />
      <path d="M12 8v7" />
      <rect x="5" y="15" width="14" height="5" rx="1.5" />
      <path d="M8.5 17.5h.01M15.5 17.5h.01" />
    </>
  ),
  record: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
    </>
  ),
  branch: (
    <>
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="8" r="2" />
      <path d="M6 7v10" />
      <path d="M18 10c0 3-2.5 4.5-6 5.2-2 .4-3.5 1-4 1.8" />
    </>
  ),
  play: <path d="M8 5.5v13l10.5-6.5z" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </>
  ),
  chevron: <path d="M9 6l6 6-6 6" />,
  "chevron-down": <path d="M6 9l6 6 6-6" />,
  warning: (
    <>
      <path d="M12 4l9 16H3z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.5h.01" />
    </>
  ),
  error: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.5 9.5l5 5M14.5 9.5l-5 5" />
    </>
  ),
  lock: (
    <>
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="2" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="7.5" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3" />
    </>
  ),
  bookmark: <path d="M7 4.5h10a1 1 0 0 1 1 1V20l-6-3.5L6 20V5.5a1 1 0 0 1 1-1z" />,
};

export const ICON_NAMES = Object.keys(PATHS) as IconName[];

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name" | "title"> {
  name: IconName;
  /** Rendered size in px (viewBox stays 24). */
  size?: number;
  /** Accessible label; without it the icon is decorative (`aria-hidden`). */
  title?: string;
}

export function Icon({ name, size = 24, title, className, ...rest }: IconProps) {
  return (
    <svg
      className={`icon${className ? ` ${className}` : ""}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      data-icon={name}
      focusable="false"
      {...rest}
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name]}
    </svg>
  );
}

/** 12 px ring spinner (constant motion → linear). */
export function Spinner({ label = "Loading", className }: { label?: string; className?: string }) {
  return (
    <span
      className={`spinner${className ? ` ${className}` : ""}`}
      role="status"
      aria-label={label}
      data-testid="spinner"
    />
  );
}
