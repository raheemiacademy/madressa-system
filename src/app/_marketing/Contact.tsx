import Link from 'next/link';
import { CONTACT_EMAIL, PRODUCT_NAME, WHATSAPP_DISPLAY, WHATSAPP_NUMBER } from '@/lib/marketing';
import { d } from './bits';
import { ContactForm } from './ContactForm';
import { PageHero } from './PageHero';
import { Shell } from './Shell';
import { Today } from './Today';

/* /contact (design-reference/website/contact.html). */
export function Contact() {
  return (
    <Shell current="/contact">
      <PageHero title="Talk to us" lede="Questions about your madressa, moving your records, or early access. A real person replies.">
        <Today className="dates" />
      </PageHero>
      <section className="section field-lav" aria-labelledby="ways-title">
        <div className="wrap contact-grid">
          <div className="contact-side">
            <h2 id="ways-title" data-rise>Pick whatever’s easiest</h2>
            <div className="contact-ways" data-rise style={d(1)}>
              <a className="way" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`${PRODUCT_NAME} question`)}`}>
                <i><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></svg></i>
                <span><strong>Email</strong><span>{CONTACT_EMAIL}</span></span>
              </a>
              <a className="way" href={`https://wa.me/${WHATSAPP_NUMBER}`}>
                <i><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 20l1.5-4.5A8 8 0 1 1 9 19z" /></svg></i>
                <span><strong>WhatsApp</strong><span>{WHATSAPP_DISPLAY}</span></span>
              </a>
            </div>
            <p data-rise style={d(2)}>Ready to try it? <Link href="/#early-access">Start your free trial</Link> instead and we’ll get in touch to set you up.</p>
          </div>
          <ContactForm />
        </div>
      </section>
    </Shell>
  );
}
