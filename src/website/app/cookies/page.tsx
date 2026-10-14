import Link from 'next/link'
import LegalPage from '@/components/LegalPage'

export default function CookiesPage() {
  return <LegalPage title="Cookies & local storage">
    <section><h2>What we store on your device</h2>
      <p>These controls apply worldwide on the website. Necessary storage supports features you request. Optional storage is off until you choose it. Change or withdraw your choice using Cookie settings on any page.</p>
      <div className="overflow-x-auto"><table className="w-full text-left text-sm border-collapse"><caption className="text-left font-semibold mb-3">Website storage inventory</caption>
        <thead><tr><th className="p-2 border-b">Name</th><th className="p-2 border-b">Purpose</th><th className="p-2 border-b">Duration</th></tr></thead>
        <tbody>
          <tr><td className="p-2 border-b">bookmarx_token, bookmarx_user</td><td className="p-2 border-b">Necessary local storage for your signed-in account; not Analytics.</td><td className="p-2 border-b">Until sign-out, removal of invalid credentials or browser storage clearing. Token validity is separately enforced.</td></tr>
          <tr><td className="p-2 border-b">bookmarx-consent</td><td className="p-2 border-b">Necessary local record of privacy choices and notice version.</td><td className="p-2 border-b">Choices expire after 180 days; we then ask again.</td></tr>
          <tr><td className="p-2 border-b">bookmarx-theme</td><td className="p-2 border-b">Optional preference: remember light/dark theme.</td><td className="p-2 border-b">Until withdrawal, browser clearing or expiry of permission.</td></tr>
          <tr><td className="p-2 border-b">_ga, _ga_*</td><td className="p-2 border-b">Optional Google Analytics cookies, only when configured and accepted.</td><td className="p-2 border-b">Configured for up to 180 days; removed from this site when you withdraw consent.</td></tr>
        </tbody>
      </table></div>
    </section>
    <section><h2>Google Analytics</h2>
      <p>When configured, Analytics helps us understand selected public-page visits. Rejecting it prevents this integration loading Google’s Analytics script or sending measurements. We do not enable advertising consent or personalised advertising through this integration.</p>
      <p>Our page-view events are restricted to public pages and strip query strings and fragments. We do not intentionally send bookmark data, emails, account identifiers or private collection paths. See <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">Google’s privacy information</a> for its processing.</p>
    </section>
    <section><h2>Other providers and the extension</h2>
      <p>Optional Google sign-in and payment services have their own storage and notices when you use them. The Analytics choice does not consent to their advertising. The extension uses browser extension storage for authentication, bookmark maps, queues and settings required for sync; it does not load website Analytics.</p>
      <p>External favicon images may contact their hosts when displayed. Provider, rights and transfer information is in our <Link href="/privacy">Privacy Policy</Link>.</p>
    </section>
    <section><h2>Your choices</h2>
      <p>Accept optional permits the available optional categories; Reject optional keeps them off. Choose settings selects categories separately. You can still change the theme for the current visit without saving it. Withdrawing Analytics consent reloads the page to stop already-loaded code. You can also clear site storage in your browser settings.</p>
    </section>
  </LegalPage>
}
