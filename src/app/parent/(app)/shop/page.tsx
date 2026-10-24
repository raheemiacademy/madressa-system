import { db } from '@/db';
import { PortalHead } from '@/app/_portal/Head';
import { SelectField, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { formatPence } from '@/lib/money';
import { requireParent } from '@/server/next/portal';
import { activeProducts, childMerits } from '@/server/portal/parent';
import { buyAction } from '../actions';
import { KidSwitch, NoKids, pickKid } from '../kids';

export const metadata = { title: 'Shop' };

/** §17/§20 The school shop: pay on the family's fees, or with the child's merits where the product allows it. */
export default async function Shop({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const p = await requireParent('Products');
  const kid = pickKid(p, (await searchParams).child);
  const [items, m] = await Promise.all([activeProducts(db), kid ? childMerits(db, kid) : null]);
  return (
    <>
      <PortalHead title="Shop" back="/parent/more" kicker={kid ? `${kid.label} · ${m?.total.balance ?? 0} merits to spend` : undefined} />
      <main className="rp-main">
        {!kid ? <NoKids /> : (
          <>
            <KidSwitch kids={p.ctx.kids} current={kid} path="/parent/shop" />
            {!items.length && <p className="rp-empty">Nothing in the shop right now.</p>}
            {items.map((x) => (
              <article key={x.id} className="ra-card" aria-labelledby={`pr-${x.id}`} style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', gap: 14 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- private product image served behind the parent session */}
                  {x.imageFileId && <img src={`/parent/file/${x.imageFileId}`} alt="" width={72} height={72} style={{ borderRadius: 12, objectFit: 'cover', flex: 'none' }} />}
                  <div style={{ minWidth: 0 }}>
                    <h2 id={`pr-${x.id}`} style={{ margin: 0, fontSize: 16 }}>{x.name}</h2>
                    <p style={{ margin: '2px 0' }}>{x.originalPricePence && x.originalPricePence > x.pricePence && <s className="ra-muted">{formatPence(x.originalPricePence)}</s>} <b>{formatPence(x.pricePence)}</b>{x.meritPrice ? ` or ${x.meritPrice} merits` : ''}</p>
                    {x.description && <p className="ra-note" style={{ margin: 0 }}>{x.description}</p>}
                    {x.stock !== null && <p className="ra-note" style={{ margin: 0 }}>{x.stock ? `${x.stock} left` : 'Sold out'}</p>}
                  </div>
                </div>
                {x.stock !== 0 && (
                  <Form action={buyAction.bind(null, x.id)} submit="Buy" savebar={false} card={false}>
                    <input type="hidden" name="studentId" value={kid.id} />
                    <div className="ra-fields">
                      <TextField name="qty" id={`q-${x.id}`} label="Quantity" inputMode="numeric" defaultValue="1" />
                      <SelectField name="pay" id={`pay-${x.id}`} label="Pay with" options={[{ value: 'invoice', label: 'Add to fees' }, ...(x.meritPrice ? [{ value: 'merits', label: `${kid.label}’s merits` }] : [])]} />
                    </div>
                  </Form>
                )}
              </article>
            ))}
          </>
        )}
      </main>
    </>
  );
}
