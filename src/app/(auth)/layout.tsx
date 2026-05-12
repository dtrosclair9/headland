import Image from 'next/image'
import Link from 'next/link'
import { SITE_NAME } from '@/lib/site'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <header className="border-b border-gray-100 bg-white">
        <div className="container-wide h-16 flex items-center">
          <Link href="/" className="flex items-center gap-2.5" aria-label={SITE_NAME}>
            <Image
              src="/images/logo-icon.png"
              alt=""
              width={36}
              height={36}
              className="h-9 w-9"
              priority
            />
            <span className="font-serif text-2xl font-bold text-primary uppercase tracking-wide">{SITE_NAME}</span>
          </Link>
        </div>
      </header>
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  )
}
