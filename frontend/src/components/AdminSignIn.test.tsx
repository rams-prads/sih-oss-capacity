import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { AdminSignIn } from "./AdminSignIn";

const officer = {
  id: "u-jso-anita",
  name: "Anita",
  email: "",
  role_id: "JSO",
  role_name: "JSO",
  department: "NSO",
  is_admin: false,
};

describe("AdminSignIn", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    delete api.defaults.headers.common["Authorization"];
  });

  it("signs in an administrator and reports it upward", async () => {
    vi.spyOn(api, "post").mockResolvedValue({
      data: { access_token: "tok123", user: { ...officer, is_admin: true } },
    } as never);
    const onSignedIn = vi.fn();

    render(<AdminSignIn onSignedIn={onSignedIn} />);
    await userEvent.type(screen.getByLabelText("Password"), "admin123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(onSignedIn).toHaveBeenCalled());
    expect(api.defaults.headers.common["Authorization"]).toBe("Bearer tok123");
  });

  it("refuses a valid but non-admin account without storing a token", async () => {
    vi.spyOn(api, "post").mockResolvedValue({
      data: { access_token: "tok123", user: officer },
    } as never);
    const onSignedIn = vi.fn();

    render(<AdminSignIn onSignedIn={onSignedIn} />);
    await userEvent.type(screen.getByLabelText("Password"), "officer123");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText(/does not have administrator access/)).toBeInTheDocument();
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(api.defaults.headers.common["Authorization"]).toBeUndefined();
  });

  it("reports a rejected password without leaking whether the id exists", async () => {
    vi.spyOn(api, "post").mockRejectedValue(new Error("401"));

    render(<AdminSignIn onSignedIn={vi.fn()} />);
    await userEvent.type(screen.getByLabelText("Password"), "wrong");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Incorrect officer id or password.")).toBeInTheDocument();
  });

  it("cannot be submitted without a password", () => {
    render(<AdminSignIn onSignedIn={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled();
  });
});
