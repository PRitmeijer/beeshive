import type { Metadata } from "next";
import { OverOnsClient } from "./OverOnsClient";

export const metadata: Metadata = {
  title: "Over Ons — De Bee's Hive",
  description:
    "Ontdek het verhaal achter De Bee's Hive. Van Zuid-Afrika naar Zuilen — ons warm eetcafé waar kunst, creativiteit en lekker eten samenkomen.",
  alternates: {
    canonical: "https://debeeshive.nl/over-ons",
  },
};

export default function OverOnsPage() {
  return <OverOnsClient />;
}
