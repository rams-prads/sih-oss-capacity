/**
 * The icon set.
 *
 * Drawn here rather than pulled from a library, and never emoji: emoji render
 * differently on every platform, carry colour we do not control, and read as
 * decoration in an interface that is meant to be quiet.
 *
 * All icons are 24x24, drawn on a 24-unit grid, and inherit currentColor and
 * font size through `em` sizing, so one icon works in a control bar and in a
 * line of body text without a second variant.
 */
type IconProps = {
  className?: string;
  title?: string;
};

function Svg({
  children,
  className = "",
  title,
  filled = false,
}: IconProps & { children: React.ReactNode; filled?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      className={`h-[1em] w-[1em] shrink-0 ${className}`}
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {title && <title>{title}</title>}
      {children}
    </svg>
  );
}

/* --- player transport --------------------------------------------------- */

export function PlayIcon(props: IconProps) {
  return (
    <Svg {...props} filled>
      <path d="M8 5.14v13.72a.6.6 0 0 0 .92.5l10.8-6.86a.6.6 0 0 0 0-1l-10.8-6.86a.6.6 0 0 0-.92.5Z" />
    </Svg>
  );
}

export function PauseIcon(props: IconProps) {
  return (
    <Svg {...props} filled>
      <rect x="7" y="5" width="3.5" height="14" rx="1" />
      <rect x="13.5" y="5" width="3.5" height="14" rx="1" />
    </Svg>
  );
}

/** Ten seconds back: the arrow carries the number, as on every player. */
export function ReplayTenIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5a7 7 0 1 1-6.7 9" />
      <path d="M12 2.5 8.8 5l3.2 2.5" />
      <text
        x="12"
        y="15.6"
        textAnchor="middle"
        fontSize="7.5"
        fontWeight="600"
        fill="currentColor"
        stroke="none"
      >
        10
      </text>
    </Svg>
  );
}

export function ForwardTenIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5a7 7 0 1 0 6.7 9" />
      <path d="m12 2.5 3.2 2.5L12 7.5" />
      <text
        x="12"
        y="15.6"
        textAnchor="middle"
        fontSize="7.5"
        fontWeight="600"
        fill="currentColor"
        stroke="none"
      >
        10
      </text>
    </Svg>
  );
}

/* --- player chrome ------------------------------------------------------- */

export function VolumeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11 5.5 6.5 9H4a.5.5 0 0 0-.5.5v5A.5.5 0 0 0 4 15h2.5l4.5 3.5a.5.5 0 0 0 .8-.4V5.9a.5.5 0 0 0-.8-.4Z" />
      <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
      <path d="M18 7a7 7 0 0 1 0 10" />
    </Svg>
  );
}

export function VolumeMutedIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11 5.5 6.5 9H4a.5.5 0 0 0-.5.5v5A.5.5 0 0 0 4 15h2.5l4.5 3.5a.5.5 0 0 0 .8-.4V5.9a.5.5 0 0 0-.8-.4Z" />
      <path d="m16 9.5 5 5" />
      <path d="m21 9.5-5 5" />
    </Svg>
  );
}

export function FullscreenIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9" />
      <path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9" />
      <path d="M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15" />
      <path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
    </Svg>
  );
}

export function FullscreenExitIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4" />
      <path d="M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4" />
      <path d="M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20" />
      <path d="M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20" />
    </Svg>
  );
}

export function SpeedIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.5 17a8.5 8.5 0 1 1 15 0" />
      <path d="m14.5 9.5-3.2 3.9a1.4 1.4 0 1 0 2 1.9Z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/* --- lesson and course state -------------------------------------------- */

/** A watched lesson. Filled, because completion should read at a glance. */
export function CheckCircleIcon(props: IconProps) {
  return (
    <Svg {...props} filled>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm4.7 7.7-5.5 5.5a1 1 0 0 1-1.4 0l-2.5-2.5a1 1 0 1 1 1.4-1.4l1.8 1.8 4.8-4.8a1 1 0 0 1 1.4 1.4Z" />
    </Svg>
  );
}

/** An unwatched lesson: outlined, so it reads as an empty slot. */
export function CircleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
    </Svg>
  );
}

export function PlayCircleIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M10.2 9.1v5.8a.4.4 0 0 0 .6.35l4.4-2.9a.4.4 0 0 0 0-.7l-4.4-2.9a.4.4 0 0 0-.6.35Z" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function LockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
    </Svg>
  );
}

export function ClockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.2 1.9" />
    </Svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6 9.5 6 6 6-6" />
    </Svg>
  );
}

export function ChevronRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m9.5 6 6 6-6 6" />
    </Svg>
  );
}

/** The marker used for an in-video question, and for a checkpoint in a list. */
export function QuestionMarkerIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.1-2.4 3.6" />
      <circle cx="12" cy="17.2" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function ExternalLinkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14.5v4a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6h4" />
    </Svg>
  );
}

/** A wrong answer. Paired with CheckCircleIcon, so the two read as a set. */
export function CrossCircleIcon(props: IconProps) {
  return (
    <Svg {...props} filled>
      <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm3.5 12.1a1 1 0 0 1-1.4 1.4L12 13.4l-2.1 2.1a1 1 0 0 1-1.4-1.4l2.1-2.1-2.1-2.1a1 1 0 1 1 1.4-1.4l2.1 2.1 2.1-2.1a1 1 0 0 1 1.4 1.4L13.4 12Z" />
    </Svg>
  );
}

/** Dismiss. Deliberately a thin cross, not the heavier CrossCircleIcon, so it
    never reads as a wrong answer. */
export function CloseIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m6.5 6.5 11 11" />
      <path d="m17.5 6.5-11 11" />
    </Svg>
  );
}
