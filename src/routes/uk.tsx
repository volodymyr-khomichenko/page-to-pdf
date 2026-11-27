import { createFileRoute } from "@tanstack/react-router";
import { LandingPage, alternateLinks, ukrainianCopy } from "@/components/landing-page";

const title = "Page to PDF — Full Page Screenshot";
const description =
  "Розширення для Chrome: знімає залогінену сторінку — кабінет, аналітику, адмінку — і зберігає PNG або PDF для AI.";

export const Route = createFileRoute("/uk")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: "https://page-to-pdf-screenshot.vercel.app/uk" },
    ],
    links: alternateLinks,
  }),
  component: () => <LandingPage copy={ukrainianCopy} />,
});
