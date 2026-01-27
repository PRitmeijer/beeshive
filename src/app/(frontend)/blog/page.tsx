import type { Metadata } from "next";
import { getPayloadClient } from "@/lib/payload";
import { BlogClient } from "./BlogClient";

export const metadata: Metadata = {
  title: "Blog — De Bee's Hive",
  description:
    "Lees het laatste nieuws van De Bee's Hive — recepten, evenementen, verhalen en meer uit ons eetcafé in Zuilen.",
  alternates: { canonical: "https://debeeshive.nl/blog" },
};

export const dynamic = "force-dynamic";

export default async function BlogPage() {
  let posts: any[] = [];

  try {
    const payload = await getPayloadClient();
    const res = await payload.find({
      collection: "blog-posts",
      where: { status: { equals: "published" } },
      sort: "-publishedDate",
      limit: 50,
      depth: 1,
    });
    posts = res.docs;
  } catch {
    // CMS not initialized
  }

  return <BlogClient posts={posts} />;
}
