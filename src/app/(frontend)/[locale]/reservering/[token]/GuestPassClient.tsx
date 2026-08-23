"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { LogoSvg } from "@/components/LogoSvg";
import { Sheet } from "@/components/Sheet";
import { TornEdge } from "@/components/TornEdge";
import { getDict } from "@/i18n/dictionaries";
import type { Locale } from "@/i18n/config";
import type { GuestResponseView, GuestPassView } from "@/lib/guestPass";
import { EVENTS, track } from "@/lib/umami";

/**
 * The guest pass as the party reads it.
 *
 * Almost every visit to this page starts with a tap inside WhatsApp, on a
 * phone, in a hallway, while putting a coat on. So it is one column all the
 * way down, in the order somebody actually wants it: what and when, then into
 * the calendar, then how to get there, then pass it on, and only at the bottom
 * the optional business of saying what you do not eat.
 *
 * There is no motion in here at all. Everything else on the site fades its
 * sections in, but this one is read once, quickly, on a connection that is
 * whatever the pub's wifi is doing, and an animation between the reader and
 * the address is not a kindness. It also keeps the page clear of
 * useReducedMotion(), which is null until hydration and is the usual way a
 * component like this ends up rendering differently on the two sides.
 *
 * Nothing sensitive can reach this file: it is typed against GuestPassView,
 * which is what src/lib/guestPass.ts lets through, and that shape has no
 * e-mail address, no phone number, no notes and no surname in it to render
 * even by accident.
 */

// Must stay in step with `bg-paper-deep` in tailwind.config.ts: a torn edge is
// the incoming section's fill painted into the outgoing one.
const PAPER_DEEP = "#E8E2D4";
const LIP_LIGHT = "rgba(255,255,255,0.5)";
/** `hive-700`, the heading ink. The logo defaults to cream, for dark grounds. */
const HEADING_INK = "#422810";

interface Props {
  locale: Locale;
  /** From the URL, not from the document: the page never echoes the secret. */
  token: string;
  view: GuestPassView;
  /** Decided on the server, against the café's own clock. */
  isPast: boolean;
  shareUrl: string;
  siteName: string;
  addressLines: string[];
  phone: string;
  mapsGoogleUrl: string;
  mapsAppleUrl: string;
  dietaryOptions: string[];
  drinkOptions: string[];
  formEnabled: boolean;
  /** <AddToCalendar>, rendered on the server so @/lib/ics stays off the wire. */
  calendar: ReactNode;
}

/** What this browser last sent, so a second visit offers an edit, not a copy. */
interface Remembered {
  /**
   * The endpoint's proof that this phone wrote one of the rows: a signature
   * over that row, handed back in the POST response and stored nowhere else.
   * Never the row's own id — those run consecutively, so holding one would be
   * a licence to edit the answer next to it. See `responseEditKey` in
   * src/lib/guestPass.ts.
   */
  responseKey: string | null;
  name: string;
  dietary: string[];
  drinks: string[];
}

const EMPTY: Remembered = {
  responseKey: null,
  name: "",
  dietary: [],
  drinks: [],
};

/** Same letterpress rule as every other field on the site. */
const fieldClass =
  "mt-2 block w-full rounded-none border-0 border-b border-hive-700/25 bg-transparent " +
  "px-0 py-3 font-body text-hive-700 placeholder:text-hive-300/70 outline-none " +
  "transition-colors duration-300 ease-settle " +
  "focus:border-honey-400 focus:shadow-[inset_0_-2px_0_0_#B4735E]";

/**
 * A ticked box, drawn rather than the browser's own. The real input is still
 * there and still focusable — it is only moved out of sight, so the keyboard
 * and the screen reader get the checkbox they expect while the page gets a
 * mark in the same ink as everything else.
 */
