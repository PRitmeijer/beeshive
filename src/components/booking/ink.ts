/**
 * The two pieces of printing the booking screens share, and nothing else.
 *
 * They are here rather than in either screen because the flow is two of them
 * now and a field on the details screen has to be the same object as a field on
 * the mailing-list form at the foot of the page — that is the whole claim the
 * letterpress layer makes about this site, and it survives exactly as long as
 * there is one copy of the string.
 */

/**
 * Letterpress field: no box, just a rule the ink sits on. Paper ground.
 * Kept byte-identical to <MailingListForm> so every form on the site is
 * demonstrably the same piece of printing.
 */
export const fieldClass =
  "mt-2 block w-full rounded-none border-0 border-b border-hive-700/25 bg-transparent " +
  "px-0 py-3 font-body text-hive-700 placeholder:text-hive-300/70 outline-none " +
  "transition-colors duration-300 ease-settle " +
  "focus:border-honey-400 focus:shadow-[inset_0_-2px_0_0_#B4735E]";

/**
 * One shared empty set for "we have not been told of a single taken sitting",
 * so clearing the list does not hand every render a new object to compare.
 */
export const NO_FULL_SLOTS: ReadonlySet<string> = new Set();
