/**
 * The five articles the blog opens with, as text.
 *
 * One copy, two destinations. `publish-blog-posts.ts` turns these into Lexical
 * documents and writes them into Payload; `export-blog-html.ts` turns the same
 * strings into HTML for pasting into a CMS this machine cannot reach. Keeping
 * the words in a module of their own is what stops those two from drifting —
 * a typo fixed for the website and not for the paste-in copy is exactly the
 * kind of difference nobody notices until both are already published.
 *
 * The bodies are written in a small subset of Markdown: paragraphs, ## and ###
 * headings, > quotes, - bullets, **bold** and [links](/somewhere). Both
 * consumers implement that same subset; neither implements more than it.
 *
 * Where the material comes from: the old debeeshive.nl. Its About page told
 * the story of the name, its menu carried a "Mede Meegemaakt Door" tab that
 * was never written, its contact page printed the opening hours as four blocks
 * of the day, and the backup came with the photographs.
 *
 * Deliberately not overlapping with what the rest of the site already says.
 * The home page, Over Ons and the site settings all sell "warm eetcafé in het
 * hart van Zuilen where creativity, connection and good food come together";
 * repeating that five more times would win nothing and cost the blog its
 * reason to exist. Each article owns its own subject and its own vocabulary
 * instead — the name, the takeover, the crowdfunding, the family, the clock.
 */

export type Article = {
  slug: string;
  category: "news" | "recipes" | "events" | "stories" | "tips";
  tags: string[];
  publishedDate: string;
  /** Path under PHOTO_DIR, and the name the file gets in the media library. */
  photo?: { source: string; filename: string; alt: { nl: string; en: string } };
  nl: { title: string; excerpt: string; body: string };
  en: { title: string; excerpt: string; body: string };
};

