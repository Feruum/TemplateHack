import { Blobatar } from '@blobatar/react'
import { idle, thinking as thinkingExpression } from 'blobatar/expression'
import 'blobatar/motion.css'

import { cn } from '@/lib/utils'

export function BlobAvatar({ seed, thinking = false, className }: {
  seed: string
  thinking?: boolean
  className?: string
}) {
  return <Blobatar
    name={seed}
    size={48}
    animate={thinking ? 'always' : 'hover'}
    expression={thinking ? thinkingExpression : idle}
    className={cn('block size-full', className)}
    aria-hidden="true"
    focusable="false"
    data-blobatar={thinking ? 'thinking' : 'idle'}
  />
}
