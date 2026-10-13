import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/utils";
import { LiveSearchCard } from "./LiveSearchCard";

const link = {
  id: "live0123456789abcdef",
  provider_code: "travelpayouts",
  provider_name: "Aviasales (via Travelpayouts)",
  bookable: true,
};

describe("LiveSearchCard", () => {
  it("names the partner without the network suffix and opens it", async () => {
    const onSelect = vi.fn();
    renderWithIntl(<LiveSearchCard link={link} empty busy={false} onSelect={onSelect} />);
    expect(screen.getByText(/No saved fares for these dates/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /See live prices on Aviasales/ }));
    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Travelpayouts/)).not.toBeInTheDocument();
  });

  it("is disabled until partner referrals are live", () => {
    renderWithIntl(
      <LiveSearchCard
        link={{ ...link, bookable: false }}
        empty={false}
        busy={false}
        onSelect={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /coming soon/i })).toBeDisabled();
  });
});
