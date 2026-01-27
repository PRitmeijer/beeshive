"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { HexagonGrid } from "@/components/HexagonGrid";

interface BlogPostProps {
  post: {
    title: string;
    publishedDate?: string;
    excerpt: string;
    content: any;
    featuredImage?: {
      url?: string;
      alt?: string;
      sizes?: { hero?: { url?: string } };
    };
    author?: { name?: string; email?: string };
  };
}

export function BlogPostClient({ post }: BlogPostProps) {
  return (
    <>
      <section className="relative min-h-[50vh] flex items-center justify-center bg-hive-800 overflow-hidden">
        <HexagonGrid count={10} />
        {post.featuredImage?.url && (
          <img
            src={post.featuredImage.sizes?.hero?.url || post.featuredImage.url}
            alt={post.featuredImage.alt || post.title}
            className="absolute inset-0 w-full h-full object-cover opacity-20"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-hive-900/70 to-hive-800/90" />
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 text-center px-6 max-w-3xl"
        >
          <Link
            href="/blog"
            className="text-honey-400/70 text-sm hover:text-honey-400 transition-colors"
          >
            ← Terug naar blog
          </Link>
          {post.publishedDate && (
            <time className="block text-honey-400/60 text-sm mt-4">
              {new Date(post.publishedDate).toLocaleDateString("nl-NL", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </time>
          )}
          <h1 className="heading-lg text-honey-100 mt-3">{post.title}</h1>
          {post.author?.name && (
            <p className="text-honey-300/50 mt-4 text-sm">
              Door {post.author.name}
            </p>
          )}
        </motion.div>
      </section>

      <section className="section-padding">
        <div className="max-w-3xl mx-auto">
          <div className="prose prose-lg max-w-none prose-headings:font-display prose-headings:text-hive-700 prose-p:text-hive-500 prose-a:text-honey-600 prose-strong:text-hive-700">
            <p className="lead text-xl text-hive-600 font-medium">
              {post.excerpt}
            </p>
            {/* Rich text content rendered by Payload */}
            <div className="mt-8 text-hive-500 leading-relaxed">
              <p>
                De volledige inhoud van dit artikel wordt geladen vanuit het CMS.
                Beheer je content via het{" "}
                <a href="/admin" className="text-honey-600 underline">
                  admin paneel
                </a>
                .
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
