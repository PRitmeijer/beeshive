#!/usr/bin/env node
//
// Refuse to start when the database carries a dev-push marker, instead of
// starting and hanging forever.
//
// Payload writes a row into `payload_migrations` with name 'dev' and batch -1
// whenever it pushes the schema straight from the collections, which is what
// it does whenever NODE_ENV is not 'production' — every one of the
// `npm run db:*` scripts, in other words, including the import and the verify
// the deploy runbook tells you to run against the production database. On the
// next connect Payload sees that row and asks, on stdin, whether it should run
// the migrations anyway. There is no terminal in a container, so nothing
// answers, and the promise behind `getPayload()` never settles.
//
// What that looks like from outside is the reason this file exists. The
// process stays alive, Next has already bound the port, and every prerendered
// page goes on answering 200 with the HTML built into the image — permanently
// `x-nextjs-cache: STALE`. `docker compose ps` reports healthy. Only the
// routes that must reach the CMS hang, and those are the ones that take
// bookings. A deploy can look completely successful and serve a restaurant
// that accepts nothing, with nothing in the log to say why.
//
// ops/warm-up.sh notices this after the fact and says so; this runs before
// `node server.js` and stops it happening. Two belts, deliberately: the
// warm-up catches the case where Payload is stuck for some other reason, and
// this catches the one cause we can name in advance and name loudly.
//
// The rule it works to is that a check must never be the reason a healthy
// deploy fails. Only one outcome exits non-zero — the marker is there, we read
// it ourselves, and we are certain. Every other outcome, including a database
// this cannot reach at all, prints its reason and exits 0: the application has
// its own reconnect loop and the compose healthcheck already gates the
// container on Postgres accepting connections, so refusing to start over a
// connection we could not make would invent an outage rather than prevent one.

// Operator-facing output is Dutch; the two owners and whoever is standing next
// to them during a deploy read this, and a container log is not the place to
// make somebody translate an emergency. The commands and the file names are
// what they are.
const say = (line) => console.log(line === "" ? "" : `preflight: ${line}`);

if (process.env.PREFLIGHT === "off") {
  say("uitgezet met PREFLIGHT=off, controle overgeslagen.");
  process.exit(0);
}

const connectionString = process.env.DATABASE_URI;
if (!connectionString) {
  say("DATABASE_URI is niet gezet; niets om te controleren.");
  say("De applicatie klaagt hier zelf over zodra ze de database nodig heeft.");
  process.exit(0);
}

// `pg` arrives in the image through @payloadcms/db-postgres and lands in the
// standalone output's own node_modules, so a bare import from /app resolves it
// — verified against .next/standalone, where it is pg 8.20.0. It is imported
// dynamically all the same: if a future build ever traced it away, the right
// answer is to say so and start the server, not to take the site down over a
// missing check.
let pg;
try {
  pg = (await import("pg")).default;
} catch {
  say("het pg-pakket zit niet in deze image; controle overgeslagen.");
  say("Zonder pg kan deze controle niets nakijken. ops/warm-up.sh merkt het");
  say("probleem dan alsnog op na de start, zie DEPLOY.md.");
  process.exit(0);
}

// How long to keep trying to connect before giving up and starting anyway.
// compose waits for the Postgres healthcheck before it starts this container,
// so one attempt is usually enough; the retries are for the restart after a
// host reboot, where both containers come up at once.
const WAIT_SECONDS = Number(process.env.PREFLIGHT_WAIT_SECONDS ?? 20);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The rows Payload would stop on: batch -1, whatever they are called.
 *
 * Keyed on the batch rather than the name because that is what
 * @payloadcms/drizzle keys on — `migrationsInDB.find((m) => m.batch === -1)`.
 * A row named something else with that batch stops the site just as dead, and
 * a delete written against the name would leave it there.
 *
 * Returns null when the table does not exist yet, which is a fresh database
 * with nothing to be wrong about. The existence check is a separate statement
 * on purpose: Postgres parses a whole statement before it runs any of it, so
 * naming a missing table inside a CASE fails exactly as loudly as naming it
 * on its own.
 */
