import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Course, Recommendation } from "../api";
import { RecommendationCard, difficultyLabel } from "./RecommendationCard";
import { CourseCover } from "./CourseCover";

function course(over: Partial<Course> = {}): Course {
  return {
    identifier: "do_1",
    name: "Foundations of Survey Design",
    description: "",
    competency_ids: ["C01", "C04"],
    target_level: 3,
    provider: "iGOT Karmayogi",
    duration_min: 300,
    source: "igot",
    mode: "online",
    eligibility: "",
    duration_days: 0,
    batch_size: 0,
    url: "",
    outline: ["A", "B", "C"],
    ...over,
  };
}

function rec(over: Partial<Recommendation> = {}): Recommendation {
  return {
    course: course(),
    score: 2,
    covers_gap_competencies: ["C01"],
    covers_count: 1,
    reason: "Closes your Survey Design gap",
    primary_competency_id: "C01",
    primary_competency_name: "Survey Design",
    ...over,
  };
}

const names: Record<string, string> = { C01: "Survey Design", C04: "Statistical Analysis" };
const lookup = (id: string) => names[id] ?? id;

const card = (r: Recommendation, enrolled = false, onEnrol = () => {}) => (
  <RecommendationCard rec={r} enrolled={enrolled} competencyName={lookup} onEnrol={onEnrol} />
);

describe("RecommendationCard", () => {
  it("answers what the officer gets, before they open anything", () => {
    render(card(rec()));
    expect(screen.getByText(/Survey Design, Statistical Analysis/)).toBeInTheDocument();
  });

  it("says where it takes them and how long it takes", () => {
    render(card(rec()));
    expect(screen.getByText(/Takes you to Proficient/)).toBeInTheDocument();
    expect(screen.getByText("5 h")).toBeInTheDocument();
    expect(screen.getByText("3 sections")).toBeInTheDocument();
  });

  it("shows minutes when a course is under an hour", () => {
    render(card(rec({ course: course({ duration_min: 40 }) })));
    expect(screen.getByText("40 min")).toBeInTheDocument();
  });

  it("flags a course that closes more than one gap", () => {
    render(card(rec({ covers_count: 2 })));
    expect(screen.getByText("Covers 2 of your gaps")).toBeInTheDocument();
  });

  it("does not flag a course that closes only one", () => {
    render(card(rec()));
    expect(screen.queryByText(/Covers .* gaps/)).not.toBeInTheDocument();
  });

  it("enrols on request", async () => {
    const onEnrol = vi.fn();
    render(card(rec(), false, onEnrol));
    await userEvent.click(screen.getByRole("button", { name: "Enrol" }));
    expect(onEnrol).toHaveBeenCalledWith("do_1");
  });

  it("cannot be enrolled in twice", () => {
    render(card(rec(), true));
    expect(screen.getByRole("button", { name: /Enrolled/ })).toBeDisabled();
  });

  it("asks for a place on a classroom programme rather than enrolling", () => {
    render(card(rec({ course: course({ source: "nssta", provider: "NSSTA" }) })));
    expect(screen.getByRole("button", { name: "Request a place" })).toBeInTheDocument();
    expect(screen.getByText("Classroom programme")).toBeInTheDocument();
  });

  it("links out to iGOT only when there is a page to link to", () => {
    const { unmount } = render(card(rec()));
    expect(screen.queryByText("On iGOT")).not.toBeInTheDocument();
    unmount();

    render(card(rec({ course: course({ url: "https://igot.example/x" }) })));
    expect(screen.getByText("On iGOT").closest("a")).toHaveAttribute(
      "href",
      "https://igot.example/x",
    );
  });
});

