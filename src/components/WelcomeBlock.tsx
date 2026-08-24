import { SocialRow, type SocialLink } from "@/components/SocialMarks";

/**
 * The short welcome: a photograph, a few words, and the places to find them.
 *
 * It exists twice — under the hero on the landing page, and at the foot of a
 * guest pass — and both are the same situation seen from different doors:
 * somebody who has not met this restaurant yet. On the guest pass they were
 * booked in by a friend and sent a link; on the front page they arrived
 * themselves. Neither has been introduced to anybody.
 *
 * Everything it renders comes from Site Instellingen, so the owners write it
 * once, in the place they already know, and it appears in both. Nothing here
 * is a field of its own: the words are the About tab's intro, the picture is
 * its picture, and the marks are the Contact tab's socials plus the Google
 * listing.
 *
 * The whole thing returns null when there is neither text nor picture. An
 * empty bordered rectangle where an introduction should be reads as a page
 * that failed to load, which is worse than a page that simply does not
 * introduce itself.
 *
 * It draws no section, no background and no padding: the two callers sit on
 * different grounds at different measures, and a component that picked one
 * would be wrong on the other page.
 */
interface WelcomeBlockProps {
  heading: string;
  /** The line above the marks. Not shown when there are no links. */
  followHint: string;
  text: string;
  imageUrl: string;
  imageAlt: string;
  /**
   * Where to find them: the accounts to follow and the Google listing where
   * the reviews live, as marks rather than as the words "Instagram" and
   * "Facebook". A row of glyphs reads as one thing at a glance, which is what
   * this is; two spelled-out nouns read as two unrelated links, and spelling
   * out "Google" would have promised a search engine rather than reviews.
   */
  links: SocialLink[];
  /** Wider on the landing page than on the pass, which is one narrow column. */
  imageWidthClass?: string;
  /**
   * Optional call to action under the follow links.
   *
   * The guest pass passes one and the landing page does not: the landing page
   * already has "Bekijk de kaart" as its hero button a screen above this, and
   * the same offer twice on one page is not twice as persuasive. On the pass
   * there is no such button anywhere, and somebody who has just read who these
   * people are is exactly the person who wants the menu next.
   */
  ctaHref?: string;
  ctaLabel?: string;
  /**
   * The eyebrow's ink. Defaults to the honey every other eyebrow on the site
   * uses; the landing page overrides it because this block and the newsletter
   * sit on the same sand one after the other, and two identical eyebrows in
   * the same colour read as one section that lost its way rather than as two.
   */
  headingClassName?: string;
}

export function WelcomeBlock({
  heading,
  followHint,
  text,
  imageUrl,
  imageAlt,
  links,
  imageWidthClass = "w-28 sm:w-44",
  ctaHref = "",
  ctaLabel = "",
  headingClassName = "",
}: WelcomeBlockProps) {
  if (!text && !imageUrl) return null;

  return (
    <div className="flex flex-row items-start gap-5 sm:gap-8">
      {imageUrl ? (
        <div className={`${imageWidthClass} shrink-0`}>
          {/* Square and cropped rather than letterboxed: the owners upload
              whatever they have, and a portrait photograph left to its own
              proportions pushes the words off a phone screen entirely. */}
          <img
            src={imageUrl}
            alt={imageAlt}
            className="aspect-square w-full rounded-[2px] object-cover
                       shadow-[0_1px_0_rgba(255,255,255,0.5),0_10px_24px_-18px_rgba(66,40,16,0.7)]"
          />
        </div>
      ) : null}

      <div className="min-w-0">
        <p className={`label ${headingClassName}`}>{heading}</p>
        <div className="rule-ink mt-3 w-10" aria-hidden="true" />

        {text ? (
          <p
            className="mt-4 max-w-prose whitespace-pre-line font-display
                       text-[1.05rem] italic leading-relaxed text-hive-600"
          >
            {text}
          </p>
        ) : null}

        {links.length > 0 ? (
          <div className="mt-5">
            <p className="text-sm leading-relaxed text-hive-400">
              {followHint}
            </p>
            {/* The same marks the footer and the contact page print, at the
                contact page's size and ink, so the third place they appear is
                not a third design. */}
            <SocialRow
              links={links}
              size={19}
              gap="gap-4"
              className="mt-3 block text-hive-400 transition-colors duration-500 ease-settle hover:text-honey-600"
            />
          </div>
        ) : null}

        {ctaHref && ctaLabel ? (
          <a href={ctaHref} className="btn-secondary mt-6 inline-block">
            {ctaLabel}
          </a>
        ) : null}
      </div>
    </div>
  );
}
