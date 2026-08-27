"use client";

/**
 * An answered band, folded down to the one line it turned out to be.
 *
 * This is the whole mechanism of the accordion and it is four elements: the
 * question in small caps, the answer beside it, and the word that undoes it.
 * Everything the guest has settled stays on screen in one line each, so nobody
 * is ever looking at a control without being able to see what they already told
 * us — which is the objection to a wizard, answered without a wizard.
 *
 * "wijzig" is a button and not a link because nothing navigates: it re-opens
 * the band in place, exactly where the summary was standing.
 */
export function BandSummary({
  label,
  answer,
  change,
  changeLabel,
  onChange,
}: {
  label: string;
  answer: string;
  /** The word itself: "wijzig". */
  change: string;
  /** What that word means on its own, for a reader who hears only it. */
  changeLabel: string;
  onChange: () => void;
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-4">
      <span className="label shrink-0">{label}</span>
      <span className="min-w-0 flex-1 font-body text-[1.05rem] text-hive-700">
        {answer}
      </span>
      <button
        type="button"
        onClick={onChange}
        aria-label={changeLabel}
        /* Padded to a real target and pulled back out of the line again.
           Every other control in this flow clears 48px on its short edge, and a
           word at the end of a line is the one that gets missed on a phone —
           the negative margin keeps the summary row the height it looks. */
        className="ink-link -my-3.5 shrink-0 px-1.5 py-3.5 text-sm"
      >
        {change}
      </button>
    </div>
  );
}
