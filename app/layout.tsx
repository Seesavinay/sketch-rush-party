import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sketch Rush — Draw Fast, Guess Faster",
  description: "A real-time drawing and guessing party game for 2–8 players.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
