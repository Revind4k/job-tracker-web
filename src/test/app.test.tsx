import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "../App";
import { makeToken, state } from "./fakeApi";

async function signUp(user = userEvent.setup()) {
  render(<App />);
  await user.click(await screen.findByRole("button", { name: "Create an account" }));
  await user.type(screen.getByLabelText("Email"), "eren@example.com");
  await user.type(screen.getByLabelText("Password"), "correct-horse");
  await user.click(screen.getByRole("button", { name: "Create account" }));
  await screen.findByText("No applications yet.");
  return user;
}

async function add(user: ReturnType<typeof userEvent.setup>, company: string, role = "Software Engineer") {
  await user.click(screen.getByRole("button", { name: "+ Add application" }));
  const dialog = screen.getByRole("dialog");
  await user.type(within(dialog).getByLabelText("Company"), company);
  await user.type(within(dialog).getByLabelText("Role"), role);
  await user.click(within(dialog).getByRole("button", { name: "Save" }));
  await screen.findByRole("cell", { name: company });
}

describe("Job Tracker", () => {
  it("explains a cold start instead of looking broken", async () => {
    state.healthy = false;
    render(<App />);
    expect(await screen.findByText(/Waking up the server/, {}, { timeout: 6000 })).toBeInTheDocument();
    state.healthy = true;
    expect(await screen.findByRole("button", { name: "Try it with sample data" }, { timeout: 8000 })).toBeInTheDocument();
  }, 15_000);

  it("registers, adds, edits, and deletes an application", async () => {
    const user = await signUp();
    await add(user, "Northwind Labs");
    expect(screen.getByText("1")).toBeInTheDocument(); // total
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const role = within(screen.getByRole("dialog")).getByLabelText("Role");
    await user.clear(role);
    await user.type(role, "Backend Engineer");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("cell", { name: "Backend Engineer" })).toBeInTheDocument();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("No applications yet.")).toBeInTheDocument();
  });

  it("validates the form before calling the API", async () => {
    const user = await signUp();
    await user.click(screen.getByRole("button", { name: "+ Add application" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText(/Posting link/), "example.com/job");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getByText("Company is required.")).toBeInTheDocument();
    expect(within(dialog).getByText("Link must start with http:// or https://")).toBeInTheDocument();
    expect(state.apps).toHaveLength(0);
  });

  it("updates status optimistically and rolls back when the server fails", async () => {
    const user = await signUp();
    await add(user, "Cobalt Systems");
    const select = screen.getByLabelText("Status for Cobalt Systems");
    await user.selectOptions(select, "INTERVIEW");
    await waitFor(() => expect(state.apps[0].status).toBe("INTERVIEW"));
    expect(await screen.findByRole("button", { name: "Interview (1)" })).toBeInTheDocument();

    state.failNextPatch = true;
    await user.selectOptions(screen.getByLabelText("Status for Cobalt Systems"), "OFFER");
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't update Cobalt Systems: database unavailable");
    expect(screen.getByLabelText("Status for Cobalt Systems")).toHaveValue("INTERVIEW");
    expect(state.apps[0].status).toBe("INTERVIEW");
  });

  it("filters by status", async () => {
    const user = await signUp();
    await add(user, "Alpha Co");
    await add(user, "Beta Co");
    await user.selectOptions(screen.getByLabelText("Status for Beta Co"), "REJECTED");
    await waitFor(() => expect(screen.getByRole("button", { name: "Rejected (1)" })).toBeInTheDocument());
    await user.click(screen.getByRole("button", { name: "Rejected (1)" }));
    await waitFor(() => expect(screen.queryByRole("cell", { name: "Alpha Co" })).not.toBeInTheDocument());
    expect(screen.getByRole("cell", { name: "Beta Co" })).toBeInTheDocument();
  });

  it("shows a friendly error for a taken email and a wrong password", async () => {
    state.users.set("eren@example.com", { id: 1, password: "correct-horse" });
    const user = userEvent.setup();
    render(<App />);
    await user.type(await screen.findByLabelText("Email"), "eren@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("invalid email or password");
    await user.click(screen.getByRole("button", { name: "Create an account" }));
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("already registered");
  });

  it("creates a demo account with sample data in one click", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(await screen.findByRole("button", { name: "Try it with sample data" }));
    expect(await screen.findByText("Demo account", {}, { timeout: 5000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByRole("row")).toHaveLength(15)); // header + 14
  });

  it("sends an expired session back to login with a notice", async () => {
    sessionStorage.setItem("jt.token", makeToken(1, "eren@example.com", 3600));
    state.users.set("eren@example.com", { id: 1, password: "x" });
    render(<App />);
    await screen.findByText("No applications yet.");
    sessionStorage.setItem("jt.token", makeToken(1, "eren@example.com", -1)); // server now rejects it
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "+ Add application" }));
    const dialog = screen.getByRole("dialog");
    await user.type(within(dialog).getByLabelText("Company"), "X");
    await user.type(within(dialog).getByLabelText("Role"), "Y");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Your session expired. Please log in again.")).toBeInTheDocument();
  });
});

describe("data loading", () => {
  it("never lets a slow, older response overwrite a newer one", async () => {
    const { http, delay } = await import("msw");
    const { server, API } = await import("./fakeApi");
    const user = await signUp();
    await add(user, "Alpha Co");
    await add(user, "Beta Co");
    await user.selectOptions(screen.getByLabelText("Status for Beta Co"), "OFFER");
    await user.click(await screen.findByRole("button", { name: "Applied (1)" }));
    await waitFor(() => expect(screen.queryByRole("cell", { name: "Beta Co" })).not.toBeInTheDocument());
    // From here the unfiltered list answers slowly, filtered lists immediately.
    server.use(http.get(`${API}/applications`, async ({ request }) => {
      if (!new URL(request.url).searchParams.get("status")) await delay(400);
      return undefined; // fall through to the fake API
    }));
    await user.click(screen.getByRole("button", { name: /^All/ }));      // slow request starts
    await user.click(screen.getByRole("button", { name: "Offer (1)" })); // newer, fast request
    await new Promise((r) => setTimeout(r, 600));                        // let the slow one land
    expect(screen.getByRole("cell", { name: "Beta Co" })).toBeInTheDocument();
    expect(screen.queryByRole("cell", { name: "Alpha Co" })).not.toBeInTheDocument();
  });
});
