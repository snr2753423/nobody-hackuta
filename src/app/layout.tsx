import type { Metadata } from "next";
import { Cinzel, EB_Garamond } from "next/font/google";
import "./globals.css";

const cinzel = Cinzel({ variable: "--font-display", subsets: ["latin"], weight: ["400", "700", "900"] });
const garamond = EB_Garamond({ variable: "--font-body", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "NOBODY: Escape Polyphemus",
  description: "A webcam-controlled retelling of the Cyclops episode from Homer's Odyssey. Invent your own powers with your body.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${cinzel.variable} ${garamond.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
