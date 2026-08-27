"use client";

/**
 * One offered day, as a printed row rather than a button.
 *
 * Full width, a hairline under it, the relative name on the left in the
 * display face and the date itself on the right in old-style figures — which
 * is how a diary lists days and nothing whatever like a chip in a chain's
 * checkout. There is no box, because there is no box anywhere in this flow.
 *
 * It is used in three places and that is the reason it is its own file: above
 * the calendar as one of the three days the flow offers without being asked,
 * and again under both of the dead ends, where the next day that *can* take the
 * party is the way forward. Those two have to be the same object — a guest who
 * has just been told Saturday is full should be offered the alternative in the
 * same shape they were choosing from a moment ago, not in a second vocabulary
 * they have to learn while being disappointed.
 */
export function DayChip({
  name,
  date,
  label,
  onPick,
}: {
  /** "Vanavond", "Morgen", or the weekday. */
  name: string;
  /** "29 augustus", in figures. */
  date: string;
  /** The whole row, said in one line, for a reader who hears it. */
  label: string;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={label}
      className="flex min-h-[3.5rem] w-full items-baseline justify-between gap-4
                 border-b border-hive-700/25 px-0 py-4 text-left
                 transition-colors duration-200 ease-settle
                 hover:bg-hive-700/[0.06]"
    >
      <span className="font-display text-[1.05rem] text-hive-700">{name}</span>
      <span className="figures-old text-[0.95rem] text-hive-500">{date}</span>
    </button>
  );
}
