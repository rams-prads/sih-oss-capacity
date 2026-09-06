import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The door.
 *
 * These are the guards, not the pages behind them: every page is stubbed so a
 * failure here can only mean the routing let someone through, or turned
 * someone away, who should not have been. That matters most for the admin
 * side, which aggregates the whole cadre's record - an officer session must
 * never reach it, and it must not be reachable simply by typing the URL.
 */

vi.mock("./pages/Learner", () => ({ default: () => <div>LEARNER PAGE</div> }));
vi.mock("./pages/MyLearning", () => ({ default: () => <div>MY LEARNING PAGE</div> }));
vi.mock("./pages/Upload", () => ({ default: () => <div>UPLOAD PAGE</div> }));
vi.mock("./pages/CompetencyAssessment", () => ({ default: () => <div>ASSESS PAGE</div> }));
vi.mock("./pages/Profile", () => ({ default: () => <div>PROFILE PAGE</div> }));
vi.mock("./pages/Join", () => ({ default: () => <div>JOIN PAGE</div> }));
vi.mock("./pages/Admin", () => ({ default: () => <div>ADMIN PAGE</div> }));

const anita = {
  id: "u-jso-anita",
  name: "Anita Deshmukh",
  email: "anita@mospi.gov.in",
  role_id: "JSO",
  role_name: "Junior Statistical Officer",
  department: "MoSPI",
  is_admin: false,
};
const meera = { ...anita, id: "u-admin-meera", name: "Meera Nair", is_admin: true };

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    getUsers: vi.fn(async () => [anita, meera]),
    getMe: vi.fn(async () => meera),
  };
});

import App from "./App";
import { setActiveUser, setToken } from "./api";

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  );
}

describe("routing and session guards", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    setActiveUser(null);
    setToken(null);
  });

  it("sends a visitor with no session to the login page", async () => {
    renderAt("/learner");
    expect(await screen.findByText("Competency Platform")).toBeInTheDocument();
    expect(screen.queryByText("LEARNER PAGE")).not.toBeInTheDocument();
  });

  it("does not let an officer session open the admin area", async () => {
    setActiveUser("u-jso-anita");
    renderAt("/admin");
    // Turned back to their own dashboard rather than to the door: they are
    // already signed in, just not as somebody who may read the whole cadre.
    // What matters is that the admin page never renders for them.
    expect(await screen.findByText("LEARNER PAGE")).toBeInTheDocument();
    expect(screen.queryByText("ADMIN PAGE")).not.toBeInTheDocument();
  });

  it("does not let the admin area be reached by typing the URL", async () => {
    renderAt("/admin");
    expect(await screen.findByText("Competency Platform")).toBeInTheDocument();
    expect(screen.queryByText("ADMIN PAGE")).not.toBeInTheDocument();
  });

  it("opens the officer area for a restored officer session", async () => {
    setActiveUser("u-jso-anita");
    renderAt("/learner");
    expect(await screen.findByText("LEARNER PAGE")).toBeInTheDocument();
  });

  it("keeps the admin rail out of the officer's navigation", async () => {
    setActiveUser("u-jso-anita");
    renderAt("/learner");
    await screen.findByText("LEARNER PAGE");
    expect(screen.getByLabelText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByLabelText("Capacity")).not.toBeInTheDocument();
  });

  it("restores an admin session from a stored token", async () => {
    setToken("tok123");
    renderAt("/admin");
    expect(await screen.findByText("ADMIN PAGE")).toBeInTheDocument();
  });

  it("keeps the officer rail out of the administrator's navigation", async () => {
    setToken("tok123");
    renderAt("/admin");
    await screen.findByText("ADMIN PAGE");
    expect(screen.getByLabelText("Capacity")).toBeInTheDocument();
    expect(screen.queryByLabelText("Dashboard")).not.toBeInTheDocument();
  });

  it("signs an officer in by picking a profile, with no password", async () => {
    renderAt("/login");
    await userEvent.click(await screen.findByText("Anita Deshmukh"));
    expect(await screen.findByText("LEARNER PAGE")).toBeInTheDocument();
  });

  it("lets registration be reached without a session", async () => {
    renderAt("/join");
    expect(await screen.findByText("JOIN PAGE")).toBeInTheDocument();
    expect(screen.getByText("Back to sign in")).toBeInTheDocument();
  });

  it("keeps registration out of a signed-in officer's navigation", async () => {
    setActiveUser("u-jso-anita");
    renderAt("/learner");
    await screen.findByText("LEARNER PAGE");
    expect(screen.queryByLabelText("Join")).not.toBeInTheDocument();
  });

  it("shows registration without the officer chrome, even when signed in", async () => {
    setActiveUser("u-jso-anita");
    renderAt("/join");
    expect(await screen.findByText("JOIN PAGE")).toBeInTheDocument();
    // No rail: a list of links to your own record means nothing on the page
    // where somebody is creating a record in the first place.
    expect(screen.queryByLabelText("Dashboard")).not.toBeInTheDocument();
    expect(screen.getByText("Back to sign in")).toBeInTheDocument();
  });

  it("signs the officer out back to the door", async () => {
    setActiveUser("u-jso-anita");
    renderAt("/learner");
    await screen.findByText("LEARNER PAGE");

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(screen.queryByText("LEARNER PAGE")).not.toBeInTheDocument());
    expect(localStorage.getItem("oss.officer")).toBeNull();
  });
});
