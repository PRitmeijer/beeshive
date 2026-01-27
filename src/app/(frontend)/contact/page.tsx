import type { Metadata } from "next";
import { ContactClient } from "./ContactClient";

export const metadata: Metadata = {
  title: "Contact — De Bee's Hive",
  description:
    "Neem contact op met De Bee's Hive in Zuilen, Utrecht. Stuur ons een bericht, bel ons, of kom langs.",
  alternates: { canonical: "https://debeeshive.nl/contact" },
};

export default function ContactPage() {
  return <ContactClient />;
}
