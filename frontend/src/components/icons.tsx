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

/** The tutor. A speech bubble with a tail, and three dots for a conversation
 *  rather than a notice - this opens something you talk to. */
export function ChatIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M20 12.5a7 7 0 0 1-7 7H8.6L4.5 21.5l.9-3.6A7 7 0 0 1 11 4.5h2a7 7 0 0 1 7 7Z" />
      <path d="M9 12h.01M12 12h.01M15 12h.01" />
    </Svg>
  );
}

/* --- learning momentum ---------------------------------------------------- */

/** A streak. Outlined with a drop at its heart, so it reads at 14px without
 *  turning into a blob, and never as the emoji it replaces. */
export function FlameIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3c.6 2.7 2.4 4.3 3.8 6 1.3 1.6 2.2 3.1 2.2 5.2a6 6 0 0 1-12 0c0-2.1 1-3.8 2.3-5.1.2 1.3.9 2.3 2 2.6C10 8.6 10.6 5.4 12 3Z" />
      <path d="M12 19a2.3 2.3 0 0 1-2.3-2.3c0-1.2 1-2.2 2.3-3.4 1.3 1.2 2.3 2.2 2.3 3.4A2.3 2.3 0 0 1 12 19Z" />
    </Svg>
  );
}

/** A goal. */
export function TargetIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** Learning Points. */
export function SparkIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M11 3.5c.5 3.9 2.6 6 6.5 6.5-3.9.5-6 2.6-6.5 6.5-.5-3.9-2.6-6-6.5-6.5 3.9-.5 6-2.6 6.5-6.5Z" />
      <path d="M18 15c.2 1.2.9 1.9 2 2-1.1.2-1.8.9-2 2-.2-1.1-.9-1.8-2-2 1.1-.1 1.8-.8 2-2Z" />
    </Svg>
  );
}

/** An achievement. */
export function MedalIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8.5 3.5h7l-2.3 5.6" />
      <path d="m8.5 3.5 2.3 5.6" />
      <circle cx="12" cy="14.8" r="5.7" />
      <circle cx="12" cy="14.8" r="2.3" />
    </Svg>
  );
}

/** The next best action: a direction, not a destination. */
export function CompassIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="m15.6 8.4-2.3 4.9-4.9 2.3 2.3-4.9 4.9-2.3Z" />
    </Svg>
  );
}

export function CalendarCheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="5.5" width="16" height="14.5" rx="2" />
      <path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" />
      <path d="m9.3 15 1.9 1.9 3.6-3.8" />
    </Svg>
  );
}

export function ArrowRightIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 12h14" />
      <path d="m13.5 6.5 5.5 5.5-5.5 5.5" />
    </Svg>
  );
}

/** Goal settings: two sliders, because a goal is a pair of dials. */
export function SlidersIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="17" r="2" />
    </Svg>
  );
}

/** More about this. A lower-case i in a circle. */
export function InfoIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r="1" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** A plain tick, for a list row where a filled circle would be too heavy. */
export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m5.5 12.5 4 4 9-9.5" />
    </Svg>
  );
}

export function TrendUpIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m4 16.5 5.5-5.5 3.5 3.5L20 7.5" />
      <path d="M14.5 7.5H20V13" />
    </Svg>
  );
}

export function BookOpenIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 6.5C10.3 5.2 8 4.5 4.5 4.5V18c3.5 0 5.8.7 7.5 2 1.7-1.3 4-2 7.5-2V4.5c-3.5 0-5.8.7-7.5 2Z" />
      <path d="M12 6.5V20" />
    </Svg>
  );
}

export function LayersIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="m12 4 8.5 4.5L12 13 3.5 8.5 12 4Z" />
      <path d="m3.5 12.5 8.5 4.5 8.5-4.5" />
    </Svg>
  );
}

export function ClipboardCheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="4.5" width="14" height="16" rx="2" />
      <path d="M9 4.5v-.7a.8.8 0 0 1 .8-.8h4.4a.8.8 0 0 1 .8.8v.7" />
      <path d="m9 13 2.2 2.2 4.3-4.2" />
    </Svg>
  );
}

/** Evidence-backed: a level that rests on measurement. */
export function ShieldCheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.5 5 6.2v5.3c0 4.3 2.9 7.8 7 9 4.1-1.2 7-4.7 7-9V6.2L12 3.5Z" />
      <path d="m9 12.2 2.1 2.1 4-4.1" />
    </Svg>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <Svg {...props} filled>
      <path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.6 9.7l5.8-.8L12 3.6Z" />
    </Svg>
  );
}

export function GlobeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3.5 12h17M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
    </Svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </Svg>
  );
}
