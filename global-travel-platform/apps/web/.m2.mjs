import { chromium } from "playwright";
const out = process.argv[2]; const only = process.argv[3];
const pages = {
  home: "/en", destinations: "/en/destinations", "dest-lisbon": "/en/destinations/lisbon", deals: "/en/deals", about: "/en/about",
  contact: "/en/contact", credits: "/en/credits", privacy: "/en/legal/privacy", "admin-login": "/en/admin/login",
  flights: "/en/flights?from=YUL&fromLabel=Montr%C3%A9al+%28YUL%29&to=CDG&toLabel=Paris+%28CDG%29&trip=round_trip&depart=2026-11-11&return=2026-11-18&adults=1&cabin=economy&currency=CAD",
};
const b = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
const ctx = await b.newContext({ viewport: { width: 360, height: 740 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
await ctx.addCookies([{ name: "fl_consent", value: "partners-0", domain: "localhost", path: "/" }]);
const p = await ctx.newPage();
for (const [name, path] of Object.entries(pages)) {
  if (only && !only.split(",").includes(name)) continue;
  await p.goto("http://localhost:3999" + path, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await p.waitForTimeout(name === "flights" ? 5000 : 1200);
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  let i = 0;
  for (let y = 0; y < H && i < 14; y += 700, i++) {
    await p.evaluate((yy) => window.scrollTo(0, yy), y); await p.waitForTimeout(250);
    await p.screenshot({ path: `${out}/s-${name}-${String(i).padStart(2, "0")}.png` });
  }
  console.log(name, "height", H, "shots", i);
}
await b.close();
