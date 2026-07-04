import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { getServerLocale } from "@/lib/i18n/server";
import { getServerTranslator } from "@/lib/i18n/server";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  const t = getServerTranslator();
  return {
    title: t("app.title"),
    description: t("app.description"),
    manifest: "/site.webmanifest",
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/favicon.svg", type: "image/svg+xml" },
        { url: "/favicon-96x96.png", sizes: "96x96", type: "image/png" },
      ],
      apple: "/apple-touch-icon.png",
    },
    appleWebApp: {
      capable: true,
      statusBarStyle: "black-translucent",
      title: "Kanby",
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0a0e1a",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = getServerLocale();
  return (
    <html lang={locale} suppressHydrationWarning className={inter.variable}>
      <body className="font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}