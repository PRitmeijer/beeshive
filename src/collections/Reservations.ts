import type { CollectionConfig, Payload } from "payload";
import { siteUrl } from "@/i18n/config";
import {
  emailErrorField,
  emailSentAtField,
  emailStateField,
  outboundEmailFields,
  sendOnChange,
  SKIP_OUTBOUND_EMAIL,
  type EmailFieldNames,
} from "@/lib/outboundEmail";
import { newGuestToken } from "@/lib/guestToken";
/*
 * Safe to import from here, and deliberately so. The cycle this file already
 * documents further down runs guestPass -> @/lib/payload -> the config -> this
 * file, and it exists because those modules fetch a Payload instance of their
 * own. @/lib/guestHistory does not: it is handed one, which is what the two
 * exported functions take as their second argument, so its only imports are a
 * type from the `payload` package and @/lib/openingHours, which imports
 * nothing at all. Nothing here reaches back round to the config.
 */
import { historyFor } from "@/lib/guestHistory";
/*
 * Safe for the same reason as the line above, and then some: @/lib/openingHours
 * imports nothing whatsoever, which is precisely why the booking rules live
 * there. Only the grid is wanted here — see the `time` field's own validate.
 */
import { isOnGrid, SLOT_MINUTES_CHOICES } from "@/lib/openingHours";
/*
 * Safe for the same reason, and written to stay that way: the confirmation
 * mail is handed a Payload instance instead of fetching one, so its only
 * imports are @/i18n/config and @/i18n/dictionaries, neither of which knows
 * this file exists. It is where the guest-facing words live, and the words are
 * the one thing the owners are most likely to ask to change.
 */
import {
  AUTO_CONFIRM,
  confirmationBody,
  CONFIRMATION_MAIL_RELEASED,
  effectiveConfirmationMode,
  confirmationSubject,
  DEFAULT_CONFIRMATION_MODE,
  type ConfirmationMode,
} from "@/lib/reservationMail";

/**
 * The finest grid the CMS can be set to, which is the one this collection has
 * to accept. Read off the list rather than typed as fifteen, so adding a
 * ten-minute option to Site Instellingen widens this field in the same edit
 * instead of turning every booking on the new grid into a 500.
 */
const FINEST_SLOT_MINUTES = Math.min(...SLOT_MINUTES_CHOICES);

/**
 * Reservation requests coming in from the public form.
 *
 * These are requests, not confirmed bookings: the owners call or mail every
 * guest back themselves, and only then move the status along. That is what the
 * café does today and what a fresh install does, but it is now a setting and
 * not a law — Site Instellingen -> Reserveren -> Bevestigingsmail aan de gast
 * has an "automatisch" on it, and with that chosen a booking arrives already at
 * Bevestigd because the seat count has already said yes. Every rule below is
 * written to hold in both worlds; where one of them turns on which world it is,
 * it says so.
 *
 * Access is deliberately lopsided. Anyone may create (the form is public and
 * unauthenticated), but reading, editing and deleting is staff only, since a
 * row holds a name, an e-mail address and a phone number.
 */

interface Reservation {
  id: number | string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  date?: string | null;
  time?: string | null;
  guests?: number | null;
  notes?: string | null;
  /** The owners' own line to the party. Read by the confirmation mail, which
   *  prints it as a paragraph of its own. */
  guestNote?: string | null;
  guestToken?: string | null;
  /** The language the guest booked in; see the field for why it is stored. */
  locale?: string | null;
}

/**
 * The three columns the guest's confirmation keeps its bookkeeping in.
 *
 * A second trio, next to the owners' `emailStatus` / `emailError` /
 * `emailSentAt`, because these are two different messages to two different
 * people and either can fail on its own. One shared set of fields would mean
 * the confirmation quietly overwriting the record of whether the owners were
 * ever told about the booking in the first place.
 */
const CONFIRMATION_FIELDS: EmailFieldNames = {
  status: "confirmationEmailStatus",
  error: "confirmationEmailError",
  sentAt: "confirmationEmailSentAt",
};

