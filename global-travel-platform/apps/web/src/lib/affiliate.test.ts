import { describe, expect, it } from "vitest";
import { getAffiliateScript } from "./affiliate";
import { buildCsp } from "./csp";

describe("getAffiliateScript", () => {
  it("is off by default", () => {
    expect(getAffiliateScript({})).toBeNull();
  });

  it("reproduces the Travelpayouts dashboard snippet for an ID", () => {
    const s = getAffiliateScript({ TRAVELPAYOUTS_SCRIPT_ID: "584743" });
    expect(s?.src).toBe("https://emrldtp.cc/NTg0NzQz.js?t=584743");
    expect(s?.code).toContain('script.setAttribute("data-cmp-ab", "2")');
    expect(s?.code).toContain("document.head.appendChild(script)");
  });

  it("accepts a custom host and rejects unsafe values", () => {
    expect(
      getAffiliateScript({
        TRAVELPAYOUTS_SCRIPT_ID: "584743",
        TRAVELPAYOUTS_SCRIPT_HOST: "emrld.ltd",
      })?.host,
    ).toBe("emrld.ltd");
    for (const id of ["abc", "58474'3", "1; alert(1)", ""]) {
      expect(getAffiliateScript({ TRAVELPAYOUTS_SCRIPT_ID: id })).toBeNull();
    }
    for (const host of ["evil.com/'x", "localhost", "a b.com", "https://x.com"]) {
      expect(
        getAffiliateScript({ TRAVELPAYOUTS_SCRIPT_ID: "584743", TRAVELPAYOUTS_SCRIPT_HOST: host }),
      ).toBeNull();
    }
  });
});

describe("buildCsp", () => {
  it("allows only self by default", () => {
    const csp = buildCsp({ dev: false });
    expect(csp).toContain("script-src 'self' 'unsafe-inline';");
    expect(csp).not.toContain("https://");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("adds the partner host to script/img/connect only", () => {
    const csp = buildCsp({ dev: false, partnerHosts: ["emrldtp.cc"] });
    const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(name)) ?? "";
    expect(directive("script-src")).toContain("https://emrldtp.cc");
    expect(directive("img-src")).toContain("https://emrldtp.cc");
    expect(directive("connect-src")).toContain("https://emrldtp.cc");
    expect(directive("default-src")).toBe("default-src 'self'");
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'");
  });
});
