import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/utils";
import {
  ConsentBanner,
  CONSENT_COOKIE,
  LOADER_ID,
  openConsentSettings,
  readConsent,
} from "./ConsentBanner";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

function clearCookie() {
  document.cookie = `${CONSENT_COOKIE}=; Max-Age=0; Path=/`;
}

function addLoader() {
  const tpl = document.createElement("script");
  tpl.id = LOADER_ID;
  tpl.type = "text/plain";
  tpl.dataset.src = PARTNER_SRC;
  tpl.textContent = "/* dashboard snippet, kept for partner verification */";
  document.head.appendChild(tpl);
}

const PARTNER_SRC = "https://emrldtp.cc/NTg0NzQz.js?t=584743";

/** Partner scripts added by URL (allowed by the nonce + 'strict-dynamic' CSP). */
function executedScripts() {
  const loaded = [...document.head.querySelectorAll("script:not([type])")];
  // No inline partner code is ever injected: it would be blocked by the CSP.
  expect(loaded.every((s) => !s.textContent)).toBe(true);
  return loaded.filter((s) => s.getAttribute("src") === PARTNER_SRC).length;
}

describe("ConsentBanner", () => {
  beforeEach(() => {
    clearCookie();
    addLoader();
  });
  afterEach(() => {
    document.head.innerHTML = "";
    clearCookie();
  });

  it("asks first and runs nothing before consent", () => {
    renderWithIntl(<ConsentBanner />);
    expect(screen.getByRole("dialog", { name: "Your choice of cookies" })).toBeInTheDocument();
    expect(executedScripts()).toBe(0);
  });

  it("offers both choices with equal weight", () => {
    renderWithIntl(<ConsentBanner />);
    const accept = screen.getByRole("button", { name: "Accept partner & Meta cookies" });
    const reject = screen.getByRole("button", { name: "Essential only" });
    expect(accept.className).toBe(reject.className);
  });

  it("app variant: shorter text, same two equal choices, same effect", async () => {
    const user = userEvent.setup();
    renderWithIntl(<ConsentBanner compact />);
    expect(screen.getByText(/Meta \(Facebook\) pixel to measure our ads/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Read our cookie notice" })).toBeInTheDocument();
    const accept = screen.getByRole("button", { name: "Accept all" });
    expect(accept.className).toBe(screen.getByRole("button", { name: "Essential only" }).className);
    await user.click(accept);
    expect(readConsent()).toBe("accepted");
    expect(executedScripts()).toBe(1);
  });

  it("activates the partner script only after Accept, and remembers it", async () => {
    const user = userEvent.setup();
    renderWithIntl(<ConsentBanner />);
    await user.click(screen.getByRole("button", { name: "Accept partner & Meta cookies" }));
    expect(readConsent()).toBe("accepted");
    expect(executedScripts()).toBe(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("never loads the script after Essential only", async () => {
    const user = userEvent.setup();
    renderWithIntl(<ConsentBanner />);
    await user.click(screen.getByRole("button", { name: "Essential only" }));
    expect(readConsent()).toBe("refused");
    expect(executedScripts()).toBe(0);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("auto-loads on later visits when previously accepted, and can be reopened", () => {
    document.cookie = `${CONSENT_COOKIE}=partners-1; Path=/`;
    renderWithIntl(<ConsentBanner />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(executedScripts()).toBe(1);
    act(() => openConsentSettings());
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("renders in French", () => {
    renderWithIntl(<ConsentBanner />, "fr");
    expect(screen.getByRole("button", { name: "Essentiels seulement" })).toBeInTheDocument();
  });
});
