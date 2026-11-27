import { Link } from "@tanstack/react-router";
import { FileImage, FileText, PanelTop } from "lucide-react";
import type { ReactNode } from "react";

/** Swap this for the listing URL once the item is published. */
export const CHROME_STORE_URL =
  "https://chromewebstore.google.com/search/Page%20to%20PDF%20Full%20Page%20Screenshot";

const icons = [
  <FileImage className="size-5" aria-hidden="true" />,
  <FileText className="size-5" aria-hidden="true" />,
  <PanelTop className="size-5" aria-hidden="true" />,
];

export type LandingCopy = {
  lang: "en" | "uk";
  kicker: string;
  title: string;
  subtitle: string;
  cta: string;
  download: string;
  storeNote: string;
  installLabel: string;
  steps: { title: string; text: string }[];
  howTitle: string;
  how: string[];
  limitsTitle: string;
  limits: { title: string; text: string }[];
  previewTitle: string;
  kpis: { label: string; value: string }[];
};

export const englishCopy: LandingCopy = {
  lang: "en",
  kicker: "Chrome extension",
  title: "Page to PDF — Full Page Screenshot",
  subtitle:
    "Capture a logged-in dashboard or private page as PNG or PDF, then give the file to an AI.",
  cta: "Add to Chrome",
  download: "Download page-to-pdf.zip",
  storeNote: "Version 1.0.10. Chrome Web Store, or the zip while the listing is not up yet.",
  installLabel: "How to use",
  steps: [
    {
      title: "Install it",
      text: "Add it from the Chrome Web Store. Or download page-to-pdf.zip, unzip it, open chrome://extensions, turn on Developer mode, and choose the page-to-pdf folder.",
    },
    {
      title: "Open your page",
      text: "Open a page you're already signed in to: analytics, an ad account, a CRM, an admin panel or an internal tool.",
    },
    {
      title: "Save the file",
      text: "Click the icon or press Alt+Shift+Y, then download PNG or PDF from the new tab.",
    },
  ],
  howTitle: "How to capture",
  how: [
    "Install Page to PDF from the Chrome Web Store, or from the page-to-pdf.zip archive.",
    "Open a page you're already signed in to: analytics, an ad account, a CRM, an admin panel or an internal tool.",
    "Click the Page to PDF icon or press Alt+Shift+Y.",
    "Wait a moment. Chrome briefly shows that the page is being debugged, which is how the capture comes out in one piece, without seams.",
    "In the new tab, download PNG or PDF and, if you want, upload the file to ChatGPT, Claude, Gemini or another AI.",
  ],
  limitsTitle: "What works and what doesn't",
  limits: [
    {
      title: "Dashboards, analytics, admin panels",
      text: "The full height of a page you can already see in your browser. Nothing is sent to a server. Articles work too, but that's not the main use.",
    },
    {
      title: "Two PDFs",
      text: "One long page as is, or split into A4 sheets. Lines at a page break can be cut.",
    },
    {
      title: "Not for email or feeds",
      text: "Inner scrolling areas like Gmail and feeds that load more as you scroll are captured only partly. Chrome system pages can't be captured.",
    },
  ],
  previewTitle: "Dashboard",
  kpis: [
    { label: "Visits", value: "12.4k" },
    { label: "Leads", value: "318" },
    { label: "Conversion", value: "4.8%" },
  ],
};

