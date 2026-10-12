import { cn } from '@/lib/utils'
interface Props {
  align?: 'center' | 'left'
  description: string
  eyebrow: string
  title: string
  titleId?: string
}

export default function SectionIntro({ align = 'left', description, eyebrow, title, titleId }: Props) {
  return (
<div className={cn('max-w-2xl', align === 'center' && 'mx-auto text-center')}>
  <p className="text-sm font-bold tracking-[0.16em] text-white/55 uppercase">{eyebrow}</p>
  <h2 className="glow-text mt-3 font-heading text-3xl font-bold tracking-tight text-balance sm:text-4xl" id={titleId}>
    {title}
  </h2>
  <p className="mt-4 text-base leading-7 text-muted-foreground text-pretty sm:text-lg">
    {description}
  </p>
</div>
  )
}
