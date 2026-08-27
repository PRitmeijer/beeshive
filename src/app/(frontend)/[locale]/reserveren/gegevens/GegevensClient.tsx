"use client";

import { GuestDetails } from "@/components/booking/GuestDetails";
import { useFunnel } from "@/components/booking/useFunnel";
import { STEPS } from "@/lib/umami";
import type { Locale } from "@/i18n/config";
import type { BookingRules } from "@/lib/openingHours";

/**
 * The details screen, on the page surface, with its own half of the funnel.
 *
 * On /reserveren the two screens are two routes, so the accordion is genuinely
 * unmounted while this is being filled in and the counting has to be handed
 * across. It is handed across by starting here rather than at the beginning:
 * `from` is the stage the accordion reached before it navigated, so an
 * abandonment from this page reads as "gave up at the details screen" instead
 * of "gave up at the time picker", which is precisely the distinction the
 * owners' question turns on. The accordion, for its part, marks its unmount as
 * a hand-off rather than a departure, so nobody is counted as having left at
 * the moment they went forward.
 *
 * Everything else about this screen — the fields, the docket, the recovery when
 * a sitting goes while somebody is typing — is the same component the phone
 * sheet mounts inline. This file is only the wiring.
 */
export function GegevensClient({
  locale,
  guests,
  date,
  time,
  dayLabel,
  rules,
  backHref,
}: {
  locale: Locale;
  guests: number;
  date: string;
  time: string;
  dayLabel: string;
  rules: BookingRules;
  backHref: string;
}) {
  /**
   * `entry` is "direct" here and not a guess. Whoever pressed a Reserveren
   * button elsewhere on the site was carried to the accordion by a navigation
   * and then here by a second one, and this page cannot tell them apart from
   * somebody who opened a link a friend sent them — so it does not pretend to.
   */
  const funnel = useFunnel({
    surface: "page",
    entry: "direct",
    from: STEPS.detailsShown,
  });

  return (
    <GuestDetails
      locale={locale}
      surface="page"
      guests={guests}
      date={date}
      time={time}
      dayLabel={dayLabel}
      rules={rules}
      funnel={funnel}
      backHref={backHref}
    />
  );
}
