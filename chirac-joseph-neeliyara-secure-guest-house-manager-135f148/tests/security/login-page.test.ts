// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { routerMock } = vi.hoisted(() => ({
  routerMock: { replace: vi.fn(), refresh: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
  usePathname: () => "/app",
}));
vi.mock("@/hooks/use-session", () => ({
  useRequireAuth: () => ({
    user: {
      id: "manager-id",
      email: "manager@example.com",
      name: "Test Manager",
      role: "MANAGER",
      canViewFinancials: false,
    },
  }),
}));
vi.mock("@/lib/api-client", () => ({
  api: vi.fn(),
  clearCsrfCache: vi.fn(),
  ensureCsrf: vi.fn(),
  fetchMe: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), message: vi.fn(), success: vi.fn() } }));

import LoginPage from "@/app/login/page";
import AppLayout from "@/app/app/layout";

describe("login page", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it("starts with an empty email and has no development credential messaging", async () => {
    await act(async () => root.render(createElement(LoginPage)));

    expect(container.querySelector<HTMLInputElement>("#email")?.value).toBe("");
    expect(container.textContent).toContain("SUMMER HOUSE");
    expect(container.textContent).toContain("MANAGEMENT");
    expect(container.textContent).toContain("Comfortable Stays. Happier Guests.");
    expect(container.textContent).not.toMatch(/demo|default password|development credential/i);
  });

  it("provides an accessible password visibility toggle", async () => {
    await act(async () => root.render(createElement(LoginPage)));

    const password = container.querySelector<HTMLInputElement>("#password");
    const showButton = container.querySelector<HTMLButtonElement>('button[aria-label="Show password"]');
    expect(password?.type).toBe("password");
    expect(showButton).toBeTruthy();

    await act(async () => showButton?.click());

    expect(container.querySelector<HTMLInputElement>("#password")?.type).toBe("text");
    expect(container.querySelector('button[aria-label="Hide password"]')).toBeTruthy();
  });

  it("uses Summer House branding in the authenticated navigation", async () => {
    await act(async () => root.render(createElement(AppLayout, null, createElement("div", null, "Workspace"))));

    expect(container.textContent).toContain("SUMMER HOUSE");
    expect(container.querySelector('[aria-label="Summer House"]')).toBeTruthy();
    expect(container.textContent).not.toContain("GHMS");
    expect(container.textContent).toContain("Bookings");
  });
});