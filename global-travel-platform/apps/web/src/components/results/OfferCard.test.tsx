import type { FlightOffer } from "@gtp/shared-types";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithIntl } from "@/test/utils";
import { OfferCard } from "./OfferCard";

const slice = {
  segments: [
    {
      carrier_code: "TS",
      carrier_name: "Air Transat",
      flight_number: "TS110",
      origin: "YUL",
      destination: "CDG",
      depart_at: "2030-05-01T18:30:00-04:00",
      arrive_at: "2030-05-02T07:30:00+02:00",
      duration_minutes: 420,
    },
  ],
  duration_minutes: 420,
  stops: 0,
};

function offer(overrides: Partial<FlightOffer> = {}): FlightOffer {
  return {
    id: "abc123",
    provider_code: "travelpayouts",
    provider_name: "Aviasales (via Travelpayouts)",
    is_demo: false,
    price: { amount: "812", currency: "CAD" },
    cabin: "economy",
    outbound: slice,
    inbound: null,
    seller_name: "Aviasales",
    seller_type: "agency",
    expires_at: "2030-04-01T00:00:00Z",
    notes: ["cached_fare", "seller_on_partner"],
    price_basis: "per_adult",
    bookable: false,
    ...overrides,
  };
}

describe("OfferCard", () => {
  it("labels cached real fares honestly and blocks booking until live", () => {
    const onSelect = vi.fn();
    renderWithIntl(<OfferCard offer={offer()} onSelect={onSelect} busy={false} />);
    expect(screen.getByText("from")).toBeInTheDocument();
    expect(screen.getByText("per adult, economy")).toBeInTheDocument();
    expect(screen.getByText("Compare sellers on Aviasales")).toBeInTheDocument();
  });

  it("names the selling agency when known", () => {
    renderWithIntl(
      <OfferCard offer={offer({ seller_name: "Farera" })} onSelect={vi.fn()} busy={false} />,
    );
    expect(screen.getByText("Fare from Farera · compare sellers on Aviasales")).toBeInTheDocument();
    expect(screen.getByText(/Found by travellers recently/)).toBeInTheDocument();
    expect(screen.queryByText("Demo data")).not.toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "Partner booking coming soon" });
    expect(btn).toBeDisabled();
    expect(screen.getByText("Air Transat")).toBeInTheDocument();
    expect(screen.getByText(/May 1/)).toBeInTheDocument(); // travel date shown
  });

  it("flags nearby dates and cabin pricing", () => {
    renderWithIntl(
      <OfferCard
        offer={offer({ notes: ["cached_fare", "different_dates", "economy_only"] })}
        onSelect={vi.fn()}
        busy={false}
      />,
    );
    expect(screen.getByText(/dates differ from your search/)).toBeInTheDocument();
    expect(screen.getByText(/your cabin is priced on the partner site/)).toBeInTheDocument();
  });

  it("keeps the demo behaviour for demo offers", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderWithIntl(
      <OfferCard
        offer={offer({
          is_demo: true,
          provider_code: "mock",
          price_basis: "total",
          bookable: true,
          notes: ["demo_fare"],
          seller_name: "Demo Aurora Air (demo)",
        })}
        onSelect={onSelect}
        busy={false}
      />,
    );
    expect(screen.getByText("Total for all passengers")).toBeInTheDocument();
    expect(screen.getByText("Demo data")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "View deal" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("renders in French", () => {
    renderWithIntl(<OfferCard offer={offer()} onSelect={vi.fn()} busy={false} />, "fr");
    expect(screen.getByText("par adulte, classe économique")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Réservation partenaire bientôt offerte" }),
    ).toBeDisabled();
  });
});
