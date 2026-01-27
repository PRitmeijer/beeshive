import { getPayloadClient } from "@/lib/payload";
import { BlogClient } from "./BlogClient";

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
