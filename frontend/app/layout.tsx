import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Arc Orchestrator",
  description: "AI Agent Orchestrator on Arc Testnet",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
