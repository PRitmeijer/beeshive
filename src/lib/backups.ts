import { execFile } from "child_process";
import { promisify } from "util";
import type { Payload } from "payload";

const run = promisify(execFile);

/**
 * What the admin is allowed to know, and to do, about the backups.
 *
 * ops/README.md is the real documentation and ops/backup.sh and ops/restore.sh
 * are the real tools. This file exists because at two in the morning, with the
 * site down, nobody is going to find a shell script in a git repository — they
 * are going to open the admin, because that is the only part of this system
 * they have ever used. So the admin gets to *see* the backups, and to take one,
 * and to be told in plain Dutch exactly what to type to get the data back.
 *
 * ---------------------------------------------------------------------------
 * WHY A RESTORE IS NOT AN ACTION HERE, AND WILL NOT BECOME ONE
 * ---------------------------------------------------------------------------
 *
 * A restore is not "the opposite of a backup". Taking a backup is additive and
 * online: pgBackRest copies the cluster while it runs, nobody is locked out,
 * and the worst case is a wasted upload. Restoring means stopping the website,
 * stopping PostgreSQL, replacing its entire data directory with the contents of
 * the repository, and replaying write-ahead log until it reaches the chosen
 * moment. Everything written after that moment ceases to exist — this
 * morning's reservations, this week's contact messages, whatever the owners
 * typed in yesterday.
 *
 * An HTTP endpoint that can do that is an HTTP endpoint that can destroy the
 * restaurant's data. It would sit behind the same session cookie as everything
 * else in the admin, on a machine that also receives requests from the public
 * internet, and one stolen laptop, one forgotten logout on a shared computer,
 * or one bug in a future access-control change would be enough. The blast
 * radius is not proportional to the convenience.
 *
 * There is a second, quieter reason. The restore has to stop the very container
 * this code is running in. A request handler cannot outlive `docker compose
 * stop beeshive`, so it would have to spawn something detached to do the work
 * and then report on it blind — and a half-finished restore that nobody is
 * watching is worse than no restore at all.
 *
 * So the panel produces a *command*, pre-filled with the backup label or the
 * point in time that was chosen, with the warnings attached, for a person to
 * paste into a terminal on the server. That person then reads what
 * ops/restore.sh prints before confirming, which is the safety this design is
 * actually buying.
 *
 * ---------------------------------------------------------------------------
 * WHY execFile AND NOT exec
 * ---------------------------------------------------------------------------
 *
 * Everything below runs `execFile` with an argument array. There is no shell,
 * so there is no quoting to get wrong and no `;` or backtick that can turn an
 * argument into a second command. Nothing that reaches the command line comes
 * from a request body either: the stanza name comes from the environment and is
 * checked against a strict pattern anyway, and the only caller-supplied value —
 * the backup type — is matched against a list of three literals before it is
 * used. Point-in-time targets never reach a command line at all; they are
 * formatted into a string for a human to read.
 */

/** Anything else is not a stanza name pgBackRest would accept in the first place. */
const STANZA_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

function stanzaName(): string {
  const configured = process.env.PGBACKREST_STANZA || "beeshive";
  return STANZA_PATTERN.test(configured) ? configured : "beeshive";
}

/**
 * Which binary to run.
 *
 * On the server this is usually nothing at all: the application container is a
 * standalone Next build and has no pgbackrest in it — the binary lives in the
 * database container (which runs `archive_command`) and in the backup container
 * (which takes the backups). That is deliberate and is not a mistake to fix by
 * mounting the data directory into the web container. See ops/pgbackrest-api.md
 * for the two supported ways to give this endpoint something to talk to, and
 * for why the read-only `info` call is the only one that is safe to expose.
 */
function binary(): string {
  return process.env.PGBACKREST_BIN || "pgbackrest";
}

export interface BackupEntry {
  /** e.g. "20260801-031500F" — this is what `--set` wants. */
  label: string;
  type: "diff" | "full" | "incr";
  /** ISO strings; pgBackRest reports unix seconds. */
  startedAt: string;
  finishedAt: string;
  /** Size of the cluster at the time, uncompressed. */
  databaseBytes: number;
  /** What this backup actually costs in the bucket, compressed. */
  repositoryBytes: number;
  /** WAL range this backup needs to be restorable at all. */
  walStart: null | string;
  walStop: null | string;
  error: boolean;
}

