"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { getDict } from "@/i18n/dictionaries";
import { localeHref, type Locale } from "@/i18n/config";
import type { BookingRules } from "@/lib/openingHours";

/**
 * How many are coming, asked first and never folded away.
 *
 * The tiles replace an `<input type="number">`, and three separate things are
 * wrong with that input rather than one. It summons a keyboard on the first
 * screen of the flow, before anybody has been shown a single thing they came
 * for. It sat in the middle of the personal details, where a party size has no
 * business being — it is a fact about the booking, not about the guest. And it
 * was the only control on the page that could hold a value the endpoint would
 * refuse, because a number field will happily hold "0", "99" or nothing at all
 * while somebody holds backspace.
 *
 * Real radios, then, in one `<fieldset>` with a `<legend>`. Real ones, with
 * the input visually hidden inside the label rather than a div wearing
 * `role="radio"`: the arrow keys, the announcement of "2 of 6", the form
 * participation and the "one of these is chosen" relationship all come free and
 * all of them are things a hand-rolled roving tabindex gets subtly wrong.
 *
 * How many of them there are is the CMS's to say and not this file's. "Grootste
 * gezelschap" is a real setting the owners move — a small dining room may put
 * it at four — and the tiles were drawn 1 to 5 plus "6+" whatever it said, so a
 * café with a maximum of four offered five pressable tiles the endpoint would
 * refuse and a "6+" menu whose first entry was six. Worse than the refusal was
 * the disagreement: with the ceiling under six the tile and the menu beneath it
 * could not even be made to say the same number. Above the ceiling there are no
 * tiles, and where the ceiling itself is under six the last tile is the ceiling
 * and the line about ringing us stands under it, because a party of eight is
 * still a party of eight and still needs somewhere to go.
 *
 * The band never collapses, so "voor 2 personen" is on screen for the whole of
 * the flow. A guest can never be looking at availability without seeing what it
 * is availability *for* — which matters here more than in most booking systems,
 * because a day that is full for six is very often open for two and the two
 * facts are drawn from the same list.
 */

/** The tiles below the menu, in the order they are printed. */
const SMALL = [1, 2, 3, 4, 5];

/** The smallest party the "6+" menu offers, and what it opens on. */
const MORE_FROM = 6;

/** One column per tile, spelled out for Tailwind's scanner to find. */
const COLUMNS = [
  "",
  "grid-cols-1",
  "grid-cols-2",
  "grid-cols-3",
  "grid-cols-4",
  "grid-cols-5",
  "grid-cols-6",
];

