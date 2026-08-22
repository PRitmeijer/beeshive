/**
 * Fills the CMS with the content the site currently falls back on when a
 * collection is empty, so the owner edits the same words he already sees on
 * the page instead of an empty admin panel.
 *
 * Run with: npm run seed
 *
 * Running it twice is safe. Every collection is counted first and left alone
 * when it already holds rows. Nothing here updates or deletes existing data.
 */
import { getPayload } from "payload";
import type { Payload } from "payload";
import config from "@payload-config";

// The dev server keeps the SQLite file open and the adapter would otherwise
// push a fresh schema on connect. Seeding is plain inserts, so we skip the
// push and never rewrite tables underneath a running server.
process.env.PAYLOAD_MIGRATING = "true";

/** Categories in the order they are printed on the card. */
const menuCategories = [
  { key: "voorgerechten", name: "Voorgerechten", description: "Om te beginnen" },
  { key: "hoofdgerechten", name: "Hoofdgerechten", description: "De hoofdmoot" },
  { key: "desserts", name: "Desserts", description: "Zoete afsluiting" },
  { key: "dranken", name: "Dranken", description: "Warm & koud" },
];

type SeedMenuItem = {
  name: string;
  description: string;
  price: number;
  categoryKey: string;
  dietary?: string[];
  featured?: boolean;
};

/**
 * The lines of the card, in printed order. The list is taken verbatim from the
 * placeholder in src/app/(frontend)/kaart/KaartClient.tsx.
 */
const menuItems: SeedMenuItem[] = [
  {
    name: "Seizoenssoep",
    description: "Met huisgebakken brood",
    price: 8.5,
    categoryKey: "voorgerechten",
    dietary: ["vegetarian"],
    featured: true,
  },
  {
    name: "Bruschetta",
    description: "Geroosterde tomaat, basilicum, balsamico",
    price: 9.5,
    categoryKey: "voorgerechten",
    dietary: ["vegan"],
  },
  {
    name: "Bijenkorfsalade",
    description: "Geitenkaas, honing, walnoten, rucola",
    price: 10,
    categoryKey: "voorgerechten",
    dietary: ["vegetarian"],
  },
  {
    name: "Slow-cooked Beef",
    description: "Zuid-Afrikaans geïnspireerd, met groenten van het seizoen",
    price: 22.5,
    categoryKey: "hoofdgerechten",
    featured: true,
  },
  {
    name: "Bobotie",
    description: "Traditioneel Zuid-Afrikaans ovenschotel met rijst",
    price: 19.5,
    categoryKey: "hoofdgerechten",
  },
  {
    name: "Risotto van het seizoen",
    description: "Romig en vol smaak",
    price: 18.5,
    categoryKey: "hoofdgerechten",
    dietary: ["vegetarian"],
  },
  {
    name: "Honingcake",
    description: "Met crème fraîche en verse bessen",
    price: 8,
    categoryKey: "desserts",
    dietary: ["vegetarian"],
    featured: true,
  },
  {
    name: "Malva Pudding",
    description: "Zuid-Afrikaans dessert met vanille-ijs",
    price: 9,
    categoryKey: "desserts",
  },
  {
    name: "Huisgemaakte Limonade",
    description: "Met verse munt en honing",
    price: 5,
    categoryKey: "dranken",
    dietary: ["vegan"],
  },
  {
    name: "Cappuccino",
    description: "Met optioneel havermelk",
    price: 3.5,
    categoryKey: "dranken",
  },
];

/** The three entries listed on /blog today, taken from BlogClient.tsx. */
const blogPosts = [
  {
    title: "Welkom bij De Bee's Hive",
    slug: "welkom",
    excerpt:
      "We zijn verheugd om onze deuren te openen in het hart van Zuilen. Lees meer over onze reis en wat je kunt verwachten.",
    publishedDate: "2025-06-14",
  },
  {
    title: "De kunst van seizoensgebonden koken",
    slug: "seizoensgebonden-koken",
    excerpt:
      "Ontdek hoe wij elk seizoen vieren met verse, lokale ingrediënten en creatieve recepten.",
    publishedDate: "2025-07-01",
  },
  {
    title: "Zuid-Afrikaanse smaken in Utrecht",
    slug: "zuid-afrikaanse-smaken",
    excerpt:
      "Van bobotie tot malva pudding: hoe onze Zuid-Afrikaanse roots onze keuken beïnvloeden.",
    publishedDate: "2025-07-15",
  },
];

