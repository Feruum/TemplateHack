import AudienceSection from '@/components/landing/AudienceSection'
import CtaSection from '@/components/landing/CtaSection'
import FaqSection from '@/components/landing/FaqSection'
import FeatureGrid from '@/components/landing/FeatureGrid'
import HeroSection from '@/components/landing/HeroSection'
import LaunchKitSection from '@/components/landing/LaunchKitSection'
import ProcessSection from '@/components/landing/ProcessSection'
import ProofSection from '@/components/landing/ProofSection'
import ScenariosSection from '@/components/landing/ScenariosSection'
import SiteFooter from '@/components/landing/SiteFooter'
import SiteHeader from '@/components/landing/SiteHeader'
import { getSecondaryAction, TEMPLATE_ACTION } from '@/lib/landing-actions'

export default function App({ year }: { year: number }) {
  const secondaryAction = getSecondaryAction(import.meta.env.PUBLIC_WEBAPP_URL)
  return <>
    <a className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4" href="#main-content">Перейти к содержанию</a>
    <SiteHeader primaryHref={TEMPLATE_ACTION.href} primaryLabel={TEMPLATE_ACTION.label} />
    <main id="main-content">
      <HeroSection primaryHref={TEMPLATE_ACTION.href} primaryLabel={TEMPLATE_ACTION.label} secondaryHref={secondaryAction.href} secondaryLabel={secondaryAction.label} />
      <FeatureGrid />
      <AudienceSection />
      <LaunchKitSection />
      <ProcessSection />
      <ScenariosSection />
      <ProofSection />
      <FaqSection />
      <CtaSection primaryHref={TEMPLATE_ACTION.href} primaryLabel={TEMPLATE_ACTION.label} />
    </main>
    <SiteFooter year={year} />
  </>
}
