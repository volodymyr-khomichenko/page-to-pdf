import { createFileRoute } from "@tanstack/react-router";
import { LandingPage, alternateLinks, englishCopy } from "@/components/landing-page";

const title = "Page to PDF — Full Page Screenshot";
const description =
  "Capture a logged-in dashboard or private page as PNG or PDF, then give the file to an AI.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: "https://page-to-pdf-screenshot.vercel.app/" },
    ],
    links: alternateLinks,
  }),
  component: () => <LandingPage copy={englishCopy} />,
});
