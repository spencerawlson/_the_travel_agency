import type { LegalContent } from "./index";

export const en: LegalContent = (s) => ({
  privacy: {
    title: "Privacy policy",
    summary: `How ${s.name} collects, uses and protects personal information.`,
    sections: [
      {
        heading: "Who we are",
        paragraphs: [
          `${s.name} is operated by ${s.legalEntity}, ${s.address}. We provide a flight search and comparison service and refer travellers to third-party sellers. We do not sell travel or take payments.`,
          `Our ${s.privacyOfficer} can be reached at ${s.privacyEmail}. Their title and contact details are published as required by Quebec's Act respecting the protection of personal information in the private sector (as amended by Law 25).`,
        ],
      },
      {
        heading: "What we collect, and what we don't",
        paragraphs: [
          "We designed the service to work with as little personal information as possible. You do not need an account to search.",
        ],
        list: [
          "Search details: origin, destination, dates, number and type of passengers, cabin, currency and language. These are not linked to your name or contact details.",
          "Referral clicks: which offer and partner you selected, the price shown, and the time.",
          "A short technical identifier derived from your IP address using a keyed hash that changes every day. We use it to count approximate daily visits and to prevent abuse (rate limiting). We do not store your IP address itself.",
          "If you email us: your email address and message, used only to respond.",
          "We do NOT collect passenger names, dates of birth, passport or identity documents, or payment card details. Bookings and payments happen on the seller's website under their privacy policy.",
        ],
      },
      {
        heading: "Why we use it",
        paragraphs: [
          "To provide search results, to send you to the partner you choose, to measure and improve the service, to reconcile commissions with partners, to keep the service secure, and to meet legal obligations. We do not sell personal information and we do not use it for targeted advertising.",
        ],
      },
      {
        heading: "Sharing and transfers outside Quebec",
        paragraphs: [
          "When you click an offer, you leave our site and the partner receives your request directly from your browser. Partners may set their own cookies and apply their own privacy policies.",
          ...(s.partnerScript
            ? [
                "Only if you consent, we load a script from our affiliate network, Travelpayouts, which may set cookies and collect technical information about your visit to attribute bookings. See our cookie notice; you can withdraw consent at any time.",
              ]
            : []),
          "Our infrastructure providers (for example, hosting, content delivery and security services) may process data outside Quebec and Canada. Before such transfers, we assess privacy risks and put contractual safeguards in place, as required by Law 25.",
        ],
      },
      {
        heading: "Retention",
        paragraphs: [
          "Search records are deleted after about 13 months, referral click records after about 25 months (to allow commission reconciliation), and technical error logs after 90 days. Security audit logs are kept for 2 years.",
        ],
      },
      {
        heading: "Your rights",
        paragraphs: [
          `You may ask to access or correct your personal information, withdraw consent, request de-indexation or deletion where applicable, and ask about how decisions concerning you are made. Write to ${s.privacyEmail}. We respond within 30 days. You may also contact the Commission d'accès à l'information du Québec or, where applicable, the Office of the Privacy Commissioner of Canada.`,
          "Because we store no names or contact details with search records, we may be unable to link anonymous search data to you.",
        ],
      },
      {
        heading: "Security incidents",
        paragraphs: [
          "We keep a register of confidentiality incidents. If an incident presents a risk of serious injury, we will notify the Commission d'accès à l'information and affected people as required by law.",
        ],
      },
      {
        heading: "Visitors from other jurisdictions",
        paragraphs: [
          "If you are in the European Economic Area or the United Kingdom, you may have additional rights under the GDPR / UK GDPR. If you are in the United States, state privacy laws may apply. Contact us to exercise these rights.",
        ],
      },
    ],
  },
  terms: {
    title: "Terms of use",
    summary: `The rules for using ${s.name}.`,
    sections: [
      {
        heading: "Our role",
        paragraphs: [
          `${s.name} is a search and comparison service. We are not an airline, a travel agency, or a travel agent, and we are not a party to any contract you make with a seller. We do not issue tickets, process payments or manage bookings.`,
        ],
      },
      {
        heading: "Prices and availability",
        paragraphs: [
          "Prices, availability, baggage allowances and fare rules are provided by partners and sellers and can change at any time. The final price and conditions are those shown by the seller before you pay. While our service runs in demo mode, all fares shown are sample data and cannot be booked.",
        ],
      },
      {
        heading: "The seller is responsible for your booking",
        paragraphs: [
          "The seller identified on each offer (an airline or a travel agency) is responsible for your booking, payment, ticket, changes, cancellations, refunds, and customer service. Please contact them directly for any booking matter.",
        ],
      },
      {
        heading: "Acceptable use",
        paragraphs: [
          "You agree not to scrape, overload, reverse-engineer or misuse the service, and not to use it for unlawful purposes. We may limit or block automated or abusive traffic.",
        ],
      },
      {
        heading: "Liability",
        paragraphs: [
          "We work to show accurate information but cannot guarantee partner data. To the extent permitted by law, we are not liable for the acts or omissions of sellers or partners. Nothing in these terms limits rights you have under consumer protection laws that cannot be waived, including Quebec's Consumer Protection Act.",
        ],
      },
      {
        heading: "Governing law",
        paragraphs: [
          "These terms are governed by the laws of the Province of Quebec and the federal laws of Canada applicable there, subject to any mandatory consumer protection rules of your place of residence.",
        ],
      },
    ],
  },
  "affiliate-disclosure": {
    title: "Affiliate disclosure",
    summary: "How we are paid, and how that affects (and doesn't affect) what you see.",
    sections: [
      {
        heading: "We earn commissions",
        paragraphs: [
          "Some partners pay us a commission when someone books after following one of our links. The commission is paid by the partner; it does not increase the price you pay.",
          "A click on an offer does not guarantee we earn anything. We only count commissions that partners report to us.",
        ],
      },
      {
        heading: "How results are ordered",
        paragraphs: [
          "By default, results are sorted by lowest total price. You can also sort by duration or departure time. Commission rates do not change the default order. If this ever changes, we will update this page and label any sponsored placement clearly.",
        ],
      },
      {
        heading: "Who sells your ticket",
        paragraphs: [
          "Each offer shows the seller. When you click 'View deal', you go to that seller's (or the partner's) website to complete your booking with them.",
        ],
      },
      {
        heading: "Current status",
        paragraphs: [
          "The service currently runs with demonstration data only. No commissions are earned from the flight results shown. Live partner links will be enabled only after partner agreements and any licensing requirements have been verified.",
          ...(s.partnerScript
            ? [
                "We are a member of the Travelpayouts affiliate network. With your consent, its script may add affiliate links or previews to our pages; we may earn a commission if you book through them.",
              ]
            : []),
        ],
      },
    ],
  },
  cookies: {
    title: "Cookie notice",
    summary: "The cookies and local storage we use.",
    sections: [
      {
        heading: s.partnerScript ? "Strictly necessary" : "Strictly necessary only",
        paragraphs: [
          s.partnerScript
            ? "We do not use advertising or third-party analytics cookies. These cookies are needed for the site to work:"
            : "We do not use advertising or third-party analytics cookies. We use only what the site needs to work:",
        ],
        list: [
          "NEXT_LOCALE: remembers your language choice.",
          ...(s.partnerScript ? ["fl_consent: remembers your cookie choice."] : []),
          "gtp_admin_session and gtp_csrf: used only by administrators who sign in.",
        ],
      },
      ...(s.partnerScript
        ? [
            {
              heading: "Optional partner cookies (only with your consent)",
              paragraphs: [
                "If you choose \u201cAccept partner cookies\u201d, we load a script from Travelpayouts, the travel affiliate network we work with. It can add travel links and short previews to our pages, and it lets Travelpayouts and its partners set cookies and collect technical information (such as your device, browser and the pages you view) so that bookings can be credited to us.",
                "If you choose \u201cEssential only\u201d, the script is never loaded and the site works the same. You can change your choice at any time with the \u201cCookie settings\u201d link at the bottom of every page. Data collected by Travelpayouts is governed by its own privacy policy.",
              ],
            },
          ]
        : []),
      {
        heading: "Partner websites",
        paragraphs: [
          "After you click through to a partner, that website may set its own cookies (for example, to attribute your booking to us). Those cookies are governed by the partner's own policy.",
        ],
      },
    ],
  },
});
