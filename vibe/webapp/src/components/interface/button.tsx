import type { ComponentProps } from 'react'
import { Slot } from 'radix-ui'
import { Button as ArcButton } from '../arc/button/button'
import styles from '../arc/button/button.module.css'
import { cn } from '@/lib/utils'

type Variant = 'default' | 'outline' | 'secondary' | 'ghost' | 'destructive' | 'link'
type Size = 'default' | 'xs' | 'sm' | 'lg' | 'icon' | 'icon-xs' | 'icon-sm' | 'icon-lg'
const variants = { default: 'primary', outline: 'secondary', secondary: 'secondary', ghost: 'ghost', destructive: 'danger', link: 'ghost' } as const
function arcSize(size: Size) { return size === 'lg' || size === 'icon-lg' ? 'lg' : size === 'sm' || size === 'xs' || size === 'icon-xs' || size === 'icon-sm' ? 'sm' : 'md' }

function buttonVariants({ variant = 'default', size = 'default', className }: { variant?: Variant; size?: Size; className?: string } = {}) {
  return cn(styles.button, styles[variants[variant]], styles[arcSize(size)], size.startsWith('icon') && 'aspect-square px-0', variant === 'link' && 'underline-offset-4 hover:underline', className)
}

export function Button({ variant = 'default', size = 'default', asChild = false, className, ...props }: Omit<ComponentProps<typeof ArcButton>, 'variant' | 'size'> & { variant?: Variant; size?: Size; asChild?: boolean }) {
  const classes = cn(size.startsWith('icon') && 'aspect-square px-0', variant === 'link' && 'underline-offset-4 hover:underline', className)
  if (asChild) return <Slot.Root {...props} data-slot="button" className={buttonVariants({ variant, size, className })} />
  return <ArcButton {...props} data-slot="button" variant={variants[variant]} size={arcSize(size)} className={classes} />
}