export interface BackupInventory {
  available: true;
  stanza: string;
  backups: BackupEntry[];
  /** Repository status as pgBackRest sees it: 0 is "ok". */
  repositoryOk: boolean;
  repositoryMessage: string;
  /** True while a backup is actually running, from pgBackRest's own lock. */
  backupRunning: boolean;
  /**
   * Whether write-ahead-log archiving is currently getting through. This fails
   * independently of the backups and is the failure that ends with a full disk
   * and a database that will not start, so it is reported separately rather
   * than folded into the repository status.
   */
  archiveHealthy: boolean;
  archiveMax: null | string;
  /** Newest full backup, in hours, or null when there has never been one. */
  newestFullAgeHours: null | number;
  /** Newest backup of any kind. */
  newestAgeHours: null | number;
  /**
   * How old the newest full backup is allowed to get before the panel turns
   * red. The scheduler takes one every Sunday (ops/pgbackrest/entrypoint.sh),
   * so anything past nine days means at least one week was missed entirely.
   */
  fullBackupMaxAgeHours: number;
}

export interface BackupsUnavailable {
  available: false;
  /** Written for the owners, in Dutch. */
  reason: string;
  /** For whoever is reading the browser console instead. */
  detail?: string;
}

export type BackupStatus = BackupInventory | BackupsUnavailable;

const FULL_BACKUP_MAX_AGE_HOURS = 9 * 24;

/** The subset of `pgbackrest info --output=json` this code relies on. */
interface RawStanza {
  archive?: { max?: null | string; min?: null | string }[];
  backup?: {
    archive?: { start?: null | string; stop?: null | string };
    error?: boolean;
    info?: {
      size?: number;
      repository?: { size?: number };
    };
    label?: string;
    timestamp?: { start?: number; stop?: number };
    type?: string;
  }[];
  name?: string;
  status?: {
    code?: number;
    lock?: { backup?: { held?: boolean } };
    message?: string;
  };
}

function hoursSince(iso: null | string): null | number {
  if (!iso) return null;
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return (Date.now() - then) / (1000 * 60 * 60);
}

function toIso(seconds: number | undefined): string {
  if (!seconds || Number.isNaN(seconds)) return "";
  return new Date(seconds * 1000).toISOString();
}

function backupType(raw: string | undefined): BackupEntry["type"] {
  return raw === "full" || raw === "diff" || raw === "incr" ? raw : "incr";
}

/**
 * Reads the repository.
 *
 * `pgbackrest info` talks to the bucket, not to the database, so it works on a
 * host where PostgreSQL is not running at all — which is exactly the situation
 * this panel exists for. It is also read-only, which is what makes it the one
 * pgBackRest command worth reaching from a web process.
 */
