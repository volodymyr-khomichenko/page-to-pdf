import { Link } from "@tanstack/react-router";
import { Download, FileImage, FileText, PanelTop } from "lucide-react";
import type { ReactNode } from "react";

const icons = [
  <FileImage className="size-5" aria-hidden="true" />,
  <FileText className="size-5" aria-hidden="true" />,
  <PanelTop className="size-5" aria-hidden="true" />,
];

export type LandingCopy = {
  lang: "en" | "uk";
  eyebrow: string | null;
  title: string;
  subtitle: string;
  download: string;
  version: string;
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
  eyebrow: null,
  title: "Page to PDF — Full Page Screenshot",
  subtitle:
    "Capture a logged-in dashboard or private page as PNG or PDF, then give the file to an AI.",
  download: "Download extension",
  version: "Version 1.0.9. Not in the Chrome Web Store yet.",
  installLabel: "How to install",
  steps: [
    {
      title: "Download and unzip",
      text: "You'll get a folder called whole-page. Give Chrome that folder, not the zip.",
    },
    {
      title: "Turn on Developer mode",
      text: "On chrome://extensions, the Developer mode switch is in the top right.",
    },
    {
      title: "Load unpacked",
      text: "Click Load unpacked and pick the whole-page folder. The icon appears in the toolbar.",
    },
  ],
  howTitle: "How to capture",
  how: [
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
  eyebrow: "Full Page Screenshot",
  title: "Page to PDF",
  subtitle:
    "Знімає сторінку, яку не витягнеш публічно: кабінет, аналітику, адмінку. PDF або PNG можна одразу дати в AI.",
  download: "Скачати розширення",
  version: "Версія 1.0.9. У Chrome Web Store ще немає.",
  installLabel: "Як поставити",
  steps: [
    {
      title: "Скачайте і розпакуйте",
      text: "Всередині буде папка whole-page. Саме її, не архів, треба дати Chrome.",
    },
    {
      title: "Увімкніть режим розробника",
      text: "На сторінці chrome://extensions перемикач «Режим розробника» зверху справа.",
    },
    {
      title: "Завантажте розпаковане",
      text: "«Завантажити розпаковане» і виберіть папку whole-page. Іконка з’явиться на панелі.",
    },
  ],
  howTitle: "Як знімати",
  how: [
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
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-5 py-10 sm:px-8 sm:py-16">
      <header className="flex flex-col gap-6">
        <LanguageSwitch lang={copy.lang} />
        <div className="grid items-end gap-8 lg:grid-cols-5">
          <div className="flex flex-col gap-5 lg:col-span-3">
            {copy.eyebrow ? (
              <p className="text-sm font-semibold tracking-wide text-stamp uppercase">
                {copy.eyebrow}
              </p>
            ) : null}
            <h1 className="font-serif text-4xl leading-tight font-semibold text-ink sm:text-5xl">
              {copy.title}
            </h1>
            <p className="max-w-xl text-lg leading-relaxed text-muted">{copy.subtitle}</p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="/whole-page.zip"
                download="whole-page.zip"
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-stamp px-5 text-base font-semibold text-stamp-fg no-underline"
              >
                <Download className="size-5" aria-hidden="true" />
                {copy.download}
              </a>
              <p className="text-sm text-muted">{copy.version}</p>
            </div>
          </div>
          <div className="lg:col-span-2">
            <ResultPreview title={copy.previewTitle} kpis={copy.kpis} />
          </div>
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3" aria-label={copy.installLabel}>
        {copy.steps.map((step, index) => (
          <article key={step.title} className="rounded-2xl border border-line bg-card p-5">
            <p className="font-serif text-3xl font-semibold text-stamp">{index + 1}</p>
            <h2 className="mt-3 text-lg font-semibold">{step.title}</h2>
            <p className="mt-2 leading-relaxed text-muted">{step.text}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-8 border-t border-line pt-8 lg:grid-cols-2">
        <div>
          <h2 className="font-serif text-3xl font-semibold">{copy.howTitle}</h2>
          <ol className="mt-4 flex flex-col gap-3 text-base leading-relaxed">
            {copy.how.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ol>
        </div>
        <div className="rounded-2xl border border-line bg-card p-5">
          <h2 className="text-lg font-semibold">{copy.limitsTitle}</h2>
          <ul className="mt-4 flex flex-col gap-4">
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
          className="text-muted"
        >
          Privacy policy
        </a>
      </footer>
    </main>
  );
}

function LanguageSwitch({ lang }: { lang: "en" | "uk" }) {
  const on = "text-sm font-semibold text-ink no-underline";
  const off = "text-sm font-semibold text-muted no-underline";
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
    <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-sm" aria-hidden="true">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-xs text-muted">PNG · PDF</span>
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
              <div key={kpi.label} className="rounded-lg border border-line bg-paper px-2 py-2">
                <p className="text-[11px] text-muted">{kpi.label}</p>
                <p className="text-sm font-semibold text-ink">{kpi.value}</p>
              </div>
            ))}
          </div>
          <div className="flex h-20 items-end gap-1.5 rounded-lg border border-line bg-paper px-3 py-2">
            {bars.map((height, index) => (
              <div
                key={index}
                className="flex-1 rounded-sm bg-stamp"
                style={{ height: `${height}%` }}
              />
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
        <span className="block font-semibold">{title}</span>
        <span className="mt-1 block leading-relaxed text-muted">{text}</span>
      </span>
    </li>
  );
}
