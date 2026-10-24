/** Every student's mark from a register form (TakeRegister), ready for saveRegister to validate. */
export function marksFromForm(fd: FormData) {
  return fd.getAll('studentId').map(Number).map((id) => ({
    studentId: id, mark: fd.get(`mark.${id}`), code: fd.get(`code.${id}`) ?? undefined, authorised: fd.get(`authorised.${id}`) ?? '',
    notified: fd.get(`notified.${id}`) ?? '', lateMinutes: fd.get(`late.${id}`) ?? '', leftEarlyMinutes: fd.get(`left.${id}`) ?? '', note: fd.get(`note.${id}`) ?? ''
  }));
}
