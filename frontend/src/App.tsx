import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { getUsers, setActiveUser } from "./api";
import type { User } from "./api";
import Admin from "./pages/Admin";
import Learner from "./pages/Learner";
import MyLearning from "./pages/MyLearning";
import Upload from "./pages/Upload";

const DEMO_USER = "u-jso-anita";

export default function App() {
  const [users, setUsers] = useState<User[]>([]);
  const [userId, setUserId] = useState(DEMO_USER);

  useEffect(() => {
    getUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  useEffect(() => {
    setActiveUser(userId);
  }, [userId]);

  const active = users.find((u) => u.id === userId);

  const tab = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-1.5 text-sm font-medium transition ${
      isActive ? "bg-white text-slate-900 shadow-sm" : "text-slate-300 hover:text-white"
    }`;

  return (
    <div className="min-h-screen">
      <header className="bg-[#1e3a5f] text-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-3">
          <div className="mr-auto">
            <h1 className="text-base font-semibold leading-tight">
              Competency Platform for the Official Statistical System
            </h1>
            <p className="text-xs text-slate-300">
              Ministry of Statistics &amp; Programme Implementation &middot; aligned to FRAC and
              iGOT Karmayogi
            </p>
          </div>

          <nav className="flex gap-1 rounded-xl bg-white/10 p-1">
            <NavLink to="/learner" className={tab}>
              My competencies
            </NavLink>
            <NavLink to="/my-learning" className={tab}>
              My learning
            </NavLink>
            <NavLink to="/assess" className={tab}>
              Assessment
            </NavLink>
            <NavLink to="/admin" className={tab}>
              Department view
            </NavLink>
          </nav>

          <label className="flex items-center gap-2 text-xs text-slate-300">
            Viewing as
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="rounded-lg border-0 bg-white/10 px-2 py-1.5 text-sm text-white outline-none ring-1 ring-white/20 focus:ring-white/50"
            >
              {users.map((u) => (
                <option key={u.id} value={u.id} className="text-slate-900">
                  {u.name} — {u.role_id}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/learner" replace />} />
          <Route path="/learner" element={<Learner userId={userId} user={active} />} />
          <Route path="/my-learning" element={<MyLearning userId={userId} />} />
          <Route path="/assess" element={<Upload userId={userId} />} />
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </main>

      <footer className="mx-auto max-w-7xl px-6 pb-8 text-xs leading-relaxed text-slate-500">
        Prototype for Smart India Hackathon 2026 (SIH26101). Course data is served by a local
        sandbox implementing the Sunbird API contract that iGOT Karmayogi is built on. This build
        is not connected to production iGOT.
      </footer>
    </div>
  );
}
