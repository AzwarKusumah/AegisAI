import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "AegisAI | Data protection",
  description: "Manage endpoint activity, sensitive-data policies, and browser enforcement."
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