/**
 * The smallest lexical value the richtext field accepts: a single paragraph.
 * The seeded posts carry their summary as the opening line so the field is not
 * empty. The owner writes the rest of the article over it in the admin panel.
 */
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

function log(line: string) {
  console.log(`[seed] ${line}`);
}

async function seedMenuCategories(payload: Payload): Promise<number> {
  const { totalDocs } = await payload.count({ collection: "menu-categories" });
  if (totalDocs > 0) {
    log(`menu-categories: ${totalDocs} rijen aanwezig, overgeslagen`);
    return 0;
  }

  let created = 0;
  for (const [index, category] of menuCategories.entries()) {
    await payload.create({
      collection: "menu-categories",
      data: {
        name: category.name,
        description: category.description,
        order: index + 1,
      },
    });
    created += 1;
  }
  log(`menu-categories: ${created} rijen aangemaakt`);
  return created;
}

async function seedMenuItems(payload: Payload): Promise<number> {
  const { totalDocs } = await payload.count({ collection: "menu-items" });
  if (totalDocs > 0) {
    log(`menu-items: ${totalDocs} rijen aanwezig, overgeslagen`);
    return 0;
  }

  // Items point at a category by relationship, so the ids are read back from
  // whatever is in the database rather than assumed from the insert order.
  const existing = await payload.find({
    collection: "menu-categories",
    limit: 100,
    pagination: false,
  });
  const idByName = new Map<string, number | string>(
    existing.docs.map((doc: any) => [doc.name as string, doc.id]),
  );

  let created = 0;
  for (const [index, item] of menuItems.entries()) {
    const categoryName = menuCategories.find(
      (category) => category.key === item.categoryKey,
    )?.name;
    const categoryId = categoryName ? idByName.get(categoryName) : undefined;

    if (!categoryId) {
      log(`menu-items: "${item.name}" overgeslagen, categorie ontbreekt`);
      continue;
    }

    await payload.create({
      collection: "menu-items",
      data: {
        name: item.name,
        description: item.description,
        price: item.price,
        category: categoryId,
        dietary: item.dietary ?? [],
        featured: item.featured ?? false,
        available: true,
        order: index + 1,
      } as any,
    });
    created += 1;
  }
  log(`menu-items: ${created} rijen aangemaakt`);
  return created;
}

async function seedBlogPosts(payload: Payload): Promise<number> {
  const { totalDocs } = await payload.count({ collection: "blog-posts" });
  if (totalDocs > 0) {
    log(`blog-posts: ${totalDocs} rijen aanwezig, overgeslagen`);
    return 0;
  }

  // featuredImage is optional, so the posts go in without one and /blog shows
  // the drawn placeholder until the owners upload photographs in the admin.
  let created = 0;
  for (const post of blogPosts) {
    await payload.create({
      collection: "blog-posts",
      data: {
        title: post.title,
        slug: post.slug,
        excerpt: post.excerpt,
        content: lexicalParagraph(post.excerpt),
        status: "published",
        publishedDate: post.publishedDate,
      } as any,
    });
    created += 1;
  }
  log(`blog-posts: ${created} rijen aangemaakt`);
  return created;
}

async function main() {
  const payload = await getPayload({ config });

  await seedMenuCategories(payload);
  await seedMenuItems(payload);
  await seedBlogPosts(payload);

  log(
    "gallery-images: overgeslagen, er zijn nog geen echte foto's. " +
      "De galerij toont zolang haar eigen placeholders.",
  );
  log(
    "events, team-members en testimonials: overgeslagen, geen enkele pagina " +
      "leest die collecties op dit moment uit, dus er is geen inhoud om over te nemen.",
  );

  log("klaar");
  process.exit(0);
}

main().catch((error) => {
  console.error("[seed] mislukt:", error);
  process.exit(1);
});
