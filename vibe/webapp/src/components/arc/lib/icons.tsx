import {
  Tick02Icon, InformationCircleIcon, Alert02Icon, CancelCircleIcon, Cancel01Icon,
  ArrowDown01Icon, ArrowUp01Icon, ArrowUp02Icon, Search01Icon, Logout01Icon,
  ComputerIcon, Moon02Icon, Sun01Icon, Loading03Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import type { ComponentProps } from 'react'

type IconProps = Omit<ComponentProps<typeof HugeiconsIcon>, 'icon'>
function iconComponent(icon: ComponentProps<typeof HugeiconsIcon>['icon']) {
  return function ArcIcon(props: IconProps) { return <HugeiconsIcon icon={icon} {...props} /> }
}
export const Check = iconComponent(Tick02Icon)
export const Info = iconComponent(InformationCircleIcon)
export const TriangleAlert = iconComponent(Alert02Icon)
export const CircleX = iconComponent(CancelCircleIcon)
export const X = iconComponent(Cancel01Icon)
export const ChevronDown = iconComponent(ArrowDown01Icon)
export const ChevronUp = iconComponent(ArrowUp01Icon)
export const ArrowUp = iconComponent(ArrowUp02Icon)
export const Search = iconComponent(Search01Icon)
export const LogOut = iconComponent(Logout01Icon)
export const Monitor = iconComponent(ComputerIcon)
export const Moon = iconComponent(Moon02Icon)
export const Sun = iconComponent(Sun01Icon)
export const SunMoon = iconComponent(ComputerIcon)
export const LoaderCircle = iconComponent(Loading03Icon)
