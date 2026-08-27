/**
 * The blog index and a single article. The articles themselves live in Payload
 * per locale; these are the words around them.
 *
 * The three sample posts are placeholders for an empty blog, in the same spirit
 * as the sample menu. They are also the only reason the sample slugs exist: a
 * real post's words all come out of the CMS.
 */
export const blogNl = {
  metaTitle: (name: string) => `Blog | ${name}`,
  /** Title of a single article; the headline carries the language. */
  postMetaTitle: (title: string, name: string) => `${title} | ${name}`,
  metaDescription:
    "Lees het laatste nieuws van De Bee's Hive: recepten, evenementen, verhalen en meer uit ons eetcafé in Zuilen.",
  eyebrow: "Verhalen & Nieuws",
  title: "Blog",
  readMore: "Lees meer",
  empty: "Binnenkort verschijnen hier onze verhalen.",
  back: "Terug naar blog",
  by: (name: string) => `Door ${name}`,
  /**
   * The plate at the head of an article and the panel it opens into.
   *
   * `hint` is the only one of these anybody sees. The other three are spoken:
   * the plate is a button and needs a name that says what pressing it does,
   * the panel is a dialog and needs a name of its own, and the cross has no
   * words in it at all. All three take the photograph's own description where
   * there is one, falling back to the headline, because "vergroot de foto" on
   * its own tells a reader listening to a list of links nothing about which
   * photograph they are being offered.
   */
  photo: {
    hint: "Vergroten",
    enlarge: (what: string) => `Vergroot de foto: ${what}`,
    dialog: (what: string) => `Foto: ${what}`,
    close: "Sluiten",
  },
  samplePosts: {
    welcome: {
      title: "Welkom bij De Bee's Hive",
      excerpt:
        "We zijn verheugd om onze deuren te openen in het hart van Zuilen. Lees meer over onze reis en wat je kunt verwachten.",
    },
    seasonal: {
      title: "De kunst van seizoensgebonden koken",
      excerpt:
        "Ontdek hoe wij elk seizoen vieren met verse, lokale ingrediënten en creatieve recepten.",
    },
    southAfrican: {
      title: "Zuid-Afrikaanse smaken in Utrecht",
      excerpt:
        "Van bobotie tot malva pudding: hoe onze Zuid-Afrikaanse roots onze keuken beïnvloeden.",
    },
  },
};

export type BlogDict = typeof blogNl;

export const blogEn: BlogDict = {
  metaTitle: (name: string) => `Blog | ${name}`,
  /** Title of a single article; the headline carries the language. */
  postMetaTitle: (title: string, name: string) => `${title} | ${name}`,
  metaDescription:
    "The latest from De Bee's Hive: recipes, events, stories and more from our eetcafé in Zuilen.",
  eyebrow: "Stories & News",
  title: "Blog",
  readMore: "Read more",
  empty: "Our stories will appear here soon.",
  back: "Back to the blog",
  by: (name: string) => `By ${name}`,
  photo: {
    hint: "Enlarge",
    enlarge: (what: string) => `Enlarge the photo: ${what}`,
    dialog: (what: string) => `Photo: ${what}`,
    close: "Close",
  },
  samplePosts: {
    welcome: {
      title: "Welcome to De Bee's Hive",
      excerpt:
        "We are delighted to open our doors in the heart of Zuilen. Read about our journey and what to expect.",
    },
    seasonal: {
      title: "The art of cooking with the seasons",
      excerpt:
        "Discover how we celebrate every season with fresh, local ingredients and creative recipes.",
    },
    southAfrican: {
      title: "South African flavours in Utrecht",
      excerpt:
        "From bobotie to malva pudding: how our South African roots shape our kitchen.",
    },
  },
};
