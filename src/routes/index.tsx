import { createFileRoute } from "@tanstack/react-router";
import { Download, FileImage, FileText, PanelTop } from "lucide-react";
import type { ReactNode } from "react";

export const Route = createFileRoute("/")({ component: Home });

const steps = [
  {
    n: "1",
    title: "Скачайте і розпакуйте",
    text: "Всередині буде папка whole-page. Саме її, не архів, треба дати Chrome.",
  },
  {
    n: "2",
    title: "Увімкніть режим розробника",
    text: "На сторінці chrome://extensions перемикач «Режим розробника» зверху справа.",
  },
  {
    n: "3",
    title: "Завантажте розпаковане",
    text: "«Завантажити розпаковане» і виберіть папку whole-page. Іконка з’явиться на панелі.",
  },
];

function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-5 py-10 sm:px-8 sm:py-16">
      <header className="grid items-end gap-8 lg:grid-cols-5">
        <div className="flex flex-col gap-5 lg:col-span-3">
          <p className="text-sm font-semibold tracking-wide text-stamp uppercase">
            Full Page Screenshot
          </p>
          <h1 className="font-serif text-4xl leading-tight font-semibold text-ink sm:text-6xl">
            Page to PDF
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-muted">
            Знімає сторінку, яку не витягнеш публічно: кабінет, аналітику, адмінку. PDF або PNG можна одразу дати в AI.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="/whole-page.zip"
              download="whole-page.zip"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-stamp px-5 text-base font-semibold text-stamp-fg no-underline"
            >
              <Download className="size-5" aria-hidden="true" />
              Скачати розширення
            </a>
            <p className="text-sm text-muted">Версія 1.0.9. У Chrome Web Store ще немає.</p>
          </div>
        </div>
        <div className="lg:col-span-2">
          <ResultPreview />
        </div>
      </header>

      <section className="grid gap-4 md:grid-cols-3" aria-label="Як поставити">
        {steps.map((step) => (
          <article key={step.n} className="rounded-2xl border border-line bg-card p-5">
            <p className="font-serif text-3xl font-semibold text-stamp">{step.n}</p>
            <h2 className="mt-3 text-lg font-semibold">{step.title}</h2>
            <p className="mt-2 leading-relaxed text-muted">{step.text}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-8 border-t border-line pt-8 lg:grid-cols-2">
        <div>
          <h2 className="font-serif text-3xl font-semibold">Як знімати</h2>
          <ol className="mt-4 flex flex-col gap-3 text-base leading-relaxed">
            <li>Відкрийте сторінку, на яку ви вже увійшли: аналітику, рекламний кабінет, CRM, адмінку чи внутрішній інструмент.</li>
            <li>Натисніть іконку Page to PDF або Alt+Shift+Y.</li>
            <li>
              Зачекайте. Chrome на мить напише, що сторінку налагоджують — так
              знімок виходить цілісним, без швів.
            </li>
            <li>У новій вкладці скачайте PNG або PDF і за потреби завантажте файл у ChatGPT, Claude, Gemini чи інший AI.</li>
          </ol>
        </div>
        <div className="rounded-2xl border border-line bg-card p-5">
          <h2 className="text-lg font-semibold">Що вийде, а що ні</h2>
          <ul className="mt-4 flex flex-col gap-4">
            <Limit
              icon={<FileImage className="size-5" aria-hidden="true" />}
              title="Кабінети, аналітика, адмінки"
              text="Уся висота сторінки, яку ви вже бачите у своєму браузері. Нічого не відправляється на сервер. Статті теж можна зняти, але це не головне."
            />
            <Limit
              icon={<FileText className="size-5" aria-hidden="true" />}
              title="Два PDF"
              text="Одна довга сторінка як є, або нарізка на A4. Рядки на межі аркуша можуть розрізатися."
            />
            <Limit
              icon={<PanelTop className="size-5" aria-hidden="true" />}
              title="Не для пошти і стрічок"
              text="Внутрішній скрол, як у Gmail, і стрічки, що догружаються вниз, знімаються лише частково. Системні сторінки Chrome — ніяк."
            />
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

function ResultPreview() {
  const bars = [42, 68, 50, 84, 58, 96, 72];
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-card shadow-sm" aria-hidden="true">
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <span className="text-sm font-semibold">Кабінет</span>
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
            <Kpi label="Візити" value="12,4к" />
            <Kpi label="Заявки" value="318" />
            <Kpi label="Конверсія" value="4,8%" />
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

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-line bg-paper px-2 py-2">
      <p className="text-[11px] text-muted">{label}</p>
      <p className="text-sm font-semibold text-ink">{value}</p>
    </div>
  );
}

function Limit({
  icon,
  title,
  text,
}: {
  icon: ReactNode;
  title: string;
  text: string;
}) {
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
