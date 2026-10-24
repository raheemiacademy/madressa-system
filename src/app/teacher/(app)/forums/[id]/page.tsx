import { notFound } from 'next/navigation';
import { db } from '@/db';
import { TopicList } from '@/app/_portal/Forums';
import { PortalHead } from '@/app/_portal/Head';
import { requireTeacher } from '@/server/next/portal';
import { visibleCategory } from '@/server/portal/shared';
import { forumPostAction } from '../../actions';

export const metadata = { title: 'Forum' };

export default async function TeacherCategory({ params }: { params: Promise<{ id: string }> }) {
  const t = await requireTeacher('Forums');
  const id = Number((await params).id);
  const data = Number.isInteger(id) ? await visibleCategory(db, t.ctx.classes.map((c) => c.id), id) : null;
  if (!data) notFound();
  return (
    <>
      <PortalHead title={data.category.name} back="/teacher/forums" />
      <main className="rp-main"><TopicList data={data} base="/teacher/forums" start={forumPostAction.bind(null, { categoryId: id })} /></main>
    </>
  );
}
