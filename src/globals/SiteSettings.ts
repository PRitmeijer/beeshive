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
