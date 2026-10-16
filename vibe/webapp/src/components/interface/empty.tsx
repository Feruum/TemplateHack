import { Children, isValidElement, type ComponentProps, type ReactNode } from 'react'
import { ArcEmptyState } from '../arc'
import { Typography } from '../typography'

function text(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(text).join('')
  return isValidElement<{ children?: ReactNode }>(node) ? text(node.props.children) : ''
}
function find(node: ReactNode, type: unknown): ReactNode {
  for (const child of Children.toArray(node)) {
    if (!isValidElement<{ children?: ReactNode }>(child)) continue
    if (child.type === type) return child.props.children
    const nested = find(child.props.children, type)
    if (nested) return nested
  }
  return undefined
}
export function Empty({ children, className, size: _size, ...props }: ComponentProps<'div'> & { size?: 'default' | 'sm' }) {
  const header = find(children, EmptyHeader)
  const headerContent = header && Children.toArray(header).filter((child) => !isValidElement(child) || child.type !== EmptyMedia)
  return <div {...props} data-size={_size}><ArcEmptyState title={text(find(children, EmptyTitle))} description={text(find(children, EmptyDescription))} headerContent={headerContent} action={find(children, EmptyContent)} icon={find(children, EmptyMedia)} className={className} /></div>
}
export function EmptyHeader(props: ComponentProps<'div'>) { return <div {...props} /> }
export function EmptyContent(props: ComponentProps<'div'>) { return <div {...props} /> }
export function EmptyMedia({ variant, ...props }: ComponentProps<'div'> & { variant?: 'default' | 'icon' }) { return <div {...props} data-variant={variant} /> }
export function EmptyTitle(props: ComponentProps<typeof Typography>) { return <Typography variant="h6" {...props} /> }
export function EmptyDescription(props: ComponentProps<typeof Typography>) { return <Typography tone="muted" variant="bodySm" {...props} /> }
