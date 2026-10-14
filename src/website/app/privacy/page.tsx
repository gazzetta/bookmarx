import Link from 'next/link'
import LegalPage from '@/components/LegalPage'
import { privacySections } from '@/lib/legal-content'

export default function Page() {
  return <LegalPage title="Privacy Policy" sections={privacySections}>
    <section><h2>Related information</h2><p><Link href="/privacy">Privacy Policy</Link> · <Link href="/terms">Terms of Service</Link> · <Link href="/cookies">Cookies and local storage</Link></p>
      <p>Use our <Link href="/contact">contact form</Link> for privacy requests and complaints.</p>
      <p><a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener noreferrer">Contact the Information Commissioner’s Office</a></p>
    </section>
  </LegalPage>
}
