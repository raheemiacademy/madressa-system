import ExamPage from '../[id]/page';

export const metadata = { title: 'Add exam' };

export default async function NewExam() {
  return ExamPage({ params: Promise.resolve({ id: 'new' }) });
}
