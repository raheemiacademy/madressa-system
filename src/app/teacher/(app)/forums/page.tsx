import { db } from '@/db';
import { CategoryList } from '@/app/_portal/Forums';
import { PortalHead } from '@/app/_portal/Head';
import { requireTeacher } from '@/server/next/portal';
import { visibleCategories } from '@/server/portal/shared';

export const metadata = { title: 'Forums' };

/** §14 Forums open to every class or to one of the teacher's classes. */
export default async function Forums() {
  const t = await requireTeacher('Forums');
  const cats = await visibleCategories(db, t.ctx.classes.map((c) => c.id));
  return (
    <>
      <PortalHead title="Forums" back="/teacher/more" />
      <main className="rp-main"><CategoryList cats={cats} base="/teacher/forums" /></main>
    </>
  );
}
