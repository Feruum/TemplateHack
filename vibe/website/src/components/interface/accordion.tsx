import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'

import { Accordion, type AccordionItem } from '@/components/arc/accordion/accordion'
import styles from '@/components/arc/accordion/accordion.module.css'

interface Enhancement {
  open: number[]
  focusedIndex: number
}

/** Keep native disclosures usable in the initial HTML and during idle hydration. */
export function ProgressiveAccordion({ items }: { items: AccordionItem[] }) {
  const root = useRef<HTMLDivElement>(null)
  const [enhancement, setEnhancement] = useState<Enhancement | null>(null)

  useEffect(() => {
    const details = Array.from(root.current?.querySelectorAll('details') ?? [])
    const activeElement = root.current?.ownerDocument.activeElement
    // Capture DOM state because a visitor can open native details before React hydrates.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time progressive enhancement
    setEnhancement({
      open: details.flatMap((detail, index) => detail.open ? [index] : []),
      focusedIndex: details.findIndex(detail => detail.querySelector('summary') === activeElement),
    })
  }, [])

  useEffect(() => {
    if (!enhancement || enhancement.focusedIndex < 0) return
    root.current?.querySelectorAll<HTMLButtonElement>('button[data-state]')[enhancement.focusedIndex]?.focus({ preventScroll: true })
  }, [enhancement])

  return <div ref={root} data-faq-enhancement={enhancement ? 'arc' : 'native'}>
    {enhancement
      ? <Accordion items={items} defaultOpen={enhancement.open} multiple size="lg" />
      : <div className={[styles.accordion, styles.lg, styles.native].join(' ')}>
        {items.map((item, index) => <details key={`${item.title}-${index}`} className={styles.item} suppressHydrationWarning>
          <summary className={styles.trigger}>
            <span>{item.title}</span>
            <span className={styles.icon}><ChevronDown width={17} height={17} aria-hidden="true" /></span>
          </summary>
          <div className={styles.panel}><div className={styles.panelInner}>{item.content}</div></div>
        </details>)}
      </div>}
  </div>
}
