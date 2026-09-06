import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import type { User } from "../api";
import logo from "../assets/karmayogi-logo.png";
import mark from "../assets/karmayogi-mark.png";

/**
 * The emblem behind a page that has no application chrome to carry it.
 *
 * The emblem alone, without its wordmark: these pages put a panel over the
 * middle of the logo, and a wordmark cut in half by a panel reads as a mistake
 * rather than as a watermark. A watermark is scenery - it has to survive being
 * ignored, so it never competes with the content for contrast, never
 * intercepts a click, and sits behind everything on its own layer.
 */
export function Watermark() {
  return (
    <div
      className="pointer-events-none fixed inset-0 -z-10 grid select-none place-items-center overflow-hidden"
      aria-hidden
    >
      <img src={logo} alt="" className="w-[min(92vw,860px)] max-w-none opacity-[0.08]" />
    </div>
  );
}

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
  profile: "M19 20v-1.8a4.2 4.2 0 0 0-4.2-4.2H9.2A4.2 4.2 0 0 0 5 18.2V20M12 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
  join: "M16 19v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 17.5V19M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19 8v6M22 11h-6",
  feedback: "M20 12a7 7 0 0 1-7 7H8.5L4.5 21.5l.9-3.5A7 7 0 0 1 11 4.5h2a7 7 0 0 1 7 7.5Z",
};

export type NavItem = { to: string; label: string; icon: string; blurb: string };

/**
 * Two navigations, because there are two applications behind one door.
 *
 * An officer's screens show that officer's own record; the admin screens
 * aggregate every officer's. They were one rail with an "Admin" item in the
 * middle of it, which put a link the signed-in officer could not open next to
 * five they could, and made the whole cadre's data look like one more tab of
 * their own. Each side now has its own rail and sees only its own routes.
 */
export const OFFICER_NAV: NavItem[] = [
  { to: "/learner", label: "Dashboard", icon: ICONS.dashboard, blurb: "Gaps, profile and recommended training" },
  { to: "/my-learning", label: "My Courses", icon: ICONS.courses, blurb: "Enrolled courses, videos and checkpoints" },
  { to: "/assess", label: "Quiz Generator", icon: ICONS.quiz, blurb: "Generate assessments from learning material" },
  { to: "/profile", label: "My Profile", icon: ICONS.profile, blurb: "Your designation, study record and what has been measured" },
];
// Registration is not in this list on purpose. It is how somebody who has no
// account gets one, so it belongs to the login page and not to the workspace
// of an officer who plainly already has one.

export const ADMIN_NAV: NavItem[] = [
  { to: "/admin", label: "Capacity", icon: ICONS.admin, blurb: "Department-wide capacity and cohort analytics" },
  // Kept out of the Capacity screen's tab strip: everything there is an
  // aggregate the platform computed about officers, and this is the one place
  // officers speak for themselves.
  { to: "/admin/feedback", label: "Feedback", icon: ICONS.feedback, blurb: "What officers have written in about, and what was done" },
];

/* ---------------------------------------------------------------------------
   The rail
   --------------------------------------------------------------------------- */

export function Rail({ items }: { items: NavItem[] }) {
  return (
    <aside className="rail fixed inset-y-0 left-0 z-40 flex w-[4.5rem] flex-col items-center gap-1 bg-ink py-4">
      {/* The nib from the Karmayogi Bharat emblem, on white. The mark's own
          blue is close enough to the rail's navy to vanish against it, so the
          tile is the light ground the mark was drawn for. */}
      <span
        className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-white"
        title="Karmayogi Bharat · Competency Platform"
      >
        <img src={mark} alt="" className="h-[26px] w-auto" />
      </span>

      <nav className="flex flex-col items-center gap-1">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            // Exact matching for anything another item sits beneath, or /admin
            // would light up alongside Feedback on /admin/feedback and the rail
            // would claim you were in two places.
            end={
              item.to === "/assess" ||
              items.some((other) => other.to !== item.to && other.to.startsWith(`${item.to}/`))
            }
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
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink text-2xs font-semibold text-white">
          {active ? initials(active.name) : "—"}
        </span>
        <span className="hidden text-left leading-tight sm:block">
          <span className="block text-xs font-medium text-ink">
            {active?.name ?? "Select officer"}
          </span>
          <span className="block text-2xs text-ink-3">{active?.role_name ?? ""}</span>
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
          <p className="border-b border-hairline px-3 py-2 text-2xs font-medium uppercase tracking-[0.08em] text-ink-3">
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
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-ground text-2xs font-semibold text-ink-2">
                    {initials(user.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-medium text-ink">
                      {user.name}
                    </span>
                    <span className="block truncate text-2xs text-ink-3">{user.role_name}</span>
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

/* ---------------------------------------------------------------------------
   Session controls

   Sign-out lives in the header on both sides rather than inside a page, so it
   sits in the same place whichever half of the application you are in.
   --------------------------------------------------------------------------- */

export function SignOutButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="press rounded-xl border border-hairline bg-surface px-3 py-2 text-xs font-medium text-ink-2 hover:border-hairline-strong hover:bg-raised"
    >
      Sign out
    </button>
  );
}

/**
 * Who is signed in on the admin side.
 *
 * Not the officer switcher: an administrator is signed in with a password and
 * cannot become someone else without signing out, so offering a menu here
 * would promise something the session does not allow.
 */
export function AdminIdentity({ user }: { user: User | null }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-hairline bg-surface py-1.5 pl-1.5 pr-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-saffron text-2xs font-semibold text-white">
        {user ? initials(user.name) : "—"}
      </span>
      <span className="hidden text-left leading-tight sm:block">
        <span className="block text-xs font-medium text-ink">{user?.name ?? "Administrator"}</span>
        <span className="block text-2xs text-ink-3">Administrator</span>
      </span>
    </div>
  );
}
