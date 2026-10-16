import { BriefcaseBusiness, Rocket, Workflow } from 'lucide-react'

import { Card } from '@/components/interface/card'
import SectionIntro from './SectionIntro'

const audiences = [
  {
    icon: Rocket,
    number: '01',
    title: 'Тем, кто не программировал',
    description: 'Чтобы собрать первый сайт или приложение небольшими понятными шагами.',
    note: 'Начните с одной страницы',
  },
  {
    icon: BriefcaseBusiness,
    number: '02',
    title: 'Основателям продукта',
    description: 'Чтобы собрать первую версию, показать её пользователям и проверить идею до расширения команды.',
    note: 'Проверьте идею на рабочей версии',
  },
  {
    icon: Workflow,
    number: '03',
    title: 'Командам и студиям',
    description: 'Чтобы не выбирать технологии и структуру заново для каждого нового проекта.',
    note: 'Одинаковая основа для проектов',
  },
]

export default function AudienceSection() {
  return (
<section className="border-b bg-muted/35 py-20 sm:py-24" id="audience" aria-labelledby="audience-title">
  <div className="site-container">
    <div>
      <SectionIntro
        align="center"
        eyebrow="Для кого"
        title="Первая версия продукта — с опытом программирования или без"
        titleId="audience-title"
        description="Новичку шаблон помогает не потеряться в технических решениях, основателю — проверить идею, команде — начинать проекты на общей основе."
      />
    </div>

    <div className="mt-12 grid gap-5 lg:grid-cols-3">
      {audiences.map(({ icon: Icon, number, title, description, note }) => (
        <Card
          key={title}
          className="h-full"
          title={title}
          description={description}
          contentLayout="column"
          header={
            <span className="grid size-11 place-items-center rounded-xl bg-white/10 text-white ring-1 ring-white/15">
              <Icon className="size-5" aria-hidden="true" />
            </span>
          }
          headerAction={
            <span className="rounded-full border border-white/15 px-3 py-1.5 font-heading text-xs font-bold tracking-widest text-white/70 tabular-nums">
              {number}
            </span>
          }
        >
            <p className="mt-8 border-t pt-4 text-xs font-bold tracking-wide text-white/55 uppercase">
              {note}
            </p>
        </Card>
      ))}
    </div>
  </div>
</section>
  )
}
