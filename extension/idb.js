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
  await new Promise((resolve, reject) => {
    const tx = db.transaction("shots", "readwrite");
    tx.objectStore("shots").put(value, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
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
