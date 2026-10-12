import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import en from "../../messages/en.json";
import fr from "../../messages/fr.json";

export function renderWithIntl(ui: ReactElement, locale: "en" | "fr" = "en") {
  return render(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === "en" ? en : fr}
      timeZone="America/Toronto"
    >
      {ui}
    </NextIntlClientProvider>,
  );
}
