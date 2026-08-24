import type { Tab } from "payload";

/**
 * De Over Ons pagina: het verhaal en het beeld dat eronder staat.
 */
export const aboutTab: Tab = {
  label: "Over Ons",
  fields: [
    {
      name: "aboutIntro",
      label: "Intro Tekst",
      type: "textarea",
      localized: true,
      // Geen defaultValue op een vertaald veld — zie SiteSettings.ts.
    },
    {
      name: "aboutStory",
      label: "Ons Verhaal",
      type: "richText",
      localized: true,
      admin: {
        description:
          "Het volledige verhaal op de Over Ons pagina. Gebruik de editor voor opmaak.",
      },
    },
    {
      name: "aboutImage",
      label: "Foto",
      type: "upload",
      relationTo: "media",
      admin: {
        description:
          "Eén foto op de Over Ons pagina, onder de quote. Bijvoorbeeld de familie, "
          + "de keuken of de zaak. Laat leeg als je hier niets wilt tonen. "
          + "Staat er ook een video-URL ingevuld, dan wint de video.",
      },
    },
    {
      name: "aboutVideoUrl",
      label: "Video (YouTube of Vimeo)",
      type: "text",
      admin: {
        description:
          "Plak de embed-URL van de video, bijv. https://www.youtube.com/embed/XXXXXXXXXXX "
          + "of https://player.vimeo.com/video/123456789. Op YouTube: Delen → Insluiten → "
          + "kopieer de src uit de iframe-code. Een gewone youtube.com/watch?v=... link "
          + "werkt niet. Video's zelf uploaden kan hier niet, die worden te groot.",
      },
    },
    {
      name: "aboutMediaCaption",
      label: "Bijschrift bij foto of video",
      type: "text",
      localized: true,
      admin: {
        description:
          "Eén korte regel onder de foto of video. Laat leeg voor geen bijschrift.",
      },
    },
  ],
};
