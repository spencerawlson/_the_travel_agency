import { defineRouting } from "next-intl/routing";

// Adding a language = add its code here + a messages/<code>.json file + legal content.
export const routing = defineRouting({
  locales: ["en", "fr"],
  defaultLocale: "en",
  localePrefix: "always",
});

export type AppLocale = (typeof routing.locales)[number];
