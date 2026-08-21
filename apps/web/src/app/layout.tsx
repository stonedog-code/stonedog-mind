import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers.tsx";

export const metadata: Metadata = {
  title: "stonedog-mind",
  description: "A short quiz on the topics you chose. Just for fun.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
