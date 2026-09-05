/**
 * A cover for a course that has no artwork.
 *
 * iGOT publishes no thumbnails, and a stock photograph of somebody at a laptop
 * would say nothing about a course on index numbers. This draws one instead:
 * a field from the palette, chosen from the competency the course builds, so
 * courses for the same competency look related on the shelf and the eye can
 * group them without reading a word.
 *
 * Deterministic, so a course keeps its cover between visits.
 */
const FIELDS = [
  { from: "#1e3a63", to: "#2b5187" },   // primary navy
  { from: "#1f4d5c", to: "#2b7086" },   // teal
  { from: "#3a3566", to: "#4f4890" },   // indigo
  { from: "#5c3a2b", to: "#8c4318" },   // the accent's family
  { from: "#1f4a3a", to: "#2b6b52" },   // green
  { from: "#4a3350", to: "#6b4a72" },   // plum
];

function pick(seed: string) {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) % 100000;
  return FIELDS[hash % FIELDS.length];
}

export function CourseCover({
  seed,
  label,
  className = "",
}: {
  seed: string;
  label?: string;
  className?: string;
}) {
  const field = pick(seed);
  const id = `cover-${seed.replace(/[^a-zA-Z0-9]/g, "")}`;

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <svg
        viewBox="0 0 320 150"
        preserveAspectRatio="xMidYMid slice"
        className="h-full w-full"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={field.from} />
            <stop offset="100%" stopColor={field.to} />
          </linearGradient>
        </defs>
        <rect width="320" height="150" fill={`url(#${id})`} />
        {/* A quiet motif rather than a picture: concentric arcs, the sort of
            mark a printed cover would carry. */}
        <g fill="none" stroke="#ffffff" strokeOpacity="0.13" strokeWidth="1.25">
          <circle cx="264" cy="26" r="34" />
          <circle cx="264" cy="26" r="54" />
          <circle cx="264" cy="26" r="74" />
        </g>
        <g stroke="#ffffff" strokeOpacity="0.09" strokeWidth="1">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <line key={i} x1={-40 + i * 46} y1="150" x2={40 + i * 46} y2="0" />
          ))}
        </g>
      </svg>

      {label && (
        <span className="absolute bottom-2.5 left-3 rounded bg-black/25 px-2 py-0.5 font-mono text-2xs font-medium tracking-wide text-white/90 backdrop-blur-[1px]">
          {label}
        </span>
      )}
    </div>
  );
}
