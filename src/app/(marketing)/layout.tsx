import MarketingNav from '@/components/marketing/Nav'
import MarketingFooter from '@/components/marketing/Footer'

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:z-[60] focus:top-3 focus:left-3 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-primary focus:shadow-lg focus:ring-2 focus:ring-accent"
      >
        Skip to content
      </a>
      <MarketingNav />
      <main id="main">{children}</main>
      <MarketingFooter />
    </>
  )
}
