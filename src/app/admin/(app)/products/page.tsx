import { asc } from 'drizzle-orm';
import { db } from '@/db';
import { contact, student } from '@/db/schema';
import { Chip } from '@/components/Chip';
import { Check, SelectField, TextField } from '@/components/Fields';
import { Form } from '@/components/Form';
import { formatCalendarDate } from '@/lib/dates';
import { formatPence, penceToInput } from '@/lib/money';
import { requireAdmin } from '@/server/next/actor';
import { listProducts, listSales } from '@/server/learning/products';
import { todayIso } from '@/server/people/common';
import { yearAndClasses } from '../students/year-classes';
import { deliveredAction, saleAction, saveProductAction } from '../merits/actions';
import { MeritTabs } from '../merits/MeritTabs';
import { FileDrop } from '@/components/FileDrop';

export const metadata = { title: 'Shop' };
type P = Awaited<ReturnType<typeof listProducts>>[number];

function ProductFields({ p }: { p?: P }) {
  const k = p?.p.id ?? 'new';
  return (
    <>
      <div className="ra-fields">
        <TextField name="name" id={`pn-${k}`} label="Name" defaultValue={p?.p.name ?? ''} />
        <TextField name="price" id={`pp-${k}`} label="Price (£)" inputMode="decimal" defaultValue={p ? penceToInput(p.p.pricePence) : ''} />
        <TextField name="originalPrice" id={`po-${k}`} label="Original price (£)" inputMode="decimal" defaultValue={p?.p.originalPricePence != null ? penceToInput(p.p.originalPricePence) : ''} help="Shown crossed out, for offers." />
        <TextField name="meritPrice" id={`pm-${k}`} label="Price in merits" inputMode="numeric" defaultValue={p?.p.meritPrice != null ? String(p.p.meritPrice) : ''} help="Blank if it can’t be bought with merits." />
        <TextField name="stock" id={`ps-${k}`} label="Stock" inputMode="numeric" defaultValue={p?.p.stock != null ? String(p.p.stock) : ''} help="Blank for unlimited." />
        <TextField name="description" id={`pd-${k}`} label="Description" full defaultValue={p?.p.description ?? ''} />
        <FileDrop name="image" label="Image" id={`pi-${k}`} accept="image/png,image/jpeg,image/webp" />
      </div>
      <Check name="active" label="Active (on sale)" defaultChecked={p?.p.active ?? true} />
    </>
  );
}

