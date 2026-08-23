/**
 * The contact page and the message form on it.
 *
 * The keys under `errors` are the codes in src/lib/contactErrors.ts: the server
 * decides which refusal applies, this table decides how it sounds. Anything the
 * table does not recognise falls back to `genericError`, so an unmapped code
 * never leaves the visitor staring at a silent form.
 */
export const contactNl = {
  metaTitle: (name: string) => `Contact | ${name}`,
  metaDescription: (name: string, area: string, city: string) =>
    `Neem contact op met ${name} in ${area}, ${city}. Stuur ons een bericht of kom langs.`,
  eyebrow: "Neem contact op",
  title: "Contact",
  follow: "Volg ons",
  reviewsHeading: "Beoordelingen",
  reviewsLink: "Lees ons op Google",
  mapTitle: "Google Maps locatie",
  detailsHeading: "Waar je ons vindt",
  messageHeading: "Stuur ons een bericht",
  messageText:
    "Een vraag, een idee of gewoon even hallo: schrijf het hieronder, dan opent je mailprogramma met het bericht klaar.",
  formName: "Naam",
  formEmail: "E-mail",
  formMessage: "Bericht",
  formSubmit: "Verstuur bericht",
  formSubmitting: "Bezig...",
  honeypot: "Laat dit veld leeg",
  sentTitle: "Bedankt voor je bericht!",
  sentText: "We nemen zo snel mogelijk contact met je op.",
  /** Keys are the codes in src/lib/contactErrors.ts. */
  errors: {
    rateLimited:
      "Je hebt net al een bericht gestuurd. Probeer het over een paar minuten opnieuw.",
    badRequest: "We konden het formulier niet lezen. Probeer het opnieuw.",
    tooLarge: "Je bericht is te lang. Kort het wat in en probeer het opnieuw.",
    nameRequired: "Vul je naam in.",
    emailRequired: "Vul je e-mailadres in.",
    emailInvalid: "Vul een geldig e-mailadres in.",
    messageRequired: "Schrijf even een bericht.",
    messageTooLong: "Je bericht is te lang, houd het onder 4000 tekens.",
    server: "Het versturen lukte niet. Mail ons gerust rechtstreeks.",
  },
  genericError: "Het versturen lukte niet. Mail ons gerust rechtstreeks.",
};

export type ContactDict = typeof contactNl;

export const contactEn: ContactDict = {
  metaTitle: (name: string) => `Contact | ${name}`,
  metaDescription: (name: string, area: string, city: string) =>
    `Get in touch with ${name} in ${area}, ${city}. Send us a message or simply drop by.`,
  eyebrow: "Get in touch",
  title: "Contact",
  follow: "Follow us",
  reviewsHeading: "Reviews",
  reviewsLink: "Read us on Google",
  mapTitle: "Google Maps location",
  detailsHeading: "Where to find us",
  messageHeading: "Send us a message",
  messageText:
    "A question, an idea, or simply hello: write it below and your mail app opens with the message ready to send.",
  formName: "Name",
  formEmail: "Email",
  formMessage: "Message",
  formSubmit: "Send message",
  formSubmitting: "Sending...",
  honeypot: "Leave this field empty",
  sentTitle: "Thank you for your message!",
  sentText: "We will get back to you as soon as we can.",
  errors: {
    rateLimited:
      "You have just sent a message. Please try again in a few minutes.",
    badRequest: "We could not read the form. Please try again.",
    tooLarge: "Your message is too long. Shorten it and try again.",
    nameRequired: "Please fill in your name.",
    emailRequired: "Please fill in your email address.",
    emailInvalid: "Please fill in a valid email address.",
    messageRequired: "Please write us a message.",
    messageTooLong: "Your message is too long, please keep it under 4000 characters.",
    server: "We could not send it. Do email us directly.",
  },
  genericError: "We could not send it. Do email us directly.",
};
