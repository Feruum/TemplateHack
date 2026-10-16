import { ArrowRight } from 'lucide-react'

import { ButtonLink } from '@/components/interface/button'
import { Card } from '@/components/interface/card'

interface Props {
  primaryHref: string
  primaryLabel: string
}

export default function CtaSection({ primaryHref, primaryLabel }: Props) {
  return (
<section className="py-20 sm:py-24" id="cta" aria-labelledby="cta-title">
  <div className="site-container">
    <Card
      className="glow-surface"
      title="Начните с одного экрана или сценария."
      titleAs="h2"
      titleId="cta-title"
      titleSize="display"
      eyebrow="С чего начать"
      description="Например, попросите заменить название и текст, собрать первый экран лендинга или добавить карточки услуг."
      contentLayout="action"
      padding="spacious"
      lift={false}
      action={
        <ButtonLink className="glow-surface shrink-0" size="lg" href={primaryHref}>
          {primaryLabel}
          <ArrowRight data-icon="inline-end" aria-hidden="true" />
        </ButtonLink>
      }
    >
      <div className="glow-halo pointer-events-none absolute -right-24 -top-24 size-80 rounded-full blur-3xl" aria-hidden="true"></div>
    </Card>
  </div>
</section>
  )
}
