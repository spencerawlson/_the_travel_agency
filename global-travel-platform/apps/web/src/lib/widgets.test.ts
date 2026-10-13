import { describe, expect, it } from "vitest";
import { buildCsp } from "./csp";
import { airhelpWidgetUrl, getWidgetIds, kiwiWidgetUrl, klookWidgetUrl } from "./widgets";

const ids = { trs: "584743", marker: "789134" };

describe("partner widgets", () => {
  it("are off unless both project id and partner marker are valid", () => {
    expect(getWidgetIds({})).toBeNull();
    expect(getWidgetIds({ TRAVELPAYOUTS_SCRIPT_ID: "584743" })).toBeNull();
    expect(
      getWidgetIds({ TRAVELPAYOUTS_SCRIPT_ID: "584743", TRAVELPAYOUTS_MARKER: "x" }),
    ).toBeNull();
    expect(
      getWidgetIds({ TRAVELPAYOUTS_SCRIPT_ID: "584743", TRAVELPAYOUTS_MARKER: " 789134 " }),
    ).toEqual(ids);
  });

  it("builds the Klook loader with the partner marker", () => {
    const u = new URL(klookWidgetUrl(ids, "fr"));
    expect(u.host).toBe("tpemd.com");
    expect(u.searchParams.get("shmarker")).toBe("789134");
    expect(u.searchParams.get("trs")).toBe("584743");
    expect(u.searchParams.get("promo_id")).toBe("4497");
    expect(u.searchParams.get("locale")).toBe("fr");
  });

  it("builds the AirHelp loader in the visitor's language", () => {
    const u = new URL(airhelpWidgetUrl(ids, "fr"));
    expect(u.searchParams.get("shmarker")).toBe("789134");
    expect(u.searchParams.get("promo_id")).toBe("8679");
    expect(u.searchParams.get("lang")).toBe("fr");
    expect(new URL(airhelpWidgetUrl(ids, "de")).searchParams.get("lang")).toBe("en");
  });

  it("pre-fills Kiwi.com with the search and rejects bad input", () => {
    const search = {
      origin: "YUL",
      destination: "STI",
      departDate: "2026-11-11",
      returnDate: "2026-11-18",
      currency: "CAD",
    };
    const u = new URL(kiwiWidgetUrl(ids, "en", search)!);
    expect(u.searchParams.get("from_name")).toBe("YUL");
    expect(u.searchParams.get("to_name")).toBe("STI");
    expect(u.searchParams.get("departure")).toBe("2026-11-11");
    expect(u.searchParams.get("return")).toBe("2026-11-18");
    expect(u.searchParams.get("currency")).toBe("cad");
    expect(
      new URL(kiwiWidgetUrl(ids, "en", { ...search, returnDate: null })!).searchParams.has(
        "return",
      ),
    ).toBe(false);
    expect(kiwiWidgetUrl(ids, "en", { ...search, origin: "yul&x=1" })).toBeNull();
    expect(kiwiWidgetUrl(ids, "en", { ...search, departDate: "soon" })).toBeNull();
  });

  it("opens the CSP to widget hosts only when enabled", () => {
    expect(buildCsp({ dev: false })).not.toContain("frame-src");
    const csp = buildCsp({ dev: false, widgets: true });
    const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(name)) ?? "";
    expect(directive("script-src")).toContain("https://tpemd.com");
    expect(directive("frame-src")).toBe(
      "frame-src https://widgets.kiwi.com https://affiliate.klook.com https://static.airhelp.com",
    );
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'");
  });
});
