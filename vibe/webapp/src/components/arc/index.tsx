import { Badge, type BadgeProps } from './badge'
import { EmptyState, type EmptyStateProps } from './empty-state'
import theme from './theme.module.css'

export { Button as ArcButton } from './button/button'
export { Card as ArcCard } from './card/card'
export { Input as ArcInput } from './input/input'
export { Select as ArcSelect } from './select/select'
export { SortableDataTable as ArcDataTable } from './sortable-data-table/sortable-data-table'

export function ArcBadge({ className, ...props }: BadgeProps) {
  return <Badge {...props} className={[theme.scope, className].filter(Boolean).join(' ')} />
}

export function ArcEmptyState({ className, ...props }: EmptyStateProps) {
  return <EmptyState {...props} className={[theme.scope, className].filter(Boolean).join(' ')} />
}
