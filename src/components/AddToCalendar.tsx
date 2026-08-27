import { AddToCalendarTracker } from "@/components/AddToCalendarTracker";
import { getDict } from "@/i18n/dictionaries";
import { defaultLocale, type Locale } from "@/i18n/config";
import { googleCalendarUrl, outlookCalendarUrl, type IcsEvent } from "@/lib/ics";

/**
 * The four ways an event gets into somebody's calendar.
 *
 * Deliberately not a client component. It has no state and no handlers — four
 * links and a drawn mark — and keeping it on the server keeps @/lib/ics out of
 * the browser bundle entirely. A client component that wants one takes it as a
 * ReactNode prop from the page above it, which is exactly what the guest pass
 * does; see the `calendar` prop on <GuestPassClient>.
 *
 * Two of the four go to the same URL, and that is not an oversight. Apple's
 * calendar has no web endpoint to hand an event to the way Google and Outlook
 * do: it subscribes to a file. So "Apple Agenda" and "los bestand" are the
 * same .ics served from the same place, named separately because a guest on an
 * iPhone is looking for the word Apple and not for a file extension.
 *
 * And that file comes from `icsHref`, an endpoint, rather than from a blob or
 * a `data:` URL built here. This control is opened from inside WhatsApp more
 * often than from a real browser, and those in-app browsers block a
 * script-driven download; iOS additionally refuses `data:text/calendar`
 * outright. A plain link to a URL that answers with `Content-Type:
 * text/calendar` and a `Content-Disposition` header is the only shape all of
 * them hand to the calendar app — which is also why there is no `download`
 * attribute here: the header does that job, and on the phones that matter the
 * attribute is ignored anyway.
 *
 * Having no handlers does not mean having no measurement. <AddToCalendarTracker>
 * is a few lines of client component wrapped around these links that hears
 * their clicks as they bubble past, so these four are counted as
 * `outbound_clicked { kind: "calendar", target }` — `target` being the key
 * below — without @/lib/ics following it into the browser.
 */

interface AddToCalendarProps {
  /** The event itself. Google and Outlook build their URLs straight from it. */
  event: IcsEvent;
  /**
   * Where the .ics is served from. Must be a URL the browser can simply visit;
   * see the note above about blobs.
   */
  icsHref: string;
  locale?: Locale;
  className?: string;
}

/** A leaf torn off a wall calendar, drawn on the same grid as <CraftIcon>. */
function CalendarMark() {
  return (
    <svg
      viewBox="0 0 32 32"
      width={18}
      height={18}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className="shrink-0"
    >
      <path d="M5.4 9.2 C11.8 8.4 20.4 8.5 26.7 9.1 L26.2 25.8 C20.1 26.6 11.6 26.5 5.7 25.9 Z" />
      <path d="M5.6 14.1 C12 13.4 20.5 13.5 26.5 14" />
      <path d="M11.1 5.6 L10.8 11.2" />
      <path d="M21.2 5.5 L20.9 11.1" />
    </svg>
  );
}

export function AddToCalendar({
  event,
  icsHref,
  locale = defaultLocale,
  className = "",
}: AddToCalendarProps) {
  const t = getDict(locale).guestPass;

  // The keys are also what the click is reported as, which is why the fourth
  // is `ics` and not `download`: the event page has been sending those five
  // words to Umami since before this control existed, and one vocabulary read
  // across two pages is worth more than a key that matches its own label.
  const options = [
    { key: "apple", label: t.calendar.apple, href: icsHref },
    { key: "google", label: t.calendar.google, href: googleCalendarUrl(event) },
    { key: "outlook", label: t.calendar.outlook, href: outlookCalendarUrl(event) },
    { key: "ics", label: t.calendar.download, href: icsHref },
  ];

  return (
    // The guest pass is the only page that offers this control, so it names
    // itself here rather than through a prop nobody would ever pass twice;
    // when a second page wants one, that is the moment to lift it.
    <AddToCalendarTracker source="guest-pass" className={className}>
      <h2 className="label flex items-center gap-2">
        <CalendarMark />
        {t.addToCalendar}
      </h2>
      <div className="rule-ink mt-3 w-10" aria-hidden="true" />
      <ul className="mt-4 grid grid-cols-2 gap-2">
        {options.map((option) => (
          <li key={option.key}>
            <a
              href={option.href}
              data-calendar-target={option.key}
              // The two external ones open a booking screen on someone else's
              // site; a new tab keeps this page where the guest left it.
              target={option.href === icsHref ? undefined : "_blank"}
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center rounded-[2px] border border-hive-700/20
                         px-3 py-2.5 text-center font-display text-[0.72rem] font-semibold uppercase
                         tracking-label text-hive-600 transition-colors duration-300 ease-settle
                         hover:bg-hive-700 hover:text-paper active:translate-y-px"
            >
              {option.label}
            </a>
          </li>
        ))}
      </ul>
    </AddToCalendarTracker>
  );
}
