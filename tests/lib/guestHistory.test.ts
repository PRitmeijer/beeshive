import { afterEach, describe, expect, it, vi } from "vitest";
import type { Payload } from "payload";
import { historyFor, historyForMany, type HistorySubject } from "@/lib/guestHistory";
import { makeFakePayload, type FakePayload, type Row } from "../support/fakePayload";
import { freezeAt } from "../support/time";

/**
 * "Hebben wij elkaar al eens gezien?"
 *
 * No module mock in this file, and that is the point worth noticing: this
 * module takes a `Payload` as an argument and imports only a type from the
 * package, so the fake is simply handed over. It is the shape the rest of the
 * codebase should be moving towards — everything else in this suite needs a
 * `vi.mock` factory purely to stop @payload-config being evaluated.
 */

afterEach(() => {
  vi.useRealTimers();
});

const row = (
  id: number,
  date: string,
  extra: Row = {},
): Row => ({ id, date: `${date}T12:00:00.000Z`, status: "nieuw", ...extra });

const withRows = (...rows: Row[]) => {
  const fake = makeFakePayload({ reservations: rows });
  return { fake, payload: fake as unknown as Payload };
};

const subject = (
  id: string | number,
  extra: Partial<HistorySubject> = {},
): HistorySubject => ({ id, date: "2026-09-19", ...extra });

describe("telephone numbers, reduced to the line they ring", () => {
  const spellings = [
    "06-12345678",
    "06 12 34 56 78",
    "+31612345678",
    "0031 6 1234 5678",
    "(06) 1234 5678",
  ];

  it.each(spellings)("reads %o as the same guest", async (phone) => {
    const { payload } = withRows(row(1, "2026-05-01", { phone: "0612345678" }));
    const answer = await historyFor(subject(2, { phone }), payload);
    expect(answer.priorReservations).toBe(1);
    expect(answer.matchedOn).toBe("phone");
  });

  it.each(["06", "12345678", "", "geen"])(
    "refuses to match on %o, which is a typo rather than a number",
    async (phone) => {
      const { payload } = withRows(row(1, "2026-05-01", { phone: "06" }));
      const answer = await historyFor(subject(2, { phone }), payload);
      expect(answer.isFirstReservation).toBe(true);
    },
  );

  it("keeps a foreign number's country code, so it matches only itself", async () => {
    const { payload } = withRows(row(1, "2026-05-01", { phone: "+49 30 1234567" }));
    expect(
      (await historyFor(subject(2, { phone: "+49 30 1234567" }), payload)).priorReservations,
    ).toBe(1);
    expect(
      (await historyFor(subject(2, { phone: "+31 30 1234567" }), payload)).priorReservations,
    ).toBe(0);
  });
});

describe("e-mail addresses", () => {
  it("treats capitals and a stray space as the same guest", async () => {
    const { payload } = withRows(row(1, "2026-05-01", { email: "jan@x.nl" }));
    const answer = await historyFor(subject(2, { email: "Jan@X.nl " }), payload);
    expect(answer.priorReservations).toBe(1);
    expect(answer.matchedOn).toBe("email");
  });

  it("does not treat a plus-tag as the same guest", async () => {
    // Stripping it would match more and would also silently merge two
    // housemates who share a domain trick. A wrong "welkom terug" is worse
    // than a missed one.
    const { payload } = withRows(row(1, "2026-05-01", { email: "jan@x.nl" }));
    expect(
      (await historyFor(subject(2, { email: "jan+a@x.nl" }), payload)).isFirstReservation,
    ).toBe(true);
  });

  it.each(["a@", "ab", "", "@"])("refuses to match on %o", async (email) => {
    const { payload } = withRows(row(1, "2026-05-01", { email: "a@" }));
    expect((await historyFor(subject(2, { email }), payload)).isFirstReservation).toBe(true);
  });
});

