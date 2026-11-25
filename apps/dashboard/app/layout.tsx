import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "AegisAI | Security Events",
  description: "Self-hosted AI data-loss prevention audit console"
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
