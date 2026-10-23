import { requireAdmin } from '@/server/next/actor';

export const metadata = { title: 'Search' };

// shortcut: students, contacts and teachers are created in Phase 2, which adds their queries here.
export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin();
  const q = ((await searchParams).q ?? '').trim().slice(0, 100);
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Search</h1><p>{q ? <>Results for “{q}”</> : 'Find students, contacts and teachers'}</p></div></div>
      <div className="ra-card">
        <p className="ra-empty" role="status">{q ? `No students, contacts or teachers match “${q}”.` : 'Type a name in the search box. Press / to jump to it from any page.'}</p>
      </div>
    </div>
  );
}
