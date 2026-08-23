import type { Tab } from "payload";

/**
 * De onderste balk van elke pagina.
 */
export const footerTab: Tab = {
  label: "Footer",
  fields: [
    {
      name: "footerTagline",
      label: "Footer Slogan",
      type: "text",
      localized: true,
      defaultValue: "Gemaakt met liefde in Zuilen",
    },
  ],
};
