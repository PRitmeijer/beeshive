import { getPayloadClient } from "@/lib/payload";
import { BlogPostClient } from "./BlogPostClient";
import { notFound } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  try {
    const payload = await getPayloadClient();
    const res = await payload.find({
      collection: "blog-posts",
      where: {
        slug: { equals: slug },
        status: { equals: "published" },
      },
      depth: 2,
      limit: 1,
    });

    if (res.docs.length === 0) return notFound();

    return <BlogPostClient post={res.docs[0] as any} />;
  } catch {
    return notFound();
  }
}