export async function readBackupStatus(): Promise<BackupStatus> {
  const stanza = stanzaName();

  let stdout: string;
  try {
    const result = await run(
      binary(),
      ["--stanza", stanza, "--output", "json", "info"],
      { timeout: 30_000, maxBuffer: 8 * 1024 * 1024 },
    );
    stdout = result.stdout;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    // ENOENT is by far the most common answer and is not a fault: on a laptop,
    // and in the application container as it is built today, pgbackrest simply
    // is not installed. Saying "not configured" rather than "failed" is the
    // difference between the owners ignoring a red box and ringing somebody.
    if (detail.includes("ENOENT")) {
      return {
        available: false,
        reason:
          "Dit scherm kan de backups niet uitlezen: het programma pgBackRest is "
          + "niet beschikbaar op de server waar de website draait. De backups "
          + "zelf lopen gewoon door. Die worden door een aparte container "
          + "gemaakt. Zie ops/pgbackrest-api.md om dit scherm er wél bij te "
          + "kunnen laten.",
        detail,
      };
    }
    return {
      available: false,
      reason:
        "De backups konden niet worden uitgelezen. Meestal betekent dat dat de "
        + "verbinding met de opslag bij Cloudflare niet werkt, bijvoorbeeld "
        + "omdat de sleutel is verlopen. Kijk in de log van de container "
        + "'beeshive-pgbackrest'.",
      detail,
    };
  }

  let parsed: RawStanza[];
  try {
    parsed = JSON.parse(stdout) as RawStanza[];
  } catch {
    return {
      available: false,
      reason: "De backups konden niet worden uitgelezen: onbegrijpelijk antwoord.",
      detail: stdout.slice(0, 500),
    };
  }

  const entry = parsed.find((item) => item.name === stanza) ?? parsed[0];
  if (!entry) {
    return {
      available: false,
      reason:
        "Er staat nog geen backup-archief in de cloud. Dat is normaal vlak na "
        + "een verhuizing; laat iemand 'ops/backup.sh full' draaien.",
    };
  }

  // Newest first. pgBackRest lists them oldest first, and every question a
  // person has here is about the most recent one.
  const backups: BackupEntry[] = (entry.backup ?? [])
    .map((item) => ({
      label: item.label ?? "",
      type: backupType(item.type),
      startedAt: toIso(item.timestamp?.start),
      finishedAt: toIso(item.timestamp?.stop),
      databaseBytes: item.info?.size ?? 0,
      repositoryBytes: item.info?.repository?.size ?? 0,
      walStart: item.archive?.start ?? null,
      walStop: item.archive?.stop ?? null,
      error: item.error === true,
    }))
    .filter((item) => item.label !== "")
    .sort((a, b) => b.finishedAt.localeCompare(a.finishedAt));

  const newestFull = backups.find((item) => item.type === "full") ?? null;
  const archiveMax = entry.archive?.[0]?.max ?? null;

  return {
    available: true,
    stanza,
    backups,
    repositoryOk: entry.status?.code === 0,
    repositoryMessage: entry.status?.message ?? "onbekend",
    backupRunning: entry.status?.lock?.backup?.held === true,
    // No archived segment at all means archiving has never worked; a repository
    // that pgBackRest itself calls unhealthy means it has stopped working.
    archiveHealthy: Boolean(archiveMax) && entry.status?.code === 0,
    archiveMax,
    newestFullAgeHours: hoursSince(newestFull?.finishedAt ?? null),
    newestAgeHours: hoursSince(backups[0]?.finishedAt ?? null),
    fullBackupMaxAgeHours: FULL_BACKUP_MAX_AGE_HOURS,
  };
}

/**
 * One backup at a time, process-wide.
 *
 * pgBackRest takes its own lock and refuses a second concurrent backup, so this
 * is not what keeps the repository consistent — it is what keeps a person who
 * clicks the button eleven times from starting eleven `pgbackrest` processes,
 * each of which would spend thirty seconds failing to get that lock while
 * holding a request open. The lock is deliberately in module memory: it does
 * not survive a restart, which is correct, because neither does the child
 * process it is protecting.
 */
let inFlight: null | Promise<BackupRunResult> = null;

export interface BackupRunResult {
  ok: boolean;
  /** Dutch, for the panel. */
  message: string;
  detail?: string;
}