/**
 * When the guest is written to, as the CMS has it at this moment.
 *
 * Read at the moment of sending rather than remembered from the save that armed
 * the mail. Switching the setting off therefore reaches the confirmations that
 * are already queued as well as the ones that are not, which is what an owner
 * who has just switched it off would expect it to mean.
 *
 * A settings global that cannot be read falls back the way `confirmationMode()`
 * says every unknown falls back: to "approval", the mode that waits for a
 * human. Worth saying out loud, because in this one spot the fallback has a
 * direction — a database having a bad minute sends a confirmation that a café
 * on "off" did not want. The other way round is worse in the far commoner case:
 * failing to "off" would settle the row at "Niet verstuurd" for the café that
 * never touched the setting at all, and a guest who is never told their table
 * is ready is the exact failure this whole feature exists to prevent. A mail
 * that slips out in "off" is at least true — somebody pressed Bevestigd for it.
 */
async function confirmationModeNow(payload: Payload): Promise<ConfirmationMode> {
  try {
    const settings = await payload.findGlobal({
      slug: "site-settings",
      depth: 0,
      overrideAccess: true,
    });
    return effectiveConfirmationMode(
      settings as { reservationConfirmationMode?: string | null },
    );
  } catch (error) {
    console.error("site settings unavailable for confirmation mode", error);
    return DEFAULT_CONFIRMATION_MODE;
  }
}

/**
 * Where the notification goes. Read out of the CMS every time rather than
 * baked in, so the owners can redirect it themselves (Site Instellingen ->
 * Contact) without a deploy.
 */
async function ownersAddress(payload: Payload): Promise<string> {
  try {
    const settings = await payload.findGlobal({
      slug: "site-settings",
      overrideAccess: true,
    });
    const email = (settings as { contactEmail?: string | null })?.contactEmail;
    return email || "info@debeeshive.nl";
  } catch {
    return "info@debeeshive.nl";
  }
}

/** The stored date is midday UTC; the owners only ever want the day itself. */
const dayOf = (value?: string | null) => (value ? String(value).slice(0, 10) : "-");

/**
 * The one sentence the notification mail carries about the guest themselves.
 *
 * It counts reservations and says so, which is narrower than it looks and
 * deliberately so. What the guest book can prove is that this address or this
 * number booked a table before; whether anybody sat at it, and whether these
 * same people walked in on a Tuesday without booking at all, it has no idea.
 * So the line no longer claims a first visit — plenty of first-time bookers
 * have been at the bar for years — and leaves the owners to draw their own
 * conclusion from a number that is actually true.
 *
 * Every failure mode still gets its own wording rather than being folded into
 * "nee", because this sentence is acted on. "We could not look it up" and
 * "there is nothing to look up" both have to survive the trip to the inbox as
 * themselves, or the mail quietly turns a doubt into a fact.
 *
 * The date is left as a plain YYYY-MM-DD to match the `Datum:` line three rows
 * above it; the sidebar badge in the admin is where it is spelled out in Dutch,
 * because that is read rather than scanned.
 */
async function reservationLine(
  doc: Reservation,
  payload: Payload,
): Promise<string> {
  if (!doc.email?.trim() && !doc.phone?.trim()) {
    return "niet na te gaan, er staat geen e-mailadres en geen telefoonnummer bij";
  }
  try {
    const history = await historyFor(
      { id: doc.id, email: doc.email, phone: doc.phone, date: doc.date },
      payload,
    );
    if (history.isFirstReservation) {
      return "nee";
    }
    const count =
      history.priorReservations === 1
        ? "1 eerdere reservering"
        : `${history.priorReservations} eerdere reserveringen`;
    const before = history.lastReservation
      ? `, de laatste op ${history.lastReservation}`
      : "";
    const how =
      history.matchedOn === "phone" ? " (herkend aan het telefoonnummer)" : "";
    return `ja, ${count}${before}${how}`;
  } catch (error) {
    // Never worth losing the whole notification over. The booking is the point
    // of this mail; the greeting is a courtesy on top of it.
    console.error("guest history unavailable for reservation mail", error);
    return "niet opgezocht, de eerdere reserveringen waren even niet te lezen";
  }
}

