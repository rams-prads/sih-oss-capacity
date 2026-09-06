import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Link, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import {
  getMe,
  getUsers,
  restoreActiveUser,
  restoreToken,
  setActiveUser,
  setToken,
} from "./api";
import type { User } from "./api";
import {
  ADMIN_NAV,
  AdminIdentity,
  OFFICER_NAV,
  Rail,
  SignOutButton,
  UserMenu,
  Watermark,
} from "./components/Shell";
import type { NavItem } from "./components/Shell";
import { Spinner } from "./components/ui";
import Admin from "./pages/Admin";
import AdminFeedback from "./pages/AdminFeedback";
import CompetencyAssessment from "./pages/CompetencyAssessment";
import Join from "./pages/Join";
import Learner from "./pages/Learner";
import Login from "./pages/Login";
import MyLearning from "./pages/MyLearning";
import Profile from "./pages/Profile";
import Upload from "./pages/Upload";

/**
 * Two applications behind one door.
 *
 * The officer side and the admin side used to share a shell: one rail carried
 * both, and the admin screens gated themselves from inside the page. That put
 * a route the signed-in officer could not open in the middle of five they
 * could, and meant "am I an administrator" was answered halfway down a page
 * rather than at the door.
 *
 * Now each side has its own route set, its own rail and its own session, and
 * the guard is here - at the route - so a page never renders for someone who
 * has no business seeing it. The two sessions are genuinely different things:
 * the officer one is a choice of profile with no password, because those
 * screens only ever show that officer's own record; the admin one is a bearer
 * token from a real sign-in, because those screens aggregate everybody's.
 */

/**
 * Which navigation item the current page belongs to.
 *
 * Longest match wins. A plain prefix test made /admin/feedback the Capacity
 * screen, because /admin is a prefix of it and came first in the list - the
 * header would have named the page the reader was not on.
 */
export function activeItem(items: NavItem[], pathname: string): NavItem | undefined {
  return items
    .filter((item) => pathname === item.to || pathname.startsWith(`${item.to}/`))
    .sort((a, b) => b.to.length - a.to.length)[0];
}

const FOOTER =
  "Prototype for Smart India Hackathon 2026 (SIH26101). Course data is served by a local " +
  "sandbox implementing the Sunbird API contract that iGOT Karmayogi is built on. This build " +
  "is not connected to production iGOT.";

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);

  // The officer half of the session: which seeded profile we are viewing as.
  const [officerId, setOfficerId] = useState<string | null>(() => restoreActiveUser());

  // The admin half. The token survives a reload but the user behind it does
  // not, so the session is "restoring" until /auth/me answers - and until it
  // does, the admin route must neither render nor bounce to the login page.
  const [admin, setAdmin] = useState<User | null>(null);
  const [adminRestoring, setAdminRestoring] = useState(() => Boolean(restoreToken()));

  useEffect(() => {
    getUsers()
      .then(setUsers)
      .catch(() => setUsers([]))
      .finally(() => setUsersLoading(false));
  }, []);

  useEffect(() => {
    if (!adminRestoring) return;
    getMe()
      .then((user) => {
        if (user.is_admin) setAdmin(user);
        else setToken(null);
      })
      .catch(() => setToken(null))
      .finally(() => setAdminRestoring(false));
  }, [adminRestoring]);

  function signInOfficer(user: User) {
    setActiveUser(user.id);
    setOfficerId(user.id);
    navigate("/learner", { replace: true });
  }

  function signInAdmin(user: User) {
    // AdminSignIn has already stored the bearer token by this point.
    setAdmin(user);
    navigate("/admin", { replace: true });
  }

  function signOutOfficer() {
    setActiveUser(null);
    setOfficerId(null);
    navigate("/login", { replace: true });
  }

  // Stable, because Admin lists it in an effect's dependencies: a fresh
  // identity on every render of this component would re-run that effect - and
  // the effect refetches - on every keystroke anywhere above it.
  const signOutAdmin = useCallback(() => {
    setToken(null);
    setAdmin(null);
    navigate("/login", { replace: true });
  }, [navigate]);

  // A newly registered officer becomes the active profile, so the dashboard
  // they land on is their own rather than whoever was signed in before.
  function handleJoined(user: User) {
    setUsers((current) => [...current.filter((u) => u.id !== user.id), user]);
    setActiveUser(user.id);
    setOfficerId(user.id);
  }

  const activeOfficer = users.find((u) => u.id === officerId);

  /**
   * Officer chrome, or the login page if there is no officer session.
   *
   * Takes a render function rather than a node so the page is only built once
   * the guard has established there is an id to build it with - no page ever
   * receives an empty user id "that will never render anyway".
   */
  function officerArea(render: (officerId: string) => ReactNode) {
    if (!officerId) return <Navigate to="/login" replace />;
    const current = activeItem(OFFICER_NAV, location.pathname);
    return (
      <Chrome
        items={OFFICER_NAV}
        current={current}
        right={
          <div className="flex items-center gap-2">
            <UserMenu users={users} userId={officerId} onSelect={switchOfficer} />
            <SignOutButton onClick={signOutOfficer} />
          </div>
        }
      >
        {render(officerId)}
      </Chrome>
    );
  }

  function switchOfficer(id: string) {
    setActiveUser(id);
    setOfficerId(id);
  }

  function adminArea(render: () => ReactNode) {
    if (adminRestoring) {
      return (
        <div className="grid min-h-screen place-items-center">
          <Spinner label="Restoring your session" />
        </div>
      );
    }
    if (!admin) return <Navigate to="/login" replace />;
    const current = activeItem(ADMIN_NAV, location.pathname);
    return (
      <Chrome
        items={ADMIN_NAV}
        current={current}
        right={
          <div className="flex items-center gap-2">
            <AdminIdentity user={admin} />
            <SignOutButton onClick={signOutAdmin} />
          </div>
        }
      >
        {render()}
      </Chrome>
    );
  }

  const home = officerId ? "/learner" : admin ? "/admin" : "/login";

  return (
    <Routes>
      <Route
        path="/login"
        element={
          officerId || admin ? (
            <Navigate to={home} replace />
          ) : (
            <Login
              users={users}
              loading={usersLoading}
              onOfficer={signInOfficer}
              onAdmin={signInAdmin}
            />
          )
        }
      />

      {/* Registration stands outside both applications. It is how somebody
          with no account gets one, so it never wears the officer chrome - a
          rail of links to an officer's own record makes no sense to a person
          who does not have a record yet. It is reached from the login page. */}
      <Route
        path="/join"
        element={
          <PublicFrame>
            <Join onJoined={handleJoined} />
          </PublicFrame>
        }
      />

      <Route
        path="/learner"
        element={officerArea((id) => <Learner userId={id} user={activeOfficer} />)}
      />
      <Route path="/my-learning" element={officerArea((id) => <MyLearning userId={id} />)} />
      <Route path="/assess" element={officerArea((id) => <Upload userId={id} />)} />
      <Route
        path="/assess/:competencyId"
        element={officerArea((id) => <CompetencyAssessment userId={id} />)}
      />
      <Route
        path="/profile"
        element={officerArea((id) => <Profile userId={id} user={activeOfficer} />)}
      />

      <Route path="/admin" element={adminArea(() => <Admin onSignedOut={signOutAdmin} />)} />
      <Route
        path="/admin/feedback"
        element={adminArea(() => <AdminFeedback onSignedOut={signOutAdmin} />)}
      />

      <Route path="/" element={<Navigate to={home} replace />} />
      <Route path="*" element={<Navigate to={home} replace />} />
    </Routes>
  );
}

