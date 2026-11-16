import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/utils";
import { HeroBackdrop } from "./HeroBackdrop";

// next-intl's navigation pulls in next/navigation, which has no module in the
// vitest/jsdom environment — same mock as the other component tests.
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
}));

const SLIDES = [
  {
    slug: "paris",
    name: "Paris",
    src: "/photos/paris-1600.webp",
    srcSmall: "/photos/paris-800.webp",
    alt: "The Eiffel Tower framed by spring blossoms in Paris",
    focus: "50% 40%",
    credit: "© Jorge Royan",
  },
  {
    slug: "london",
    name: "London",
    src: "/photos/london-1600.webp",
    srcSmall: "/photos/london-800.webp",
    alt: "Tower Bridge over the River Thames under a blue sky",
    focus: "50% 55%",
    credit: "© The Cosmonaut",
  },
];

describe("HeroBackdrop", () => {
  // jsdom has no matchMedia; the backdrop reads prefers-reduced-motion.
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });
  });

  it("gives every mounted hero image its real alt text", () => {
    renderWithIntl(<HeroBackdrop slides={SLIDES} />);
    const imgs = screen.getAllByRole("img");
    expect(imgs.length).toBeGreaterThan(0);
    for (const img of imgs) {
      expect(img.getAttribute("alt")).toBeTruthy();
    }
    expect(
      screen.getByAltText("The Eiffel Tower framed by spring blossoms in Paris"),
    ).toBeInTheDocument();
    expect(
      screen.getByAltText("Tower Bridge over the River Thames under a blue sky"),
    ).toBeInTheDocument();
  });
});
