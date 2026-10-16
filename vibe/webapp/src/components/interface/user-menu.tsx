import { UserMenu as ArcUserMenu, type UserMenuProps as ArcUserMenuProps } from '@/components/arc/user-menu/user-menu'
import { BlobAvatar } from '../identity/BlobAvatar'
import { userAvatarSeed } from '../identity/avatar-seed'

export type { UserMenuItem, UserMenuUser } from '@/components/arc/user-menu/user-menu'
export type UserMenuProps = ArcUserMenuProps & { avatarSeed?: string }

export function UserMenu({ avatarSeed, user, ...props }: UserMenuProps) {
  return <ArcUserMenu {...props} user={{
    ...user,
    avatarFallback: avatarSeed ? <BlobAvatar seed={userAvatarSeed(avatarSeed)} /> : user.avatarFallback,
  }} />
}