export async function takeBackup(type: "diff" | "full"): Promise<BackupRunResult> {
  if (type !== "diff" && type !== "full") {
    return { ok: false, message: "Onbekend soort backup." };
  }

  if (inFlight) {
    return {
      ok: false,
      message: "Er loopt al een backup. Wacht tot die klaar is.",
    };
  }

  const stanza = stanzaName();

  const attempt = (async (): Promise<BackupRunResult> => {
    try {
      await run(
        binary(),
        ["--stanza", stanza, "--type", type, "backup"],
        // A full backup of a small restaurant database is seconds, but the
        // upload to R2 is the slow half and a cold bucket on a bad line is not
        // unheard of. Fifteen minutes, then give up rather than hold a request
        // open forever.
        { timeout: 15 * 60_000, maxBuffer: 8 * 1024 * 1024 },
      );
      return {
        ok: true,
        message:
          type === "full"
            ? "De volledige backup is gemaakt en staat in de cloud."
            : "De backup is gemaakt en staat in de cloud.",
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (detail.includes("ENOENT")) {
        return {
          ok: false,
          message:
            "Deze knop kan hier geen backup starten: pgBackRest draait in een "
            + "andere container. Draai op de server 'ops/backup.sh full'.",
          detail,
        };
      }
      return {
        ok: false,
        message:
          "De backup is niet gelukt. Kijk in de log van de container "
          + "'beeshive-pgbackrest' wat er misging.",
        detail,
      };
    }
  })();

  inFlight = attempt;
  try {
    return await attempt;
  } finally {
    inFlight = null;
  }
}

export function backupIsRunning(): boolean {
  return inFlight !== null;
}

/**
 * Is this a fresh, empty install sitting on top of somebody else's data?
 *
 * This is the case the owner asked about in so many words: "if it's an empty
 * install but it's connected to the R2 then you can just reverse to that". It
 * happens after the server is rebuilt, after `docker compose down -v`, and
 * after a move to another host — the container comes up, Payload runs its
 * migrations against an empty cluster, and the admin greets whoever finds it
 * with a create-your-first-user screen as though the restaurant had no website
 * before today. The data is not gone; it is in the bucket. But nothing on that
 * screen says so, and that is the whole problem.
 *
 * Two signals, either of which is enough. No users at all is the strongest —
 * a working install always has at least one. A site-settings row that has never
 * been written is the second: Payload creates globals lazily, so its absence
 * means nobody has ever opened the settings page.
 *
 * The second signal is not redundancy, it is the one that actually fires. A
 * database with no users at all cannot be looked at from the admin: Payload
 * sends every request to the create-first-user screen, and there is nobody to
 * log in as. What really happens is that whoever found the empty site makes an
 * account — and at that instant the user count is 1, the settings have still
 * never been written, and the warning appears on the first page they see. That
 * is the moment it has to catch, which is why "empty" is an or and not an and.
 */
export interface InstallState {
  empty: boolean;
  users: number;
  hasSettings: boolean;
}

export async function readInstallState(payload: Payload): Promise<InstallState> {
  let users = 0;
  let hasSettings = false;

  try {
    const result = await payload.count({ collection: "users", overrideAccess: true });
    users = result.totalDocs;
  } catch {
    users = 0;
  }

  try {
    const settings = await payload.findGlobal({
      slug: "site-settings",
      depth: 0,
      overrideAccess: true,
    });
    // A global that has never been saved comes back as the defaults with no
    // `updatedAt`, which is the only reliable way to tell "never written" from
    // "written and then emptied".
    hasSettings = Boolean((settings as { updatedAt?: string })?.updatedAt);
  } catch {
    hasSettings = false;
  }

  return { empty: users === 0 || !hasSettings, users, hasSettings };
}

/**
 * The commands the panel shows instead of running.
 *
 * They are built here rather than typed into the component so that the panel,
 * this file and docs/backups.md cannot drift apart, and so that the stanza name
 * is the same one `info` was read with. Each is a single line meant to be
 * pasted into a terminal in the directory that holds docker-compose.yml.
 *
 * The two that need a value the server does not have — a backup label the
 * person picked from the table, a moment they typed — are templates with a
 * placeholder rather than functions, because this whole object crosses to the
 * browser as JSON and a function would arrive as nothing at all. The panel
 * fills them in with `fillCommand` below; the wording stays here.
 */
export interface RestoreCommands {
  /** Newest backup plus every archived WAL segment: "put it back as it was". */
  latest: string;
  /** `{LABEL}` is a backup label out of the inventory table. */
  forLabel: string;
  /** `{TIJD}` is a local time, e.g. 2026-08-01 12:00:00. */
  forTime: string;
  /**
   * The empty-install path, which is a sequence rather than one command: the
   * cluster has to exist before it can be restored into, and it has to be
   * stopped before pgBackRest will touch it.
   */
  ontoEmptyInstall: string[];
}

export const COMMAND_PLACEHOLDER = {
  label: "{LABEL}",
  time: "{TIJD}",
} as const;

export function restoreCommands(stanza = stanzaName()): RestoreCommands {
  return {
    latest: "ops/restore.sh --yes-really",
    forLabel: `ops/restore.sh --set ${COMMAND_PLACEHOLDER.label} --yes-really`,
    forTime: `ops/restore.sh --time "${COMMAND_PLACEHOLDER.time}" --yes-really`,
    ontoEmptyInstall: [
      "docker compose build",
      "docker compose up -d postgres",
      "docker compose stop postgres",
      "docker compose run --rm --no-deps --entrypoint pgbackrest pgbackrest \\",
      `  --stanza=${stanza} --delta --target-action=promote restore`,
      "docker compose up -d",
      "ops/backup.sh full",
    ],
  };
}

/** Substitutes one placeholder. Shared so the panel never composes a command itself. */
export function fillCommand(template: string, placeholder: string, value: string): string {
  return template.split(placeholder).join(value);
}
