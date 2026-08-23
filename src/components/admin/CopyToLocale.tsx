"use client";

import React, { useCallback, useMemo, useState } from "react";
import { Banner, Button, toast, useConfig, useDocumentInfo, useLocale } from "@payloadcms/ui";

/**
 * "Vertalingen" — the panel that turns the two-save dance into one button.
 *
 * Dropped at the top of a document as a `ui` field (see the snippet at the
 * bottom of docs/backups.md and the note in this component's own comment
 * below), it answers the question the owners actually have when they open the
 * English tab of something they just wrote: do I have to type all of this
 * again? No — press the button and the Dutch text is copied across, and only
 * into the fields that are still empty, so nothing anybody translated is
 * thrown away.
 *
 * It is written the way it is for one reason worth stating: the direction is
 * always *into the locale you are looking at*. An editor who has just switched
 * to English sees "Neem de Nederlandse tekst over in het Engels" and the result
 * lands in front of them; the reverse button appears by itself when they switch
 * back to Dutch, because then Dutch is the target. Offering both directions at
 * once reads as a choice, and the wrong choice quietly overwrites the language
 * that was finished.
 *
 * The page is reloaded rather than patched into the form state afterwards. The
 * edit view holds its own copy of every field, and a copy that changed twelve
 * of them across three tabs cannot be reconciled with that without knowing more
 * about Payload's form internals than is wise to depend on. The cost is that
 * unsaved edits are lost, which is why the panel says so out loud before the
 * button rather than after it.
 *
 * Registering it, on a collection or a tab:
 *
 *     {
 *       name: "vertalingen",
 *       type: "ui",
 *       admin: { components: { Field: "@/components/admin/CopyToLocale#CopyToLocale" } },
 *     }
 */

interface CopyResponse {
  filled?: string[];
  kept?: string[];
  error?: string;
}

