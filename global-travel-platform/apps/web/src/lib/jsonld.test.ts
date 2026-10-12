import { describe, expect, it } from "vitest";
import { safeJsonLd } from "./jsonld";

describe("safeJsonLd", () => {
  it("cannot close the surrounding script tag and still parses back", () => {
    const name = "</script><img src=x onerror=alert(1)>";
    const out = safeJsonLd({ name });
    expect(out).not.toContain("<");
    expect(JSON.parse(out).name).toBe(name);
  });
});
