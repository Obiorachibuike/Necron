import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Providers } from "@/components/providers";

export const metadata: Metadata = {
  title: {
    default: "CareerPilot AI — career strategy, evidence, and applications",
    template: "%s · CareerPilot AI",
  },
  description:
    "CareerPilot AI turns your verified experience into targeted applications, interview practice, and a clear job-search plan.",
  applicationName: "CareerPilot AI",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7F9F6" },
    { media: "(prefers-color-scheme: dark)", color: "#080B09" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const theme = cookieStore.get("cp_theme")?.value;
  const initialClass = theme === "dark" ? "dark" : "";
  return (
    <html lang="en" className={initialClass} data-theme={theme ?? "system"} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=document.cookie.match(/(?:^|; )cp_theme=([^;]*)/);var t=m?decodeURIComponent(m[1]):(localStorage.getItem('cp_theme')||'system');var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.dataset.theme=t;}catch(e){}})();`,
          }}
        />
      </head>
      <body>
        <a href="#main-content" className="cp-skip">Skip to content</a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
