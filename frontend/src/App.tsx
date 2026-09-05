import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { getUsers, setActiveUser } from "./api";
import type { User } from "./api";
import { NAV, Rail, UserMenu } from "./components/Shell";
import Admin from "./pages/Admin";
import Join from "./pages/Join";
import Learner from "./pages/Learner";
import MyLearning from "./pages/MyLearning";
import Upload from "./pages/Upload";

const DEMO_USER = "u-jso-anita";

export default function App() {
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState(DEMO_USER);
  const location = useLocation();

  // A newly registered officer becomes the active profile, so the dashboard they
  // land on is their own rather than the demo one.
  function handleJoined(user: User) {
    setUsers((current) => [...current.filter((u) => u.id !== user.id), user]);
    setUserId(user.id);
  }

  useEffect(() => {
    getUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    setActiveUser(userId);
  }, [userId]);

  const active = users.find((u) => u.id === userId);
  const current = NAV.find((item) => location.pathname.startsWith(item.to));

  return (
    <div className="min-h-screen pl-[4.5rem]">
      <Rail />

      {/* The header carries the page name and the officer, and nothing else.
          Navigation moved to the rail, so this row no longer competes with it. */}
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

          <UserMenu users={users} userId={userId} onSelect={setUserId} />
        </div>
      </header>

      {/* Keyed on pathname so each screen enters rather than snapping in. */}
      <main key={location.pathname} className="rise mx-auto max-w-[82rem] px-8 py-7">
        <Routes>
          <Route path="/" element={<Navigate to="/learner" replace />} />
          <Route path="/learner" element={<Learner userId={userId} user={active} />} />
          <Route path="/my-learning" element={<MyLearning userId={userId} />} />
          <Route path="/assess" element={<Upload userId={userId} />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/join" element={<Join onJoined={handleJoined} />} />
        </Routes>
      </main>

      <footer className="mx-auto max-w-[82rem] px-8 pb-10">
        <p className="border-t border-hairline pt-5 text-2xs leading-relaxed text-ink-4">
          Prototype for Smart India Hackathon 2026 (SIH26101). Course data is served by a local
          sandbox implementing the Sunbird API contract that iGOT Karmayogi is built on. This build
          is not connected to production iGOT.
        </p>
      </footer>
    </div>
  );
}