/* ---------------------------------------------------------------------------
   The frame both sides share

   Same rail, header and footer geometry either side of the door; only the
   navigation and the identity control differ. Keeping one component means the
   two areas cannot drift into looking like two different products.
   --------------------------------------------------------------------------- */

function Chrome({
  items,
  current,
  right,
  children,
}: {
  items: NavItem[];
  current?: NavItem;
  right: ReactNode;
  children: ReactNode;
}) {
  const location = useLocation();

  return (
    <div className="min-h-screen pl-[4.5rem]">
      <Rail items={items} />

      {/* The header carries the page name and who is signed in, and nothing
          else. Navigation lives in the rail, so this row does not compete. */}
      <header className="sticky top-0 z-30 border-b border-hairline bg-ground/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[82rem] items-center gap-6 px-8 py-4">
          <div className="mr-auto min-w-0">
            <h1 className="truncate text-[19px] font-semibold leading-tight text-ink">
              {current?.label ?? "Competency Platform"}
            </h1>
            <p className="mt-0.5 truncate text-2xs leading-tight text-ink-3">
              {current?.blurb ?? "Official Statistical System · MoSPI"}
            </p>
          </div>
          {right}
        </div>
      </header>

      {/* Keyed on pathname so each screen enters rather than snapping in. */}
      <main key={location.pathname} className="rise mx-auto max-w-[82rem] px-8 py-7">
        {children}
      </main>

      <footer className="mx-auto max-w-[82rem] px-8 pb-10">
        <p className="border-t border-hairline pt-5 text-2xs leading-relaxed text-ink-4">
          {FOOTER}
        </p>
      </footer>
    </div>
  );
}

/** The frame for a page reachable without a session. No rail: there is nothing
 *  to navigate to yet, and an empty rail would only advertise that. */
function PublicFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <Watermark />

      <header className="border-b border-hairline bg-surface/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[62rem] items-center justify-between gap-6 px-8 py-4">
          <div className="min-w-0">
            <h1 className="truncate text-[19px] font-semibold leading-tight text-ink">
              Register an officer
            </h1>
            <p className="mt-0.5 truncate text-2xs leading-tight text-ink-3">
              Official Statistical System · MoSPI
            </p>
          </div>
          <Link
            to="/login"
            className="press shrink-0 rounded-xl border border-hairline bg-surface px-3 py-2 text-xs font-medium text-ink-2 hover:border-hairline-strong hover:bg-raised"
          >
            Back to sign in
          </Link>
        </div>
      </header>

      {/* Centred in what is left after the header, so the card lands over the
          middle of the watermark. Anchored to the top it sat above the
          emblem's fan and left the mouse and its cord adrift in the empty half
          of the page below. */}
      <main className="rise mx-auto flex w-full max-w-[62rem] flex-1 flex-col justify-center px-8 py-10">
        {children}
      </main>

      <footer className="mx-auto w-full max-w-[62rem] px-8 pb-10">
        <p className="border-t border-hairline pt-5 text-2xs leading-relaxed text-ink-4">
          {FOOTER}
        </p>
      </footer>
    </div>
  );
}
