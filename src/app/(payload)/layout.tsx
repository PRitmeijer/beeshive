import type { Metadata } from "next";
import React from "react";

import "@payloadcms/next/css";

export const metadata: Metadata = {
  title: "Admin — De Bee's Hive",
};

export default function PayloadLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
