import { Badge, type BadgeProps } from './badge'
import { EmptyState, type EmptyStateProps } from './empty-state'
import theme from './theme.module.css'

export function ArcBadge({ className, ...props }: BadgeProps) {
  return <Badge {...props} className={[theme.scope, className].filter(Boolean).join(' ')} />
}

export function ArcEmptyState({ className, ...props }: EmptyStateProps) {
  return <EmptyState {...props} className={[theme.scope, className].filter(Boolean).join(' ')} />
}