export function PartyBand({
  locale,
  value,
  rules,
  onChange,
}: {
  locale: Locale;
  value: number;
  rules: BookingRules;
  onChange: (guests: number) => void;
}) {
  const t = getDict(locale).reservationForm;
  const name = useId();
  const selectId = useId();

  /**
   * The tiles this café actually has, and whether there is a menu behind them.
   *
   * `capped` is a house whose largest table is smaller than the menu's first
   * entry. There is no "6+" tile then — it would open on a party the endpoint
   * refuses — so the sentence under the tiles carries the whole of the way out
   * instead, which is the same sentence and the same link it carries when the
   * menu is open.
   */
  const max = Math.max(1, rules.maxPartySize);
  const capped = max < MORE_FROM;
  const tiles: (number | null)[] = SMALL.filter((n) => n <= max);
  if (!capped) tiles.push(null);

  /**
   * Whether the menu under "6+" is open.
   *
   * Held rather than derived from `value >= MORE_FROM`, because it has to stay
   * open while somebody is choosing out of it and because a remembered guest
   * whose usual party is eight should arrive with it already open, showing
   * eight, rather than with six tiles none of which is inked.
   */
  const [more, setMore] = useState(!capped && value >= MORE_FROM);
  useEffect(() => {
    if (!capped && value >= MORE_FROM) setMore(true);
  }, [value, capped]);

  // The caret follows the tile that was pressed into the menu it opened. The
  // guard is what keeps it from being dragged back there every time the party
  // size changes for any other reason — a window answer landing, say.
  const wantSelect = useRef(false);
  const selectRef = useRef<HTMLSelectElement>(null);
  useEffect(() => {
    if (!wantSelect.current) return;
    wantSelect.current = false;
    selectRef.current?.focus();
  }, [more]);

  const sizes: number[] = [];
  for (let n = MORE_FROM; n <= max; n += 1) {
    sizes.push(n);
  }

  return (
    <fieldset className="border-0 p-0">
      <legend className="label">{t.partyLegend}</legend>
      {/* Written out rather than built, because Tailwind reads this file as
          text and a class it cannot see in it is a class it does not print. */}
      <div
        className={`mt-3 grid ${COLUMNS[tiles.length]} gap-2 max-[340px]:grid-cols-3`}
      >
        {tiles.map((tile) => {
          const isMore = tile === null;
          const checked = isMore ? more : value === tile && !more;
          return (
            <label key={isMore ? "more" : tile} className="block cursor-pointer">
              <input
                type="radio"
                name={name}
                value={isMore ? "more" : tile}
                checked={checked}
                /* The tile's own face, read out as it is printed, rather
                   than the question the whole group is asking. It carried
                   `partyMoreLabel` — "Met hoeveel zijn jullie?" — which is the
                   right label for the menu underneath and is the wrong thing
                   entirely on one of six tiles: what a reader heard at the end
                   of the row was "1 persoon, 2 personen, 3, 4, 5, Met hoeveel
                   zijn jullie?", as though the group were asking itself. */
                aria-label={isMore ? t.partyMore : t.people(tile)}
                onChange={() => {
                  if (isMore) {
                    wantSelect.current = true;
                    setMore(true);
                    // Six rather than whatever was chosen before, so the menu
                    // and the booking say the same thing the moment it opens.
                    onChange(MORE_FROM);
                    return;
                  }
                  setMore(false);
                  onChange(tile);
                }}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                /* Two bands on the focus ring, and the outer one is the one
                   that can actually be seen. Gold on this paper is the house's
                   focus mark everywhere else on the site and it is worth about
                   1.8:1 against the sheet, under the 3:1 an indicator has to
                   hold. So the gold stays and a hair of heading ink is laid
                   immediately outside it: the mark still reads as ours, and
                   what carries it is the band with the contrast rather than
                   the band with the colour. */
                className="flex h-12 items-center justify-center rounded-[2px]
                           border-b border-hive-700/25 font-body text-[1rem] text-hive-700
                           transition-colors duration-200 ease-settle
                           peer-hover:peer-[:not(:checked)]:bg-hive-700/[0.06]
                           peer-checked:border-clay-500 peer-checked:bg-clay-500 peer-checked:text-paper
                           peer-focus-visible:ring-2 peer-focus-visible:ring-honey-400
                           peer-focus-visible:outline peer-focus-visible:outline-2
                           peer-focus-visible:outline-offset-2 peer-focus-visible:outline-hive-700"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {isMore ? t.partyMore : tile}
              </span>
            </label>
          );
        })}
      </div>

      {/* The menu behind the last tile, and the only way out for a party the
          form will not take. On the phone sheet that link is the one link
          there is: following it navigates, which closes the sheet, and that is
          the intended end of the journey rather than a side effect. */}
      {more ? (
        <div className="mt-4">
          <label htmlFor={selectId} className="label block">
            {t.partyMoreLabel}
          </label>
          <select
            id={selectId}
            ref={selectRef}
            value={Math.max(value, MORE_FROM)}
            onChange={(e) => onChange(Number(e.target.value))}
            className="figures-old mt-2 block w-full rounded-none border-0 border-b
                       border-hive-700/25 bg-transparent px-0 py-3 font-body text-hive-700
                       outline-none transition-colors duration-300 ease-settle
                       focus:border-honey-400"
          >
            {sizes.map((n) => (
              <option key={n} value={n}>
                {t.people(n)}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* The ceiling and the way past it, under whichever of the two the tiles
          ended in. It used to be printed only inside the menu, which is the one
          place a guest has already been told the number — and never at all in
          the house where it matters most, the one whose largest table is under
          six and whose tiles therefore simply stop. */}
      {more || capped ? (
        <p className="mt-4 text-sm text-hive-400">
          {t.guestsHint(max)} {t.guestsMoreBefore}
          <Link
            href={localeHref(locale, "/contact")}
            className="ink-link !text-current"
          >
            {t.guestsMoreLink}
          </Link>
          {t.guestsMoreAfter}
        </p>
      ) : null}
    </fieldset>
  );
}
