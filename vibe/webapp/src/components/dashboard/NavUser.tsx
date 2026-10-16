import {
  Settings01Icon,
  UserCircle02Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useNavigate } from '@tanstack/react-router'
import type { UserDto } from '@web-app-demo/contracts'
import { useRef, useState } from 'react'

import { UserMenu } from '@/components/interface/user-menu'
import {
  SidebarMenu,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { Typography } from '@/components/typography'
import type { WorkspaceRoutePath } from '@/features/navigation'
import { useAvatarImage, useAvatarQuery } from '@/features/avatar'

export function NavUser({
  accountPath,
  onLogout,
  settingsPath,
  user,
}: {
  accountPath?: WorkspaceRoutePath
  onLogout: () => Promise<void>
  settingsPath: WorkspaceRoutePath
  user: UserDto
}) {
  const navigate = useNavigate()
  const { isMobile, setOpen, setOpenMobile, state } = useSidebar()
  const [logoutError, setLogoutError] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const avatarQuery = useAvatarQuery()
  const avatarSrc = useAvatarImage(avatarQuery.data?.avatar?.downloadUrl)

  const logout = async () => {
    setLogoutError(false)
    try {
      await onLogout()
    } catch {
      setLogoutError(true)
      setOpen(true)
      triggerRef.current?.focus({ preventScroll: true })
    }
  }

  const navigateTo = (to: WorkspaceRoutePath) => {
    setOpenMobile(false)
    void navigate({ to })
  }

  return (
    <>
      {logoutError && (
        <Typography role="alert" variant="caption" tone="destructive">
          Logout failed. Please try again.
        </Typography>
      )}
      <SidebarMenu>
        <SidebarMenuItem>
          <UserMenu
            avatarSeed={user.id}
            items={[
              ...(accountPath ? [{
                label: 'Profile',
                icon: <HugeiconsIcon aria-hidden icon={UserCircle02Icon} strokeWidth={2} />,
                onSelect: () => navigateTo(accountPath),
              }] : []),
              {
                label: 'Settings',
                icon: <HugeiconsIcon aria-hidden icon={Settings01Icon} strokeWidth={2} />,
                onSelect: () => navigateTo(settingsPath),
              },
            ]}
            onOpenChange={setMenuOpen}
            onSignOut={logout}
            open={menuOpen}
            ref={triggerRef}
            showName={isMobile || state === 'expanded'}
            showTheme={false}
            signOutLabel="Log out"
            signOutPendingLabel="Logging out…"
            triggerLabel="Open account menu"
            user={{
              email: user.email,
              name: user.displayName ?? user.email,
              plan: user.role,
              avatarSrc: avatarSrc ?? undefined,
            }}
          />
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  )
}
