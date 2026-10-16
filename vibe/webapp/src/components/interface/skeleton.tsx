import type { ComponentProps } from 'react'
import { Skeleton as ArcSkeleton } from '../arc/skeleton/skeleton'
export function Skeleton(props: ComponentProps<typeof ArcSkeleton>) { return <ArcSkeleton lines={1} {...props} /> }
