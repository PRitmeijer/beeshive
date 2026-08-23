/**
 * The two-field mailing list sign-up, which appears on the homepage and in the
 * footer. Deliberately terse: it is asking for very little and should look it.
 *
 * `privacyNote` is the fallback for the line under the address field. The
 * owners can write their own in Site Instellingen -> Homepage, and the form
 * prefers theirs; this one is here so the field is never bare on a page that
 * has no settings to hand. Handing over an e-mail address to a café is a small
 * act of trust, and the sentence that says how seldom it will be used is worth
 * more than any of the other words on the form.
 */
export const newsletterNl = {
  name: "Je naam",
  email: "Je e-mailadres",
  privacyNote:
    "Hooguit een mail per maand, nooit spam, en uitschrijven kan met een klik.",
  submit: "Aanmelden",
  submitting: "Bezig...",
  error: "Er ging iets mis. Probeer het opnieuw.",
  successTitle: "Bedankt voor je aanmelding!",
  successText:
    "Je staat op de lijst. We mailen hooguit een keer per maand, en alleen als er echt iets te vertellen valt.",
};

export type NewsletterDict = typeof newsletterNl;

export const newsletterEn: NewsletterDict = {
  name: "Your name",
  email: "Your email address",
  privacyNote:
    "At most one email a month, never spam, and you can unsubscribe in one click.",
  submit: "Sign up",
  submitting: "Sending...",
  error: "Something went wrong. Please try again.",
  successTitle: "Thank you for signing up!",
  successText:
    "You are on the list. We write at most once a month, and only when there is genuinely something to tell you.",
};
