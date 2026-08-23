"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Banner, Button, CopyToClipboard, toast } from "@payloadcms/ui";

/**
 * The backups page, as the two owners of a restaurant will meet it.
 *
 * Everything on this page is written for somebody who does not know what a
 * write-ahead log is and should not have to. The technical detail is still
 * there — the labels, the sizes, the WAL range — because whoever they call at
 * two in the morning will need it, but it is never what the page leads with.
 * The page leads with one sentence: is the data safe, yes or no.
 *
 * Three things are worth knowing about how this is built.
 *
 * It is styled with Payload's own CSS custom properties and nothing else. The
 * site's Tailwind is not loaded in the admin — the admin is a separate route
 * group with its own stylesheet — so a `bg-paper-50` here would render as
 * nothing at all, and worse, would render as nothing only in production where
 * the class is purged. `--theme-elevation-*`, `--theme-text` and friends come
 * from @payloadcms/ui and follow the light/dark setting the person chose.
 *
 * It never restores anything, and it is not shy about it. The restore section
 * makes you type HERSTELLEN, and what you get for typing it is a command on
 * your clipboard. src/lib/backups.ts carries the full reasoning; the short
 * version is that a web request that can wipe the database is a bad trade for
 * saving somebody an SSH session once every few years.
 *
 * All timestamps are turned into "3 uur geleden" from the browser's clock, and
 * only after the fetch has returned. Doing it during the first render would be
 * a hydration mismatch — the server renders one minute and the browser another
 * — which is the same trap src/app/(frontend)/[locale]/page.tsx avoids by
 * resolving dates on the server. Here there is no server render worth speaking
 * of: the component mounts empty and fills itself in.
 */

interface BackupEntry {
  label: string;
  type: "diff" | "full" | "incr";
  startedAt: string;
  finishedAt: string;
  databaseBytes: number;
  repositoryBytes: number;
  walStart: null | string;
  walStop: null | string;
  error: boolean;
}

type BackupStatus =
  | {
      available: false;
      reason: string;
      detail?: string;
    }
  | {
      available: true;
      stanza: string;
      backups: BackupEntry[];
      repositoryOk: boolean;
      repositoryMessage: string;
      backupRunning: boolean;
      archiveHealthy: boolean;
      archiveMax: null | string;
      newestFullAgeHours: null | number;
      newestAgeHours: null | number;
      fullBackupMaxAgeHours: number;
    };

interface BackupsResponse {
  status: BackupStatus;
  install: { empty: boolean; users: number; hasSettings: boolean };
  commands: {
    latest: string;
    forLabel: string;
    forTime: string;
    ontoEmptyInstall: string[];
  };
  running: boolean;
}

const CONFIRM_WORD = "HERSTELLEN";

