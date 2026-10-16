import type { ComponentProps } from 'react'
import { Card as ArcCard } from '../arc/card/card'
import { Typography } from '../typography'
import { cn } from '@/lib/utils'

export function Card({ size = 'default', className, ...props }: ComponentProps<'div'> & { size?: 'default' | 'sm' }) {
  return <ArcCard {...props} interactive={false} data-slot="card" data-size={size} className={cn('group/card [&>div]:grid [&>div]:gap-5', size === 'sm' && '[&>div]:gap-3', className)} />
}
export function CardHeader({ className, ...props }: ComponentProps<'div'>) { return <div {...props} data-slot="card-header" className={cn('grid gap-1.5', className)} /> }
export function CardContent({ className, ...props }: ComponentProps<'div'>) { return <div {...props} data-slot="card-content" className={className} /> }
export function CardFooter({ className, ...props }: ComponentProps<'div'>) { return <div {...props} data-slot="card-footer" className={cn('flex items-center gap-3', className)} /> }
export function CardAction({ className, ...props }: ComponentProps<'div'>) { return <div {...props} data-slot="card-action" className={cn('col-start-2 row-span-2 row-start-1 self-start justify-self-end', className)} /> }
export function CardTitle(props: ComponentProps<typeof Typography>) { return <Typography as="h2" variant="h6" {...props} /> }
export function CardDescription(props: ComponentProps<typeof Typography>) { return <Typography variant="bodySm" tone="muted" {...props} /> }
