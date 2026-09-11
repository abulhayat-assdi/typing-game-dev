import type { Metadata, Viewport } from "next";

/**
 * Root layout (M3). Renders no <html>/<body> itself — the locale layout owns
 * them so `lang` is always correct. This level holds only global metadata.
 */
export const metadata: Metadata = {
  title: {
    default: "Typing Adventure Platform",
    template: "%s · Typing Adventure",
  },
  description:
    "Gamified typing-learning adventure — worlds, missions, XP, streaks, clans and clan wars.",
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#7c3aed",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
