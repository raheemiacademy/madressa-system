'use client';

import { useActionState } from 'react';
import { TextArea, TextField } from '@/components/Fields';
import { SaveBar } from '@/components/SaveBar';
import type { FormState } from '@/lib/validate';
import { saveProfileAction } from './actions';

type P = { name: string; logoFileId: string | null; logoUrl: string | null; address: string | null; city: string | null; postcode: string | null; email: string | null; noReplyEmail: string | null; bccEmail: string | null; receiptSenderEmail: string | null; receiptSenderName: string | null; tel: string | null; fax: string | null };

export function ProfileForm({ profile: p }: { profile: P | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveProfileAction, undefined);
  const e = (n: string) => state?.errors?.[n];
  const v = (k: keyof P) => (p?.[k] as string | null) ?? '';
  return (
    <form className="ra-card ra-form" action={action} noValidate>
      <div className="ra-card-h"><div><h2>School profile</h2><div className="ra-note">Shown on portals, emails, receipts and PDFs.</div></div></div>
      <div className="ra-fields">
        <TextField name="name" label="School name" defaultValue={v('name')} error={e('name')} required autoComplete="organization" full />
        <div className="ra-field full">
          <label htmlFor="f-logo">Logo</label>
          <input className="ra-input" id="f-logo" name="logo" type="file" accept="image/png,image/jpeg,image/webp" style={{ paddingTop: 8 }} aria-describedby={e('logo') ? 'f-logo-err' : 'f-logo-help'} aria-invalid={e('logo') ? true : undefined} />
          <span className="help" id="f-logo-help">Upload a PNG, JPEG or WebP image up to 5 MB, or give a web address below.</span>
          {e('logo') && <span className="err" id="f-logo-err">{e('logo')}</span>}
          {p?.logoFileId && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- uploaded logo */}
              <img src={`/files/${p.logoFileId}`} alt="Current logo" style={{ maxWidth: 120, borderRadius: 10 }} />
              <label className="ra-check"><input type="checkbox" name="logo.remove" /><span>Remove the uploaded logo</span></label>
            </>
          )}
        </div>
        <TextField name="logoUrl" label="Logo web address" type="url" inputMode="url" placeholder="https://" defaultValue={v('logoUrl')} error={e('logoUrl')} full />
        <TextArea name="address" label="Address" defaultValue={v('address')} error={e('address')} autoComplete="street-address" rows={3} />
        <TextField name="city" label="City" defaultValue={v('city')} error={e('city')} autoComplete="address-level2" />
        <TextField name="postcode" label="Postcode" defaultValue={v('postcode')} error={e('postcode')} autoComplete="postal-code" autoCapitalize="characters" />
        <TextField name="tel" label="Telephone" type="tel" inputMode="tel" defaultValue={v('tel')} error={e('tel')} />
        <TextField name="fax" label="Fax" type="tel" inputMode="tel" defaultValue={v('fax')} error={e('fax')} />
        <TextField name="email" label="School email" type="email" inputMode="email" defaultValue={v('email')} error={e('email')} />
        <TextField name="noReplyEmail" label="No-reply email" type="email" inputMode="email" defaultValue={v('noReplyEmail')} error={e('noReplyEmail')} />
        <TextField name="bccEmail" label="BCC copy address" type="email" inputMode="email" defaultValue={v('bccEmail')} error={e('bccEmail')} help="Gets a copy of every email the system sends." />
        <TextField name="receiptSenderEmail" label="Fees receipt sender email" type="email" inputMode="email" defaultValue={v('receiptSenderEmail')} error={e('receiptSenderEmail')} />
        <TextField name="receiptSenderName" label="Fees receipt sender name" defaultValue={v('receiptSenderName')} error={e('receiptSenderName')} />
      </div>
      <SaveBar pending={pending} state={state} />
    </form>
  );
}
