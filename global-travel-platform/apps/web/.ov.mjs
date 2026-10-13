import { chromium } from "playwright";
const paths = ["/en","/fr","/en/destinations","/en/destinations/cape-town","/en/deals","/en/about","/en/contact","/en/credits","/en/legal/privacy","/en/admin/login",
 "/en/flights?from=YUL&fromLabel=Montr%C3%A9al+%28YUL%29&to=CDG&toLabel=Paris+%28CDG%29&trip=round_trip&depart=2026-11-11&return=2026-11-18&adults=1&cabin=economy&currency=CAD"];
const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
for (const width of [320, 360, 414, 768]) {
  const ctx = await b.newContext({ viewport: { width, height: 800 }, isMobile: width < 700, hasTouch: true });
  await ctx.addCookies([{ name: "fl_consent", value: "partners-0", domain: "localhost", path: "/" }]);
  const p = await ctx.newPage(); const bad = [];
  for (const path of paths) {
    for (let i = 0; i < 30; i++) { try { await p.goto("http://localhost:3999" + path, { waitUntil: "networkidle", timeout: 40000 }); break; } catch { await p.waitForTimeout(1000); } }
    await p.waitForTimeout(path.includes("flights") ? 4000 : 800);
    const sw = await p.evaluate(() => document.documentElement.scrollWidth);
    if (sw > width) bad.push(`${path.slice(0, 30)} scrollWidth=${sw}`);
  }
  console.log(width, bad.length ? bad.join(" | ") : "no horizontal overflow on any page");
  await ctx.close();
}
await b.close();
