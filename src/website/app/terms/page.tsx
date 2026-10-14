import Link from 'next/link'
import LegalPage from '@/components/LegalPage'
import { termsSections } from '@/lib/legal-content'

export default function Page() {
  return <LegalPage title="Terms of Service" sections={termsSections}>
    <section><h2>Related information</h2><p><Link href="/privacy">Privacy Policy</Link> · <Link href="/terms">Terms of Service</Link> · <Link href="/cookies">Cookies and local storage</Link></p>
      <p>Use our <Link href="/contact">contact form</Link> for support, cancellation, refund requests and complaints.</p>
    </section>
  </LegalPage>
}
