function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("wholepage", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("shots");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function putShot(id, value) {
  const db = await openDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("shots", "readwrite");
      const store = tx.objectStore("shots");
      store.put(value, id);
      const keysRequest = store.getAllKeys();
      const valuesRequest = store.getAll();
      tx.oncomplete = () => {
        const ranked = keysRequest.result.map((key, index) => ({
          key,
          created: Number(valuesRequest.result[index]?.created) || 0,
        }));
        ranked.sort((a, b) => b.created - a.created);
        const extra = ranked.slice(5);
        if (!extra.length) {
          resolve();
          return;
        }
        const cleanup = db.transaction("shots", "readwrite");
        for (const item of extra) cleanup.objectStore("shots").delete(item.key);
        cleanup.oncomplete = () => resolve();
        cleanup.onerror = () => reject(cleanup.error);
      };
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

export async function getShot(id) {
  const db = await openDb();
  const value = await new Promise((resolve, reject) => {
    const tx = db.transaction("shots", "readonly");
    const request = tx.objectStore("shots").get(id);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return value;
}
