/**
 * The two-field mailing list sign-up, which appears on the homepage and in the
 * footer. Deliberately terse: it is asking for very little and should look it.
 */
export const newsletterNl = {
  name: "Je naam",
  email: "Je e-mailadres",
  submit: "Aanmelden",
  submitting: "Bezig...",
  error: "Er ging iets mis. Probeer het opnieuw.",
  successTitle: "Bedankt voor je aanmelding!",
  successText: "Je hoort snel van ons.",
};

export type NewsletterDict = typeof newsletterNl;

export const newsletterEn: NewsletterDict = {
  name: "Your name",
  email: "Your email address",
  submit: "Sign up",
  submitting: "Sending...",
  error: "Something went wrong. Please try again.",
  successTitle: "Thank you for signing up!",
  successText: "You will hear from us soon.",
};
