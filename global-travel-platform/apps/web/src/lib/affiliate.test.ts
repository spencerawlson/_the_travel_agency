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
    expect(csp).toContain("style-src 'self' 'unsafe-inline';");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("adds the partner host (and the Drive script extras) only when enabled", () => {
    const csp = buildCsp({ dev: false, partnerHosts: ["emrldtp.cc"] });
    const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(name)) ?? "";
    expect(directive("script-src")).toContain("https://emrldtp.cc");
    expect(directive("img-src")).toContain("https://emrldtp.cc");
    expect(directive("connect-src")).toContain("https://emrldtp.cc");
    expect(directive("connect-src")).toContain("https://www.travelpayouts.com");
    expect(directive("style-src")).toContain("https://emrldtp.cc https://fonts.googleapis.com");
    expect(directive("font-src")).toContain("https://fonts.gstatic.com");
    expect(directive("default-src")).toBe("default-src 'self'");
    expect(directive("frame-ancestors")).toBe("frame-ancestors 'none'");
  });

  it("uses the per-request nonce instead of 'unsafe-inline' for scripts", () => {
    const csp = buildCsp({ dev: false, nonce: "abc123==", partnerHosts: ["emrldtp.cc"] });
    const script = csp.split("; ").find((d) => d.startsWith("script-src")) ?? "";
    expect(script).toContain("'nonce-abc123==' 'strict-dynamic'");
    expect(script).not.toContain("unsafe-inline");
    expect(script).not.toContain("unsafe-eval");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });
});
