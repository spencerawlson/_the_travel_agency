import type { Airport } from "@gtp/shared-types";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { defaultForm, todayIso } from "@/lib/search";
import { renderWithIntl } from "@/test/utils";
import { SearchForm } from "./SearchForm";

const push = vi.fn();
vi.mock("@/i18n/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

const AIRPORTS: Airport[] = [
  {
    iata: "YUL",
    name: "Montreal / Pierre Elliott Trudeau International Airport",
    city: "Montréal",
    country_code: "CA",
    country_name: "Canada",
    timezone: "America/Toronto",
  },
  {
    iata: "CDG",
    name: "Charles de Gaulle International Airport",
    city: "Paris",
    country_code: "FR",
    country_name: "France",
    timezone: "Europe/Paris",
  },
];

const fetchAirports = vi.fn(async (q: string) =>
  AIRPORTS.filter((a) => `${a.city} ${a.iata}`.toLowerCase().includes(q.toLowerCase())),
);

async function chooseAirport(
  user: ReturnType<typeof userEvent.setup>,
  label: RegExp,
  query: string,
  option: RegExp,
) {
  await user.type(screen.getByRole("combobox", { name: label }), query);
  await user.click(await screen.findByRole("option", { name: option }));
}

describe("SearchForm", () => {
  beforeEach(() => {
    push.mockReset();
    fetchAirports.mockClear();
  });

  it("shows validation errors and does not submit when empty", async () => {
    const user = userEvent.setup();
    const onSubmitValid = vi.fn();
    renderWithIntl(<SearchForm onSubmitValid={onSubmitValid} fetchAirports={fetchAirports} />);
    await user.click(screen.getByRole("button", { name: "Search flights" }));
    expect(screen.getByText("Choose a departure airport from the list.")).toBeInTheDocument();
    expect(screen.getByText("Choose a destination airport from the list.")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "From" })).toHaveAttribute("aria-invalid", "true");
    expect(onSubmitValid).not.toHaveBeenCalled();
  });

  it("uses autocomplete and submits a valid search", async () => {
    const user = userEvent.setup();
    const onSubmitValid = vi.fn();
    renderWithIntl(<SearchForm onSubmitValid={onSubmitValid} fetchAirports={fetchAirports} />);
    await chooseAirport(user, /from/i, "montr", /Montréal/);
    await chooseAirport(user, /^to$/i, "paris", /Paris/);
    expect(screen.getByRole("combobox", { name: "From" })).toHaveValue("Montréal (YUL)");
    await user.click(screen.getByRole("button", { name: "Search flights" }));
    expect(onSubmitValid).toHaveBeenCalledTimes(1);
    expect(onSubmitValid.mock.calls[0]![0]).toMatchObject({
      origin: { iata: "YUL" },
      destination: { iata: "CDG" },
      tripType: "round_trip",
    });
  });

  it("navigates to the results page with query params by default", async () => {
    const user = userEvent.setup();
    const initial = {
      ...defaultForm(),
      origin: { iata: "YUL", label: "Montréal (YUL)" },
      destination: { iata: "CDG", label: "Paris (CDG)" },
    };
    renderWithIntl(<SearchForm initial={initial} fetchAirports={fetchAirports} />);
    await user.click(screen.getByRole("button", { name: "Search flights" }));
    expect(push).toHaveBeenCalledWith({
      pathname: "/flights",
      query: expect.objectContaining({ from: "YUL", to: "CDG", trip: "round_trip" }),
    });
  });

  it("rejects the same origin and destination", async () => {
    const user = userEvent.setup();
    const same = { iata: "YUL", label: "Montréal (YUL)" };
    renderWithIntl(
      <SearchForm
        initial={{ ...defaultForm(), origin: same, destination: same }}
        onSubmitValid={vi.fn()}
        fetchAirports={fetchAirports}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Search flights" }));
    expect(screen.getByText("Origin and destination must be different.")).toBeInTheDocument();
  });

  it("validates past departure dates and return-before-departure", async () => {
    const user = userEvent.setup();
    const onSubmitValid = vi.fn();
    const base = {
      ...defaultForm(),
      origin: { iata: "YUL", label: "YUL" },
      destination: { iata: "CDG", label: "CDG" },
    };
    renderWithIntl(
      <SearchForm
        initial={{ ...base, departDate: "2000-01-01", returnDate: "1999-12-31" }}
        onSubmitValid={onSubmitValid}
        fetchAirports={fetchAirports}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Search flights" }));
    expect(screen.getByText("Departure date cannot be in the past.")).toBeInTheDocument();
    expect(onSubmitValid).not.toHaveBeenCalled();
  });

  it("hides the return requirement for one-way trips", async () => {
    const user = userEvent.setup();
    const onSubmitValid = vi.fn();
    const base = {
      ...defaultForm(),
      origin: { iata: "YUL", label: "YUL" },
      destination: { iata: "CDG", label: "CDG" },
      returnDate: "",
    };
    renderWithIntl(
      <SearchForm initial={base} onSubmitValid={onSubmitValid} fetchAirports={fetchAirports} />,
    );
    await user.click(screen.getByRole("radio", { name: "One way" }));
    expect(screen.getByLabelText("Return")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Search flights" }));
    expect(onSubmitValid).toHaveBeenCalledTimes(1);
  });

  it("enforces infant/adult rule through the passenger picker", async () => {
    const user = userEvent.setup();
    const onSubmitValid = vi.fn();
    const base = {
      ...defaultForm(todayIso()),
      origin: { iata: "YUL", label: "YUL" },
      destination: { iata: "CDG", label: "CDG" },
    };
    renderWithIntl(
      <SearchForm initial={base} onSubmitValid={onSubmitValid} fetchAirports={fetchAirports} />,
    );
    await user.click(screen.getByText("1 passenger"));
    await user.click(screen.getByRole("button", { name: "Increase Infants" }));
    await user.click(screen.getByRole("button", { name: "Increase Infants" }));
    await user.click(screen.getByRole("button", { name: "Search flights" }));
    expect(screen.getByText("Each infant needs an accompanying adult.")).toBeInTheDocument();
    expect(onSubmitValid).not.toHaveBeenCalled();
  });

  it("renders in French", async () => {
    renderWithIntl(<SearchForm fetchAirports={fetchAirports} />, "fr");
    expect(screen.getByRole("button", { name: "Rechercher des vols" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Aller-retour" })).toBeChecked();
  });

  it("supports keyboard selection in the combobox", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SearchForm onSubmitValid={vi.fn()} fetchAirports={fetchAirports} />);
    const input = screen.getByRole("combobox", { name: "From" });
    await user.type(input, "par");
    await screen.findByRole("option", { name: /Paris/ });
    await user.keyboard("{Enter}");
    await waitFor(() => expect(input).toHaveValue("Paris (CDG)"));
    expect(input).toHaveAttribute("aria-expanded", "false");
  });
});
