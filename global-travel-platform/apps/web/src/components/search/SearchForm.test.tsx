import type { Airport } from "@gtp/shared-types";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultForm, todayIso } from "@/lib/search";
import { formatDate } from "@/lib/format";
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
    expect(screen.getByRole("button", { name: "Return" })).toBeDisabled();
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

  it("pre-fills the origin passed from the server (visitor location)", () => {
    renderWithIntl(
      <SearchForm
        defaultOrigin={{ iata: "YVR", label: "Vancouver (YVR)" }}
        fetchAirports={fetchAirports}
      />,
    );
    expect(screen.getByRole("combobox", { name: "From" })).toHaveValue("Vancouver (YVR)");
    expect(screen.getByRole("combobox", { name: "To" })).toHaveValue("");
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

  /** Day N of next month as an ISO date (always inside one calendar view). */
  function nextMonthDay(day: number): string {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, day))
      .toISOString()
      .slice(0, 10);
  }

  async function openNextMonthCalendar(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: "Departure" }));
    expect(screen.getByRole("group", { name: "Travel dates calendar" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next month" }));
  }

  it("picks departure and return in the same calendar, each on its own card", async () => {
    const user = userEvent.setup();
    const onSubmitValid = vi.fn();
    const base = {
      ...defaultForm(),
      origin: { iata: "YUL", label: "YUL" },
      destination: { iata: "CDG", label: "CDG" },
      departDate: "",
      returnDate: "",
    };
    renderWithIntl(
      <SearchForm initial={base} onSubmitValid={onSubmitValid} fetchAirports={fetchAirports} />,
    );
    await openNextMonthCalendar(user);
    const depart = nextMonthDay(10);
    const ret = nextMonthDay(17);
    await user.click(screen.getByRole("button", { name: formatDate(depart, "en") }));
    await user.click(screen.getByRole("button", { name: formatDate(ret, "en") }));
    expect(screen.queryByRole("group", { name: "Travel dates calendar" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Departure" })).toHaveTextContent(
      formatDate(depart, "en"),
    );
    expect(screen.getByRole("button", { name: "Return" })).toHaveTextContent(
      formatDate(ret, "en"),
    );
    await user.click(screen.getByRole("button", { name: "Search flights" }));
    expect(onSubmitValid).toHaveBeenCalledWith(
      expect.objectContaining({ departDate: depart, returnDate: ret }),
    );
  });

  it("tapping an earlier day restarts the departure instead of setting a return", async () => {
    const user = userEvent.setup();
    const base = {
      ...defaultForm(),
      origin: { iata: "YUL", label: "YUL" },
      destination: { iata: "CDG", label: "CDG" },
      departDate: "",
      returnDate: "",
    };
    renderWithIntl(<SearchForm initial={base} fetchAirports={fetchAirports} />);
    await openNextMonthCalendar(user);
    await user.click(screen.getByRole("button", { name: formatDate(nextMonthDay(17), "en") }));
    await user.click(screen.getByRole("button", { name: formatDate(nextMonthDay(10), "en") }));
    expect(screen.getByRole("button", { name: "Departure" })).toHaveTextContent(
      formatDate(nextMonthDay(10), "en"),
    );
    expect(screen.getByRole("button", { name: "Return" })).toHaveTextContent("Select date");
  });

  it("one-way trips pick only a departure date and close the calendar", async () => {
    const user = userEvent.setup();
    const base = {
      ...defaultForm(),
      origin: { iata: "YUL", label: "YUL" },
      destination: { iata: "CDG", label: "CDG" },
      departDate: "",
      returnDate: "",
    };
    renderWithIntl(<SearchForm initial={base} fetchAirports={fetchAirports} />);
    await user.click(screen.getByRole("radio", { name: "One way" }));
    await openNextMonthCalendar(user);
    const depart = nextMonthDay(10);
    await user.click(screen.getByRole("button", { name: formatDate(depart, "en") }));
    expect(screen.queryByRole("group", { name: "Travel dates calendar" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Departure" })).toHaveTextContent(
      formatDate(depart, "en"),
    );
    expect(screen.getByRole("button", { name: "Return" })).toBeDisabled();
  });
});

describe("SearchForm app card layout", () => {
  const originalUA = window.navigator.userAgent;
  const appInitial = {
    ...defaultForm(),
    origin: { iata: "YUL", label: "Montréal (YUL)" },
    destination: { iata: "CDG", label: "Paris (CDG)" },
  };

  beforeEach(() => {
    Object.defineProperty(window.navigator, "userAgent", {
      value: "Mozilla/5.0 FareluneApp/1.0",
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(window.navigator, "userAgent", {
      value: originalUA,
      configurable: true,
    });
  });

  it("shows airport chips with clear buttons and date trash buttons", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SearchForm initial={appInitial} fetchAirports={fetchAirports} />);
    expect(await screen.findByText("Montréal (YUL)")).toBeInTheDocument();
    expect(screen.getByText("Paris (CDG)")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear origin" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear destination" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear departure date" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Clear return date" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Clear origin" }));
    expect(screen.getByRole("combobox", { name: "From" })).toBeInTheDocument();
  });

  it("trash clears the return date", async () => {
    const user = userEvent.setup();
    renderWithIntl(<SearchForm initial={appInitial} fetchAirports={fetchAirports} />);
    await user.click(await screen.findByRole("button", { name: "Clear return date" }));
    expect(screen.getByRole("button", { name: "Return" })).toHaveTextContent("Select date");
  });

  it("keeps the website layout for non-app browsers", () => {
    Object.defineProperty(window.navigator, "userAgent", {
      value: originalUA,
      configurable: true,
    });
    renderWithIntl(<SearchForm initial={appInitial} fetchAirports={fetchAirports} />);
    expect(screen.queryByRole("button", { name: "Clear origin" })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Round trip" })).toBeInTheDocument();
  });
});