export const ARTICLES: Article[] = [
  {
    slug: "waarom-heten-wij-de-bees-hive",
    category: "stories",
    tags: ["naam", "familiegeschiedenis", "Zuid-Afrika"],
    publishedDate: "2025-09-14",
    photo: {
      source: "restaurant/20250523_151724.jpg",
      filename: "bijenkorf-tekening.jpg",
      alt: {
        nl: "Inkttekening van een bijenkorf aan een tak, met bijen eromheen, op handgeschept papier.",
        en: "Ink drawing of a beehive hanging from a branch with bees around it, on handmade paper.",
      },
    },
    nl: {
      title: "Waarom heten wij De Bee's Hive?",
      excerpt:
        "Nee, we houden geen bijen. De naam komt van een naamplaatje op een paardenboerderij in 2002, waar Backström simpelweg niet op paste.",
      body: `
Het is de vraag die het vaakst over de bar komt, meestal ergens tussen het bestellen en het brengen: houden jullie bijen? Nee. Er is geen korf, er is geen imker, en de honing op de bijenkorfsalade kopen we net als iedereen.

Het echte antwoord is minder logisch en een stuk leuker.

## Een naamplaatje dat te klein was

Zuid-Afrika, 2002, een paardenboerderij. Onze achternaam is Backström. Dat is een prima naam, behalve wanneer hij op een klokje moet passen dat daar niet op gebouwd is.

Iemand kortte hem af tot "The B's". Zo stond het op het bordje, en zo bleef het.

## Van The B's naar een korf

Jaren later stonden we op markten. Een kraam heeft een naam nodig, en "The B's" was inmiddels van ons. Van B's naar bees is één letter, en van bees naar een hive is één gedachte:

> Alles wat lekker is, zit toch in de korf.

Zo heette de kraam. Zo heet nu het eetcafé.

## Waarom de naam meeverhuisde naar Zuilen

Toen we hier de sleutel kregen, hebben we kort overwogen iets nieuws te bedenken. Iets Nederlandsers, iets met Zuilen erin, iets dat meteen uitlegt wat we doen.

We hebben het niet gedaan. Een naam die ruim twintig jaar met een familie meeloopt is geen marketing meer, het is een bijnaam. Die verzin je niet opnieuw omdat je verhuisd bent.

## En toen bleek het Nederlands mee te werken

Wat we niet hadden zien aankomen: dit land geeft je woordgrappen cadeau zodra er een bij in je naam zit. Bij-zonder. Bij-zig. We hebben ze allebei op de oude website gezet en we zijn er nooit meer vanaf gekomen.

Dus nee, we houden geen bijen.

Nog niet.
`,
    },
    en: {
      title: "Why are we called De Bee's Hive?",
      excerpt:
        "No, we do not keep bees. The name comes from a name badge on a horse farm in 2002, on which Backström simply would not fit.",
      body: `
It is the question that comes across the bar most often, usually somewhere between the ordering and the bringing: do you keep bees? No. There is no hive, there is no beekeeper, and we buy the honey for the hive salad like everybody else.

The real answer makes less sense and is a good deal more fun.

## A name badge that was too small

South Africa, 2002, a horse farm. Our surname is Backström. That is a perfectly good name, except when it has to fit on a badge that was not built for it.

Somebody shortened it to "The B's". That is what the badge said, and that is what stuck.

## From The B's to a hive

Years later we were doing markets. A stall needs a name, and "The B's" was ours by then. From B's to bees is one letter, and from bees to a hive is one thought:

> Everything good ends up in the hive anyway.

That was the name of the stall. It is now the name of the eetcafé.

## Why the name moved to Zuilen with us

When we got the keys here we briefly considered inventing something new. Something Dutch, something with Zuilen in it, something that explains what we do before you walk in.

We did not. A name that has followed a family around for more than twenty years is not marketing any more, it is a nickname. You do not reinvent one because you have moved house.

## And then Dutch turned out to help

What we had not seen coming: this country hands you puns for free once there is a bee in your name. Bij-zonder, the Dutch for special, with the word for bee sitting inside it. Bij-zig, busy, the same trick. We put both on the old website and we have never managed to stop.

So no, we do not keep bees.

Not yet.
`,
    },
  },

  {
    slug: "van-de-kleine-baron-naar-de-bees-hive",
    category: "news",
    tags: ["De Kleine Baron", "overname", "Zuilen", "buurt"],
    publishedDate: "2025-11-02",
    photo: {
      source: "renovations/reno-22.jpg",
      filename: "krijtbord-vorige-eigenaar.jpg",
      alt: {
        nl: "Het uitgeveegde krijtbord in de zaak, waar het handschrift van de vorige eigenaar nog doorheen schemert.",
        en: "The wiped chalkboard in the dining room, the previous owner's handwriting still showing through.",
      },
    },
    nl: {
      title: "Van De Kleine Baron naar De Bee's Hive",
      excerpt:
        "Op de hoek van de Sweder van Zuylenweg en de Edisonstraat zat jarenlang De Kleine Baron. Hoe één bericht van onze oude huisbaas — 'dit lijkt me iets voor jullie' — ervoor zorgde dat wij de sleutel kregen.",
      body: `
Als je in Zuilen woont en je loopt langs de hoek van de Sweder van Zuylenweg en de Edisonstraat, dan heb je die deur waarschijnlijk vaker opengedaan dan je je herinnert. Hier zat De Kleine Baron. Lunch, koffie, high tea, een terras richting het Julianapark. Voor veel mensen in deze buurt was dit gewoon het adres waar je afsprak.

Nu staat onze naam op de gevel. Dit is hoe dat gegaan is.

## Een bericht dat we niet zagen aankomen

Onze voormalige huisbaas wist dat Alan chef-kok is. Toen hij hoorde dat er een eetcafé te koop stond, stuurde hij ons een bericht. Er stond ongeveer één zin in:

> Dit lijkt me iets voor jullie.

Hij had gelijk, al wisten wij dat op dat moment nog niet zeker. Wat we wel wisten: dit soort berichten krijg je geen twee keer.

## Overnemen is niet hetzelfde als beginnen

Een leeg pand huren en er iets van maken is één ding. Een lopende zaak overnemen is iets anders, en op sommige punten lastiger. Er is een buurt die het adres al kent. Er zijn mensen die hier jarenlang hetzelfde bestelden. En er is een vorige eigenaar die je van alles kan vertellen, of niets.

De onze vertelde alles. Hij hielp bij de overdracht op manieren waar hij zelf niets aan verdiende, en dat is het soort ding dat je onthoudt.

## Wat blijft

- De hoek. Zelfde deur, zelfde stoep, zelfde Julianapark om de hoek.
- Dat je hier binnen kunt lopen voor alleen een koffie.
- Het idee dat dit een plek voor de buurt is en niet voor de gids.

## Wat verandert

- De keuken. Zuid-Afrika staat nu op de kaart: bobotie, malva pudding, en een handvol dingen die hier zelden op een menu staan.
- De naam, met een eigen verhaal dat we [ergens anders](/blog/waarom-heten-wij-de-bees-hive) uit de doeken doen.
- De dagen. We zijn maandag, donderdag, vrijdag en zaterdag open, plus de laatste zondag van de maand.

## Als je hier vroeger kwam

Dan ben je hier nog steeds welkom en hoef je niets nieuws te leren. Bestel je koffie waar je hem altijd bestelde. En mocht je een keer bobotie willen proberen: dat is een Zuid-Afrikaanse ovenschotel, hij is niet pittig, en hij is beter dan hij klinkt.
`,
    },
    en: {
      title: "From De Kleine Baron to De Bee's Hive",
      excerpt:
        "For years the corner of Sweder van Zuylenweg and Edisonstraat was De Kleine Baron. How one message from our former landlord — 'this looks like something for you' — ended with us holding the key.",
      body: `
If you live in Zuilen and you walk past the corner of the Sweder van Zuylenweg and the Edisonstraat, you have probably opened that door more often than you remember. This was De Kleine Baron. Lunch, coffee, high tea, a terrace facing the Julianapark. For a lot of people in this neighbourhood it was simply the address you met at.

Our name is on the front now. This is how that happened.

## A message we did not see coming

Our former landlord knew that Alan is a chef. When he heard that an eetcafé was up for sale, he sent us a message. It was about one sentence long:

> This looks like something for you.

He was right, although we were not sure of it at the time. What we did know: you do not get a message like that twice.

## Taking over is not the same as starting

Renting an empty unit and making something of it is one thing. Taking over a working business is another, and harder in places. There is a neighbourhood that already knows the address. There are people who ordered the same thing here for years. And there is a previous owner who can tell you everything, or nothing.

Ours told us everything. He helped with the handover in ways he earned nothing from, and that is the sort of thing you remember.

## What stays

- The corner. Same door, same pavement, same Julianapark round the back.
- That you can walk in for a coffee and nothing else.
- The idea that this is a place for the neighbourhood rather than for a guide.

## What changes

- The kitchen. South Africa is on the menu now: bobotie, malva pudding, and a handful of things that rarely turn up on a Dutch card.
- The name, which has a story of its own that we tell [elsewhere](/en/blog/waarom-heten-wij-de-bees-hive).
- The days. We are open Monday, Thursday, Friday and Saturday, plus the last Sunday of the month.

## If you used to come here

You are still welcome and there is nothing new to learn. Order your coffee where you always ordered it. And if you ever fancy trying the bobotie: it is a South African baked dish, it is not spicy, and it is better than it sounds.
`,
    },
  },

  {
    slug: "mede-meegemaakt-door",
    category: "news",
    tags: ["crowdfunding", "CrowdAboutNow", "verbouwing", "dankwoord"],
    publishedDate: "2026-01-18",
    photo: {
      source: "renovations/reno-01.jpg",
      filename: "verbouwing-vloer-achter-de-bar.jpg",
      alt: {
        nl: "De kale vloer achter de bar tijdens de verbouwing, met blootliggende afvoerbuizen en een bezem.",
        en: "The bare floor behind the bar during the renovation, with exposed drain pipes and a broom.",
      },
    },
    nl: {
      title: "Mede meegemaakt door",
      excerpt:
        "Op onze oude website stond een menu-item met deze titel. Je kon erop klikken en dan kreeg je een lege pagina. Dit is die pagina, alsnog: een dankwoord aan iedereen die meebetaalde aan de verbouwing.",
      body: `
Wie de oude website van De Bee's Hive kende, herinnert zich misschien een tabblad in het menu: "Mede Meegemaakt Door". Je kon erop klikken. Dan laadde er een pagina met een menubalk, een footer, en daartussen precies niets.

We hebben hem nooit gevuld. Niet uit onverschilligheid, maar omdat we op dat moment een keuken aan het bouwen waren en de website steeds het ding was dat morgen ook nog kon. Toen kwam de opening, en daarna kwam alles wat na een opening komt.

Bij deze dan alsnog.

## Wat er op die pagina had moeten staan

Een eetcafé overnemen kost meer geld dan een familie die net terug is uit Zuid-Afrika op de plank heeft liggen. Dat verschil hebben we opgehaald via [CrowdAboutNow](https://crowdaboutnow.nl/campagnes/de-bees-hive), een Utrechts crowdfundingplatform waar ondernemers lenen van mensen in plaats van van een loket.

Dat verschil is groter dan het klinkt. Bij een bank teken je iets. Hier moesten we uitleggen wat we van plan waren, aan mensen die daarna zelf besloten of ze dat een goed idee vonden. Een deel van hen kende ons niet. Een deel woont drie straten verderop.

> Verbouwen is voor het grootste deel onzichtbaar werk. Het geld gaat naar dingen waar geen gast ooit naar kijkt.

## Wat dat anders maakt

Een investeerder die tien minuten lopen van je zaak woont, komt langs. Niet om te controleren, gewoon voor een koffie. En dan zit hij aan een tafel die er staat omdat hij heeft meebetaald, en zegt hij daar niets over.

Dat is ongeveer het mooiste dat ons hier is overkomen.

## Dank

Aan iedereen die inlegde: dank. Aan onze vorige huisbaas, die het balletje aan het rollen bracht. Aan de vorige eigenaar, die de overdracht makkelijker maakte dan hij had hoeven doen. En aan de buurt, die binnenliep voordat wij goed en wel wisten wat we aan het doen waren.

Deze pagina is veel te laat. De koffie staat klaar.
`,
    },
    en: {
      title: "Made possible by",
      excerpt:
        "Our old website had a menu item with this title. You could click it and you got an empty page. Here is that page at last: a thank you to everyone who helped pay for the renovation.",
      body: `
Anyone who knew the old De Bee's Hive website may remember a tab in the menu: "Mede Meegemaakt Door" — made possible by. You could click it. What loaded was a page with a navigation bar, a footer, and precisely nothing in between.

We never filled it in. Not out of indifference, but because at that moment we were building a kitchen and the website was the thing that could always wait until tomorrow. Then the opening came, and after that came everything that comes after an opening.

So, belatedly.

## What should have been on that page

Taking over an eetcafé costs more money than a family that has just moved back from South Africa has lying around. We raised the difference through [CrowdAboutNow](https://crowdaboutnow.nl/campagnes/de-bees-hive), a crowdfunding platform based in Utrecht where entrepreneurs borrow from people rather than from a counter.

That difference is bigger than it sounds. At a bank you sign something. Here we had to explain what we intended to do, to people who then decided for themselves whether they thought it was a good idea. Some of them did not know us. Some of them live three streets away.

> A renovation is mostly invisible work. The money goes into things no guest will ever look at.

## What that changes

An investor who lives ten minutes' walk from your business comes in. Not to check up on anything, just for a coffee. And then he sits at a table that exists because he helped pay for it, and says nothing about it.

That is close to the best thing that has happened to us here.

## Thank you

To everyone who put money in: thank you. To our former landlord, who set the whole thing rolling. To the previous owner, who made the handover easier than he needed to. And to the neighbourhood, which walked in before we properly knew what we were doing.

This page is very late. The coffee is ready.
`,
    },
  },

  {
    slug: "wie-er-in-de-keuken-staat",
    category: "stories",
    tags: ["familiebedrijf", "keuken", "verse pasta"],
    publishedDate: "2026-04-12",
    photo: {
      source: "food/food-00.jpg",
      filename: "verse-pasta-aan-het-rek.jpg",
      alt: {
        nl: "Verse pasta die in linten aan een rek hangt te drogen in de keuken.",
        en: "Fresh pasta hanging in ribbons on a drying rack in the kitchen.",
      },
    },
    nl: {
      title: "Wie er in de keuken staat",
      excerpt:
        "Alan kookt vijfenveertig jaar. Sylvia staat er dertig van naast hem. Lesley en Keegan groeiden op tussen de bestellingen door. Vier mensen, één zaak, en geen manager ertussen.",
      body: `
Er zijn restaurants waar je nooit te weten komt wie er gekookt heeft. Dit is er geen van. Als je hier iets eet, is de kans groot dat je die kok diezelfde middag ook achter de bar hebt zien staan.

## Alan

Vijfenveertig jaar chef en restaurateur. Dat is lang genoeg om alles een keer te hebben meegemaakt, en precies lang genoeg om er nog steeds zin in te hebben. Hij maakt de pasta zelf, wat een keuze is die je pas begrijpt zodra je het verschil geproefd hebt.

## Sylvia

Dertig jaar naast hem, in de zaak en daarbuiten. Zij is de Nederlandse helft van dit verhaal en de reden dat wij hier zitten en niet ergens tussen Kaapstad en Johannesburg.

## Lesley en Keegan

Hun kinderen, opgegroeid in de horeca. Dat is een specifieke jeugd: je leert een tafel dekken voordat je leert fietsen, en op je twaalfde zie je aankomen wanneer een bestelling misgaat.

## Wat dat voor jou betekent

Vooral dit: er zit niemand tussen. Als er iets mis is met je bord, vertel je dat niet aan een manager die het doorgeeft. Je vertelt het aan de mensen die het gemaakt hebben, en die repareren het zelf.

Het betekent ook dat we soms met te weinig zijn. Op een volle zaterdag duurt het langer. Dat weten we. Zeg gerust iets als het te lang duurt — dan weten wij het ook.
`,
    },
    en: {
      title: "Who is in the kitchen",
      excerpt:
        "Alan has been cooking for forty-five years. Sylvia has spent thirty of them beside him. Lesley and Keegan grew up between the orders. Four people, one place, and no manager in between.",
      body: `
There are restaurants where you never find out who cooked. This is not one of them. If you eat something here, there is a fair chance you also saw that cook standing behind the bar the same afternoon.

## Alan

Forty-five years as a chef and restaurateur. That is long enough to have seen everything once, and exactly long enough to still want to do it. He makes the pasta himself, which is a decision you only really understand once you have tasted the difference.

## Sylvia

Thirty years beside him, in the business and outside it. She is the Dutch half of this story, and the reason we are here rather than somewhere between Cape Town and Johannesburg.

## Lesley and Keegan

Their children, raised in hospitality. That is a particular sort of childhood: you learn to lay a table before you learn to ride a bike, and by twelve you can see an order going wrong before it does.

## What that means for you

Mostly this: there is nobody in between. If something is wrong with your plate, you are not telling a manager who passes it on. You are telling the people who made it, and they fix it themselves.

It also means we are sometimes short-handed. On a full Saturday things take longer. We know. Say something if the wait gets silly — then we know too.
`,
    },
  },

  {
    slug: "van-koffie-tot-borrel",
    category: "tips",
    tags: ["openingstijden", "koffie", "lunch", "borrel", "diner"],
    publishedDate: "2026-07-05",
    photo: {
      source: "restaurant/20250517_142725.jpg",
      filename: "krijtbord-openingstijden.jpg",
      alt: {
        nl: "Krijtbord met de openingstijden erop geschreven: zaterdag 11:00 t/m 21:00.",
        en: "Chalkboard with the opening hours written on it: Saturday 11:00 to 21:00.",
      },
    },
    nl: {
      title: "Van koffie tot borrel: wat je hier op welk uur kunt doen",
      excerpt:
        "Elf uur 's ochtends tot negen uur 's avonds is een lange dag, en er zitten vier verschillende sferen in. Voor wie zich afvraagt of dit nou een koffiezaak, een lunchplek of een restaurant is: het antwoord is ja.",
      body: `
Mensen die hier voor het eerst binnenlopen stellen bijna altijd dezelfde vraag, meestal na een blik op de bar en dan op de tafels: kan ik hier gewoon koffie drinken? Ja. En om vijf uur kun je aan diezelfde tafel eten. Dat is niet verwarrend bedoeld, dat is hoe een eetcafé werkt.

Hieronder de dag zoals wij hem draaien.

## 11:00 – 12:00 · Koffie, thee en iets zoets

De deur gaat om elf uur open en het eerste uur is rustig. Krant, laptop, of iemand die na de boodschappen even gaat zitten. Er staat gebak, waaronder onze honingcake met crème fraîche en verse bessen.

Dit is het uur waarin een uur over één cappuccino doen niemand tot last is.

## 12:00 – 16:00 · Lunch, en het begin van de borrel

Vanaf twaalf uur draait de keuken. Soep van het seizoen met ons eigen brood, een bruschetta, de bijenkorfsalade met geitenkaas, honing, walnoten en rucola.

Rond een uur of drie kantelt het vanzelf. De lunchborden gaan terug naar binnen, de eerste borrel komt op tafel, en niemand die er iets van zegt als dat om half vier gebeurt.

## 16:00 – 20:00 · Diner

Vanaf vier uur staat de hele kaart open: bobotie, de risotto van het seizoen, slow-cooked beef met de groenten die er die week zijn.

## 20:00 – 21:00 · Nog even zitten

De keuken sluit, de bar niet meteen. Om negen uur doen we de deur dicht.

## Welke dagen

Maandag, donderdag, vrijdag en zaterdag, steeds van 11:00 tot 21:00. Dinsdag en woensdag zijn we dicht. Zondag ook — behalve de laatste zondag van de maand, dan zijn we er wel.

## Moet je reserveren?

Voor koffie en lunch niet. Voor het diner, en zeker op vrijdag en zaterdag, is het verstandig. Dat kan [hier](/reserveren) in een halve minuut, of bel ons op 030 785 2199.
`,
    },
    en: {
      title: "From coffee to borrel: what you can do here, and when",
      excerpt:
        "Eleven in the morning to nine at night is a long day, and there are four different moods in it. For anyone wondering whether this is a coffee place, a lunch spot or a restaurant: the answer is yes.",
      body: `
People walking in for the first time almost always ask the same thing, usually after a glance at the bar and then at the tables: can I just have a coffee here? Yes. And at five o'clock you can eat dinner at that same table. None of that is meant to confuse anybody — it is how an eetcafé works.

Here is the day as we run it.

## 11:00 – 12:00 · Coffee, tea and something sweet

The door opens at eleven and the first hour is quiet. A newspaper, a laptop, somebody sitting down after the shopping. There is cake, including our honey cake with crème fraîche and fresh berries.

This is the hour in which taking an hour over one cappuccino bothers nobody at all.

## 12:00 – 16:00 · Lunch, sliding into drinks

From twelve the kitchen is running. Soup of the season with our own bread, a bruschetta, the hive salad with goat's cheese, honey, walnuts and rocket.

Around three it tips over by itself. The lunch plates go back in, the first drinks come out, and nobody comments if that happens at half past three.

## 16:00 – 20:00 · Dinner

From four the whole menu is open: bobotie, the risotto of the season, slow-cooked beef with whatever vegetables the week has.

## 20:00 – 21:00 · Staying a while longer

The kitchen closes; the bar does not, immediately. At nine we shut the door.

## Which days

Monday, Thursday, Friday and Saturday, each from 11:00 to 21:00. We are closed on Tuesday and Wednesday. Sunday too — except the last Sunday of the month, when we are here.

## Do you need to book?

Not for coffee or lunch. For dinner, and certainly on a Friday or Saturday, it is wise. You can do that [here](/en/reserveren) in about thirty seconds, or call us on 030 785 2199.
`,
    },
  },
];

/** The slugs scripts/seed.ts writes, which these articles are here to replace. */
export const SAMPLE_SLUGS = ["welkom", "seizoensgebonden-koken", "zuid-afrikaanse-smaken"];
