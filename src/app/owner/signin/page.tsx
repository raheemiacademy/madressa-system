import { redirect } from 'next/navigation';
import { getOwner } from '@/server/next/owner';
import { SignInForm } from './SignInForm';

export const metadata = { title: 'Sign in' };

export default async function OwnerSignInPage() {
  if (await getOwner()) redirect('/owner');
  return <SignInForm />;
}
