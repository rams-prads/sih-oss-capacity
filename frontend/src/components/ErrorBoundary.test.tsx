import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ErrorBoundary } from "./ErrorBoundary";

function Explodes(): JSX.Element {
  throw new Error("field the API did not send");
}

describe("ErrorBoundary", () => {
  beforeEach(() => {
    // React logs the caught error; the test output should stay readable.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows a message instead of a blank page", () => {
    render(
      <ErrorBoundary label="The tutor">
        <Explodes />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/The tutor could not be displayed/)).toBeInTheDocument();
  });

  it("says the rest of the page still works", () => {
    render(
      <ErrorBoundary>
        <Explodes />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/rest of the page still works/)).toBeInTheDocument();
  });

  it("points at the likely cause, a version mismatch", () => {
    render(
      <ErrorBoundary>
        <Explodes />
      </ErrorBoundary>,
    );
    expect(screen.getByText(/different versions/)).toBeInTheDocument();
  });

  it("leaves healthy children alone", () => {
    render(
      <ErrorBoundary>
        <p>working fine</p>
      </ErrorBoundary>,
    );
    expect(screen.getByText("working fine")).toBeInTheDocument();
  });

  it("can be retried once the cause is fixed", async () => {
    let broken = true;
    function Sometimes() {
      if (broken) throw new Error("still broken");
      return <p>recovered</p>;
    }
    render(
      <ErrorBoundary>
        <Sometimes />
      </ErrorBoundary>,
    );
    broken = false;
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(screen.getByText("recovered")).toBeInTheDocument();
  });
});