export const ukrainianCopy: LandingCopy = {
  lang: "uk",
  kicker: "Розширення для Chrome",
  title: "Page to PDF — Full Page Screenshot",
  subtitle:
    "Знімає сторінку, яку не витягнеш публічно: кабінет, аналітику, адмінку. PDF або PNG можна одразу дати в AI.",
  cta: "Додати в Chrome",
  download: "Скачати page-to-pdf.zip",
  storeNote: "Версія 1.0.10. Chrome Web Store або архів, поки картки в магазині ще немає.",
  installLabel: "Як користуватися",
  steps: [
    {
      title: "Поставте розширення",
      text: "Додайте з Chrome Web Store. Або скачайте page-to-pdf.zip, розпакуйте, відкрийте chrome://extensions, увімкніть режим розробника і виберіть папку page-to-pdf.",
    },
    {
      title: "Відкрийте свою сторінку",
      text: "Відкрийте сторінку, на яку ви вже увійшли: аналітику, рекламний кабінет, CRM, адмінку чи внутрішній інструмент.",
    },
    {
      title: "Збережіть файл",
      text: "Натисніть іконку або Alt+Shift+Y і скачайте PNG або PDF у новій вкладці.",
    },
  ],
  howTitle: "Як знімати",
  how: [
    "Поставте Page to PDF з Chrome Web Store або з архіву page-to-pdf.zip.",
    "Відкрийте сторінку, на яку ви вже увійшли: аналітику, рекламний кабінет, CRM, адмінку чи внутрішній інструмент.",
    "Натисніть іконку Page to PDF або Alt+Shift+Y.",
    "Зачекайте. Chrome на мить напише, що сторінку налагоджують — так знімок виходить цілісним, без швів.",
    "У новій вкладці скачайте PNG або PDF і за потреби завантажте файл у ChatGPT, Claude, Gemini чи інший AI.",
  ],
  limitsTitle: "Що вийде, а що ні",
  limits: [
    {
      title: "Кабінети, аналітика, адмінки",
      text: "Уся висота сторінки, яку ви вже бачите у своєму браузері. Нічого не відправляється на сервер. Статті теж можна зняти, але це не головне.",
    },
    {
      title: "Два PDF",
      text: "Одна довга сторінка як є, або нарізка на A4. Рядки на межі аркуша можуть розрізатися.",
    },
    {
      title: "Не для пошти і стрічок",
      text: "Внутрішній скрол, як у Gmail, і стрічки, що догружаються вниз, знімаються лише частково. Системні сторінки Chrome — ніяк.",
    },
  ],
  previewTitle: "Кабінет",
  kpis: [
    { label: "Візити", value: "12,4к" },
    { label: "Заявки", value: "318" },
    { label: "Конверсія", value: "4,8%" },
  ],
};

const SITE = "https://page-to-pdf-screenshot.vercel.app";

export const alternateLinks = [
  { rel: "alternate", hrefLang: "en", href: `${SITE}/` },
  { rel: "alternate", hrefLang: "uk", href: `${SITE}/uk` },
  { rel: "alternate", hrefLang: "x-default", href: `${SITE}/` },
];

