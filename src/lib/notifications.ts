import { getPayloadClient } from "@/lib/payload";
import type { Locale } from "@/i18n/config";

/**
 * The notifications that are live right now, in one place.
 *
 * It exists because the same query is needed twice and had drifted into being
 * written once. The layout reads it on the server so the bar is in the first
 * HTML the browser receives; /api/active-notifications reads it for anything
 * that wants to poll later. A banner that only arrives after a client fetch is
 * a banner that arrives after the page has been laid out, and the reader
 * watches the whole page jump down to make room for it.
 */

export interface ActiveNotification {
  /** Always a string here: Payload hands back a number on Postgres, and the
   *  bar keys dismissals by it. One shape, decided once. */
  id: string;
  title: string;
  /** Optional: plenty of notices are a title and nothing else. */
  message?: string | null;
  type: "info" | "offer" | "event" | "important";
  displayMode?: "banner" | "popup";
  link?: string;
  dismissible: boolean;
}

export async function getActiveNotifications(
  locale: Locale,
): Promise<ActiveNotification[]> {
  try {
    const payload = await getPayloadClient();
    const now = new Date().toISOString();

    const res = await payload.find({
      collection: "notifications",
      locale,
      where: {
        active: { equals: true },
        or: [
          { startDate: { exists: false } },
          { startDate: { less_than_equal: now } },
        ],
      },
      limit: 5,
    });

    // Drop the ones that have run out. The end date is picked as a day, not a
    // moment, so it is stored at midnight — comparing it directly would retire
    // a notification at the *start* of the day the owners chose, giving them a
    // banner that is never seen on its final day. Run it to the end of that
    // day instead, which is what "tot en met" means to the person typing it.
    const live = res.docs.filter((n: { endDate?: string | null }) => {
      if (!n.endDate) return true;
      const end = new Date(n.endDate);
      if (Number.isNaN(end.getTime())) return true;
      end.setUTCHours(23, 59, 59, 999);
      return end >= new Date();
    });

    return live.map((n) => ({
      ...(n as unknown as ActiveNotification),
      id: String((n as { id: string | number }).id),
    }));
  } catch {
    // A notice nobody can read is not worth taking the page down for.
    return [];
  }
}
