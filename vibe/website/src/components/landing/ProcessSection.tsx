import { Badge } from '@/components/interface/badge'
import { Card } from '@/components/interface/card'
import SectionIntro from './SectionIntro'

const steps = [
  {
    number: '01',
    title: 'Опишите продукт',
    description: 'Кто будет им пользоваться, какую проблему он решает и что пользователь должен сделать в первую очередь.',
  },
  {
    number: '02',
    title: 'Поставьте одну задачу',
    description: 'Например: собрать главный экран, добавить форму заявки или подключить данные. Агент внесёт изменения и запустит проверки.',
  },
  {
    number: '03',
    title: 'Проверьте результат',
    description: 'Откройте страницу или приложение. Если сценарий работает как задумано и проверки прошли, переходите к следующей задаче.',
  },
]

export default function ProcessSection() {
  return (
<section className="border-b bg-muted/35 py-20 sm:py-24" id="process" aria-labelledby="process-title">
  <div className="site-container grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
    <div>
      <SectionIntro
        eyebrow="С чего начать"
        title="Первая проверяемая задача — в три шага"
        titleId="process-title"
        description="Опишите продукт, поставьте агенту одну конкретную задачу и проверьте результат. После этого переходите к следующей функции."
      />
    </div>
    <ol className="grid gap-4">
      {steps.map((step) => (
        <li key={step.number}>
          <Card
            title={step.title}
            description={step.description}
            contentLayout="leading"
            leading={
              <Badge className="h-8 min-w-11 tabular-nums">
                {step.number}
              </Badge>
            }
          />
        </li>
      ))}
    </ol>
  </div>
</section>
  )
}
