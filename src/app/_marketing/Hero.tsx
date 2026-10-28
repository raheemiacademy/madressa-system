import { Pattern } from './bits';
import { Evening } from './Evening';
import { Today } from './Today';

export function Hero() {
  return (
    <section className="hero field-ink on-ink" aria-labelledby="hero-title">
      <Pattern id="khatam-hero" />
      <div className="wrap hero-grid">
        <div className="hero-copy">
          <h1 id="hero-title"><span className="ln"><span>Run your</span></span> <span className="ln"><span>madressa</span></span> <span className="ln"><span>in one place</span></span></h1>
          <p className="lede">Registers, fees, parents and teachers together, for <strong>maktabs, mosques and Islamic schools</strong>. Not paper, spreadsheets and WhatsApp groups.</p>
          <div className="hero-actions">
            <a className="btn btn-sky" href="#early-access">Start free trial</a>
            <a className="btn btn-quiet" href="#evening-tour">See an evening with it</a>
          </div>
          <p className="hero-note">Free during early access. No card needed.</p>
          <Today className="dates" />
        </div>
        <Evening />
      </div>
    </section>
  );
}
