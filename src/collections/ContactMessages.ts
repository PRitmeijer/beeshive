import type { CollectionConfig, Payload } from "payload";
import { outboundEmailFields, sendOnChange } from "@/lib/outboundEmail";

/**
 * Messages from the contact form.
 *
 * The form used to hand the visitor off to `mailto:` and, later, to mail
 * straight from the route — which meant that when the mail did not go out,
 * nothing was left behind. A stranger asking whether they can hold a birthday
 * here is worth more than that, so the message is stored first and mailed
 * afterwards (see src/lib/outboundEmail.ts). Even with the mail server down,
 * the conversation is sitting in the admin waiting to be answered.
 */

interface ContactMessage {
  id: number | string;
  name?: string | null;
  email?: string | null;
  message?: string | null;
  locale?: string | null;
}

/**
 * Where the notification goes. Read fresh out of the CMS rather than baked in,
 * so the owners can point it somewhere else themselves (Site Instellingen ->
 * Contact) without waiting for a deploy.
 */
async function contactAddress(payload: Payload): Promise<string> {
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

export const ContactMessages: CollectionConfig = {
  slug: "contact-messages",
  labels: {
    singular: "Bericht",
    plural: "Berichten",
  },
  access: {
    // Closed even to anonymous creates, exactly like Reservations. A public
    // create would also open Payload's own POST /api/contact-messages, and
    // that endpoint skips every check in /api/contact: no honeypot, no rate
    // limit, no length caps. The route writes through the local API, which
    // bypasses access by design, so the form keeps working and the REST
    // endpoint stays shut.
    create: () => false,
    // A message carries a name, an e-mail address and whatever the visitor
    // felt like telling us: never readable or mutable without a login.
    read: ({ req: { user } }) => Boolean(user),
    update: ({ req: { user } }) => Boolean(user),
    delete: ({ req: { user } }) => Boolean(user),
  },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "email", "status", "emailStatus", "createdAt"],
    description:
      "Berichten die via het contactformulier binnenkomen. Ieder bericht staat hier ook als het mailtje niet is aangekomen, dus dit is de plek om te kijken of iemand nog wacht op antwoord.",
    group: "Gasten",
  },
  hooks: {
    afterChange: [
      sendOnChange<ContactMessage>({
        to: (_doc, payload) => contactAddress(payload),
        // Answering goes straight back to the visitor.
        replyTo: (doc) =>
          doc.email ? `${doc.name ?? doc.email} <${doc.email}>` : undefined,
        subject: (doc) => `Bericht via de website: ${doc.name ?? "onbekend"}`,
        body: (doc) =>
          [
            `Naam:     ${doc.name || "-"}`,
            `E-mail:   ${doc.email || "-"}`,
            `Taal:     ${doc.locale === "en" ? "Engels" : "Nederlands"}`,
            "",
            "Bericht:",
            doc.message || "-",
          ].join("\n"),
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
      name: "message",
      label: "Bericht",
      type: "textarea",
      required: true,
      maxLength: 4000,
      admin: {
        description: "Wat de bezoeker zelf heeft geschreven",
      },
    },
    {
      name: "notes",
      label: "Notities",
      type: "textarea",
      admin: {
        description:
          "Voor jullie zelf: wat je hebt afgesproken, of wie het oppakt. De bezoeker ziet dit niet.",
      },
    },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { label: "Nieuw", value: "nieuw" },
        { label: "Beantwoord", value: "beantwoord" },
        { label: "Gearchiveerd", value: "gearchiveerd" },
      ],
      defaultValue: "nieuw",
      admin: {
        position: "sidebar",
        description:
          "Zet op beantwoord zodra iemand teruggemaild heeft, en op gearchiveerd als het klaar is.",
      },
    },
    ...outboundEmailFields(),
    {
      name: "locale",
      label: "Taal van de bezoeker",
      type: "text",
      admin: {
        position: "sidebar",
        readOnly: true,
        description:
          "Welke taalversie van de site iemand las toen hij het formulier invulde. Handig om te weten in welke taal je antwoordt.",
      },
    },
    {
      name: "source",
      label: "Binnengekomen via",
      type: "text",
      defaultValue: "website",
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "Wordt automatisch ingevuld",
      },
    },
  ],
};
