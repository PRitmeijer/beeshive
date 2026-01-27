"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { HexagonGrid } from "@/components/HexagonGrid";
import { ScrollReveal } from "@/components/ScrollReveal";

interface BlogPost {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  publishedDate?: string;
  featuredImage?: {
    url?: string;
    alt?: string;
    sizes?: { card?: { url?: string } };
  };
}

const placeholderPosts: BlogPost[] = [
  {
    id: "1",
    title: "Welkom bij De Bee's Hive",
    slug: "welkom",
    excerpt:
      "We zijn verheugd om onze deuren te openen in het hart van Zuilen. Lees meer over onze reis en wat je kunt verwachten.",
    publishedDate: "2025-06-14",
  },
  {
    id: "2",
    title: "De kunst van seizoensgebonden koken",
    slug: "seizoensgebonden-koken",
    excerpt:
      "Ontdek hoe wij elk seizoen vieren met verse, lokale ingrediënten en creatieve recepten.",
    publishedDate: "2025-07-01",
  },
  {
    id: "3",
    title: "Zuid-Afrikaanse smaken in Utrecht",
    slug: "zuid-afrikaanse-smaken",
    excerpt:
      "Van bobotie tot malva pudding — hoe onze Zuid-Afrikaanse roots onze keuken beïnvloeden.",
    publishedDate: "2025-07-15",
  },
];

export function BlogClient({ posts: cmsPosts }: { posts: BlogPost[] }) {
  const posts = cmsPosts.length > 0 ? cmsPosts : placeholderPosts;

  return (
    <>
      <section className="relative min-h-[50vh] flex items-center justify-center bg-hive-800 overflow-hidden">
        <HexagonGrid count={10} />
        <div className="absolute inset-0 bg-gradient-to-b from-hive-900/60 to-hive-800/80" />
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 text-center px-6"
        >
          <span className="text-honey-400 font-medium text-sm uppercase tracking-widest">
            Verhalen & Nieuws
          </span>
          <h1 className="heading-xl text-honey-100 mt-3">Blog</h1>
        </motion.div>
      </section>

      <section className="section-padding">
        <div className="max-w-4xl mx-auto">
          <div className="space-y-8">
            {posts.map((post, i) => (
              <ScrollReveal key={post.id} delay={i * 0.1}>
                <Link href={`/blog/${post.slug}`}>
                  <motion.article
                    whileHover={{ y: -4 }}
                    className="group bg-white rounded-3xl overflow-hidden shadow-sm hover:shadow-xl hover:shadow-honey-900/5 transition-all"
                  >
                    <div className="flex flex-col md:flex-row">
                      <div className="md:w-1/3 aspect-video md:aspect-auto">
                        {post.featuredImage?.url ? (
                          <img
                            src={
                              post.featuredImage.sizes?.card?.url ||
                              post.featuredImage.url
                            }
                            alt={post.featuredImage.alt || post.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full min-h-[200px] bg-gradient-to-br from-honey-200 to-honey-400 flex items-center justify-center">
                            <span className="text-4xl opacity-30">🐝</span>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 p-8">
                        {post.publishedDate && (
                          <time className="text-honey-500 text-sm font-medium">
                            {new Date(post.publishedDate).toLocaleDateString(
                              "nl-NL",
                              {
                                year: "numeric",
                                month: "long",
                                day: "numeric",
                              }
                            )}
                          </time>
                        )}
                        <h2 className="heading-md text-hive-700 mt-2 mb-3 group-hover:text-honey-600 transition-colors">
                          {post.title}
                        </h2>
                        <p className="text-hive-400 leading-relaxed">
                          {post.excerpt}
                        </p>
                        <span className="inline-flex items-center gap-2 text-honey-600 font-semibold mt-4 text-sm group-hover:gap-3 transition-all">
                          Lees meer
                          <span>→</span>
                        </span>
                      </div>
                    </div>
                  </motion.article>
                </Link>
              </ScrollReveal>
            ))}
          </div>

          {posts.length === 0 && (
            <div className="text-center py-20">
              <p className="text-4xl mb-4">🐝</p>
              <p className="text-hive-400">
                Binnenkort verschijnen hier onze verhalen.
              </p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
