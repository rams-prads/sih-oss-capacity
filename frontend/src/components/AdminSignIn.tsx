import { useState } from "react";
import { login, setToken } from "../api";
import type { User } from "../api";

/**
 * Department analytics cover the whole cadre, so they need a real sign-in.
 * The X-User-Id header used elsewhere to switch demo profiles is deliberately
 * not accepted by the admin endpoints.
 */
export function AdminSignIn({ onSignedIn }: { onSignedIn: (user: User) => void }) {
  const [userId, setUserId] = useState("u-admin-meera");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { access_token, user } = await login(userId, password);
      if (!user.is_admin) {
        setError("That account does not have administrator access.");
        return;
      }
      setToken(access_token);
      onSignedIn(user);
    } catch {
      setError("Incorrect officer id or password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md rounded-xl border border-hairline bg-surface p-6 shadow-sm">
      <h2 className="font-semibold text-ink">Administrator sign-in</h2>
      <p className="mt-1 text-sm text-ink-3">
        Department analytics show every officer's record, so they require a sign-in
        rather than the profile switcher.
      </p>

      <form onSubmit={submit} className="mt-4 space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-2" htmlFor="uid">
            Officer id
          </label>
          <input
            id="uid"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full rounded-lg border border-hairline-strong px-3 py-2 text-sm"
            autoComplete="username"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-ink-2" htmlFor="pwd">
            Password
          </label>
          <input
            id="pwd"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-hairline-strong px-3 py-2 text-sm"
            autoComplete="current-password"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy || !password}
          className="w-full rounded-lg bg-ashoka px-4 py-2 text-sm font-medium text-white transition hover:bg-ashoka-2 disabled:bg-hairline-strong"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-4 border-t border-hairline pt-3 text-xs text-ink-4">
        Demo credentials: <code>u-admin-meera</code> / <code>admin123</code>. Seeded
        officers use <code>officer123</code> and are not administrators.
      </p>
    </div>
  );
}