export const Reservations: CollectionConfig = {
  slug: "reservations",
  labels: {
    singular: "Reserveringsaanvraag",
    plural: "Reserveringsaanvragen",
  },
  access: {
    // Closed even to anonymous creates. Public create would also open Payload's
    // own POST /api/reservations, and that endpoint skips every check in
    // /api/reserve: no honeypot, no past-date rule, no length caps. The route
    // writes through the local API, which bypasses access by design, so the
    // form keeps working and the REST endpoint stays shut.
    create: () => false,
    // Guest data: never readable or mutable without a login.
    read: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user),
  },
  admin: {
    useAsTitle: "name",
    // "time" sits beside "date" because an upcoming list without the hour is
    // half a list — and because within one day the order is arbitrary (see the
    // note in UpcomingFilter.tsx about why sort=date,time is a trap), so the
    // column is the only honest way to see which table comes first.
    defaultColumns: [
      "name",
      "date",
      "time",
      "guests",
      "status",
      // "Bevestigd" answers whether the table is held; the confirmation's own
      // status answers whether the guest has been told so, and those two stopped
      // being the same question when the mail was built. It belongs here, beside
      // the status — but only once the mail is part of a release. While it is
      // held back it would be a column of "Nog niet bevestigd" on every row, for
      // something switched off. Put it back next to "status" when
      // CONFIRMATION_MAIL_RELEASED goes true.
      ...(CONFIRMATION_MAIL_RELEASED ? ["confirmationEmailStatus"] : []),
      "createdAt",
    ],
    /**
     * "Vanaf vandaag" en "Alle aanvragen", boven de tabel.
     *
     * Dit staat opzettelijk NIET in `admin.baseListFilter`. Zo'n basisfilter
     * wordt stilletjes met een `and` aan de zoekopdracht geplakt en bereikt de
     * browser nooit — het staat in Payload's eigen
     * ServerOnlyCollectionAdminProperties. De eigenaren zouden veertig regels
     * zien, eronder "1-10 van 40", en geen enkele manier hebben om te
     * ontdekken dat er nog driehonderd bestaan. Erger nog: "selecteer alles"
     * bouwt zijn eigen zoekopdracht uit de URL, dus een verwijderactie zou
     * rijen raken die nooit op het scherm hebben gestaan.
     *
     * Deze component zet het filter daarom in de URL, waar het te zien en weg
     * te klikken is. Payload's filterpaneel klapt er vanzelf voor open, omdat
     * de vorm where[or][0][and][0] precies is wat validateWhereQuery
     * accepteert. De volledige redenering staat in het bestand zelf.
     *
     * `beforeListTable` en niet `Description`: die laatste vervangt de
     * beschrijving hieronder in plaats van er iets aan toe te voegen. En
     * beforeListTable is het enige slot dat óók getekend wordt als de tabel
     * leeg is — precies het moment waarop er iets uitgelegd moet worden.
     *
     * Zoals alles hier moet de regel ook in
     * src/app/(payload)/admin/importMap.js staan. Draai
     * `npm run generate:importmap` na een wijziging.
     */
    components: {
      beforeListTable: ["@/components/admin/UpcomingFilter#UpcomingFilter"],
    },
    description:
      "Aanvragen die via het reserveringsformulier binnenkomen. Een aanvraag is nog geen bevestiging: bel of mail de gast en zet daarna de status. Staat de bevestigingsmail bij Site Instellingen op meteen versturen, dan bevestigen aanvragen zichzelf en komen ze al op Bevestigd binnen.",
    group: "Gasten",
  },
  hooks: {
    beforeChange: [
      ({ data, operation }) => {
        // Minted once, at the very beginning, because the token is what the
        // guest link is made of: handing out a new one silently would break a
        // link that is already in somebody's WhatsApp.
        if (operation === "create" && !data.guestToken) {
          data.guestToken = newGuestToken();
        }
        return data;
      },
    ],
    afterChange: [
      // The mail the owners get used to be sent inline from /api/reserve. It
      // lives here now so that the request being stored and the request being
      // announced are two separate, visible steps: the route only has to say
      // emailStatus "pending", and a failed send leaves a row the owners can
      // retry from the admin instead of a booking nobody heard about.
      sendOnChange<Reservation>({
        to: (_doc, payload) => ownersAddress(payload),
        // Answering goes straight back to the guest.
        replyTo: (doc) =>
          doc.email ? `${doc.name ?? doc.email} <${doc.email}>` : undefined,
        subject: (doc) =>
          `Reserveringsaanvraag: ${doc.name ?? "onbekend"}, ${dayOf(doc.date)} om ${doc.time ?? "-"} (${doc.guests ?? "?"}p)`,
        body: async (doc, payload) =>
          [
            `Naam:        ${doc.name || "-"}`,
            `E-mail:      ${doc.email || "-"}`,
            `Telefoon:    ${doc.phone || "-"}`,
            `Datum:       ${dayOf(doc.date)}`,
            `Tijd:        ${doc.time || "-"}`,
            `Personen:    ${doc.guests ?? "-"}`,
            // The owners read this mail long before they open the admin, and
            // on a busy evening they may never open it at all — so the one
            // thing the sidebar badge exists to tell them is said here too.
            `Eerder gereserveerd: ${await reservationLine(doc, payload)}`,
            "",
            "Opmerkingen:",
            doc.notes || "-",
            "",
            `Bekijk en bevestig: ${siteUrl}/admin/collections/reservations/${doc.id}`,
            /*
             * The guest's own page. The guest now gets this link themselves in
             * the confirmation below, so this line is no longer the only way it
             * reaches them — it is here so the owners can send it early, to a
             * party that is still being talked round, and so they can see at a
             * glance that a link exists at all. Built by hand rather than
             * through `guestPassUrl()` from @/lib/guestPass on purpose: that
             * module imports @/lib/payload, which imports the config, which
             * imports this file. The cycle is not avoided by moving the mail —
             * @/lib/reservationMail builds the same URL out of @/i18n/config
             * for exactly this reason, and says so.
             */
            `Gastenpagina:  ${doc.guestToken ? `${siteUrl}/reservering/${doc.guestToken}` : "nog niet aangemaakt"}`,
            "",
            "Let op: dit is een aanvraag, nog geen bevestiging. De gast wacht op bericht.",
          ].join("\n"),
      }),
      /*
       * And the mail the guest gets, once the owners have said yes.
       *
       * Nothing here decides whether to send. This is the same engine as the
       * one above, pointed at its own three columns, and its only rule is the
       * one that rule has always been: a row whose stored status reads "In de
       * wachtrij" gets sent, exactly once. What arms it is the field hook on
       * `confirmationEmailStatus` further down, which writes that status
       * inside the very transaction that moved the reservation to Bevestigd.
       *
       * Keeping the decision out of the engine is what keeps the send honest.
       * The engine re-reads the row after the commit and checks the status
       * again there, so a save that rolls back takes the arming with it and a
       * second save that already settled this one cannot make it send twice.
       * A predicate comparing the in-flight document to the old one has no
       * stored state to re-read and would lose both of those properties.
       */
      sendOnChange<Reservation>({
        fields: CONFIRMATION_FIELDS,
        /*
         * The one place the "niet versturen" mode is enforced, and on purpose
         * the last possible one.
         *
         * The obvious place is the arming hook further down, and it is the
         * wrong place: that hook runs on every write to this collection, so
         * reading the global from there would be a query on every save of every
         * reservation — including the bookkeeping writes this engine makes
         * itself — to answer a question that only matters on the few saves that
         * move a row to Bevestigd. Here it costs a query only when a mail was
         * genuinely about to leave — the same trip `ownersAddress()` is already
         * making a few lines down to fill in the reply-to.
         *
         * Being last is worth something of its own. This runs after the commit,
         * so it reads the setting as it stands at the moment of sending: a mode
         * switched to "niet versturen" in between the arming and the send stops
         * the mail, rather than the mail escaping because of what the CMS said
         * an hour ago.
         */
        to: async (doc, payload) =>
          (await confirmationModeNow(payload)) === "off" ? undefined : doc.email,
        /*
         * Both reasons in one sentence, because the engine takes one skip
         * reason per message and not one per document. The two ways a
         * confirmation ends up here — a booking with no address on it, and a
         * café that has switched the guest mail off — are equally likely to be
         * the one an owner is staring at, and naming only the commoner one
         * would send them looking for a missing e-mail address that is sitting
         * right there in the field above.
         */
        skipReason:
          "Er ging geen bevestiging naar de gast. Dat is één van twee dingen: deze reservering heeft geen e-mailadres, of de bevestigingsmail staat op \"Helemaal niet versturen\" (Site Instellingen, tabblad Reserveren).",
        // The mail leaves from no-reply@, and the last paragraph invites the
        // guest to answer it. Without this, "stuur gewoon een antwoord op dit
        // mailtje" is an instruction to write into a bin.
        replyTo: (_doc, payload) => ownersAddress(payload),
        subject: (doc, payload) => confirmationSubject(doc, payload),
        body: (doc, payload) => confirmationBody(doc, payload),
      }),
    ],
  },
  fields: [
    {
      type: "row",
      fields: [
        {
          name: "name",
          label: "Naam",
          type: "text",
          required: true,
          maxLength: 120,
          admin: { width: "50%" },
        },
        {
          name: "email",
          label: "E-mailadres",
          type: "email",
          required: true,
          admin: { width: "50%" },
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "phone",
          label: "Telefoonnummer",
          type: "text",
          required: true,
          maxLength: 40,
          admin: {
            width: "50%",
            description: "Hierop bevestigen we de tafel",
          },
        },
        {
          name: "guests",
          label: "Aantal personen",
          type: "number",
          required: true,
          min: 1,
          max: 30,
          admin: { width: "50%" },
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "date",
          label: "Datum",
          type: "date",
          required: true,
          admin: {
            width: "50%",
            date: { pickerAppearance: "dayOnly", displayFormat: "d MMMM yyyy" },
          },
        },
        {
          name: "time",
          label: "Tijd",
          type: "text",
          required: true,
          maxLength: 10,
          /**
           * The seat counting in src/lib/capacity.ts lays every booking out on
           * the grid the form offers, and a booking that starts at 19:07 used
           * to occupy a column nothing else ever read: it consumed no capacity
           * and saw none. The arithmetic there now floors an odd time onto the
           * grid, so this is no longer load-bearing — but a table is still at
           * one of the times a guest could have chosen, and letting the field
           * say otherwise only invites the question of what "19:07" was
           * supposed to mean.
           *
           * The finest grid rather than the one in force. How far apart the
           * sittings sit is a setting — "Tijdstippen om de" in Site
           * Instellingen — and a field validator is handed the value and its
           * siblings, never the global, so this cannot know which of the two
           * the owners have chosen today. Accepting every grid the CMS can be
           * set to is the answer that is right under both: it demanded
           * `(00|30)$` until the day quarters were switched on, at which point
           * every single :15 booking the form produced would have reached
           * `payload.create` and come back as a ValidationError the route could
           * only turn into "er ging iets mis aan onze kant". /api/reserve is
           * where the tighter of the two is enforced, against the same number
           * the form drew its times from.
           *
           * /api/reserve never produces one of these; a row typed in by hand in
           * the admin is the only way in, which is why the message is written
           * for the owners rather than for a developer.
           */
          validate: (value: string | null | undefined) => {
            if (!value) return "Vul een tijd in, bijvoorbeeld 19:00.";
            return isOnGrid(value.trim(), FINEST_SLOT_MINUTES)
              ? true
              : "Gebruik hele uren of kwartieren in 24-uursnotatie, bijvoorbeeld 19:00, 19:15 of 19:30.";
          },
          admin: { width: "50%" },
        },
      ],
    },
    {
      name: "duration",
      label: "Duur (minuten)",
      type: "number",
      min: 15,
      max: 480,
      // No default: an empty field is the signal to fall back to the standard
      // sitting time, and Payload has no way to express "explicitly nothing".
      admin: {
        description:
          "Hoe lang deze tafel bezet is. Leeg = de standaard uit Site Instellingen.",
      },
    },
    {
      name: "notes",
      label: "Opmerkingen",
      type: "textarea",
      maxLength: 2000,
      admin: {
        description:
          "Allergieën, verjaardag, kinderstoel, een rustige tafel: wat de gast doorgeeft.",
      },
    },
    {
      name: "guestNote",
      label: "Bericht aan het gezelschap",
      type: "textarea",
      maxLength: 500,
      // Not localized, unlike everything on the public site: this is one line
      // written by hand to one party, and the owners know which language that
      // party speaks better than a translation tab does.
      admin: {
        description:
          "Komt op de gedeelde gastenpagina te staan, dus iedereen die de link krijgt leest dit mee. Schrijf het aan het gezelschap zelf, bijvoorbeeld: \"we houden de grote tafel bij het raam voor jullie vrij\". Laat leeg als er niets te melden is.",
      },
    },
    {
      name: "guestResponses",
      label: "Reacties van het gezelschap",
      type: "array",
      labels: { singular: "Reactie", plural: "Reacties" },
      admin: {
        description:
          "Wat het gezelschap zelf heeft doorgegeven via de gedeelde link.",
        // Written by the guest page through the local API, never typed here.
        // Left editable so the owners can correct a typo or delete a prank
        // entry, which is the only thing they will ever want to do with it.
        initCollapsed: true,
      },
      fields: [
        {
          type: "row",
          fields: [
            {
              name: "name",
              label: "Naam",
              type: "text",
              admin: { width: "50%" },
            },
            {
              name: "addedAt",
              label: "Doorgegeven op",
              type: "date",
              admin: {
                width: "50%",
                readOnly: true,
                date: { pickerAppearance: "dayAndTime" },
              },
            },
          ],
        },
        {
          name: "dietary",
          label: "Dieetwensen",
          type: "text",
          admin: {
            description: "Wat deze persoon niet eet, gescheiden door komma's",
          },
        },
        {
          name: "drinks",
          label: "Drinken",
          type: "text",
        },
        {
          /**
           * The one line a companion writes in their own words.
           *
           * The ticked lists above only ever hold labels the owners wrote, so
           * an allergy nobody thought to put on the list had nowhere to go. A
           * guest who cannot eat sesame is not helped by a "Vegetarisch" box.
           *
           * Free text from an unauthenticated page, so it is capped here and
           * again in the endpoint, and it is rendered as text and never as
           * markup. See GUEST_RESPONSE_LIMITS in src/lib/guestPass.ts.
           */
          name: "note",
          label: "Toelichting",
          type: "textarea",
          maxLength: 300,
          admin: {
            description:
              "Wat deze persoon er zelf bij schreef, bijvoorbeeld een allergie die niet in de lijst staat.",
          },
        },
      ],
    },
    {
      /**
       * "Eerste reservering" or "4e reservering", at the top of the sidebar.
       *
       * Reservering rather than bezoek because that is all the database can
       * honestly claim: somebody who walked in on a Tuesday without ringing has
       * been here and no row records it.
       *
       * A `ui` field stores nothing and adds no column: it is a place to hang a
       * component, and everything it shows is worked out at render time from
       * the reservations that are already there. See
       * src/components/admin/GuestHistory.tsx for why the component is a server
       * one, and src/lib/guestHistory.ts for why that matters.
       *
       * First in the sidebar on purpose. It is the thing the owners open a
       * booking to find out, and by the time they have scrolled past the status
       * and the mail bookkeeping they have already decided what to say.
       */
      name: "guestHistory",
      type: "ui",
      admin: {
        position: "sidebar",
        components: { Field: "@/components/admin/GuestHistory#GuestHistory" },
      },
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { label: "Nieuw", value: "nieuw" },
        { label: "Gebeld", value: "gebeld" },
        { label: "Bevestigd", value: "bevestigd" },
        { label: "Geannuleerd", value: "geannuleerd" },
      ],
      defaultValue: "nieuw",
      access: {
        // The public form may never choose its own status. Only a logged in
        // user moves an aanvraag along.
        create: () => false,
        update: ({ req: { user } }) => Boolean(user),
      },
      hooks: {
        // Belt and braces: whatever arrives on a create, the row starts at
        // "nieuw" — unless the request carries AUTO_CONFIRM, which /api/reserve
        // sets and nothing else does, and which that route only sets once it
        // has read "automatisch versturen" out of Site Instellingen itself.
        // Field access alone is bypassed by the local API, which is exactly how
        // that route writes, so this hook and not `access.create` is the last
        // thing standing between a public form and a booking that declares
        // itself confirmed. That is why the exception is a flag no browser can
        // reach rather than a loosening of the rule: every other create in the
        // codebase still starts at "nieuw", full stop. The reasoning is written
        // out in full beside AUTO_CONFIRM in @/lib/reservationMail.
        beforeChange: [
          ({ operation, req, value }) =>
            operation === "create" && !req.context?.[AUTO_CONFIRM]
              ? "nieuw"
              : value,
        ],
      },
      admin: {
        position: "sidebar",
        description:
          "Nieuw is nog niet bevestigd. Zet op bevestigd zodra de gast bericht heeft.",
      },
    },
    ...outboundEmailFields(),
    {
      /**
       * Which language this guest booked in.
       *
       * It has to be on the row because of when the confirmation is written.
       * The request that knew the answer — /api/reserve resolves the language
       * from the page the form was submitted from — is long gone by the time
       * the owners press Bevestigd, so there is nothing left to ask.
       *
       * /api/reserve stores it on the create, from the same resolved value it
       * uses to build the guest link it hands back, so a booking made through
       * the English pages arrives here already saying so and the confirmation
       * is written in the language the guest actually read the form in.
       *
       * It stays editable all the same, and that is the point of the field
       * rather than an oversight. The stored value only knows which pages the
       * form was on; the owners are the ones who know that the English
       * colleague booked through the Dutch site, or that the party is Dutch and
       * the person who filled it in was not. Rows written before this field
       * existed all read Nederlands, which is the right guess for this café and
       * the wrong one often enough to be worth a glance before confirming.
       *
       * A select and not a read-only note, which is where this differs from the
       * same field on Berichten. There the locale is a hint for a person about
       * to write a reply by hand, and being wrong costs them a moment. Here it
       * chooses the words of a mail that leaves without anybody reading it
       * first, and the owners are the only ones who can know that the English
       * colleague booked through the Dutch page. So it is editable, and it sits
       * next to the status they are about to change.
       */
      name: "locale",
      label: "Taal van de gast",
      type: "select",
      options: [
        { label: "Nederlands", value: "nl" },
        { label: "English", value: "en" },
      ],
      defaultValue: "nl",
      admin: {
        position: "sidebar",
        description:
          "In welke taal deze gast het formulier invulde, en dus in welke taal de bevestigingsmail en de gastenpagina geschreven zijn. Klopt het niet, zet het dan hier goed vóór je op Bevestigd zet.",
      },
    },
    {
      ...emailStateField({
        names: CONFIRMATION_FIELDS,
        label: "Bevestigingsmail aan de gast",
        // Out of sight while the mail is held back from the release. The column
        // and its default stay exactly as they are, so nothing written during
        // the hold has to be repaired when it is switched on.
        hidden: !CONFIRMATION_MAIL_RELEASED,
        /*
         * "skipped" and never "pending", and this is the single most dangerous
         * line in the whole feature. The owners' notification defaults to
         * "pending" because every new reservation genuinely does owe them a
         * mail the second it lands. A confirmation is owed to nobody until the
         * owners have actually confirmed something, so a "pending" default here
         * would mail a confirmation to every guest at the moment they pressed
         * Verstuur — telling three hundred people their table was ready before
         * anybody had looked at the date. The migration carries the same
         * default on the column and backfills every existing row to it.
         */
        defaultValue: "skipped",
        // "Niet verstuurd" is what the helper calls this state, and on a row
        // that is simply still waiting to be confirmed it reads as a fault
        // report. The owners would go looking for a breakage that is not there.
        optionLabels: { skipped: "Nog niet bevestigd" },
        description:
          "Het mailtje dat de gast krijgt als zijn tafel klaarstaat. Wanneer dat gebeurt, stellen jullie zelf in bij Site Instellingen, tabblad Reserveren, onder Bevestigingsmail aan de gast: pas als jullie de reservering op Bevestigd zetten en opslaan, meteen als de gast boekt, of helemaal niet. Wil je hem nog een keer sturen, zet dit dan op \"In de wachtrij\" en sla op.",
      }),
      hooks: {
        /**
         * The trigger for the whole feature, and the only thing that decides
         * whether a guest is written to.
         *
         * It arms the mail — writes "pending" into this field — and does so
         * from inside the very save that moved the reservation to Bevestigd.
         * That is the point of doing it here rather than in the hook that
         * sends: if the save rolls back, the arming rolls back with it, and the
         * engine's post-commit re-read finds a row that never said "pending".
         * A confirmation can therefore never outlive the confirmation it was
         * about.
         *
         * It fires on a transition and not on a value. `status === "bevestigd"`
         * would arm on every subsequent save of a confirmed row, so correcting
         * a typo in the notes six weeks later would write "pending" over "sent"
         * and mail the party all over again. Comparing against `originalDoc`
         * means an unchanged row leaves this field exactly as it found it,
         * which is also what makes the owners' own resend work: they set this
         * to "In de wachtrij" by hand, nothing here touches it, and the engine
         * sends. Deliberately going Bevestigd -> Geannuleerd -> Bevestigd does
         * mail again, and should: the guest pass told the party the table was
         * gone in between, so the second mail is news rather than a duplicate.
         *
         * The SKIP_OUTBOUND_EMAIL check is the load-bearing line. That flag
         * already stops the sending hook, so leaving it out here would look
         * harmless — but it would let a write that must not announce itself
         * (the guest pass appending a companion's answer, either mail's own
         * bookkeeping) quietly arm a mail that the same flag then refuses to
         * send. The row would sit loaded until the next unrelated save pulled
         * the trigger, and it would surface days later as "a guest got a second
         * confirmation when we fixed a typo". The flag has to be a fuse, not a
         * delay.
         *
         * A create never arms from here, whatever it says, and the `operation`
         * check is now the only thing making that true. It used to have the
         * status field's own hook behind it: that hook stored "nieuw" on every
         * create no matter what was submitted, so a booking that arrived
         * claiming to be Bevestigd simply did not exist. "Automatisch
         * versturen" has since bought that hook one narrow exception, for the
         * single caller that has read the mode out of the CMS, so a create
         * genuinely can land at Bevestigd now. It still does not arm anything
         * here — /api/reserve writes "pending" into this field itself, inside
         * the same create, and this hook hands that value straight back
         * untouched. One arming, done by the half of the system that knows why
         * it is arming.
         *
         * For a table taken over the phone the price is unchanged: two saves.
         * That is a fair price, because the second save is the moment the owners
         * look again at the e-mail address they just typed from memory, which is
         * the field this entire mail hangs off.
         *
         * `data?.status ?? originalDoc?.status` rather than either one alone,
         * because a field hook is handed only the keys that are being written.
         * A bookkeeping update touches three mail columns and no status at all,
         * and this has to read the unchanged one in that case rather than
         * `undefined`.
         */
        beforeChange: [
          ({ data, operation, originalDoc, req, value }) => {
            // Held back from this release, so nothing is loaded in the first
            // place. Stopping it here rather than only at the send is what
            // keeps a reservation confirmed during the hold from sitting at
            // "In de wachtrij" — a row that looks like it owes a mail, in a
            // panel that is hidden, for a feature that is off. It stays at its
            // default and says nothing. See CONFIRMATION_MAIL_RELEASED.
            if (!CONFIRMATION_MAIL_RELEASED) return value;
            if (req.context?.[SKIP_OUTBOUND_EMAIL]) return value;
            if (operation !== "update") return value;
            const next = (data?.status ?? originalDoc?.status) as
              | string
              | undefined;
            const previous = originalDoc?.status as string | undefined;
            return next === "bevestigd" && previous !== "bevestigd"
              ? "pending"
              : value;
          },
        ],
      },
    },
    emailErrorField({
      names: CONFIRMATION_FIELDS,
      errorLabel: "Foutmelding bevestigingsmail",
      hidden: !CONFIRMATION_MAIL_RELEASED,
    }),
    emailSentAtField({
      names: CONFIRMATION_FIELDS,
      sentAtLabel: "Bevestiging verstuurd op",
      hidden: !CONFIRMATION_MAIL_RELEASED,
    }),
    {
      name: "guestToken",
      label: "Sleutel gastenpagina",
      type: "text",
      unique: true,
      index: true,
      admin: {
        position: "sidebar",
        readOnly: true,
        description:
          "Het geheime deel van de deelbare link naar de gastenpagina. Iedereen met die link kan de reservering zien en aanvullen, dus deel hem alleen met het gezelschap. Wordt er een nieuwe sleutel gemaakt, dan werkt de oude link niet meer.",
      },
    },
    {
      name: "source",
      label: "Binnengekomen via",
      type: "text",
      defaultValue: "website",
      access: {
        // Same reasoning as status: readOnly only hides a field in the admin
        // UI, it does not stop an API caller from writing it. The local API
        // (used by /api/reserve) bypasses field access and sets this itself.
        create: () => false,
        update: ({ req: { user } }) => Boolean(user),
      },
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "Wordt automatisch ingevuld",
      },
    },
  ],
};
