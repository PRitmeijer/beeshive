"use client";

import React, { useEffect, useState } from "react";
import { useConfig } from "@payloadcms/ui";

/**
 * "Vertalingen" in the admin sidebar: how much English is still missing, and
 * where.
 *
 * CopyToLocale solves the problem at the point of use — you are looking at a
 * blog post, you press a button, the Dutch text comes across. What it cannot
 * do is tell anybody that there are eleven other posts in the same state,
 * because the admin has no view that knows the difference between a document
 * with no English text and one that simply has short English text. Payload's
 * fallback makes that deliberately invisible: every page on the English site
 * looks finished whether it was translated or not, which is the right choice
 * for visitors and a terrible one for the person who has to keep track.
 *
 * So this asks the same endpoint the copy button posts to, in its GET form,
 * for a count per collection, and renders the ones that are not zero as links
 * into that collection with `?locale=en` already set. It is a nudge, not a
 * task list — there is no "mark as done", because "done" is a judgement about
 * words that no count can make.
 *
 * It renders nothing at all when everything is translated, when the scan fails,
 * and while it is still loading. A sidebar that flickers a spinner on every
 * page load in the admin would be a worse thing than the problem it solves.
 *
 * Registered in `admin.components.afterNavLinks`; see docs/backups.md for the
 * exact entry.
 */

interface MissingEntry {
  slug: string;
  label: string;
  missing: number;
}

export const LocaleAssist: React.FC = () => {
  const [entries, setEntries] = useState<MissingEntry[]>([]);
  // A client component in afterNavLinks gets no ServerProps, so the admin route
  // comes from the client config rather than from the Payload instance the way
  // AgendaNavLink reads it.
  const { config } = useConfig();
  const adminRoute = config.routes?.admin || "/admin";

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/admin/locale-copy?from=nl&to=en", {
          credentials: "include",
        });
        if (!response.ok) return;
        const data = (await response.json()) as { collections?: MissingEntry[] };
        if (!cancelled) setEntries(data.collections ?? []);
      } catch {
        // Silent on purpose: see the note above.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (entries.length === 0) return null;

  return (
    <div style={{ marginTop: "var(--base)" }}>
      <div
        style={{
          color: "var(--theme-elevation-500)",
          fontSize: "0.8rem",
          letterSpacing: "0.04em",
          marginBottom: "0.35rem",
          textTransform: "uppercase",
        }}
      >
        Vertalingen
      </div>
      <div
        style={{
          color: "var(--theme-elevation-500)",
          fontSize: "0.8rem",
          marginBottom: "0.5rem",
        }}
      >
        Hier staat nog geen Engelse tekst:
      </div>
      {entries.map((entry) => (
        <a
          className="nav__link"
          href={`${adminRoute}/collections/${entry.slug}?locale=en`}
          key={entry.slug}
          style={{ display: "flex", gap: "0.5rem", justifyContent: "space-between" }}
        >
          <span className="nav__link-label">{entry.label}</span>
          <span style={{ color: "var(--theme-elevation-500)" }}>{entry.missing}</span>
        </a>
      ))}
    </div>
  );
};
