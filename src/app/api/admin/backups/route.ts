import { NextResponse, type NextRequest } from "next/server";
import { getPayloadClient } from "@/lib/payload";
import { readJsonBody, str } from "@/lib/apiGuard";
import {
  backupIsRunning,
  readBackupStatus,
  readInstallState,
  restoreCommands,
  takeBackup,
} from "@/lib/backups";

/**
 * The data behind /admin/backups.
 *
 * GET answers "is our data safe" and POST answers "make me a copy right now".
 * There is no third verb, and src/lib/backups.ts explains at length why a
 * restore will never be one: this endpoint is reachable with a session cookie
 * from the public internet, and a restore wipes the database. The panel gets a
 * command to copy instead.
 *
 * Both verbs require a logged-in Payload user, and the GET does too — the
 * inventory names the stanza, the size of the database and the times the
 * server is unattended at night, which is not a thing to hand to anyone who
 * finds the URL.
 *
 * Nothing here is cached. A page about whether the backups are working must
 * never show a reassuring answer from ten minutes ago.
 */
export const dynamic = "force-dynamic";

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === request.nextUrl.host;
  } catch {
    return false;
  }
}

export async function GET(request: NextRequest) {
  const payload = await getPayloadClient();
  const { user } = await payload.auth({ headers: request.headers });
  if (!user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  // Deliberately sequential rather than Promise.all: `readBackupStatus` shells
  // out and `readInstallState` hits the database, and doing both at once on a
  // container that is already struggling — which is when this page gets opened
  // — buys nothing worth the contention.
  const status = await readBackupStatus();
  const install = await readInstallState(payload);

  return NextResponse.json({
    status,
    install,
    // Sent even when the inventory could not be read. On a rebuilt server that
    // is precisely the combination — no pgbackrest reachable from the web
    // container, an empty database, and a bucket full of backups — where the
    // restore command is the only thing on the page anybody needs.
    commands: restoreCommands(),
    running: backupIsRunning(),
  });
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) {
    return NextResponse.json({ error: "Ongeldige aanvraag" }, { status: 403 });
  }

  const payload = await getPayloadClient();
  const { user } = await payload.auth({ headers: request.headers });
  if (!user) {
    return NextResponse.json({ error: "Niet ingelogd" }, { status: 401 });
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return NextResponse.json({ error: body.error }, { status: body.status });
  }

  // One action, matched against a literal. There is no route from a request
  // body to a command line here and there is not meant to be one.
  const action = str(body.data.action, 32);
  if (action !== "backup") {
    return NextResponse.json(
      { error: "Alleen 'backup' kan vanaf hier gestart worden." },
      { status: 400 },
    );
  }

  const type = str(body.data.type, 8);
  if (type !== "full" && type !== "diff") {
    return NextResponse.json(
      { error: "Kies 'full' of 'diff'." },
      { status: 400 },
    );
  }

  if (backupIsRunning()) {
    // 409 rather than 429: this is not "too often", it is "that is already
    // happening", and the panel says so in those words.
    return NextResponse.json(
      { error: "Er loopt al een backup. Wacht tot die klaar is." },
      { status: 409 },
    );
  }

  const result = await takeBackup(type);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
