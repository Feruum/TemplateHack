import { Card } from '@/components/interface/card'
import { Separator } from '@/components/interface/separator'
import SectionIntro from './SectionIntro'

const metrics = [
  ['Продолжить', 'ставить агенту новые задачи в том же проекте'],
  ['Передать', 'исходный код разработчику без переноса из конструктора'],
  ['Опубликовать', 'разместить сайт и сервер на хостинге, а мобильное приложение — в магазинах приложений'],
]

export default function ProofSection() {
  return (
<section className="border-b py-20 sm:py-24" id="results" aria-labelledby="results-title">
  <div className="site-container">
    <div>
      <SectionIntro
        align="center"
        eyebrow="Что останется у вас"
        title="Исходный код, который можно развивать дальше"
        titleId="results-title"
        description="Проект можно запускать локально, размещать на хостинге и передавать разработчику. Вы не привязаны к закрытому конструктору."
      />
    </div>

    <div className="mt-12 grid gap-5 lg:grid-cols-[1.15fr_0.85fr]">
      <Card
        className="glow-surface"
        title="Проект состоит из обычных исходных файлов. Их можно хранить в своём репозитории, открывать в редакторе и передавать разработчику."
        titleAs="p"
        titleSize="large"
        eyebrow="Без закрытого конструктора"
        padding="comfortable"
        lift={false}
      />

      <Card padding="comfortable" lift={false}>
          {metrics.map(([value, label], index) => (
            <div key={index}>
              {index > 0 && <Separator className="my-6" />}
              <p className="glow-text font-heading text-4xl font-bold tracking-tight">{value}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{label}</p>
            </div>
          ))}
      </Card>
    </div>
  </div>
</section>
  )
}
