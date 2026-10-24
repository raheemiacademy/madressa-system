import { notFound } from 'next/navigation';
import { db } from '@/db';
import { TopicView } from '@/app/_portal/Forums';
import { PortalHead } from '@/app/_portal/Head';
import { postsIn } from '@/server/learning/forums';
import { requireTeacher } from '@/server/next/portal';
import { visibleTopic } from '@/server/portal/shared';
import { forumPostAction } from '../../../actions';

export const metadata = { title: 'Forum topic' };

export default async function TeacherTopic({ params }: { params: Promise<{ id: string }> }) {
  const t = await requireTeacher('Forums');
  const id = Number((await params).id);
  const topic = Number.isInteger(id) ? await visibleTopic(db, t.ctx.classes.map((c) => c.id), id) : null;
  if (!topic) notFound();
  const posts = await postsIn(db, id);
  return (
    <>
      <PortalHead title={topic.title} back={`/teacher/forums/${topic.categoryId}`} />
      <main className="rp-main"><TopicView topic={topic} posts={posts} reply={forumPostAction.bind(null, { topicId: id })} /></main>
    </>
  );
}
