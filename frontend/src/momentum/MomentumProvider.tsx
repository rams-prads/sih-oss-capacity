import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { getMomentum, setLearningGoal } from "../api";
import type { Momentum } from "../api";
import { CelebrationToast } from "../components/CelebrationToast";
import { diffMomentum } from "./diff";
import type { Celebration } from "./diff";

/**
 * The officer's momentum, held once for the whole officer application.
 *
 * Mounted above the routes rather than inside a page, for two reasons. The
 * header's streak and the pages below it read the same record, so they cannot
 * disagree. And feedback needs a "before": a video finished inside a course is
 * worth whatever the record gained since it was last read, so the last reading
 * has to outlive the page it was taken on.
 *
 * Everything here fails quietly. Momentum is encouragement layered over the
 * platform; if it cannot be read, every other screen must carry on exactly as
 * it did before it existed.
 */
export type MomentumStatus = "idle" | "loading" | "ready" | "error";

interface MomentumContextValue {
  momentum: Momentum | null;
  /** "error" only when nothing has ever been read; a failed refresh keeps the last record. */
  status: MomentumStatus;
  /** Re-read the record without any feedback - after an in-video answer, say. */
  refresh: () => Promise<Momentum | null>;
  /** Re-read the record and tell the officer what their last action changed. */
  celebrate: (title: string) => Promise<void>;
  updateGoal: (goal: { weekly_days_target: number; daily_points_target: number }) => Promise<void>;
}

const noop: MomentumContextValue = {
  momentum: null,
  status: "idle",
  refresh: async () => null,
  celebrate: async () => {},
  updateGoal: async () => {},
};

const MomentumContext = createContext<MomentumContextValue>(noop);

export function useMomentum(): MomentumContextValue {
  return useContext(MomentumContext);
}

export function MomentumProvider({
  userId,
  children,
}: {
  userId: string | null;
  children: ReactNode;
}) {
  const [momentum, setMomentum] = useState<Momentum | null>(null);
  const [status, setStatus] = useState<MomentumStatus>(userId ? "loading" : "idle");
  const [celebration, setCelebration] = useState<(Celebration & { id: number }) | null>(null);
  const latest = useRef<Momentum | null>(null);
  // The officer a response belongs to. Switching profile mid-request must not
  // let the previous officer's record land on the next officer's screen.
  const owner = useRef(userId);

  useEffect(() => {
    owner.current = userId;
    latest.current = null;
    setMomentum(null);
    setStatus(userId ? "loading" : "idle");
    setCelebration(null);
  }, [userId]);

  const read = useCallback(async (): Promise<Momentum | null> => {
    if (!userId) return null;
    try {
      const next = await getMomentum(userId);
      if (owner.current !== userId || !next) return null;
      latest.current = next;
      setMomentum(next);
      setStatus("ready");
      return next;
    } catch {
      if (owner.current === userId && !latest.current) setStatus("error");
      return null;
    }
  }, [userId]);

  useEffect(() => {
    read();
  }, [read]);

  const celebrate = useCallback(
    async (title: string) => {
      const before = latest.current;
      const after = await read();
      if (!after) return;
      setCelebration({ ...diffMomentum(before, after, title), id: Date.now() });
    },
    [read],
  );

  const updateGoal = useCallback(
    async (goal: { weekly_days_target: number; daily_points_target: number }) => {
      if (!userId) return;
      const next = await setLearningGoal(userId, goal);
      if (owner.current !== userId) return;
      latest.current = next;
      setMomentum(next);
      setStatus("ready");
    },
    [userId],
  );

  const dismiss = useCallback(() => setCelebration(null), []);

  const value = useMemo(
    () => ({ momentum, status, refresh: read, celebrate, updateGoal }),
    [momentum, status, read, celebrate, updateGoal],
  );

  return (
    <MomentumContext.Provider value={value}>
      {children}
      {celebration && (
        <CelebrationToast
          key={celebration.id}
          celebration={celebration}
          onDismiss={dismiss}
        />
      )}
    </MomentumContext.Provider>
  );
}
