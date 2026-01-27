import React from "react";

export const metadata = {
  title: "De Bee's Hive",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
