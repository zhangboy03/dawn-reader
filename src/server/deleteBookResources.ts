export async function deleteBookResources({
  deleteObject,
  rememberDeletion,
  deleteRecord,
  deleteProgress,
}: {
  deleteObject: () => Promise<unknown>;
  rememberDeletion: () => Promise<unknown>;
  deleteRecord: () => Promise<unknown>;
  deleteProgress: () => Promise<unknown>;
}) {
  await rememberDeletion();
  await deleteObject();
  await deleteRecord();
  await deleteProgress();
}

export function canRestoreDeletedBook(addedAt: string, deletedAt: string) {
  if (!Number.isFinite(Date.parse(addedAt)) || !Number.isFinite(Date.parse(deletedAt))) return false;
  return new Date(addedAt).toISOString() > new Date(deletedAt).toISOString();
}