export const CopyToLocale: React.FC = () => {
  const { id, collectionSlug, globalSlug } = useDocumentInfo();
  const locale = useLocale();
  const { config } = useConfig();

  const [busy, setBusy] = useState(false);
  const [overwrite, setOverwrite] = useState(false);

  /**
   * Every configured locale except the one being edited. With two languages
   * this is a single button; the loop is here so a third language does not
   * need this file reopened.
   */
  const sources = useMemo(() => {
    const locales = config.localization ? config.localization.locales : [];
    return locales
      .filter((entry) => entry.code !== locale?.code)
      .map((entry) => ({ code: entry.code, label: labelOf(entry) }));
  }, [config.localization, locale?.code]);

  const targetLabel = useMemo(() => {
    const locales = config.localization ? config.localization.locales : [];
    const current = locales.find((entry) => entry.code === locale?.code);
    return current ? labelOf(current) : (locale?.code ?? "");
  }, [config.localization, locale?.code]);

  const run = useCallback(
    async (from: string) => {
      if (busy) return;

      // Overwriting is the one irreversible thing this panel can do, so it is
      // confirmed here as well as being a deliberate tick of the box. Two
      // gestures for a destructive action, one for a safe one.
      if (overwrite) {
        const sure = window.confirm(
          "Alles overschrijven?\n\nDe tekst die er nu in deze taal staat wordt "
          + "vervangen door de vertaling uit de andere taal. Dit kan niet "
          + "ongedaan gemaakt worden.",
        );
        if (!sure) return;
      }

      setBusy(true);
      try {
        const response = await fetch("/api/admin/locale-copy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            collection: collectionSlug,
            global: globalSlug,
            id,
            from,
            to: locale?.code,
            overwrite,
          }),
        });

        const data = (await response.json()) as CopyResponse;

        if (!response.ok) {
          toast.error(data.error ?? "Overnemen is niet gelukt.");
          setBusy(false);
          return;
        }

        const filled = data.filled?.length ?? 0;
        if (filled === 0) {
          toast.info(
            "Er was niets over te nemen — alle velden waren hier al ingevuld.",
          );
          setBusy(false);
          return;
        }

        toast.success(
          filled === 1
            ? "Eén veld overgenomen. De pagina wordt opnieuw geladen."
            : `${filled} velden overgenomen. De pagina wordt opnieuw geladen.`,
        );
        // A full reload rather than router.refresh(): the form keeps its own
        // state and would otherwise show the old, empty fields over the new
        // saved ones.
        window.location.reload();
      } catch {
        toast.error("Overnemen is niet gelukt. Is de verbinding weggevallen?");
        setBusy(false);
      }
    },
    [busy, collectionSlug, globalSlug, id, locale?.code, overwrite],
  );

  // Nothing to copy into or out of before the document exists: a brand new
  // document has no id, and its other locale cannot hold anything yet.
  if (!globalSlug && !id) return null;
  if (sources.length === 0) return null;

  return (
    <div
      style={{
        border: "1px solid var(--theme-elevation-150)",
        borderRadius: "var(--style-radius-m, 4px)",
        padding: "calc(var(--base) * 0.75)",
        marginBottom: "var(--base)",
        background: "var(--theme-elevation-50)",
      }}
    >
      <h4 style={{ margin: "0 0 0.25rem" }}>Vertalingen</h4>
      <p style={{ margin: "0 0 0.75rem", color: "var(--theme-elevation-600)" }}>
        Je bewerkt nu de <strong>{targetLabel}</strong> versie. Teksten worden per
        taal apart bewaard — foto&apos;s, datums en vinkjes niet, die gelden voor
        allebei. Sla je eigen wijzigingen eerst op: hieronder klikken laadt de
        pagina opnieuw.
      </p>

      {sources.map((source) => (
        <div key={source.code} style={{ marginBottom: "0.5rem" }}>
          <Button
            buttonStyle="secondary"
            disabled={busy}
            onClick={() => {
              void run(source.code);
            }}
            size="small"
          >
            {busy
              ? "Bezig…"
              : `Neem de ${sourceInDutch(source.code, source.label)} tekst over in het ${targetInDutch(locale?.code, targetLabel)}`}
          </Button>
        </div>
      ))}

      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.4rem",
          marginTop: "0.5rem",
          color: "var(--theme-elevation-600)",
        }}
      >
        <input
          checked={overwrite}
          disabled={busy}
          onChange={(event) => setOverwrite(event.target.checked)}
          type="checkbox"
        />
        Ook velden overschrijven die hier al ingevuld zijn
      </label>

      {overwrite ? (
        <div style={{ marginTop: "0.5rem" }}>
          <Banner type="error">
            Let op: hiermee gaat de vertaling die er nu staat verloren.
          </Banner>
        </div>
      ) : null}
    </div>
  );
};

/**
 * A locale's label can be a plain string or a per-admin-language map. Only the
 * string form is used here — the map form would need the admin's own interface
 * language to index it, and the two sentence helpers below already spell out
 * the languages this site actually has.
 */
function labelOf(entry: { code: string; label: Record<string, string> | string }): string {
  return typeof entry.label === "string" ? entry.label : entry.code;
}

/**
 * The two grammatical forms Dutch needs for this sentence.
 *
 * "Neem de Nederlandse tekst over in het Engels" — the source takes the
 * adjective form and the target takes "het". Payload's locale labels are nouns
 * ("Nederlands", "English"), which fit neither slot, so the two known languages
 * are spelled out and anything else falls back to the label as given rather
 * than to a sentence that reads like a machine wrote it.
 */
function sourceInDutch(code: string, label: string): string {
  if (code === "nl") return "Nederlandse";
  if (code === "en") return "Engelse";
  return label;
}

function targetInDutch(code: string | undefined, label: string): string {
  if (code === "nl") return "Nederlands";
  if (code === "en") return "Engels";
  return label;
}