/** §17 Products: inventory, create a sale (invoice or merits), and sales with delivery. */
export default async function Shop() {
  await requireAdmin('edit');
  const [{ options }, products, sales, students, contacts] = await Promise.all([yearAndClasses(), listProducts(db), listSales(db),
    db.select({ id: student.id, firstName: student.firstName, surname: student.surname }).from(student).orderBy(asc(student.surname)).limit(3000),
    db.select({ id: contact.id, name: contact.name }).from(contact).orderBy(asc(contact.name)).limit(3000)]);
  const active = products.filter((p) => p.p.active);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Shop</h1><p>Products families can buy, or students can buy with their merits</p></div></div>
      <MeritTabs current="/admin/products" />
      <section className="ra-card" aria-label="Inventory">
        {products.length === 0 ? <p className="ra-empty">No products yet.</p> : (
          <div className="ra-table-wrap" tabIndex={0}><table className="ra-table">
            <thead><tr><th><span className="sr-only">Image</span></th><th>Product</th><th className="num">Price</th><th className="num">Merits</th><th className="num">Stock</th><th className="num">Sold</th><th>Status</th></tr></thead>
            <tbody>{products.map((p) => (
              <tr key={p.p.id}>
                {/* eslint-disable-next-line @next/next/no-img-element -- private uploaded product image */}
                <td>{p.p.imageFileId ? <img src={`/admin/files/${p.p.imageFileId}`} alt="" width={40} height={40} style={{ objectFit: 'cover', borderRadius: 8 }} /> : null}</td>
                <td className="wrap">{p.p.name}<div className="ra-note">{p.p.description ?? ''}</div></td>
                <td className="num">{formatPence(p.p.pricePence)}{p.p.originalPricePence ? <div className="ra-note"><s>{formatPence(p.p.originalPricePence)}</s></div> : null}</td>
                <td className="num">{p.p.meritPrice ?? ''}</td><td className="num">{p.p.stock ?? '∞'}</td><td className="num">{p.sold}</td>
                <td><Chip colour={p.p.active ? 'var(--color-ok)' : 'var(--color-fg-muted)'}>{p.p.active ? 'On sale' : 'Hidden'}</Chip></td></tr>
            ))}</tbody>
          </table></div>
        )}
      </section>
      {active.length > 0 && (
        <Form action={saleAction} submit="Create sale" resetOnSuccess>
          <div className="ra-card-h"><div><h2>Create a sale</h2><div className="ra-note">Paying by invoice adds a Products invoice to the student’s fees. A whole class means one each.</div></div></div>
          <div className="ra-fields">
            <SelectField name="productId" label="Product" options={active.map((p) => ({ value: String(p.p.id), label: `${p.p.name} (${formatPence(p.p.pricePence)}${p.p.meritPrice ? ` or ${p.p.meritPrice} merits` : ''})` }))} />
            <SelectField name="target" label="Sold to" options={[{ value: 'student', label: 'A student' }, { value: 'contact', label: 'A contact' }, { value: 'class', label: 'A whole class' }]} />
            <SelectField name="studentId" label="Student" options={[{ value: '', label: '—' }, ...students.map((s) => ({ value: String(s.id), label: `${s.surname}, ${s.firstName}` }))]} />
            <SelectField name="contactId" label="Contact" options={[{ value: '', label: '—' }, ...contacts.map((c) => ({ value: String(c.id), label: c.name }))]} />
            <SelectField name="classId" label="Class" options={[{ value: '', label: '—' }, ...options]} />
            <TextField name="qty" label="Quantity" inputMode="numeric" defaultValue="1" />
            <SelectField name="pay" label="Pay by" options={[{ value: 'invoice', label: 'Invoice (fees)' }, { value: 'merits', label: 'Merits' }]} />
            <TextField name="soldOn" label="Date" type="date" defaultValue={todayIso()} />
          </div>
        </Form>
      )}
      <section className="ra-card" aria-labelledby="sales-h">
        <div className="ra-card-h"><div><h2 id="sales-h">Sales</h2></div></div>
        {sales.length === 0 ? <p className="ra-empty">No sales yet.</p> : (
          <Form action={deliveredAction} card={false} savebar={false} submit="Apply to selected">
            <div className="ra-table-wrap" tabIndex={0} style={{ maxHeight: 520 }}><table className="ra-table">
              <thead><tr><th><span className="sr-only">Select</span></th><th>Date</th><th>Contact</th><th>Student</th><th>Class</th><th>Item</th><th className="num">Qty</th><th className="num">Total</th><th>Delivered</th></tr></thead>
              <tbody>{sales.map((s) => (
                <tr key={s.s.id}><td><input type="checkbox" name="ids" value={s.s.id} aria-label={`Select sale #${s.s.id}`} /></td><td>{formatCalendarDate(s.s.soldOn)}</td><td className="wrap">{s.contactName ?? ''}</td><td className="wrap">{s.studentName ?? ''}</td><td>{s.className ?? ''}</td>
                  <td className="wrap">{s.productName}</td><td className="num">{s.s.qty}</td><td className="num">{s.s.meritsSpent ? `${s.s.meritsSpent} merits` : formatPence(s.s.totalPence)}</td><td>{s.s.deliveredAt ? 'Yes' : <span className="ra-muted">No</span>}</td></tr>
              ))}</tbody>
            </table></div>
            <SelectField name="op" label="Selected sales" options={[{ value: 'delivered', label: 'Mark delivered' }, { value: 'undelivered', label: 'Mark not delivered' }]} />
          </Form>
        )}
      </section>
      {products.map((p) => (
        <details key={p.p.id} className="ra-card"><summary><b>Edit: {p.p.name}</b></summary>
          <Form action={saveProductAction.bind(null, p.p.id)} card={false} savebar={false} submit="Save product" encType="multipart/form-data"><ProductFields p={p} /></Form>
        </details>
      ))}
      <Form action={saveProductAction.bind(null, null)} submit="Add product" encType="multipart/form-data" resetOnSuccess><div className="ra-card-h"><div><h2>New product</h2></div></div><ProductFields /></Form>
    </div>
  );
}