export const BackupPanel: React.FC = () => {
  const [data, setData] = useState<null | BackupsResponse>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [restoreOpen, setRestoreOpen] = useState(false);
  const [chosenLabel, setChosenLabel] = useState("");
  const [chosenTime, setChosenTime] = useState("");
  const [typed, setTyped] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin/backups", {
        credentials: "include",
      });
      if (!response.ok) throw new Error(String(response.status));
      setData((await response.json()) as BackupsResponse);
    } catch {
      setData(null);
      toast.error("De backupgegevens konden niet worden opgehaald.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startBackup = useCallback(
    async (type: "diff" | "full") => {
      if (busy) return;
      setBusy(true);
      toast.info("De backup is gestart. Dit kan een paar minuten duren.");
      try {
        const response = await fetch("/api/admin/backups", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ action: "backup", type }),
        });
        const result = (await response.json()) as {
          error?: string;
          message?: string;
          ok?: boolean;
        };
        if (response.ok && result.ok) {
          toast.success(result.message ?? "De backup is gemaakt.");
        } else {
          toast.error(result.message ?? result.error ?? "De backup is niet gelukt.");
        }
      } catch {
        toast.error("De backup is niet gelukt.");
      } finally {
        setBusy(false);
        void load();
      }
    },
    [busy, load],
  );

  if (loading && !data) {
    return <p style={{ color: muted }}>Bezig met ophalen…</p>;
  }

  if (!data) {
    return (
      <Banner type="error">
        De backupgegevens konden niet worden opgehaald. Probeer de pagina te
        herladen.
      </Banner>
    );
  }

  const { status, install, commands } = data;

  // The one thing the page has to answer, worked out before anything is drawn.
  const stale =
    status.available &&
    (status.newestFullAgeHours === null ||
      status.newestFullAgeHours > status.fullBackupMaxAgeHours);

  return (
    <div style={{ maxWidth: "60rem" }}>
      <h1 style={{ marginBottom: "0.25rem" }}>Backups</h1>
      <p style={{ color: muted, marginTop: 0 }}>
        Een kopie van alles wat in dit beheerpaneel staat — de kaart, de blog, de
        agenda, de reserveringen — wordt elke nacht naar de beveiligde opslag bij
        Cloudflare gestuurd. De foto&apos;s staan daar sowieso al en horen daar
        niet bij.
      </p>

      {install.empty ? <EmptyInstallBlock commands={commands} /> : null}

      {status.available ? (
        <>
          <Section title="Hoe staat het ervoor">
            {stale ? (
              <Banner type="error">
                <strong>Let op.</strong>{" "}
                {status.newestFullAgeHours === null
                  ? "Er is nog nooit een volledige backup gemaakt."
                  : `De laatste volledige backup is ${ago(status.newestFullAgeHours)} gemaakt, en dat is te lang geleden.`}{" "}
                Maak er nu een met de knop hieronder, en laat daarna uitzoeken
                waarom de nachtelijke backup niet is gelukt.
              </Banner>
            ) : (
              <Banner type="success">
                Laatste geslaagde backup:{" "}
                <strong>{ago(status.newestAgeHours)}</strong>. De laatste
                volledige kopie is {ago(status.newestFullAgeHours)} gemaakt.
              </Banner>
            )}

            {!status.archiveHealthy ? (
              <div style={{ marginTop: "0.5rem" }}>
                <Banner type="error">
                  De doorlopende meeschrijving naar de cloud werkt op dit moment
                  niet. Zolang dat zo is kan er alleen worden teruggezet naar het
                  moment van de laatste nachtelijke backup, en niet naar
                  vanmiddag. Dit lost zichzelf niet op — kijk in de log van
                  &lsquo;beeshive-pgbackrest&rsquo;.
                </Banner>
              </div>
            ) : null}

            {!status.repositoryOk ? (
              <div style={{ marginTop: "0.5rem" }}>
                <Banner type="error">
                  De opslag meldt: {status.repositoryMessage}
                </Banner>
              </div>
            ) : null}

            <p style={{ color: muted }}>
              {status.backupRunning
                ? "Er loopt op dit moment een backup."
                : "Er loopt op dit moment geen backup."}
            </p>

            <Button
              buttonStyle="primary"
              disabled={busy || status.backupRunning}
              onClick={() => {
                void startBackup("full");
              }}
            >
              {busy ? "Bezig…" : "Maak nu een backup"}
            </Button>{" "}
            <Button
              buttonStyle="secondary"
              disabled={busy || status.backupRunning}
              onClick={() => {
                void load();
              }}
            >
              Ververs
            </Button>
            <p style={{ color: muted, marginTop: "0.5rem" }}>
              Dit maakt een volledige kopie. De site blijft gewoon werken terwijl
              het gebeurt; niemand merkt er iets van. Doe dit vlak voordat je iets
              gaat veranderen waar je niet zeker van bent.
            </p>
          </Section>

          <Section title="Wat er in de cloud staat">
            <InventoryTable
              backups={status.backups}
              onChoose={(label) => {
                setChosenLabel(label);
                setChosenTime("");
                setRestoreOpen(true);
              }}
            />
          </Section>
        </>
      ) : (
        <Section title="Hoe staat het ervoor">
          <Banner type="info">{status.reason}</Banner>
          <p style={{ color: muted }}>
            Controleer dan op de server zelf of er backups worden gemaakt:
          </p>
          <CommandBlock command="docker compose exec pgbackrest pgbackrest --stanza=beeshive info" />
        </Section>
      )}

      <Section title="Terugzetten">
        <Banner type="error">
          Terugzetten gooit alles weg wat er na het gekozen moment is gebeurd.
          Reserveringen van vandaag, berichten via het contactformulier,
          aanpassingen aan de kaart: alles van ná dat moment is dan verdwenen. De
          site is er een paar minuten uit terwijl het gebeurt.
        </Banner>

        <p>
          Dit scherm zet niets terug. Het maakt de opdracht voor je klaar, en die
          moet iemand op de server zelf uitvoeren — bewust, met de kans om eerst
          te lezen wat er gaat gebeuren. Dat is met opzet zo: een knop op een
          website die de hele database kan wissen, is een knop die de hele
          database kan wissen.
        </p>

        {!restoreOpen ? (
          <Button
            buttonStyle="secondary"
            onClick={() => {
              setRestoreOpen(true);
              setTyped("");
            }}
          >
            Ik wil iets terugzetten
          </Button>
        ) : (
          <RestoreForm
            chosenLabel={chosenLabel}
            chosenTime={chosenTime}
            commands={commands}
            onCancel={() => {
              setRestoreOpen(false);
              setTyped("");
            }}
            onTime={setChosenTime}
            onTyped={setTyped}
            typed={typed}
          />
        )}
      </Section>

      <Section title="Wat gebeurt er als ik dit doe">
        <ol style={{ color: muted, lineHeight: 1.6, paddingLeft: "1.2rem" }}>
          <li>De website gaat uit. Bezoekers zien hem een paar minuten niet.</li>
          <li>De database gaat uit.</li>
          <li>
            De hele inhoud van de database wordt vervangen door de kopie uit de
            cloud, en daarna wordt alles wat er daarna nog gebeurd is opnieuw
            afgespeeld tot aan het moment dat je hebt gekozen.
          </li>
          <li>Database en website gaan weer aan.</li>
          <li>
            Er wordt meteen een nieuwe volledige backup gemaakt, want vanaf nu is
            dit de stand van zaken.
          </li>
        </ol>
        <p style={{ color: muted }}>
          De foto&apos;s worden hierbij niet aangeraakt. Die staan bij Cloudflare
          en blijven precies waar ze zijn.
        </p>
      </Section>
    </div>
  );
};

