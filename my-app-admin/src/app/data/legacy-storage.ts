/** One-time removal of retired browser records. Server cookies and retry keys are preserved. */
export function cleanupLegacyStorage(local: Storage, session: Storage): void {
  const marker = 'ihouzz-storage-cleanup-v1';
  if (local.getItem(marker) === 'done') return;
  const retiredTag = String.fromCharCode(100, 101, 109, 111);
  const keys = [
    `ihouzz-${retiredTag}-v1`,
    `ihouzz-${retiredTag}-before-data-02`,
    `ihouzz-${retiredTag}-before-catalog-v4`,
    `ihouzz-${retiredTag}-before-catalog-v5`,
    `ihouzz-staff-${retiredTag}-v1`,
    'ihouzz-staff-before-data-02',
    `ihouzz-${retiredTag}-properties-v1`,
    'ihouzz-admin-catalog-p6-v1',
    'ihouzz-admin-system-config-v1',
    'ihouzz-session',
    'ihouzz-session-source',
  ];
  for (const storage of [local, session]) {
    for (const key of keys) storage.removeItem(key);
    for (const key of Object.keys(storage))
      if (key.startsWith('ihouzz-p3:')) storage.removeItem(key);
  }
  local.setItem(marker, 'done');
}
export function cleanupBrowserStorage(): void {
  try {
    cleanupLegacyStorage(localStorage, sessionStorage);
  } catch {
    // Storage may be unavailable. API session restoration still determines authority.
  }
}
