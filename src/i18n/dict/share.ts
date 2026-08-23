/**
 * The words on and around the share card — the picture and the two lines a
 * chat app, a timeline or a search result puts under a link to this site.
 *
 * Almost everything a card shows is already written somewhere else: the page's
 * own title and description, or the three "Delen" fields in Site Instellingen.
 * What is left here is the copy nobody would think to type into the CMS — the
 * alternative text a screen reader reads instead of the picture, and the one
 * line the drawn card falls back to when the page has nothing shorter to say
 * about itself than its own meta description.
 */
export const shareNl = {
  /**
   * Alt text for a card that stands for the site as a whole, rather than for
   * one photograph. A document's own picture keeps the alt text the owners
   * typed on the upload; this is for the two cases where there is none.
   */
  imageAlt: (name: string) => `Deelkaart van ${name}`,
  /** The line under the name on the drawn card. Kept short enough to fit. */
  tagline: "Eetcafé in Zuilen, Utrecht",
};

export type ShareDict = typeof shareNl;

export const shareEn: ShareDict = {
  imageAlt: (name: string) => `Share card for ${name}`,
  tagline: "Eetcafé in Zuilen, Utrecht",
};
