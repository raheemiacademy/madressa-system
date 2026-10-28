import { OFFER, PRODUCT_NAME } from '@/lib/marketing';
import { d } from './bits';
import { EarlyAccessForm } from './EarlyAccessForm';

export function EarlyAccess() {
  return (
    <section className="section early on-ink" id="early-access" aria-labelledby="early-title">
      <div className="wrap early-grid">
        <div className="early-copy">
          <h2 id="early-title" data-rise data-words>Free while we’re in early access</h2>
          <p data-rise style={d(1)}>{PRODUCT_NAME} is launching soon. Join now and your madressa uses it free until launch, with us setting it up alongside you.</p>
          <ul data-rise style={d(2)}>
            <li>Every feature, for every class, teacher and parent</li>
            <li>Free data import from your spreadsheets or current system</li>
            <li>A direct line to the people building it. Your ideas shape what comes next</li>
          </ul>
          <p className="offer" data-rise style={d(3)}>{OFFER}</p>
        </div>
        <EarlyAccessForm />
      </div>
    </section>
  );
}
