import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import type { User } from "../api";

/* ---------------------------------------------------------------------------
   Icons. Inline rather than a package: five 20px glyphs do not justify a
   dependency, and these inherit currentColor so the rail states are one rule.
   --------------------------------------------------------------------------- */

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Icon({ path, className = "h-[18px] w-[18px]" }: { path: string; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path d={path} {...stroke} />
    </svg>
  );
}

const ICONS = {
  dashboard: "M4 13h6V4H4v9Zm0 7h6v-4H4v4Zm10 0h6v-9h-6v9Zm0-16v4h6V4h-6Z",
  courses: "M4 5.5A1.5 1.5 0 0 1 5.5 4H10a2 2 0 0 1 2 2 2 2 0 0 1 2-2h4.5A1.5 1.5 0 0 1 20 5.5v11a1.5 1.5 0 0 1-1.5 1.5H14a2 2 0 0 0-2 2 2 2 0 0 0-2-2H5.5A1.5 1.5 0 0 1 4 16.5v-11Z",
  quiz: "M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17h.01M4 12a8 8 0 1 0 16 0 8 8 0 0 0-16 0Z",
  admin: "M3 20h18M6 20v-7M11 20V7M16 20v-4M21 20V4",
  join: "M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19 8v6M22 11h-6",
};

export const NAV = [
  { to: "/learner", label: "Dashboard", icon: ICONS.dashboard, blurb: "Gaps, profile and recommended training" },
  { to: "/my-learning", label: "My Courses", icon: ICONS.courses, blurb: "Enrolled courses, videos and checkpoints" },
  { to: "/assess", label: "Quiz Generator", icon: ICONS.quiz, blurb: "Generate assessments from learning material" },
  { to: "/admin", label: "Admin", icon: ICONS.admin, blurb: "Department-wide capacity and cohort analytics" },
  { to: "/join", label: "Join", icon: ICONS.join, blurb: "Register an officer and measure where they start" },
];

/* ---------------------------------------------------------------------------
   The rail
   --------------------------------------------------------------------------- */

export function Rail() {
  return (
    <aside className="rail fixed inset-y-0 left-0 z-40 flex w-[4.5rem] flex-col items-center gap-1 bg-ink py-4">
      <span
        className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-saffron text-white"
        title="Competency Platform"
      >
        <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden>
          <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          {Array.from({ length: 8 }, (_, i) => (
            <line
              key={i}
              x1="12"
              y1="12"
              x2="12"
              y2="4"
              stroke="currentColor"
              strokeWidth="0.9"
              strokeLinecap="round"
              transform={`rotate(${i * 45} 12 12)`}
              opacity="0.8"
            />
          ))}
        </svg>
      </span>

      <nav className="flex flex-col items-center gap-1">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            aria-label={item.label}
            className={({ isActive }) =>
              `tip-host press relative grid h-11 w-11 place-items-center rounded-xl ${
                isActive
                  ? "bg-saffron text-white"
                  : "text-white/45 hover:bg-white/10 hover:text-white"
              }`
            }
          >
            <Icon path={item.icon} className="h-[19px] w-[19px]" />
            <span className="tip" role="tooltip">
              {item.label}
            </span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}

/* ---------------------------------------------------------------------------
   The officer switcher

   Its own control in the top-right, which is where a profile lives. Previously
   this was a bare select sitting inside the navigation, which read as one more
   nav item rather than as "who am I looking at".
   --------------------------------------------------------------------------- */

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export function UserMenu({
  users,
  userId,
  onSelect,
}: {
  users: User[];
  userId: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const active = users.find((u) => u.id === userId);

  // Close on outside press and on Escape. Both listeners are only attached
  // while the menu is open, so the closed state costs nothing.
  useEffect(() => {
    if (!open) return;

    function onDown(event: MouseEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={root}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="press flex items-center gap-2.5 rounded-xl border border-hairline bg-surface py-1.5 pl-1.5 pr-2.5 hover:border-hairline-strong"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink text-[11px] font-semibold text-white">
          {active ? initials(active.name) : "—"}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-[13px] font-medium text-ink">
            {active?.name ?? "Select officer"}
          </span>
          <span className="block text-[11px] text-ink-3">{active?.role_name ?? ""}</span>
        </span>
        <svg viewBox="0 0 12 12" className="h-3 w-3 shrink-0 text-ink-4" aria-hidden>
          <path d="M3 4.5 6 7.5l3-3" {...stroke} strokeWidth={1.4} />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          className="menu-in absolute right-0 z-50 mt-2 w-72 overflow-hidden rounded-xl border border-hairline bg-surface shadow-[var(--shadow-lg)]"
        >
          <p className="border-b border-hairline px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-ink-3">
            Viewing as
          </p>
          <div className="max-h-80 overflow-y-auto p-1">
            {users.map((user) => {
              const isActive = user.id === userId;
              return (
                <button
                  key={user.id}
                  role="menuitem"
                  onClick={() => {
                    onSelect(user.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left ${
                    isActive ? "bg-ashoka-soft" : "hover:bg-ground"
                  }`}
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-ground text-[10px] font-semibold text-ink-2">
                    {initials(user.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">
                      {user.name}
                    </span>
                    <span className="block truncate text-[11px] text-ink-3">{user.role_name}</span>
                  </span>
                  {isActive && (
                    <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 shrink-0 text-saffron" aria-hidden>
                      <path d="M2.5 6.5 5 9l4.5-5.5" {...stroke} strokeWidth={1.8} />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
