import { Children, isValidElement, type ComponentProps, type ReactNode } from 'react'
import { Avatar as ArcAvatar } from '../arc/avatar/avatar'
import { BlobAvatar } from '../identity/BlobAvatar'
import { userAvatarSeed } from '../identity/avatar-seed'
import { cn } from '@/lib/utils'

export function Avatar({ children, size = 'default', seed, name: accountName, ...props }: ComponentProps<'span'> & { seed?: string; name?: string; size?: 'default' | 'sm' | 'lg' | 'xl' }) {
  const elements = Children.toArray(children)
  const image = elements.find((child) => isValidElement(child) && child.type === AvatarImage)
  const fallback = elements.find((child) => isValidElement(child) && child.type === AvatarFallback)
  const imageProps = isValidElement<ComponentProps<'img'>>(image) ? image.props : undefined
  const name = accountName ?? (isValidElement<{ children: ReactNode }>(fallback) && typeof fallback.props.children === 'string' ? fallback.props.children : 'User')
  const fallbackProps = isValidElement<ComponentProps<'span'>>(fallback) ? fallback.props : {}
  const generatedFallback = seed ? <AvatarFallback {...fallbackProps} className={cn('absolute inset-0 grid place-items-center', fallbackProps.className)}><BlobAvatar seed={userAvatarSeed(seed)} /></AvatarFallback> : fallback
  return <ArcAvatar {...props} name={name} src={imageProps?.src} fallback={generatedFallback} size={size === 'default' ? 'md' : size} />
}
export function AvatarImage(props: ComponentProps<'img'>) { return <img {...props} /> }
export function AvatarFallback(props: ComponentProps<'span'>) { return <span {...props} /> }
