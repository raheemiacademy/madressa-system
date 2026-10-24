import { notFound } from 'next/navigation';
import { db } from '@/db';
import { TopicView } from '@/app/_portal/Forums';
import { PortalHead } from '@/app/_portal/Head';
import { postsIn } from '@/server/learning/forums';
import { requireParent } from '@/server/next/portal';
import { visibleTopic } from '@/server/portal/shared';
import { forumPostAction } from '../../../actions';

export const metadata = { title: 'Forum topic' };

export default async function ParentTopic({ params }: { params: Promise<{ id: string }> }) {
  const p = await requireParent();
  const id = Number((await params).id);
  const topic = Number.isInteger(id) ? await visibleTopic(db, p.ctx.kids.map((k) => k.classId).filter((c): c is number => !!c), id) : null;
  if (!topic) notFound();
  const posts = await postsIn(db, id);
  return (
    <>
      <PortalHead title={topic.title} back={`/parent/forums/${topic.categoryId}`} />
      <main className="rp-main"><TopicView topic={topic} posts={posts} reply={forumPostAction.bind(null, { topicId: id })} /></main>
    </>
  );
}