describe("a booking with neither an address nor a number", () => {
  it("is never seen, and never matches another blank one", async () => {
    // "Both blank" is not a resemblance. Two half-typed rows in the admin must
    // not be greeted as one returning guest.
    const { payload } = withRows(row(1, "2026-05-01"), row(2, "2026-06-01"));
    const answers = await historyForMany([subject(3), subject(4)], payload);
    expect(answers.get(3)?.isFirstReservation).toBe(true);
    expect(answers.get(4)?.isFirstReservation).toBe(true);
    expect(answers.get(3)?.matchedOn).toBeNull();
  });
});

describe("which of the two made the match", () => {
  const earlier = row(1, "2026-05-01", { email: "jan@x.nl", phone: "0612345678" });

  it("reports the address when both would do", async () => {
    const { payload } = withRows(earlier);
    const answer = await historyFor(
      subject(2, { email: "jan@x.nl", phone: "0612345678" }),
      payload,
    );
    expect(answer.matchedOn).toBe("email");
  });

  it("falls back to the number for the regular who typo'd their address", async () => {
    const { payload } = withRows(earlier);
    const answer = await historyFor(
      subject(2, { email: "jan@xx.nl", phone: "06 1234 5678" }),
      payload,
    );
    expect(answer.matchedOn).toBe("phone");
    expect(answer.priorReservations).toBe(1);
  });
});

describe("strictly earlier than this booking's own day", () => {
  const guest = { email: "jan@x.nl" };

  it("does not count a booking on the same day", async () => {
    const { payload } = withRows(row(1, "2026-09-19", guest));
    expect(
      (await historyFor(subject(2, { ...guest, date: "2026-09-19" }), payload))
        .isFirstReservation,
    ).toBe(true);
  });

  it("does not count a booking later than this one", async () => {
    // The owners open a booking to find out what to say when these people walk
    // in, and on that evening only the evenings before it exist.
    const { payload } = withRows(row(1, "2026-12-01", guest));
    expect(
      (await historyFor(subject(2, { ...guest, date: "2026-09-19" }), payload))
        .isFirstReservation,
    ).toBe(true);
  });

  it.each([7, "7"])("never counts the row itself, with an id of %o", async (id) => {
    const { payload } = withRows(row(7, "2026-09-19", guest));
    expect(
      (await historyFor(subject(id, { ...guest, date: "2026-09-19" }), payload))
        .isFirstReservation,
    ).toBe(true);
  });

  it("does not let two subjects who are the same guest count each other", async () => {
    // Two rows on one screen, one guest, one of them in the future. Neither is
    // history for the other.
    const { payload } = withRows(
      row(1, "2026-09-19", guest),
      row(2, "2026-12-01", guest),
    );
    const answers = await historyForMany(
      [
        { id: 1, ...guest, date: "2026-09-19" },
        { id: 2, ...guest, date: "2026-12-01" },
      ],
      payload,
    );
    expect(answers.get(1)?.priorReservations).toBe(0);
    expect(answers.get(2)?.priorReservations).toBe(1);
  });

  it("reports the first and last of the earlier days", async () => {
    const { payload } = withRows(
      row(1, "2024-02-14", guest),
      row(2, "2025-07-03", guest),
      row(3, "2026-01-09", guest),
    );
    const answer = await historyFor(subject(9, { ...guest, date: "2026-09-19" }), payload);
    expect(answer.priorReservations).toBe(3);
    expect(answer.firstReservation).toBe("2024-02-14");
    expect(answer.lastReservation).toBe("2026-01-09");
  });

  it("skips a row whose date cannot be read without breaking the count", async () => {
    const { payload } = withRows(
      row(1, "2024-02-14", guest),
      { id: 2, date: "kerst", status: "nieuw", ...guest },
    );
    const answer = await historyFor(subject(9, { ...guest, date: "2026-09-19" }), payload);
    expect(answer.priorReservations).toBe(1);
    expect(answer.firstReservation).toBe("2024-02-14");
  });

  it("judges a subject with no date against today in Amsterdam", async () => {
    freezeAt("2026-09-19T22:30:00Z"); // already the 20th in the café
    const { payload } = withRows(row(1, "2026-09-19", guest));
    const answer = await historyFor({ id: 2, ...guest }, payload);
    expect(answer.priorReservations).toBe(1);
  });
});

