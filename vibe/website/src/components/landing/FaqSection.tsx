import { ProgressiveAccordion } from '@/components/interface/accordion'

import SectionIntro from './SectionIntro'

const questions = [
  {
    question: 'Можно ли начать без опыта в программировании?',
    answer: 'Да, если начинать с небольших задач. Опишите, какой текст, экран или сценарий нужен. Агент внесёт изменения по правилам шаблона. Ваша часть — проверить результат и решить, что делать дальше.',
  },
  {
    question: 'Как агент понимает, что менять?',
    answer: 'В проекте заранее описано, где находятся его части, как они связаны и какие проверки запускать. Агент следует этим правилам, когда ищет нужный код, вносит изменения и проверяет результат.',
  },
  {
    question: 'Что можно собрать?',
    answer: 'Лендинг, веб-приложение, мобильное приложение и сервер с авторизацией и базой данных. Можно взять только нужную часть, а остальные подключить позже.',
  },
  {
    question: 'Какие технологии уже настроены?',
    answer: 'React и Vite для публичного сайта и рабочей области, Bun и Hono для API, Drizzle и PostgreSQL для данных. Python и LangGraph запускают подключаемые модули агента.',
  },
  {
    question: 'Как проверяются изменения агента?',
    answer: 'Агент выбирает и запускает подходящие автоматические проверки кода, тесты или сборку проекта. Затем показывает результаты. Это помогает находить ошибки, но не заменяет ручную проверку страницы или сценария перед публикацией.',
  },
  {
    question: 'Когда понадобится разработчик?',
    answer: 'Для первых страниц и небольших изменений опыт программирования не обязателен. Перед запуском платежей, работы с персональными данными или сложных интеграций стоит привлечь разработчика.',
  },
]

const faqItems = questions.map(({ question, answer }) => ({ title: question, content: answer }))

export default function FaqSection() {
  return (
<section className="border-b bg-muted/35 py-20 sm:py-24" id="faq" aria-labelledby="faq-title">
  <div className="site-container grid gap-12 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
    <div className="lg:sticky lg:top-28 lg:self-start">
      <SectionIntro
        eyebrow="Частые вопросы"
        title="Что знать перед началом"
        titleId="faq-title"
        description="Коротко о составе шаблона, работе с агентом и проверке результата."
      />
    </div>

    <div className="overflow-hidden rounded-2xl border bg-card px-5 sm:px-7">
      <ProgressiveAccordion items={faqItems} />
    </div>
  </div>
</section>
  )
}
