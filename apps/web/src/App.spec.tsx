import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.tsx";

const fetchMock = vi.fn<typeof fetch>();

function respond(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function renderApp() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <App />
    </QueryClientProvider>,
  );
}

describe("App", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
    window.history.replaceState(null, "", "/");
  });

  it("shows the product name as the main heading", () => {
    fetchMock.mockResolvedValue(respond(401));
    renderApp();
    expect(
      screen.getByRole("heading", { level: 1, name: "BarBro" }),
    ).toBeDefined();
  });

  it("offers Google sign-in when signed out", async () => {
    fetchMock.mockResolvedValue(respond(401));
    renderApp();

    const link = await screen.findByRole("link", {
      name: "Sign in with Google",
    });
    expect(link.getAttribute("href")).toBe("/api/auth/google/start");
  });

  it("shows the email when signed in", async () => {
    fetchMock.mockResolvedValue(respond(200, { email: "a@b.c" }));
    renderApp();

    expect(await screen.findByText("Signed in as a@b.c")).toBeDefined();
  });

  it("signs out with the CSRF header and returns to the sign-in link", async () => {
    fetchMock
      .mockResolvedValueOnce(respond(200, { email: "a@b.c" }))
      .mockResolvedValueOnce(respond(204));
    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect(
      await screen.findByRole("link", { name: "Sign in with Google" }),
    ).toBeDefined();
    expect(fetchMock).toHaveBeenLastCalledWith("/api/auth/logout", {
      method: "POST",
      headers: { "X-Requested-With": "fetch" },
    });
  });

  it("tells the user when sign-out fails", async () => {
    fetchMock
      .mockResolvedValueOnce(respond(200, { email: "a@b.c" }))
      .mockResolvedValueOnce(respond(500));
    renderApp();

    fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Sign-out failed. Please try again.",
    );
    expect(screen.getByText("Signed in as a@b.c")).toBeDefined();
  });

  it("tells the user when the account cannot be loaded", async () => {
    fetchMock.mockResolvedValue(respond(500));
    renderApp();

    expect((await screen.findByRole("alert")).textContent).toBe(
      "Could not load your account.",
    );
  });

  it("tells the user when sign-in failed", async () => {
    window.history.replaceState(null, "", "/?signin=failed");
    fetchMock.mockResolvedValue(respond(401));
    renderApp();

    expect(screen.getByRole("alert").textContent).toBe(
      "Sign-in failed. Please try again.",
    );
    expect(
      await screen.findByRole("link", { name: "Sign in with Google" }),
    ).toBeDefined();
  });
});
