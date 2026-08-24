/**
 * English translations for the seeded content.
 *
 * Payload stores one row per locale, so this writes the `en` side of documents
 * that already exist in `nl`. Runs after scripts/seed.ts and is idempotent: it
 * matches on the fields that are not localised (slug for posts, order for menu
 * rows) and overwrites only the English values.
 *
 * Every English write passes `fallbackLocale: false`, and it is not optional.
 * A partial update reads the existing document first and keeps whatever it
 * finds for the fields the patch does not mention — and a normal read of an
 * untranslated English document hands back Dutch, because `localization
 * .fallback` is on in src/payload.config.ts. So without this flag, setting one
 * English field writes the Dutch text of every other field into the English
 * rows as if somebody had typed it there. That is exactly how the English site
 * came to serve a Dutch hero, a Dutch newsletter block and a Dutch About
 * intro: this script set `openingHoursNote` and took the rest of the global
 * with it. scripts/clear-en-echo.ts undoes that on a database it already
 * happened to.
 */
import { getPayload } from "payload";
import config from "@payload-config";

/** Minimal valid lexical document, same shape scripts/seed.ts writes. */
function lexicalParagraph(text: string) {
  return {
    root: {
      type: "root",
      format: "",
      indent: 0,
      version: 1,
      direction: "ltr",
      children: [
        {
          type: "paragraph",
          format: "",
          indent: 0,
          version: 1,
          direction: "ltr",
          textFormat: 0,
          children: [
            {
              type: "text",
              detail: 0,
              format: 0,
              mode: "normal",
              style: "",
              text,
              version: 1,
            },
          ],
        },
      ],
    },
  };
}

const log = (m: string) => console.log(`  ${m}`);

const CATEGORIES: Record<string, { name: string; description: string }> = {
  Voorgerechten: { name: "Starters", description: "To begin" },
  Hoofdgerechten: { name: "Mains", description: "The main event" },
  Desserts: { name: "Desserts", description: "A sweet finish" },
  Dranken: { name: "Drinks", description: "Hot and cold" },
};

const ITEMS: Record<string, { name: string; description: string }> = {
  Seizoenssoep: { name: "Soup of the season", description: "With home-baked bread" },
  Bruschetta: { name: "Bruschetta", description: "Roasted tomato, basil, balsamic" },
  Bijenkorfsalade: {
    name: "Beehive salad",
    description: "Goat's cheese, honey, walnuts, rocket",
  },
  "Slow-cooked Beef": {
    name: "Slow-cooked beef",
    description: "South African inspired, with vegetables of the season",
  },
  Bobotie: {
    name: "Bobotie",
    description: "A traditional South African bake, served with rice",
  },
  "Risotto van het seizoen": {
    name: "Risotto of the season",
    description: "Creamy and full of flavour",
  },
  Honingcake: {
    name: "Honey cake",
    description: "With creme fraiche and fresh berries",
  },
  "Malva Pudding": {
    name: "Malva pudding",
    description: "A South African dessert with vanilla ice cream",
  },
  "Huisgemaakte Limonade": {
    name: "Home-made lemonade",
    description: "With fresh mint and honey",
  },
  Cappuccino: { name: "Cappuccino", description: "Oat milk on request" },
};

const POSTS: Record<string, { title: string; excerpt: string }> = {
  welkom: {
    title: "Welcome to De Bee's Hive",
    excerpt:
      "We are delighted to be opening our doors in the heart of Zuilen. Read about our journey and what to expect.",
  },
  "seizoensgebonden-koken": {
    title: "The art of cooking with the seasons",
    excerpt:
      "How we mark every season with fresh, local ingredients and a little invention.",
  },
  "zuid-afrikaanse-smaken": {
    title: "South African flavours in Utrecht",
    excerpt:
      "From bobotie to malva pudding: how our South African roots shape the kitchen.",
  },
};

async function main() {
  const payload = await getPayload({ config });
  let written = 0;

  const cats = await payload.find({
    collection: "menu-categories",
    limit: 200,
    locale: "nl",
  });
  for (const doc of cats.docs) {
    const en = CATEGORIES[(doc as unknown as { name: string }).name];
    if (!en) continue;
    await payload.update({
      collection: "menu-categories",
      id: doc.id,
      locale: "en",
      fallbackLocale: false,
      data: en as never,
    });
    written += 1;
  }
  log(`menu-categories: ${written} vertaald`);

  let items = 0;
  const menu = await payload.find({
    collection: "menu-items",
    limit: 500,
    locale: "nl",
  });
  for (const doc of menu.docs) {
    const en = ITEMS[(doc as unknown as { name: string }).name];
    if (!en) continue;
    await payload.update({
      collection: "menu-items",
      id: doc.id,
      locale: "en",
      fallbackLocale: false,
      data: en as never,
    });
    items += 1;
  }
  log(`menu-items: ${items} vertaald`);

  let posts = 0;
  const blog = await payload.find({
    collection: "blog-posts",
    limit: 200,
    locale: "nl",
  });
  for (const doc of blog.docs) {
    const en = POSTS[(doc as unknown as { slug: string }).slug];
    if (!en) continue;
    await payload.update({
      collection: "blog-posts",
      id: doc.id,
      locale: "en",
      fallbackLocale: false,
      data: { ...en, content: lexicalParagraph(en.excerpt) } as never,
    });
    posts += 1;
  }
  log(`blog-posts: ${posts} vertaald`);

  await payload.updateGlobal({
    slug: "site-settings",
    locale: "nl",
    data: {
      openingHoursNote:
        "Elke laatste zondag van de maand zijn wij extra geopend.",
    } as never,
  });

  await payload.updateGlobal({
    slug: "site-settings",
    locale: "en",
    fallbackLocale: false,
    data: {
      openingHoursNote: "We are also open on the last Sunday of every month.",
    } as never,
  });
  log("site-settings: Engelse openingstijden-notitie gezet");

  console.log("klaar");
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
