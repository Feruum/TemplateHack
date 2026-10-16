import type { ComponentProps } from 'react'
import { Alert as ArcAlert } from '../arc/alert/alert'
import { Typography } from '../typography'
import { cn } from '@/lib/utils'

export function Alert({ variant = 'default', ...props }: ComponentProps<'div'> & { variant?: 'default' | 'destructive' }) {
  return <ArcAlert role="alert" {...props} tone={variant === 'destructive' ? 'danger' : 'info'} />
}
export function AlertTitle(props: ComponentProps<typeof Typography>) { return <Typography as="div" variant="bodySmMedium" {...props} /> }
export function AlertDescription(props: ComponentProps<typeof Typography>) { return <Typography as="div" variant="bodySm" {...props} /> }
export function AlertAction({ className, ...props }: ComponentProps<'div'>) { return <div {...props} className={cn('mt-3 flex gap-2', className)} /> }
