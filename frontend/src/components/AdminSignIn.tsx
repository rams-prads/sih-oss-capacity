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
    <div>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-2" htmlFor="uid">
            Officer id
          </label>
          <input
            id="uid"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            className="w-full rounded-lg border border-hairline-strong bg-surface px-3 py-2.5 text-sm text-ink"
            autoComplete="username"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-medium text-ink-2" htmlFor="pwd">
            Password
          </label>
          <input
            id="pwd"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-hairline-strong bg-surface px-3 py-2.5 text-sm text-ink"
            autoComplete="current-password"
          />
        </div>

        {error && (
          <p className="rounded-lg bg-alert-soft px-3 py-2 text-sm text-alert">{error}</p>
        )}

        <button
          type="submit"
          disabled={busy || !password}
          className="press w-full rounded-lg bg-ashoka px-4 py-2.5 text-sm font-medium text-white transition hover:bg-ashoka-2 disabled:bg-hairline-strong"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <p className="mt-5 border-t border-hairline pt-4 text-xs leading-relaxed text-ink-4">
        Demo credentials: <code className="text-ink-3">u-admin-meera</code> /{" "}
        <code className="text-ink-3">admin123</code>. Seeded officers use{" "}
        <code className="text-ink-3">officer123</code> and are not administrators.
      </p>
    </div>
  );
}
