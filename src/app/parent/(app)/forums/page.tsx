import { db } from '@/db';
import { CategoryList } from '@/app/_portal/Forums';
import { PortalHead } from '@/app/_portal/Head';
import { requireParent } from '@/server/next/portal';
import { visibleCategories } from '@/server/portal/shared';

export const metadata = { title: 'Forums' };

/** §14 Forums open to all parents or to your children's classes. */
export default async function Forums() {
  const p = await requireParent();
  const cats = await visibleCategories(db, p.ctx.kids.map((k) => k.classId).filter((c): c is number => !!c));
  return (
    <>
      <PortalHead title="Forums" back="/parent/more" />
      <main className="rp-main"><CategoryList cats={cats} base="/parent/forums" /></main>
    </>
  );
}
