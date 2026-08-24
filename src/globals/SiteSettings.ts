import type { GlobalConfig } from "payload";

import { generalTab } from "./settings/general";
import { contactTab } from "./settings/contact";
import { homepageTab } from "./settings/homepage";
import { aboutTab } from "./settings/about";
import { reservationsTab } from "./settings/reservations";
import { sharingTab } from "./settings/sharing";
import { analyticsTab } from "./settings/analytics";
import { footerTab } from "./settings/footer";

/**
 * Alle instellingen van de site, in tabbladen.
 *
 * Dit bestand is met opzet leeg gebleven: elk tabblad woont in zijn eigen
 * bestand onder src/globals/settings/, en hier worden ze alleen op volgorde
 * gezet. Eén tabblad groeide anders uit tot honderden regels waarin niemand nog
 * iets terugvond. Een nieuw tabblad is dus een nieuw bestand daar plus één regel
 * hieronder — verder niets.
 *
 * De volgorde in de lijst is de volgorde waarin de eigenaren de tabbladen zien,
 * dus die loopt van "gebruik je dagelijks" naar "stel je één keer in".
 *
 * Let op bij een nieuw veld: de pagina's lezen deze instellingen via
 * getSiteSettings() in src/lib/payload.ts, en dat bestand houdt een eigen set
 * standaardwaarden bij voor het geval het CMS leeg of onbereikbaar is. Elk veld
 * dat je hier toevoegt heeft daar dus ook een standaard nodig, in zowel de
 * Nederlandse als de Engelse set, anders valt het veld op de Engelse site weg.
 *
 * En daaruit volgt de regel die de rest van dit bestand niet meer uitlegt: een
 * veld met `localized: true` krijgt hier géén `defaultValue`. Een defaultValue
 * is Nederlandse tekst, en Payload schrijft hem in de taal waarin het veld voor
 * het eerst wordt opgeslagen — ook in het Engels. Die Nederlandse zin staat dan
 * echt in de Engelse rij, getSiteSettings() ziet een ingevuld veld en de
 * Engelse standaard uit src/lib/payload.ts komt er nooit meer aan te pas. De
 * Engelse pagina toont dan Nederlands terwijl de eigenaren niets fout deden.
 * De standaardtekst hoort dus in src/lib/payload.ts, per taal; leeg in het CMS
 * betekent hier "gebruik die".
 *
 * Om dezelfde reden krijgt elk schrijven naar een andere taal dan het
 * Nederlands `fallbackLocale: false` mee (zie scripts/seed-en.ts en
 * src/lib/localeCopy.ts). Zonder dat leest Payload het bestaande document mét
 * fallback, en zet het elke Nederlandse zin die het zo terugkrijgt als echte
 * Engelse waarde weg — één veld bijwerken vertaalt dan per ongeluk de hele
 * global naar het Nederlands.
 */
export const SiteSettings: GlobalConfig = {
  slug: "site-settings",
  label: "Site Instellingen",
  fields: [
    {
      type: "tabs",
      tabs: [
        generalTab,
        contactTab,
        homepageTab,
        aboutTab,
        reservationsTab,
        sharingTab,
        analyticsTab,
        footerTab,
      ],
    },
  ],
};
