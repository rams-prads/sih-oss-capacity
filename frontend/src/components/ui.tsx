import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * The primitives every screen composes.
 *
 * Panels are a hairline on white and nothing else - no shadow at rest. Depth is
 * spent only where something is genuinely floating (menus, the modal). A
 * minimal interface that still stacks shadows on every card is not minimal.
 */

export function Card({
  title,
  subtitle,
  right,
  children,
  className = "",
  flush = false,
}: {
  title?: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  /** Drop the body padding, for tables and lists that manage their own. */
  flush?: boolean;
}) {
  return (
    <section className={`rounded-2xl border border-hairline bg-surface ${className}`}>
      {(title || right) && (
        <header className="flex items-start justify-between gap-4 px-6 pb-4 pt-5">
          <div className="min-w-0">
            {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
            {subtitle && (
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-ink-3">{subtitle}</p>
            )}
          </div>
          {right && <div className="shrink-0">{right}</div>}
        </header>
      )}
      <div className={flush ? "" : "px-6 pb-6"}>{children}</div>
    </section>
  );
}

/**
 * A stat tile. The number is the whole point, so it gets the size and the
 * tabular figures; everything around it is deliberately quiet.
 */
export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "default" | "good" | "warn";
}) {
  const tones = {
    default: "text-ink",
    good: "text-chakra",
    warn: "text-saffron-ink",
  };

  return (
    <div className="rounded-2xl border border-hairline bg-surface px-5 py-4">
      <p className="text-2xs font-medium uppercase tracking-[0.08em] text-ink-3">{label}</p>
      <p className={`mt-2.5 text-[30px] font-semibold leading-none tabular-nums ${tones[tone]}`}>
        {value}
      </p>
      {hint && <p className="mt-2 text-2xs leading-snug text-ink-3">{hint}</p>}
    </div>
  );
}

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: "slate" | "amber" | "teal" | "blue";
}) {
  const tones = {
    slate: "bg-ground text-ink-2",
    amber: "bg-saffron-soft text-saffron-ink",
    teal: "bg-chakra-soft text-chakra",
    blue: "bg-ashoka-soft text-ink-2",
  };
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-2xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

/** The one button in the system. Press feedback comes from `.press`. */
export function Button({
  variant = "secondary",
  size = "md",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
}) {
  const variants = {
    primary: "bg-ink text-white border border-ink hover:bg-ashoka-2 hover:border-ashoka-2",
    secondary: "bg-surface text-ink border border-hairline-strong hover:bg-raised",
    ghost: "bg-transparent text-ink-2 border border-transparent hover:bg-ground hover:text-ink",
  };
  const sizes = {
    sm: "px-2.5 py-1 text-xs",
    md: "px-3.5 py-2 text-xs",
  };

  return (
    <button
      {...props}
      className={`press inline-flex items-center justify-center gap-1.5 rounded-lg font-medium disabled:pointer-events-none disabled:opacity-40 ${variants[variant]} ${sizes[size]} ${className}`}
    />
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl bg-raised px-4 py-10 text-center text-xs text-ink-3">{children}</p>
  );
}

/**
 * A faster spinner reads as a faster app at an identical load time. 600ms is
 * about as quick as this goes without looking frantic.
 */
export function Spinner({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2.5 px-1 py-10 text-xs text-ink-3">
      <span
        className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-hairline-strong border-t-saffron [animation-duration:600ms]"
        aria-hidden
      />
      {label}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl bg-alert-soft px-4 py-3 text-xs text-alert">{children}</p>
  );
}

/** A quiet caption for provenance and source notes in card headers. */
export function Meta({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-ground px-2.5 py-1 text-2xs font-medium text-ink-3">
      {children}
    </span>
  );
}