export function LandingPage({ copy }: { copy: LandingCopy }) {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <a
            href="https://khomichenko.com/"
            className="text-lg font-bold tracking-tight text-ink no-underline"
          >
            Volodymyr Khomichenko
          </a>
          <LanguageSwitch lang={copy.lang} />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-col gap-14 px-5 py-12 sm:px-8 sm:py-16">
        <section className="grid items-start gap-10 lg:grid-cols-5">
          <div className="flex flex-col gap-5 lg:col-span-3">
            <p className="text-xs font-bold tracking-[0.14em] text-stamp uppercase">{copy.kicker}</p>
            <h1 className="max-w-xl text-4xl leading-tight font-bold text-ink sm:text-[42px] sm:leading-[1.2]">
              {copy.title}
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted">{copy.subtitle}</p>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <a
                href={CHROME_STORE_URL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-12 items-center justify-center rounded-[3px] bg-stamp px-8 text-sm font-bold tracking-wide text-white uppercase no-underline"
              >
                {copy.cta}
              </a>
              <a
                href="/page-to-pdf.zip"
                className="inline-flex min-h-12 items-center justify-center rounded-[3px] border border-stamp bg-white px-8 text-sm font-bold tracking-wide text-stamp uppercase no-underline"
              >
                {copy.download}
              </a>
              <p className="w-full text-sm text-muted">{copy.storeNote}</p>
            </div>
          </div>
          <div className="lg:col-span-2">
            <ResultPreview title={copy.previewTitle} kpis={copy.kpis} />
          </div>
        </section>

        <section className="grid gap-8 border-t border-line pt-10 md:grid-cols-3" aria-label={copy.installLabel}>
          {copy.steps.map((step, index) => (
            <article key={step.title}>
              <p className="text-sm font-bold text-stamp">{String(index + 1).padStart(2, "0")}</p>
              <h2 className="mt-2 text-xl font-bold text-ink">{step.title}</h2>
              <p className="mt-2 leading-relaxed text-muted">{step.text}</p>
            </article>
          ))}
        </section>

        <section className="grid gap-10 border-t border-line pt-10 lg:grid-cols-2">
          <div>
            <h2 className="text-3xl font-bold text-ink">{copy.howTitle}</h2>
            <ol className="mt-5 flex list-decimal flex-col gap-3 pl-5 leading-relaxed">
              {copy.how.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </div>
          <div className="border border-line p-6">
            <h2 className="text-xl font-bold text-ink">{copy.limitsTitle}</h2>
            <ul className="mt-5 flex flex-col gap-5">
              {copy.limits.map((limit, index) => (
                <Limit key={limit.title} icon={icons[index]} title={limit.title} text={limit.text} />
              ))}
            </ul>
          </div>
        </section>

        <footer className="border-t border-line pt-6 text-sm">
          <a
            href="https://khomichenko.com/privacy-policy/#page-to-pdf"
            target="_blank"
            rel="noreferrer"
            className="text-stamp no-underline"
          >
            Privacy policy
          </a>
        </footer>
      </main>
    </div>
  );
}

function LanguageSwitch({ lang }: { lang: "en" | "uk" }) {
  const on = "text-sm font-bold text-ink no-underline";
  const off = "text-sm font-bold text-stamp no-underline";
  return (
    <nav aria-label={lang === "uk" ? "Мова" : "Language"} className="flex items-center gap-2">
      {lang === "en" ? (
        <span className={on} aria-current="page">
          EN
        </span>
      ) : (
        <Link to="/" hrefLang="en" className={off}>
          EN
        </Link>
      )}
      <span className="text-muted" aria-hidden="true">
        |
      </span>
      {lang === "uk" ? (
        <span className={on} aria-current="page">
          UK
        </span>
      ) : (
        <Link to="/uk" hrefLang="uk" className={off}>
          UK
        </Link>
      )}
    </nav>
  );
}

function ResultPreview({
  title,
  kpis,
}: {
  title: string;
  kpis: { label: string; value: string }[];
}) {
  const bars = [42, 68, 50, 84, 58, 96, 72];
  return (
    <div className="border border-line bg-white" aria-hidden="true">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-sm font-bold text-ink">{title}</span>
        <span className="text-xs font-medium tracking-wide text-muted uppercase">PNG · PDF</span>
      </div>
      <div className="flex gap-3 p-4">
        <div className="flex w-12 shrink-0 flex-col gap-2 pt-1">
          <div className="h-2 rounded-full bg-stamp" />
          <div className="h-2 w-9 rounded-full bg-line" />
          <div className="h-2 rounded-full bg-line" />
          <div className="h-2 w-8 rounded-full bg-line" />
          <div className="h-2 w-10 rounded-full bg-line" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="grid grid-cols-3 gap-2">
            {kpis.map((kpi) => (
              <div key={kpi.label} className="border border-line px-2 py-2">
                <p className="text-[11px] text-muted">{kpi.label}</p>
                <p className="text-sm font-bold text-ink">{kpi.value}</p>
              </div>
            ))}
          </div>
          <div className="flex h-20 items-end gap-1.5 border border-line px-3 py-2">
            {bars.map((height, index) => (
              <div key={index} className="flex-1 bg-stamp" style={{ height: `${height}%` }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function Limit({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <li className="flex gap-3">
      <span className="mt-0.5 text-stamp">{icon}</span>
      <span>
        <span className="block font-bold text-ink">{title}</span>
        <span className="mt-1 block leading-relaxed text-muted">{text}</span>
      </span>
    </li>
  );
}