async function findMarkers(client) {
  const { rows: table } = await client.query(
    "select to_regclass('payload_migrations') is not null as present",
  );
  if (!table[0]?.present) return null;

  const { rows } = await client.query(
    "select name from payload_migrations where batch = -1 order by name",
  );
  return rows.map((row) => row.name);
}

const deadline = Date.now() + WAIT_SECONDS * 1000;
let markers;
let lastError;

for (;;) {
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: 5000,
    application_name: "beeshive-preflight",
  });
  try {
    await client.connect();
    markers = await findMarkers(client);
    lastError = undefined;
    break;
  } catch (err) {
    lastError = err;
  } finally {
    await client.end().catch(() => {});
  }

  if (Date.now() >= deadline) break;
  await sleep(2000);
}

if (lastError) {
  say(`database niet bereikbaar: ${lastError.message}`);
  say("Controle overgeslagen. Dit is op zichzelf geen reden om niet te");
  say("starten. De applicatie probeert zelf opnieuw te verbinden en compose");
  say("wacht al op de healthcheck van Postgres.");
  process.exit(0);
}

if (markers === null) {
  say("payload_migrations bestaat nog niet; verse database, niets te melden.");
  process.exit(0);
}

if (markers.length === 0) {
  say("geen dev-push-markering in payload_migrations. Doorstarten.");
  process.exit(0);
}

const named = markers.map((name) => `'${name ?? "(zonder naam)"}'`).join(", ");

say("");
say(`STOP. Deze database draagt een dev-push-markering (${named}).`);
say("");
say("Wat het is. In payload_migrations staat een rij met batch -1. Payload zet");
say("die neer zodra het schema rechtstreeks vanuit de collecties gepusht is,");
say("en dat doet elk npm run db:*-script, omdat geen daarvan NODE_ENV op");
say("production zet. Een database die net door de import en de verify is");
say("gegaan, heeft die rij dus.");
say("");
say("Wat het met de site doet. Payload ziet de rij zodra het verbindt en");
say("vraagt op de terminal of het de migraties alsnog mag draaien. In een");
say("container is er geen terminal, dus antwoordt niemand en komt Payload");
say("nooit voorbij die vraag. Next heeft de poort dan al open: elke");
say("voorgerenderde pagina blijft 200 antwoorden met de HTML uit het image,");
say("docker compose ps zegt healthy, en alles wat de CMS echt nodig heeft");
say("blijft hangen: reserveringen, het contactformulier, de meldingsbalk, de");
say("admin. De site lijkt te draaien en neemt geen enkele boeking aan.");
say("");
say("Er zijn twee uitwegen.");
say("");
say("1. Haal de rij weg. Dat mag als het schema van npm run migrate komt en de");
say("   migratierij er nog boven staat, want dan kloppen de migraties en de");
say("   tabellen werkelijk met elkaar:");
say("");
say('     docker compose exec postgres psql -U beeshive -d beeshive -c \\');
say('       "SELECT id, name, batch FROM payload_migrations ORDER BY id;"');
say('     docker compose exec postgres psql -U beeshive -d beeshive -c \\');
say('       "DELETE FROM payload_migrations WHERE batch = -1;"');
say("");
say("   Weet je niet waar dat schema vandaan komt, haal de rij dan niet weg.");
say("   Zoek eerst uit wat er gepusht heeft.");
say("");
say("2. Accepteer de push en draai de migraties met de hand, vanaf een checkout");
say("   met de Payload-CLI erin, in een echte terminal die de vraag kan");
say("   beantwoorden:");
say("");
say("     npm run migrate");
say("");
say("DEPLOY.md, onder 'When the container comes up healthy and serves nothing");
say("new', schrijft allebei uit en zegt wanneer weghalen niet veilig is.");
say("");
say("De container stopt nu met code 1 en Docker herstart hem, dus deze melding");
say("komt terug tot de markering weg is. Dat is de bedoeling: liever een");
say("container die zichtbaar niet start dan een die healthy heet en niets doet.");
say("PREFLIGHT=off slaat deze controle over.");
say("");

process.exit(1);