function PickList({
  legend,
  hint,
  options,
  picked,
  onToggle,
}: {
  legend: string;
  hint: string;
  options: string[];
  picked: string[];
  onToggle: (option: string) => void;
}) {
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <p className="mt-2 text-sm text-hive-400">{hint}</p>
      <ul className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        {options.map((option) => (
          <li key={option}>
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={picked.includes(option)}
                onChange={() => onToggle(option)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-[2px]
                           border border-hive-700/25 transition-colors duration-200 ease-settle
                           peer-checked:border-clay-500 peer-checked:bg-clay-500
                           peer-checked:[&_svg]:opacity-100
                           peer-focus-visible:ring-2 peer-focus-visible:ring-honey-400"
              >
                <svg
                  viewBox="0 0 12 12"
                  width="11"
                  height="11"
                  fill="none"
                  stroke="#F1ECE1"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  focusable="false"
                  className="opacity-0 transition-opacity duration-200"
                >
                  <path d="M2 6.3 L4.7 9 L10 3.2" />
                </svg>
              </span>
              <span className="text-[0.95rem] leading-snug text-hive-600">
                {option}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

export function GuestPassClient({
  locale,
  token,
  view,
  isPast,
  shareUrl,
  siteName,
  addressLines,
  phone,
  mapsGoogleUrl,
  mapsAppleUrl,
  dietaryOptions,
  drinkOptions,
  formEnabled,
  calendar,
}: Props) {
  const dict = getDict(locale);
  const t = dict.guestPass;

  // No properties at all. The token is the one thing this page has that
  // nothing else does, and it is exactly the thing that must never leave it —
  // a token in an analytics property is the reservation handed to a third
  // party. That the page was opened is the whole measurement.
  useEffect(() => {
    track(EVENTS.guestPassOpened);
  }, []);

  const [responses, setResponses] = useState<GuestResponseView[]>(
    view.responses,
  );
  const [remembered, setRemembered] = useState<Remembered | null>(null);
  const [draft, setDraft] = useState<Remembered>(EMPTY);
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [error, setError] = useState(t.error);
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<number | null>(null);

  /**
   * Which of these phones has already answered is a fact about the phone, not
   * about the reservation, so it lives in localStorage rather than on the
   * document. Read after mount and never during render: the server has no
   * localStorage, and a value that appears out of one mid-render is precisely
   * the sort of thing that hydrates into a mismatch.
   */
  const storageKey = `beeshive:guest-pass:${token}`;
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<Remembered>;
      if (typeof parsed?.name !== "string" || !parsed.name) return;
      const saved: Remembered = {
        // Anything stored by an older version of this page held the row id
        // under another name; it is not read, so that guest is offered a fresh
        // line rather than an edit. One retyped answer, once.
        responseKey:
          typeof parsed.responseKey === "string" ? parsed.responseKey : null,
        name: parsed.name,
        dietary: Array.isArray(parsed.dietary) ? parsed.dietary : [],
        drinks: Array.isArray(parsed.drinks) ? parsed.drinks : [],
      };
      setRemembered(saved);
      setDraft(saved);
    } catch {
      // Private browsing throws on localStorage. Forgetting is a fine outcome:
      // the worst that happens is the guest is asked their name again.
    }
  }, [storageKey]);

  useEffect(
    () => () => {
      if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    },
    [],
  );

  /**
   * "Zaterdag 12 september 2026", written out of the dictionary rather than
   * through Intl, so the server and the browser produce the same string to the
   * character. The year is always there: this is a single evening being read
   * out of a chat message, with nothing around it to date it.
   */
  const dateLabel = (iso: string): string => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
    const d = new Date(`${iso}T12:00:00.000Z`);
    const weekday = dict.weekdays[(d.getUTCDay() + 6) % 7];
    const month = dict.months[d.getUTCMonth()];
    return `${weekday} ${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
  };

  const toggle = (key: "dietary" | "drinks") => (option: string) =>
    setDraft((prev) => ({
      ...prev,
      [key]: prev[key].includes(option)
        ? prev[key].filter((item) => item !== option)
        : [...prev[key], option],
    }));

  /**
   * navigator.clipboard needs a secure context and a permission the in-app
   * browsers do not always grant. The old selection trick is deprecated and
   * still the only thing that works in a WebView that refuses the modern one,
   * so it stays as the fallback rather than the guest being told "copy failed".
   */
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      const field = document.createElement("textarea");
      field.value = shareUrl;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      try {
        document.execCommand("copy");
      } catch {
        // Nothing left to try. The link is on screen and selectable.
      }
      document.body.removeChild(field);
    }
    setCopied(true);
    if (copyTimer.current !== null) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopied(false), 2500);
  };

  /** The endpoint answers with a code, so the wording comes from here. */
  const messageFrom = (data: unknown): string => {
    const code =
      data && typeof data === "object"
        ? (data as { error?: unknown }).error
        : undefined;
    if (code === "full") return t.full;
    if (code === "nameRequired") return t.nameRequired;
    return t.error;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft.name.trim()) {
      setError(t.nameRequired);
      setStatus("error");
      return;
    }
    setStatus("sending");
    try {
      const res = await fetch("/api/guest-pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          responseKey: draft.responseKey ?? undefined,
          name: draft.name,
          dietary: draft.dietary,
          drinks: draft.drinks,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        responseKey?: string | null;
        responses?: GuestResponseView[];
      } | null;

      if (!res.ok) {
        setError(messageFrom(data));
        setStatus("error");
        return;
      }

      const saved: Remembered = {
        ...draft,
        name: draft.name.trim(),
        responseKey: data?.responseKey ?? draft.responseKey ?? null,
      };
      setResponses(data?.responses ?? responses);
      setRemembered(saved);
      setDraft(saved);
      setEditing(false);
      setStatus("sent");
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(saved));
      } catch {
        // See above: forgetting only costs the guest a retyped name.
      }
    } catch {
      setError(t.error);
      setStatus("error");
    }
  };

  const cancelled = view.status === "geannuleerd";
  const notice = cancelled ? t.cancelledNotice : isPast ? t.pastNotice : null;
  // An evening that is over or called off is not asking anyone anything. The
  // endpoint refuses these too; this only keeps the page honest about it.
  const canJoin = formEnabled && !cancelled && !isPast;
  const showForm = canJoin && (editing || !remembered);

  // First names only, on both sides, so this is a match on what is shown.
  const myFirstName = (remembered?.name ?? "").trim().split(/\s+/)[0] ?? "";
  const mineIndex = myFirstName
    ? responses.findIndex(
        (r) => r.name.toLowerCase() === myFirstName.toLowerCase(),
      )
    : -1;

  return (
    <>
      {/* ===== The sheet itself ===== */}
      <section className="relative overflow-hidden bg-paper">
        <div className="mx-auto w-full max-w-2xl px-6 pb-16 pt-28 md:px-10 md:pt-32">
          <LogoSvg
            width={150}
            height={87}
            fill={HEADING_INK}
            className="-ml-1"
          />
          <p className="label mt-8">{t.heading}</p>
          <div className="rule-ink my-4 w-14" aria-hidden="true" />
          <h1 className="heading-lg text-hive-800">
            {t.subheading(view.firstName)}
          </h1>
          {notice ? (
            <p className="mt-6 max-w-prose font-display text-[0.95rem] italic leading-relaxed text-clay-600">
              {notice}
            </p>
          ) : null}
        </div>
        <TornEdge
          color={PAPER_DEEP}
          lip={LIP_LIGHT}
          variant={0}
          className="absolute inset-x-0 bottom-0 z-20"
        />
      </section>

      <section className="section-padding relative overflow-hidden bg-paper-deep">
        <div className="mx-auto max-w-2xl space-y-14">
          {/* ===== When, where, how many ===== */}
          <Sheet tone="paper" edge="soft">
            <div className="px-6 py-10 md:px-10 md:py-12">
              <dl className="space-y-7">
                <div>
                  <dt className="label">{t.whenLabel}</dt>
                  <dd className="menu-row mt-2">
                    <span className="menu-name">{dateLabel(view.date)}</span>
                    {view.time ? (
                      <span className="menu-price figures-old">
                        {view.time}
                      </span>
                    ) : null}
                  </dd>
                </div>

                <div className="rule-ink w-full" aria-hidden="true" />

                <div>
                  <dt className="label">{t.whereLabel}</dt>
                  <dd className="mt-2">
                    <span className="menu-name">{siteName}</span>
                    <address className="menu-desc not-italic">
                      {addressLines.map((line) => (
                        <span key={line} className="block">
                          {line}
                        </span>
                      ))}
                    </address>
                  </dd>
                </div>

                <div className="rule-ink w-full" aria-hidden="true" />

                <div className="menu-row">
                  <dt className="label self-center">{t.guestsLabel}</dt>
                  <dd className="menu-price figures-old">
                    {view.guests === null ? "—" : t.guestsValue(view.guests)}
                  </dd>
                </div>

                <div className="menu-row">
                  <dt className="label self-center">{t.statusLabel}</dt>
                  <dd className="menu-price">{t.status[view.status]}</dd>
                </div>

                <div className="menu-row">
                  <dt className="label self-center">{t.nameLabel}</dt>
                  <dd className="menu-price">{view.firstName}</dd>
                </div>
              </dl>
            </div>
          </Sheet>

          {/* ===== Into the calendar ===== */}
          {calendar}

          {/* ===== Getting there ===== */}
          <div>
            <h2 className="label">{t.directions}</h2>
            <div className="rule-ink mt-3 w-10" aria-hidden="true" />
            <div className="mt-4 flex flex-wrap items-center gap-x-8 gap-y-3">
              <a
                href={mapsGoogleUrl}
                onClick={() =>
                  track(EVENTS.directionsClicked, { source: "guest-pass-google" })
                }
                target="_blank"
                rel="noopener noreferrer"
                className="ink-link"
              >
                {t.directionsGoogle}
              </a>
              <a
                href={mapsAppleUrl}
                onClick={() =>
                  track(EVENTS.directionsClicked, { source: "guest-pass-apple" })
                }
                target="_blank"
                rel="noopener noreferrer"
                className="ink-link"
              >
                {t.directionsApple}
              </a>
              {phone ? (
                <a
                  href={`tel:${phone.replace(/\s/g, "")}`}
                  onClick={() => track(EVENTS.phoneClicked)}
                  className="ink-link"
                >
                  {t.callUs}
                </a>
              ) : null}
            </div>
          </div>

          {/* ===== Passing it on ===== */}
          <div>
            <h2 className="label">{t.shareHeading}</h2>
            <div className="rule-ink mt-3 w-10" aria-hidden="true" />
            <p className="mt-4 leading-relaxed text-hive-500">{t.shareHint}</p>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={copyLink}
                className="btn-secondary"
                // The change of word is the whole feedback, so it has to be
                // announced rather than only seen.
                aria-live="polite"
              >
                {copied ? t.copied : t.copyLink}
              </button>
              <a
                // wa.me rather than whatsapp://, because this same link has to
                // work when the page is opened on a laptop with WhatsApp Web.
                href={`https://wa.me/?text=${encodeURIComponent(
                  t.whatsAppMessage(siteName, shareUrl),
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
              >
                {t.shareWhatsApp}
              </a>
            </div>
          </div>

          {/* ===== Are you coming too? ===== */}
          {canJoin ? (
            <div>
              <h2 className="label">{t.joinHeading}</h2>
              <div className="rule-ink mt-3 w-10" aria-hidden="true" />

              {showForm ? (
                <form onSubmit={handleSubmit} className="mt-5 space-y-8">
                  <p className="leading-relaxed text-hive-500">{t.joinHint}</p>

                  <div>
                    <label htmlFor="guest-name" className="label block">
                      {t.yourName}
                    </label>
                    <input
                      id="guest-name"
                      name="name"
                      type="text"
                      required
                      maxLength={60}
                      autoComplete="given-name"
                      value={draft.name}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, name: e.target.value }))
                      }
                      className={fieldClass}
                    />
                  </div>

                  {/* An empty list in the CMS is the owners saying "do not ask
                      this", so the whole block goes rather than an empty one
                      being drawn. */}
                  {dietaryOptions.length > 0 ? (
                    <PickList
                      legend={t.dietaryHeading}
                      hint={t.dietaryHint}
                      options={dietaryOptions}
                      picked={draft.dietary}
                      onToggle={toggle("dietary")}
                    />
                  ) : null}

                  {drinkOptions.length > 0 ? (
                    <PickList
                      legend={t.drinksHeading}
                      hint={t.drinksHint}
                      options={drinkOptions}
                      picked={draft.drinks}
                      onToggle={toggle("drinks")}
                    />
                  ) : null}

                  <div className="flex flex-wrap items-center gap-4 pt-1">
                    <button
                      type="submit"
                      disabled={status === "sending"}
                      className="btn-primary disabled:opacity-50"
                    >
                      {status === "sending"
                        ? t.submitting
                        : remembered
                          ? t.update
                          : t.submit}
                    </button>
                    {editing ? (
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(remembered ?? EMPTY);
                          setEditing(false);
                          setStatus("idle");
                        }}
                        className="ink-link text-sm"
                      >
                        {t.editCancel}
                      </button>
                    ) : null}
                  </div>

                  {status === "error" ? (
                    <p role="alert" className="text-sm text-clay-600">
                      {error}
                    </p>
                  ) : null}
                </form>
              ) : (
                <div className="mt-5" role="status">
                  <p className="font-display text-xl text-hive-700">
                    {status === "sent" ? t.thanks : t.alreadyJoined}
                  </p>
                  <p className="mt-2 max-w-prose leading-relaxed text-hive-500">
                    {t.thanksBody}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(true);
                      setStatus("idle");
                    }}
                    className="ink-link mt-4 text-sm"
                  >
                    {t.edit}
                  </button>
                </div>
              )}
            </div>
          ) : null}

          {/* ===== Who is coming ===== */}
          <div>
            <h2 className="label">{t.attending}</h2>
            <div className="rule-ink mt-3 w-10" aria-hidden="true" />
            {responses.length === 0 ? (
              <p className="mt-4 italic leading-relaxed text-hive-400">
                {t.noneYet}
              </p>
            ) : (
              <ul className="mt-5 space-y-5">
                {responses.map((response, index) => {
                  const picks = [...response.dietary, ...response.drinks];
                  return (
                    <li key={`${response.name}-${index}`}>
                      <p className="menu-name">
                        {response.name}
                        {index === mineIndex ? (
                          <span className="ml-2 font-body text-[0.7rem] uppercase tracking-label text-honey-600">
                            {t.you}
                          </span>
                        ) : null}
                      </p>
                      <p className="menu-desc">
                        {picks.length > 0 ? picks.join(" · ") : t.nothingPicked}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <p className="text-sm italic leading-snug text-hive-400">
            {t.privacyNote}
          </p>
        </div>
      </section>
    </>
  );
}
