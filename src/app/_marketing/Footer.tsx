import { PRODUCT_NAME } from '@/lib/marketing';
import { Pattern } from './bits';
import { Today, Year } from './Today';

export function Footer() {
  return (
    <footer className="site-foot on-ink">
      <Pattern id="khatam-foot" />
      <div className="wrap">
        <p className="foot-name" translate="no">{PRODUCT_NAME}</p>
        <div className="foot-grid">
          <div><h3>Product</h3><ul><li><a href="/features">Features</a></li><li><a href="#evening-tour">An evening with it</a></li><li><a href="#early-access">Start free trial</a></li></ul></div>
          <div><h3>Help</h3><ul><li><a href="/faq">FAQ</a></li><li><a href="/contact">Contact</a></li></ul></div>
          <div><h3>Contact</h3><ul><li><a href="mailto:[YOUR EMAIL]">[YOUR EMAIL]</a></li><li><a href="https://wa.me/[WHATSAPP NUMBER]">WhatsApp</a></li></ul></div>
          <div><h3>Today</h3><Today /><p className="foot-copy">© <Year /> {PRODUCT_NAME}</p></div>
        </div>
      </div>
    </footer>
  );
}
