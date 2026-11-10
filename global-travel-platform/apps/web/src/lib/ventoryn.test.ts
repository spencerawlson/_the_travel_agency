import { describe, expect, it } from "vitest";
import { buildCsp } from "./csp";
import { getVentorynSiteId, VENTORYN_ORIGIN } from "./ventoryn";

describe("getVentorynSiteId", () => {
  it("defaults to Farelune's site id", () => {
    expect(getVentorynSiteId({})).toBe("4883942067d372e8b00a2709");
  });
  it("can be overridden or turned off", () => {
    expect(getVentorynSiteId({ VENTORYN_SITE_ID: "aaaaaaaaaaaaaaaaaaaaaaaa" })).toBe("aaaaaaaaaaaaaaaaaaaaaaaa");
    expect(getVentorynSiteId({ VENTORYN_SITE_ID: "off" })).toBeNull();
    expect(getVentorynSiteId({ VENTORYN_SITE_ID: "not-an-id" })).toBeNull();
  });
});

describe("buildCsp with Ventoryn", () => {
  const directive = (csp: string, name: string) =>
    csp.split("; ").find((d) => d.startsWith(name)) ?? "";
  it("allows the script and its beacon only when on", () => {
    const on = buildCsp({ dev: false, ventoryn: true, nonce: "n" });
    expect(directive(on, "script-src")).toContain(VENTORYN_ORIGIN);
    expect(directive(on, "connect-src")).toContain(VENTORYN_ORIGIN);
    const off = buildCsp({ dev: false });
    expect(off).not.toContain(VENTORYN_ORIGIN);
  });
});
