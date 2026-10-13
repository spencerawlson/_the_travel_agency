import type { LegalContent } from "./index";

export const fr: LegalContent = (s) => ({
  privacy: {
    title: "Politique de confidentialité",
    summary: `Comment ${s.name} recueille, utilise et protège les renseignements personnels.`,
    sections: [
      {
        heading: "Qui nous sommes",
        paragraphs: [
          `${s.name} est exploité par ${s.legalEntity}, ${s.address || "établie au Québec, Canada"}. Vous pouvez nous joindre à ${s.contactEmail}. Nous offrons un service de recherche et de comparaison de vols et dirigeons les voyageurs vers des vendeurs tiers. Nous ne vendons pas de voyages et ne prenons pas de paiements.`,
          `Notre responsable de la protection des renseignements personnels peut être joint à ${s.privacyEmail}. Son titre et ses coordonnées sont publiés conformément à la Loi sur la protection des renseignements personnels dans le secteur privé du Québec (telle que modifiée par la Loi 25).`,
        ],
      },
      {
        heading: "Ce que nous recueillons, et ce que nous ne recueillons pas",
        paragraphs: [
          "Nous avons conçu le service pour fonctionner avec le moins de renseignements personnels possible. Aucun compte n'est nécessaire pour effectuer une recherche.",
        ],
        list: [
          "Détails de recherche : origine, destination, dates, nombre et type de passagers, classe, devise et langue. Ils ne sont pas liés à votre nom ni à vos coordonnées.",
          "Clics de recommandation : l'offre et le partenaire choisis, le prix affiché et l'heure.",
          "Un court identifiant technique dérivé de votre adresse IP au moyen d'un hachage à clé qui change chaque jour. Il sert à compter les visites quotidiennes approximatives et à prévenir les abus (limitation du débit). Nous ne conservons pas votre adresse IP elle-même.",
          "Si vous nous écrivez : votre adresse courriel et votre message, utilisés uniquement pour vous répondre.",
          "Nous ne recueillons PAS les noms des passagers, dates de naissance, passeports ou pièces d'identité, ni les données de cartes de paiement. Les réservations et paiements se font sur le site du vendeur, selon sa politique de confidentialité.",
        ],
      },
      {
        heading: "Pourquoi nous les utilisons",
        paragraphs: [
          "Pour fournir des résultats de recherche, vous diriger vers le partenaire que vous choisissez, mesurer et améliorer le service, rapprocher les commissions avec nos partenaires, assurer la sécurité du service et respecter nos obligations légales. Nous ne vendons pas de renseignements personnels et ne les utilisons pas à des fins de publicité ciblée.",
        ],
      },
      {
        heading: "Communication et transferts hors Québec",
        paragraphs: [
          "Lorsque vous cliquez sur une offre, vous quittez notre site et le partenaire reçoit votre demande directement de votre navigateur. Les partenaires peuvent installer leurs propres témoins et appliquer leurs propres politiques de confidentialité.",
          ...(s.partnerScript || s.partnerWidgets
            ? [
                "Seulement si vous y consentez, nous chargeons du contenu de notre réseau d'affiliation, Travelpayouts, et de ses partenaires (recherche de vols Kiwi.com, activités Klook), qui peuvent installer des témoins et recueillir des renseignements techniques sur votre visite afin d'attribuer les réservations. Consultez notre avis sur les témoins; vous pouvez retirer votre consentement à tout moment.",
              ]
            : []),
          "Nos fournisseurs d'infrastructure (par exemple, hébergement, diffusion de contenu et services de sécurité) peuvent traiter des données à l'extérieur du Québec et du Canada. Avant de tels transferts, nous évaluons les facteurs relatifs à la vie privée et mettons en place des protections contractuelles, comme l'exige la Loi 25.",
        ],
      },
      {
        heading: "Conservation",
        paragraphs: [
          "Les données de recherche sont supprimées après environ 13 mois, les données de clics de recommandation après environ 25 mois (pour permettre le rapprochement des commissions) et les journaux d'erreurs techniques après 90 jours. Les journaux d'audit de sécurité sont conservés 2 ans.",
        ],
      },
      {
        heading: "Vos droits",
        paragraphs: [
          `Vous pouvez demander l'accès à vos renseignements personnels ou leur rectification, retirer votre consentement, demander la désindexation ou la suppression lorsque applicable, et vous renseigner sur la façon dont les décisions qui vous concernent sont prises. Écrivez à ${s.privacyEmail}. Nous répondons dans un délai de 30 jours. Vous pouvez aussi vous adresser à la Commission d'accès à l'information du Québec ou, le cas échéant, au Commissariat à la protection de la vie privée du Canada.`,
          "Comme nous ne conservons ni noms ni coordonnées avec les données de recherche, il se peut que nous ne puissions pas relier des données de recherche anonymes à votre personne.",
        ],
      },
      {
        heading: "Incidents de confidentialité",
        paragraphs: [
          "Nous tenons un registre des incidents de confidentialité. Si un incident présente un risque de préjudice sérieux, nous aviserons la Commission d'accès à l'information et les personnes concernées, comme l'exige la loi.",
        ],
      },
      {
        heading: "Visiteurs d'autres territoires",
        paragraphs: [
          "Si vous êtes dans l'Espace économique européen ou au Royaume-Uni, vous pourriez bénéficier de droits supplémentaires en vertu du RGPD / RGPD du Royaume-Uni. Aux États-Unis, des lois étatiques sur la vie privée peuvent s'appliquer. Écrivez-nous pour exercer ces droits.",
        ],
      },
    ],
  },
  terms: {
    title: "Conditions d'utilisation",
    summary: `Les règles d'utilisation de ${s.name}.`,
    sections: [
      {
        heading: "Notre rôle",
        paragraphs: [
          `${s.name} est un service de recherche et de comparaison. Nous ne sommes ni une compagnie aérienne, ni une agence de voyages, ni un agent de voyages, et nous ne sommes pas partie aux contrats que vous concluez avec un vendeur. Nous n'émettons pas de billets, ne traitons pas de paiements et ne gérons pas de réservations.`,
        ],
      },
      {
        heading: "Prix et disponibilités",
        paragraphs: [
          "Les prix, disponibilités, franchises de bagages et conditions tarifaires sont fournis par les partenaires et les vendeurs et peuvent changer à tout moment. Le prix final et les conditions applicables sont ceux affichés par le vendeur avant le paiement. Tant que notre service fonctionne en mode démonstration, tous les tarifs affichés sont fictifs et ne peuvent pas être réservés.",
        ],
      },
      {
        heading: "Le vendeur est responsable de votre réservation",
        paragraphs: [
          "Le vendeur indiqué pour chaque offre (compagnie aérienne ou agence de voyages) est responsable de votre réservation, du paiement, du billet, des modifications, annulations et remboursements, ainsi que du service à la clientèle. Veuillez communiquer directement avec lui pour toute question liée à une réservation.",
        ],
      },
      {
        heading: "Utilisation acceptable",
        paragraphs: [
          "Vous vous engagez à ne pas extraire de données, surcharger, désosser ou utiliser abusivement le service, ni à l'utiliser à des fins illégales. Nous pouvons limiter ou bloquer le trafic automatisé ou abusif.",
        ],
      },
      {
        heading: "Responsabilité",
        paragraphs: [
          "Nous nous efforçons d'afficher des renseignements exacts, mais ne pouvons garantir les données des partenaires. Dans la mesure permise par la loi, nous ne sommes pas responsables des actes ou omissions des vendeurs ou des partenaires. Rien dans les présentes ne limite les droits auxquels vous ne pouvez renoncer en vertu des lois sur la protection du consommateur, dont la Loi sur la protection du consommateur du Québec.",
        ],
      },
      {
        heading: "Droit applicable",
        paragraphs: [
          "Les présentes conditions sont régies par les lois de la province de Québec et les lois fédérales du Canada qui s'y appliquent, sous réserve des règles impératives de protection du consommateur de votre lieu de résidence.",
        ],
      },
    ],
  },
  "affiliate-disclosure": {
    title: "Divulgation d'affiliation",
    summary:
      "Comment nous sommes rémunérés, et l'effet (ou l'absence d'effet) sur ce que vous voyez.",
    sections: [
      {
        heading: "Nous touchons des commissions",
        paragraphs: [
          "Certains partenaires nous versent une commission lorsqu'une personne réserve après avoir suivi l'un de nos liens. La commission est payée par le partenaire; elle n'augmente pas le prix que vous payez.",
          "Un clic sur une offre ne garantit aucune rémunération. Nous ne comptabilisons que les commissions déclarées par nos partenaires.",
        ],
      },
      {
        heading: "Ordre des résultats",
        paragraphs: [
          "Par défaut, les résultats sont triés selon le prix total le plus bas. Vous pouvez aussi les trier par durée ou par heure de départ. Les taux de commission ne modifient pas l'ordre par défaut. Si cela devait changer, nous mettrons cette page à jour et identifierons clairement tout placement commandité.",
        ],
      },
      {
        heading: "Qui vend votre billet",
        paragraphs: [
          "Chaque offre indique le vendeur. Lorsque vous cliquez sur « Voir l'offre », vous êtes dirigé vers le site de ce vendeur (ou du partenaire) pour y finaliser votre réservation.",
        ],
      },
      {
        heading: "Situation actuelle",
        paragraphs: [
          s.referralsLive
            ? "Les liens partenaires sont actifs. Lorsque vous cliquez sur « Voir l'offre », vous êtes dirigé vers Aviasales, un site de recherche de vols qui compare les offres de compagnies aériennes et d'agences de voyages. Vous y choisissez votre vendeur et le payez directement. Nous pouvons toucher une commission de notre réseau d'affiliation (Travelpayouts) si vous réservez; cela ne change jamais le prix que vous payez. Les prix affichés sur notre site sont des tarifs trouvés récemment et sont confirmés sur Aviasales avant le paiement."
            : "Les liens de réservation partenaires ne sont pas encore actifs. Les prix affichés servent uniquement à la comparaison. Les liens partenaires seront activés une fois les ententes de partenariat et toute exigence de permis applicable confirmées.",
          ...(s.partnerScript || s.partnerWidgets
            ? [
                "Nous sommes membres du réseau d'affiliation Travelpayouts. Avec votre consentement, nos pages affichent du contenu partenaire (par exemple des tarifs Kiwi.com en direct et des activités Klook) et peuvent ajouter des liens d'affiliation; nous pouvons toucher une commission si vous réservez par leur intermédiaire, sans frais supplémentaires pour vous.",
              ]
            : []),
        ],
      },
    ],
  },
  cookies: {
    title: "Avis sur les témoins",
    summary: "Les témoins (cookies) et le stockage local que nous utilisons.",
    sections: [
      {
        heading:
          s.partnerScript || s.partnerWidgets
            ? "Strictement nécessaires"
            : "Strictement nécessaires seulement",
        paragraphs: [
          s.partnerScript || s.partnerWidgets
            ? "Nous n'utilisons aucun témoin publicitaire ni d'analytique tiers. Ces témoins sont nécessaires au fonctionnement du site :"
            : "Nous n'utilisons aucun témoin publicitaire ni d'analytique tiers. Nous n'utilisons que ce dont le site a besoin pour fonctionner :",
        ],
        list: [
          "NEXT_LOCALE : mémorise votre choix de langue.",
          ...(s.partnerScript || s.partnerWidgets
            ? ["fl_consent : mémorise votre choix de témoins."]
            : []),
          "gtp_admin_session et gtp_csrf : utilisés uniquement par les administrateurs qui se connectent.",
        ],
      },
      ...(s.partnerScript || s.partnerWidgets
        ? [
            {
              heading: "Témoins partenaires facultatifs (seulement avec votre consentement)",
              paragraphs: [
                "Si vous choisissez « Accepter les témoins partenaires », nous chargeons du contenu de Travelpayouts, le réseau d'affiliation voyage avec lequel nous travaillons, et de ses partenaires Kiwi.com (recherche de vols en direct) et Klook (activités). Ce contenu peut ajouter des liens de voyage, des offres en direct et de courts aperçus à nos pages, et il permet à Travelpayouts et à ses partenaires d'installer des témoins et de recueillir des renseignements techniques (comme votre appareil, votre navigateur et les pages consultées) afin de nous attribuer les réservations.",
                "Si vous choisissez « Essentiels seulement », ce contenu partenaire n'est jamais chargé et le site fonctionne de la même façon. Vous pouvez modifier votre choix à tout moment grâce au lien « Paramètres des témoins » au bas de chaque page. Les données recueillies par Travelpayouts sont régies par sa propre politique de confidentialité.",
              ],
            },
          ]
        : []),
      {
        heading: "Sites des partenaires",
        paragraphs: [
          "Après avoir cliqué vers un partenaire, ce site peut installer ses propres témoins (par exemple, pour nous attribuer votre réservation). Ces témoins sont régis par la politique du partenaire.",
        ],
      },
    ],
  },
});