describe("cancelled bookings", () => {
  it("does not count them, and says so in the query", async () => {
    const { fake, payload } = withRows(
      row(1, "2026-05-01", { email: "jan@x.nl", status: "geannuleerd" }),
    );
    const answer = await historyFor(subject(2, { email: "jan@x.nl" }), payload);
    expect(answer.isFirstReservation).toBe(true);
    expect(fake.calls.find[0].where).toEqual({
      and: [
        { date: { less_than_equal: "2026-09-19T23:59:59.999Z" } },
        { status: { not_equals: "geannuleerd" } },
      ],
    });
  });

  it("counts the three statuses that are not a cancellation", async () => {
    // Strictly, only "bevestigd" is a table anybody sat at — but the owners
    // confirm by ringing, and the row that gets moved along afterwards is the
    // exception. Counting only confirmed bookings would report that every
    // single guest is here for the first time.
    const { payload } = withRows(
      row(1, "2026-05-01", { email: "jan@x.nl", status: "nieuw" }),
      row(2, "2026-06-01", { email: "jan@x.nl", status: "gebeld" }),
      row(3, "2026-07-01", { email: "jan@x.nl", status: "bevestigd" }),
    );
    expect(
      (await historyFor(subject(9, { email: "jan@x.nl" }), payload)).priorReservations,
    ).toBe(3);
  });
});

describe("one query for a whole screenful", () => {
  it("spends a single find on forty subjects", async () => {
    // The agenda's whole performance argument. A per-booking lookup would be
    // forty round trips to draw one week.
    const { fake, payload } = withRows(row(1, "2026-05-01", { email: "jan@x.nl" }));
    const subjects = Array.from({ length: 40 }, (_, i) => ({
      id: i + 100,
      email: `guest${String(i)}@x.nl`,
      date: `2026-09-${String((i % 28) + 1).padStart(2, "0")}`,
    }));

    await historyForMany(subjects, payload);
    expect(fake.calls.find).toHaveLength(1);

    const call = fake.calls.find[0];
    expect(call.collection).toBe("reservations");
    expect(call.overrideAccess).toBe(true);
    expect(call.depth).toBe(0);
    expect(call.pagination).toBe(false);
    expect(call.limit).toBe(5000);
    // Newest first, so the cap sheds the oldest history rather than the most
    // recent — the evenings a guest at the door is most likely to be
    // remembered by.
    expect(call.sort).toBe("-date");
    expect(call.select).toEqual({ email: true, phone: true, date: true, status: true });
    // One bound serves every subject: the latest day anybody is asking about.
    expect(call.where?.and[0]).toEqual({
      date: { less_than_equal: "2026-09-28T23:59:59.999Z" },
    });
  });

  it("spends none at all when nothing is matchable", async () => {
    const { fake, payload } = withRows(row(1, "2026-05-01", { email: "jan@x.nl" }));
    await historyForMany([subject(1), subject(2)], payload);
    expect(fake.calls.find).toHaveLength(0);
  });
});

describe("a database that will not answer", () => {
  it("rejects rather than reporting a first visit", async () => {
    /**
     * The opposite of the judgement src/lib/capacity.ts makes, and
     * deliberately so. An empty result set and a failed query produce the same
     * `priorReservations: 0`, and "eerste reservering" is a sentence somebody
     * then says out loud to a guest of four years. The cheap failure here is
     * the caller catching this and printing "niet op te zoeken".
     */
    const fake: FakePayload = makeFakePayload({ throwOn: ["find"] });
    await expect(
      historyFor(subject(1, { email: "jan@x.nl" }), fake as unknown as Payload),
    ).rejects.toThrow();
  });
});
