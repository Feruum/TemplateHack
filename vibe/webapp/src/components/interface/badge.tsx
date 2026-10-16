import type { ComponentProps } from 'react'
import { ArcBadge } from '../arc'
import { Slot } from 'radix-ui'
import styles from '../arc/badge.module.css'
import { cn } from '@/lib/utils'

export function Badge({ variant = 'default', asChild = false, className, ...props }: ComponentProps<'span'> & { variant?: 'default' | 'secondary' | 'destructive' | 'outline'; asChild?: boolean }) {
  if (asChild) return <Slot.Root {...props} className={cn(styles.badge, className)} />
  return <ArcBadge {...props} tone={variant === 'destructive' ? 'danger' : 'neutral'} className={className} />
}