describe("RecommendationCard, once enrolled", () => {
  const enrolment = (over: Partial<import("../api").Enrolment> = {}) => ({
    course_identifier: "do_1",
    course_name: "Foundations of Survey Design",
    status: "in_progress",
    progress_pct: 40,
    ...over,
  });

  it("says why the course is recommended, and how demanding it is", () => {
    render(card(rec()));
    expect(screen.getByText(/Recommended because:/)).toBeInTheDocument();
    expect(screen.getByText(/Closes your Survey Design gap/)).toBeInTheDocument();
    expect(screen.getByText("Intermediate")).toBeInTheDocument();
  });

  it("resumes a course already begun, with its progress", async () => {
    const onContinue = vi.fn();
    render(
      <RecommendationCard
        rec={rec()}
        enrolled
        enrolment={enrolment()}
        competencyName={lookup}
        onEnrol={() => {}}
        onContinue={onContinue}
      />,
    );
    expect(screen.getByText("40%")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /Continue/ }));
    expect(onContinue).toHaveBeenCalledWith("do_1");
  });

  it("offers to start an enrolled course not yet begun, and to review a finished one", () => {
    const { unmount } = render(
      <RecommendationCard
        rec={rec()}
        enrolled
        enrolment={enrolment({ status: "not_started", progress_pct: 0 })}
        competencyName={lookup}
        onEnrol={() => {}}
        onContinue={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /Start/ })).toBeInTheDocument();
    unmount();

    render(
      <RecommendationCard
        rec={rec()}
        enrolled
        enrolment={enrolment({ status: "completed", progress_pct: 100 })}
        competencyName={lookup}
        onEnrol={() => {}}
        onContinue={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /Review/ })).toBeInTheDocument();
  });

  it("offers nothing to resume on a lapsed enrolment", () => {
    render(
      <RecommendationCard
        rec={rec()}
        enrolled
        enrolment={enrolment({ status: "expired" })}
        competencyName={lookup}
        onEnrol={() => {}}
        onContinue={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /Enrolled/ })).toBeDisabled();
  });

  it("never offers to play a classroom programme", () => {
    render(
      <RecommendationCard
        rec={rec({ course: course({ source: "nssta", provider: "NSSTA" }) })}
        enrolled
        enrolment={enrolment()}
        competencyName={lookup}
        onEnrol={() => {}}
        onContinue={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /Place requested/ })).toBeDisabled();
  });
});

describe("difficultyLabel", () => {
  it("reads the level a course builds towards", () => {
    expect(difficultyLabel(0)).toBeNull();
    expect(difficultyLabel(2)).toBe("Foundation");
    expect(difficultyLabel(3)).toBe("Intermediate");
    expect(difficultyLabel(4)).toBe("Advanced");
  });
});

describe("CourseCover", () => {
  it("is drawn rather than fetched, since iGOT publishes no artwork", () => {
    const { container } = render(<CourseCover seed="C01" />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(container.querySelector("img")).toBeNull();
  });

  it("gives the same course the same cover every time", () => {
    const a = render(<CourseCover seed="C03" />).container.innerHTML;
    const b = render(<CourseCover seed="C03" />).container.innerHTML;
    expect(a).toBe(b);
  });

  it("draws every cover from the palette, never an arbitrary colour", () => {
    // Six fields, so two competencies can share one; what matters is that a
    // cover is always one of them and never something off-brand.
    const allowed = new Set([
      "#1e3a63", "#1f4d5c", "#3a3566", "#5c3a2b", "#1f4a3a", "#4a3350",
    ]);
    for (const seed of ["C01", "C03", "C10", "C15", "C19", "C24", "do_113829"]) {
      const stop = render(<CourseCover seed={seed} />)
        .container.querySelector("stop")
        ?.getAttribute("stop-color");
      expect(allowed.has(stop ?? ""), `${seed} used ${stop}`).toBe(true);
    }
  });

  it("uses more than one field across a realistic set of competencies", () => {
    const seen = new Set(
      ["C01", "C03", "C10", "C15", "C19", "C24"].map(
        (seed) =>
          render(<CourseCover seed={seed} />)
            .container.querySelector("stop")
            ?.getAttribute("stop-color") ?? "",
      ),
    );
    expect(seen.size).toBeGreaterThan(1);
  });

  it("carries its label", () => {
    render(<CourseCover seed="C01" label="C01" />);
    expect(screen.getByText("C01")).toBeInTheDocument();
  });
});
