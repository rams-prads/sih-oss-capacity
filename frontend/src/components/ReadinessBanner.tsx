import { useId } from "react";
import type { GapReport } from "../api";
import { InfoIcon } from "./icons";
import { useEntrance } from "./motion";

/**
 * The one number this page exists to give, and what it rests on.
 *
 * Readiness is the answer and keeps the size; the role and the evidence are
 * support and stay short. Evidence sits directly under the figure on purpose: a
 * readiness built from levels an officer typed at sign-up is a different claim
 * from one built from measurement, and distance between the two let the first
 * be read as the second.
 */
export function ReadinessBanner({ report, roleName }: { report: GapReport; roleName: string }) {
  const measured = report.measured_competencies > 0;

  return (
    <div>
      <p className="text-2xs font-semibold uppercase tracking-[0.14em] text-ink-4">
        Role readiness
      </p>

      <div className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-5">
        <ReadinessRing value={report.readiness_pct} />
        <div className="min-w-0 flex-1 basis-40">
          <p className="text-lg font-semibold leading-snug text-ink">{roleName}</p>
          {report.department && <p className="mt-1 text-xs text-ink-3">{report.department}</p>}
        </div>
      </div>

      <div className="mt-8">
        <EvidenceBar report={report} />
        {/* Measured evidence speaks for itself in the bar; its absence is the
            thing a reader could miss, so only that gets a line. */}
        {!measured && (
          <p className="mt-3 flex items-center gap-2 text-xs text-saffron-ink">
            <InfoIcon className="shrink-0 text-[14px]" />
            Self-reported levels, not yet assessed
          </p>
        )}
      </div>
    </div>
  );
}

const RING = { size: 172, stroke: 10 };

/**
 * Readiness as a meter: one ratio against a limit. The unfilled track is a
 * light step of the fill's own hue, so the whole ring reads as one scale, and
 * the figure sits inside it at hero size.
 */
function ReadinessRing({ value }: { value: number }) {
  const t = useEntrance(1400, 180);
  const clamped = Math.min(100, Math.max(0, value));
  const shown = clamped * t;
  const { size, stroke } = RING;
  const radius = (size - stroke) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * radius;
  const decimals = Number.isInteger(value) ? 0 : 1;
  const gradientId = `readiness-${useId().replace(/:/g, "")}`;

  return (
    <div
      role="meter"
      aria-label="Role readiness"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={`${value}%`}
      title="How much of what this role asks for you already meet, weighted by what matters most to it"
      className="relative shrink-0"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="block">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2b5187" />
            <stop offset="100%" stopColor="#1e3a63" />
          </linearGradient>
        </defs>
        <circle cx={c} cy={c} r={radius} fill="none" stroke="#eaf0f8" strokeWidth={stroke} />
        <circle
          data-mark="readiness-arc"
          cx={c}
          cy={c}
          r={radius}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - shown / 100)}
          transform={`rotate(-90 ${c} ${c})`}
        />
      </svg>

      <div aria-hidden className="absolute inset-0 grid place-items-center">
        <p className="flex items-baseline font-semibold leading-none tracking-[-0.03em] text-ink">
          <span className="text-[2.75rem]">{shown.toFixed(decimals)}</span>
          <span className="ml-0.5 text-xl text-ink-3">%</span>
        </p>
      </div>
    </div>
  );
}

/**
 * What the figure rests on, one segment per competency, strongest evidence
 * first. Evidence strength is ordered, so it is drawn as one hue stepping from
 * solid to faint rather than as three unrelated colours.
 */
function EvidenceBar({ report }: { report: GapReport }) {
  const tiers = [
    { key: "measured", label: "measured", count: report.measured_competencies, fill: "bg-ashoka" },
    {
      key: "provisional",
      label: "provisional",
      count: report.provisional_competencies,
      fill: "bg-ashoka/45",
    },
    {
      key: "unverified",
      label: "unverified",
      count: report.unverified_competencies,
      fill: "bg-hairline-strong",
    },
  ];
  const total = tiers.reduce((sum, tier) => sum + tier.count, 0);
  if (total === 0) return null;

  return (
    <div>
      <div
        role="img"
        aria-label={`Evidence: ${tiers.map((tier) => `${tier.count} ${tier.label}`).join(", ")}`}
        className="flex gap-[2px]"
      >
        {tiers.flatMap((tier) =>
          Array.from({ length: tier.count }, (_, k) => (
            <span
              key={`${tier.key}-${k}`}
              data-tier={tier.key}
              className={`h-1.5 min-w-0 flex-1 first:rounded-l-full last:rounded-r-full ${tier.fill}`}
            />
          )),
        )}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1 text-2xs text-ink-3">
        {tiers.map((tier) => (
          <li key={tier.key} className="flex items-center gap-1.5">
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${tier.fill}`} />
            <span className="font-semibold text-ink">{tier.count}</span> {tier.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