/* ------------------------------------------------------------------ pieces */

const muted = "var(--theme-elevation-600)";

const Section: React.FC<{ children: React.ReactNode; title: string }> = ({
  children,
  title,
}) => (
  <section
    style={{
      border: "1px solid var(--theme-elevation-150)",
      borderRadius: "var(--style-radius-m, 4px)",
      padding: "calc(var(--base) * 0.75)",
      marginTop: "var(--base)",
      background: "var(--theme-elevation-0)",
    }}
  >
    <h2 style={{ fontSize: "1.1rem", marginTop: 0 }}>{title}</h2>
    {children}
  </section>
);

/**
 * The block that only ever appears on a server that has just been rebuilt.
 *
 * This is the thing the owner asked for in so many words, and it is the reason
 * the whole page exists. A fresh container with an empty database and a bucket
 * full of backups looks, from the admin, exactly like a brand new website — and
 * the natural reaction to that is to start retyping the menu. So the page says,
 * before anything else on it, that the data is not gone and where it is.
 */
const EmptyInstallBlock: React.FC<{ commands: BackupsResponse["commands"] }> = ({
  commands,
}) => (
  <div style={{ marginTop: "var(--base)" }}>
    <Banner type="error">
      <strong>Er staat een backup in de cloud.</strong> Deze installatie is leeg —
      er staat nog geen inhoud in. Als dit een nieuwe of opnieuw opgebouwde
      server is, hoef je niets opnieuw in te typen: alles staat nog in de
      beveiligde opslag bij Cloudflare en kan worden teruggezet.
    </Banner>
    <p style={{ color: muted }}>
      Laat iemand met toegang tot de server het volgende doen, in de map waar
      docker-compose.yml staat. Doe dit vóórdat er iemand in dit paneel begint te
      typen — wat er nu wordt ingevoerd, wordt door het terugzetten weer
      weggegooid.
    </p>
    <CommandBlock command={commands.ontoEmptyInstall.join("\n")} />
    <p style={{ color: muted }}>
      Zorg dat het bestand <code>.env</code> op de nieuwe server staat, en dan
      vooral <code>PGBACKREST_CIPHER_PASS</code>. Zonder dat wachtwoord is de
      backup in de cloud niet te openen, door niemand, ook niet door Cloudflare.
    </p>
  </div>
);

