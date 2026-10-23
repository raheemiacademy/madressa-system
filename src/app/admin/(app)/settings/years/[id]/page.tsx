import { eq } from 'drizzle-orm';
import { notFound } from 'next/navigation';
import { db } from '@/db';
import { academicYear } from '@/db/schema';
import { requireAdmin } from '@/server/next/actor';
import { YearForm } from '../YearForm';

export const metadata = { title: 'Edit academic year' };

export default async function EditYear({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin('super');
  const id = Number((await params).id);
  const [y] = Number.isInteger(id) ? await db.select().from(academicYear).where(eq(academicYear.id, id)).limit(1) : [];
  if (!y) notFound();
  return <YearForm year={y} />;
}
