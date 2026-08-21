const LOCAL_DATABASES = ["dawn-reader-library", "dawn-reader-evidence"];

export function isDawnStorageKey(key: string) {
  return key.startsWith("dawn-reader-");
}

function deleteDatabase(name: string) {
  return new Promise<boolean>((resolve) => {
    const request = indexedDB.deleteDatabase(name);
    let settled = false;
    const finish = (deleted: boolean) => {
      if (settled) return;
      settled = true;
      resolve(deleted);
    };
    request.onsuccess = () => finish(true);
    request.onerror = () => finish(false);
    request.onblocked = () => finish(false);
  });
}

export async function clearLocalAccountData() {
  for (let index = localStorage.length - 1; index >= 0; index -= 1) {
    const key = localStorage.key(index);
    if (key && isDawnStorageKey(key)) localStorage.removeItem(key);
  }
  const databaseResults = await Promise.all(LOCAL_DATABASES.map(deleteDatabase));
  if (typeof caches !== "undefined") {
    const names = await caches.keys();
    await Promise.all(names.map((name) => caches.delete(name)));
  }
  return { fullyCleared: databaseResults.every(Boolean) };
}
