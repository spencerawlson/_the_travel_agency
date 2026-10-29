import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/utils";
import { AppTabBar } from "./AppTabBar";

let pathname = "/";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    children,
    href,
    ...props
  }: {
    children: React.ReactNode;
    href: string;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => pathname,
}));

describe("AppTabBar", () => {
  it("shows the five reference tabs and marks the current one", () => {
    pathname = "/";
    renderWithIntl(<AppTabBar />);
    for (const label of ["Home", "Flights", "Explore", "Saved", "Profile"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("Home").closest("a")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Flights").closest("a")).not.toHaveAttribute("aria-current");
  });

  it("marks Saved active on a saved-trips page", () => {
    pathname = "/saved-trips";
    renderWithIntl(<AppTabBar />);
    expect(screen.getByText("Saved").closest("a")).toHaveAttribute("aria-current", "page");
  });

  it("renders the same five tabs in French", () => {
    pathname = "/destinations";
    renderWithIntl(<AppTabBar />, "fr");
    expect(screen.getByText("Explorer").closest("a")).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Enregistrés")).toBeInTheDocument();
    expect(screen.getByText("Profil")).toBeInTheDocument();
  });
});
