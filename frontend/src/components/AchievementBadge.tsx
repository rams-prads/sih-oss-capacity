import type { ComponentType } from "react";
import type { Achievement, Momentum } from "../api";
import {
  BookOpenIcon,
  ClipboardCheckIcon,
  FlameIcon,
  LayersIcon,
  LockIcon,
  MedalIcon,
  PlayCircleIcon,
  ShieldCheckIcon,
  TargetIcon,
  TrendUpIcon,
} from "./icons";

/**
 * Achievements: a short list of milestones in an officer's learning.
 *
 * Eight, and each one is a thing the record can prove - a measurement taken, a
 * level raised on evidence, a course finished, a week kept. A badge for
 * opening the app would teach that opening the app is the point.
 */
const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  first_assessment: ClipboardCheckIcon,
  evidence_backed: ShieldCheckIcon,
  level_up: TrendUpIcon,
  first_course: BookOpenIcon,
  five_modules: LayersIcon,
  streak_7: FlameIcon,
  week_on_target: TargetIcon,
  videos_25: PlayCircleIcon,
};

function earnedOn(iso: string | null): string {
  if (!iso) return "Earned";
  return `Earned ${new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })}`;
}

export function AchievementBadge({ achievement }: { achievement: Achievement }) {
  const Icon = ICONS[achievement.id] ?? MedalIcon;
  const { unlocked, progress, target } = achievement;

  return (
    <li className="flex items-start gap-3 rounded-xl border border-hairline p-3.5">
      <span
        aria-hidden
        className={`relative grid h-11 w-11 shrink-0 place-items-center rounded-full text-[20px] ${
          unlocked ? "bg-ashoka text-white" : "bg-ground text-ink-4 ring-1 ring-inset ring-hairline"
        }`}
      >
        <Icon />
        {!unlocked && (
          <span className="absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full bg-surface text-[11px] text-ink-4 ring-1 ring-hairline">
            <LockIcon />
          </span>
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold leading-snug ${unlocked ? "text-ink" : "text-ink-2"}`}>
          {achievement.title}
          <span className="sr-only">{unlocked ? " (unlocked)" : " (locked)"}</span>
        </p>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-3">{achievement.description}</p>
        {unlocked ? (
          <p className="mt-1.5 text-2xs font-medium text-chakra">{earnedOn(achievement.unlocked_on)}</p>
        ) : target > 1 ? (
          <div className="mt-2 flex items-center gap-2">
            <div
              role="progressbar"
              aria-label={`${achievement.title} progress`}
              aria-valuemin={0}
              aria-valuemax={target}
              aria-valuenow={progress}
              className="h-1.5 flex-1 overflow-hidden rounded-full bg-saffron/15"
            >
              <div
                className="h-full rounded-full bg-saffron transition-[width] duration-700"
                style={{ width: `${Math.round((100 * progress) / target)}%` }}
              />
            </div>
            <span className="shrink-0 text-2xs tabular-nums text-ink-4">
              {progress} / {target}
            </span>
          </div>
        ) : (
          <p className="mt-1.5 text-2xs text-ink-4">Not yet</p>
        )}
      </div>
    </li>
  );
}

export function AchievementsPanel({ momentum }: { momentum: Momentum }) {
  const unlocked = momentum.achievements.filter((a) => a.unlocked).length;
  // Earned first, so what someone has done is not buried under what they have not.
  const ordered = [...momentum.achievements].sort(
    (a, b) => Number(b.unlocked) - Number(a.unlocked),
  );

  return (
    <section className="rounded-2xl border border-hairline bg-surface px-5 pb-5 pt-5 sm:px-6">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="text-[15px] font-semibold text-ink">Achievements</h2>
        <p className="text-xs text-ink-3">
          {unlocked} of {momentum.achievements.length} earned
        </p>
      </header>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ordered.map((achievement) => (
          <AchievementBadge key={achievement.id} achievement={achievement} />
        ))}
      </ul>
    </section>
  );
}
