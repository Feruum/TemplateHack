import { useEffect, useRef, useState, type ReactNode } from 'react'

import { DropdownMenu, type DropdownMenuProps } from '@/components/arc/dropdown-menu/dropdown-menu'

interface Enhancement {
  open: boolean
  focusedHref: string | null
  triggerFocused: boolean
}

/** Retain a native details menu until hydration can provide Arc/Radix focus management. */
export function ProgressiveDropdownMenu({ children, ...props }: DropdownMenuProps & { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [enhancement, setEnhancement] = useState<Enhancement | null>(null)

  useEffect(() => {
    const native = root.current?.querySelector('details')
    const activeElement = root.current?.ownerDocument.activeElement
    const activeLink = native?.contains(activeElement ?? null) && activeElement instanceof HTMLAnchorElement ? activeElement : null
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time native menu enhancement
    setEnhancement({
      open: native?.open ?? false,
      focusedHref: activeLink?.getAttribute('href') ?? null,
      triggerFocused: native?.querySelector('summary') === activeElement,
    })
  }, [])

  useEffect(() => {
    if (enhancement?.triggerFocused && !enhancement.open) trigger.current?.focus({ preventScroll: true })
  }, [enhancement])

  return <div ref={root} className="md:hidden" data-mobile-navigation={enhancement ? 'arc' : 'native'}>
    {enhancement ? <DropdownMenu
      {...props}
      defaultOpen={enhancement.open}
      triggerRef={trigger}
      initialFocusHref={enhancement.focusedHref ?? undefined}
    /> : children}
  </div>
}
