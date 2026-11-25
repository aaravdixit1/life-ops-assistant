import type { Metadata } from "next";
import "./globals.css";
import { WorkspaceLayout } from "@/components/workspace-layout";

export const metadata: Metadata = {
  title: "Life-Ops Assistant",
  description: "Autonomous Personal Life & Academic Operations Assistant",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <head>
        {/* Anti-Flicker Inline Theme Script */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                const saved = localStorage.getItem("lifeops-theme-pref");
                if (saved) {
                  const { mode } = JSON.parse(saved);
                  if (mode) document.documentElement.classList.add(mode);
                } else {
                  document.documentElement.classList.add("dark");
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="h-full antialiased overflow-hidden">
        <WorkspaceLayout>{children}</WorkspaceLayout>
      </body>
    </html>
  );
}
