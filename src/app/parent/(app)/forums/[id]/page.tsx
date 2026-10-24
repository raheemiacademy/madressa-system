import { notFound } from 'next/navigation';
import { db } from '@/db';
import { TopicList } from '@/app/_portal/Forums';
import { PortalHead } from '@/app/_portal/Head';
import { requireParent } from '@/server/next/portal';
import { visibleCategory } from '@/server/portal/shared';
import { forumPostAction } from '../../actions';

export const metadata = { title: 'Forum' };

export default async function ParentCategory({ params }: { params: Promise<{ id: string }> }) {
  const p = await requireParent();
  const id = Number((await params).id);
  const data = Number.isInteger(id) ? await visibleCategory(db, p.ctx.kids.map((k) => k.classId).filter((c): c is number => !!c), id) : null;
  if (!data) notFound();
  return (
    <>
      <PortalHead title={data.category.name} back="/parent/forums" />
      <main className="rp-main"><TopicList data={data} base="/parent/forums" start={forumPostAction.bind(null, { categoryId: id })} /></main>
    </>
  );
}