const InventoryTable: React.FC<{
  backups: BackupEntry[];
  onChoose: (label: string) => void;
}> = ({ backups, onChoose }) => {
  if (backups.length === 0) {
    return (
      <Banner type="error">
        Er staat nog geen enkele backup in de opslag. Maak er nu een.
      </Banner>
    );
  }

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            {["Wanneer", "Soort", "Grootte", "Kenmerk", ""].map((head) => (
              <th
                key={head}
                style={{
                  borderBottom: "1px solid var(--theme-elevation-150)",
                  color: muted,
                  fontWeight: 500,
                  padding: "0.4rem 0.6rem 0.4rem 0",
                  textAlign: "left",
                }}
              >
                {head}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {backups.map((backup) => (
            <tr key={backup.label}>
              <td style={cell}>
                {formatMoment(backup.finishedAt)}
                <div style={{ color: muted }}>{ago(hoursSince(backup.finishedAt))}</div>
              </td>
              <td style={cell}>{typeInDutch(backup.type)}</td>
              <td style={cell}>
                {bytes(backup.repositoryBytes)}
                <div style={{ color: muted }}>
                  database {bytes(backup.databaseBytes)}
                </div>
              </td>
              <td style={{ ...cell, fontFamily: "monospace" }}>
                {backup.label}
                {backup.error ? (
                  <div style={{ color: "var(--theme-error-500)" }}>
                    met fouten gemaakt
                  </div>
                ) : null}
              </td>
              <td style={cell}>
                <Button
                  buttonStyle="secondary"
                  onClick={() => onChoose(backup.label)}
                  size="small"
                >
                  Naar hier terug
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const cell: React.CSSProperties = {
  borderBottom: "1px solid var(--theme-elevation-100)",
  padding: "0.5rem 0.6rem 0.5rem 0",
  verticalAlign: "top",
};

/**
 * The two-step confirmation.
 *
 * Step one is opening this at all. Step two is typing HERSTELLEN, which is a
 * word nobody types by accident and which cannot be produced by a mis-click.
 * What it unlocks is the command, not the restore — the point of the friction
 * is to make sure the person reading the warnings is the same person who is
 * about to run it.
 */
const RestoreForm: React.FC<{
  chosenLabel: string;
  chosenTime: string;
  commands: BackupsResponse["commands"];
  onCancel: () => void;
  onTime: (value: string) => void;
  onTyped: (value: string) => void;
  typed: string;
}> = ({ chosenLabel, chosenTime, commands, onCancel, onTime, onTyped, typed }) => {
  const unlocked = typed.trim().toUpperCase() === CONFIRM_WORD;

  // The two placeholders are the ones `COMMAND_PLACEHOLDER` in
  // src/lib/backups.ts defines. They are repeated as literals here rather than
  // imported because that module reaches for child_process and belongs on the
  // server; the wording of every command still lives there, and only the
  // substitution happens on this side.
  const command = chosenTime.trim()
    ? commands.forTime.split("{TIJD}").join(chosenTime.trim())
    : chosenLabel
      ? commands.forLabel.split("{LABEL}").join(chosenLabel)
      : commands.latest;

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <p>
        {chosenTime.trim() ? (
          <>
            Terugzetten naar de stand van <strong>{chosenTime.trim()}</strong>.
          </>
        ) : chosenLabel ? (
          <>
            Terugzetten naar de backup met kenmerk{" "}
            <strong style={{ fontFamily: "monospace" }}>{chosenLabel}</strong>.
          </>
        ) : (
          <>Terugzetten naar de nieuwste backup, met alles wat daarna nog is bijgehouden.</>
        )}
      </p>

      <label style={{ display: "block", marginBottom: "0.75rem" }}>
        <span style={{ color: muted, display: "block" }}>
          Of kies een moment (jaar-maand-dag uur:minuut:seconde), bijvoorbeeld
          2026-08-01 12:00:00. Laat leeg om een hele backup uit de lijst te
          gebruiken.
        </span>
        <input
          onChange={(event) => onTime(event.target.value)}
          placeholder="2026-08-01 12:00:00"
          style={input}
          type="text"
          value={chosenTime}
        />
      </label>

      <label style={{ display: "block", marginBottom: "0.75rem" }}>
        <span style={{ display: "block" }}>
          Typ het woord <strong>{CONFIRM_WORD}</strong> om de opdracht te laten
          zien.
        </span>
        <input
          onChange={(event) => onTyped(event.target.value)}
          style={input}
          type="text"
          value={typed}
        />
      </label>

      {unlocked ? (
        <>
          <p style={{ color: muted }}>
            Voer dit uit op de server, in de map waar docker-compose.yml staat.
            De opdracht laat eerst zien wat er in de opslag zit en wat er
            overschreven wordt; lees dat voordat je verder gaat.
          </p>
          <CommandBlock command={command} />
        </>
      ) : null}

      <Button buttonStyle="secondary" onClick={onCancel} size="small">
        Annuleren
      </Button>
    </div>
  );
};

const input: React.CSSProperties = {
  background: "var(--theme-input-bg)",
  border: "1px solid var(--theme-elevation-150)",
  borderRadius: "var(--style-radius-s, 3px)",
  color: "var(--theme-text)",
  marginTop: "0.25rem",
  padding: "0.4rem 0.5rem",
  width: "100%",
};

const CommandBlock: React.FC<{ command: string }> = ({ command }) => (
  <div
    style={{
      alignItems: "flex-start",
      background: "var(--theme-elevation-50)",
      border: "1px solid var(--theme-elevation-150)",
      borderRadius: "var(--style-radius-s, 3px)",
      display: "flex",
      gap: "0.5rem",
      justifyContent: "space-between",
      margin: "0.5rem 0",
      padding: "0.6rem",
    }}
  >
    <pre
      style={{
        fontFamily: "monospace",
        margin: 0,
        overflowX: "auto",
        whiteSpace: "pre",
      }}
    >
      {command}
    </pre>
    <CopyToClipboard
      defaultMessage="Kopieer"
      successMessage="Gekopieerd"
      value={command}
    />
  </div>
);

/* ------------------------------------------------------------- formatting */

function hoursSince(iso: string): null | number {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return null;
  return (Date.now() - then) / (1000 * 60 * 60);
}

/**
 * "3 uur geleden".
 *
 * Rounded generously on purpose: the difference between 71 and 73 hours is not
 * information anyone here can use, and "3 dagen geleden" is a sentence somebody
 * can act on where a timestamp is not.
 */
function ago(hours: null | number): string {
  if (hours === null) return "nooit";
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(hours * 60));
    return minutes === 1 ? "1 minuut geleden" : `${minutes} minuten geleden`;
  }
  if (hours < 36) {
    const rounded = Math.round(hours);
    return rounded === 1 ? "1 uur geleden" : `${rounded} uur geleden`;
  }
  const days = Math.round(hours / 24);
  return days === 1 ? "1 dag geleden" : `${days} dagen geleden`;
}

function formatMoment(iso: string): string {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "onbekend";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "long",
    timeZone: "Europe/Amsterdam",
    year: "numeric",
  }).format(when);
}

function bytes(value: number): string {
  if (!value) return "—";
  const units = ["B", "kB", "MB", "GB", "TB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size >= 10 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`;
}

function typeInDutch(type: BackupEntry["type"]): string {
  if (type === "full") return "volledig";
  if (type === "diff") return "verschil";
  return "aanvulling";
}
