import Link from 'next/link';
import { requireAdmin } from '@/server/next/actor';

export const metadata = { title: 'Moving your data' };

/** A plain guide to bringing a madrasah's records across from another system or their own spreadsheets. */
export default async function ImportGuide() {
  await requireAdmin('edit');
  return (
    <div className="ra-page">
      <div className="ra-page-h"><div><h1>Moving your data</h1><p>Bring your records across from another system, or from your own spreadsheets, in about an hour</p></div>
        <div className="ra-toolbar"><Link className="ra-btn primary" href="/admin/import/students">Import students</Link></div></div>

      <section className="ra-card ra-guide" aria-labelledby="g1">
        <h2 id="g1">1. Get your data out of the old system</h2>
        <p>Most school systems have an “Export”, “Download” or “Save as Excel” button on their student list. You want <b>one row per child</b>, including their parents’ details if you can.</p>
        <ul>
          <li><b>From IBEAMS:</b> Tools → Custom PDF/CSV downloads → a student list with contacts, as CSV.</li>
          <li><b>From your own spreadsheets:</b> use them as they are. Any column headings will do.</li>
          <li><b>From paper or a Word document:</b> type it into Excel or Google Sheets first: one row per child, one column per detail.</li>
        </ul>
        <p className="ra-muted">Save as .xlsx (Excel) or .csv. Google Sheets: File → Download → Microsoft Excel or CSV.</p>
      </section>

      <section className="ra-card ra-guide" aria-labelledby="g2">
        <h2 id="g2">2. Import in this order</h2>
        <ol>
          <li><b>Teachers</b>: <Link href="/admin/import/teachers">Import teachers</Link>, or add them by hand if there are only a few.</li>
          <li><b>Classes</b>: <Link href="/admin/import/classes">Import classes</Link>, or type the class names one per line in “Quick add”.</li>
          <li><b>Students with their parents</b>: <Link href="/admin/import/students">Import students</Link>. If a column holds the class name, each child goes straight into that class.</li>
        </ol>
        <p>Classes come before students so children can be put into them as they’re imported.</p>
      </section>

      <section className="ra-card ra-guide" aria-labelledby="g3">
        <h2 id="g3">3. Match, check, then import</h2>
        <ul>
          <li>After you upload, we <b>match your columns</b> to ours (for example “Forename” → first name, “Mum’s mobile” → parent mobile). Check the guesses and change any that are wrong.</li>
          <li>A single “Name” column is split into first name and surname for you.</li>
          <li>Then you see a <b>preview</b>: every row is checked, and rows with a problem show what’s wrong. Nothing is saved until you press Import.</li>
          <li>Brothers and sisters who share a parent email are linked to the <b>same parent</b>, not copied.</li>
        </ul>
      </section>

      <section className="ra-card ra-guide" aria-labelledby="g4">
        <h2 id="g4">Tips</h2>
        <ul>
          <li>Dates work as 25/09/2015 or 2015-09-25.</li>
          <li>Gender can be Male, Female, or left blank.</li>
          <li>Medical notes are stored encrypted.</li>
          <li>If something goes wrong, fix it in your spreadsheet and upload it again: the preview shows exactly what will happen first.</li>
          <li>Hundreds of rows are fine (up to 5,000 at a time).</li>
        </ul>
      </section>
    </div>
  );
}
