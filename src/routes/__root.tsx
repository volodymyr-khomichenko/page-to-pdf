import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Page to PDF — Full Page Screenshot" },
      {
        name: "description",
        content: "Розширення для Chrome: знімає залогінену сторінку — кабінет, аналітику, адмінку — і зберігає PNG або PDF для AI.",
      },
      { name: "theme-color", content: "#1f4d3a" },
      { property: "og:title", content: "Page to PDF — Full Page Screenshot" },
      {
        property: "og:description",
        content: "Розширення для Chrome: знімає залогінену сторінку — кабінет, аналітику, адмінку — і зберігає PNG або PDF для AI.",
      },
      { property: "og:url", content: "https://page-to-pdf-screenshot.vercel.app/" },
      { property: "og:image", content: "https://page-to-pdf-screenshot.vercel.app/og.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://page-to-pdf-screenshot.vercel.app/og.png" },
    ],
    links: [
      { rel: "icon", href: "/favicon.ico", sizes: "32x32" },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      ...(import.meta.env.PROD
        ? []
        : [
            { rel: "manifest", href: "/__grok/manifest.webmanifest" },
            { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
          ]),
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,560;9..144,650&family=Source+Sans+3:ital,wght@0,400;0,600;0,700;1,400&display=swap",
      },
    ],
  }),
  component: () => (
    <html lang="uk" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
