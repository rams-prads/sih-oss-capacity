import { useState } from "react";
import { Link } from "react-router-dom";
import type { User } from "../api";
import mark from "../assets/karmayogi-mark.png";
import { AdminSignIn } from "../components/AdminSignIn";
import { Watermark } from "../components/Shell";
import { Spinner } from "../components/ui";

/**
 * The one door into both halves of the platform.
 *
 * The two sides are not the same kind of sign-in, and the page says so rather
 * than pretending otherwise. An officer's screens show that officer's own
 * record, so picking a profile is all the identity the demo needs and there is
 * no password to invent. The admin screens aggregate every officer's record,
 * so that side takes a real password and returns a bearer token - the officer
 * header the rest of the app uses is deliberately not accepted there.
 *
 * Both are on one screen behind a segmented control instead of two routes,
 * because "which of these am I" is the question being asked, and a reader
 * cannot answer it if only one option is on screen at a time.
 */

type Side = "officer" | "admin";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase();
}

export default function Login({
  users,
  loading,
  onOfficer,
  onAdmin,
}: {
  users: User[];
  loading: boolean;
  onOfficer: (user: User) => void;
  onAdmin: (user: User) => void;
}) {
  const [side, setSide] = useState<Side>("officer");

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center px-6 py-12">
      <Watermark />

      <div className="relative w-full max-w-lg">
        <header className="text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-surface ring-1 ring-hairline">
            <img src={mark} alt="" className="h-10 w-auto" />
          </span>
          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.01em] text-ink">
            Competency Platform
          </h1>
          <p className="mt-1.5 text-sm text-ink-3">Official Statistical System · MoSPI</p>
        </header>

        <div className="mt-8 overflow-hidden rounded-2xl border border-hairline bg-surface">
          {/* The choice of side, made before anything is filled in. */}
          <div className="flex gap-1 border-b border-hairline bg-ground p-1.5">
            {(
              [
                ["officer", "Officer"],
                ["admin", "Administrator"],
              ] as [Side, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSide(key)}
                aria-pressed={side === key}
                className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  side === key
                    ? "bg-surface text-ink shadow-sm"
                    : "text-ink-3 hover:text-ink-2"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="p-6">
            {side === "officer" ? (
              <OfficerPicker users={users} loading={loading} onPick={onOfficer} />
            ) : (
              <>
                <p className="mb-5 text-sm leading-relaxed text-ink-3">
                  Department analytics cover every officer's record, so this side needs a
                  password rather than a choice of profile.
                </p>
                <AdminSignIn onSignedIn={onAdmin} />
              </>
            )}
          </div>
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-ink-4">
          Prototype for Smart India Hackathon 2026 (SIH26101). Not connected to production
          iGOT.
        </p>
      </div>
    </div>
  );
}

function OfficerPicker({
  users,
  loading,
  onPick,
}: {
  users: User[];
  loading: boolean;
  onPick: (user: User) => void;
}) {
  if (loading) return <Spinner label="Loading officers" />;

  if (users.length === 0) {
    return (
      <div className="py-6 text-center">
        <p className="text-sm text-ink-2">No officers are seeded yet.</p>
        <p className="mt-1.5 text-xs text-ink-4">
          Start the backend and run the seed, or register the first officer below.
        </p>
        <RegisterLink />
      </div>
    );
  }

  return (
    <>
      <p className="mb-4 text-sm leading-relaxed text-ink-3">
        Choose the officer to sign in as. Every screen then shows that officer's own
        record.
      </p>

      <ul className="-mx-1.5 max-h-80 space-y-0.5 overflow-y-auto px-1.5">
        {users.map((user) => (
          <li key={user.id}>
            <button
              type="button"
              onClick={() => onPick(user)}
              className="press flex w-full items-center gap-3 rounded-xl border border-transparent px-2.5 py-2.5 text-left transition hover:border-hairline hover:bg-raised"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ashoka-soft text-xs font-semibold text-ashoka">
                {initials(user.name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">
                  {user.name}
                </span>
                <span className="block truncate text-xs text-ink-3">{user.role_name}</span>
              </span>
              {user.is_admin && (
                <span className="shrink-0 rounded-full bg-saffron-soft px-2 py-0.5 text-2xs font-medium text-saffron-ink">
                  also admin
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>

      <RegisterLink />
    </>
  );
}

function RegisterLink() {
  return (
    <p className="mt-5 border-t border-hairline pt-4 text-xs text-ink-4">
      Not on the roll yet?{" "}
      <Link to="/join" className="font-medium text-ashoka hover:underline">
        Register an officer
      </Link>{" "}
      and the platform will measure where they start.
    </p>
  );
}
