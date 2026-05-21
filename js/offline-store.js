/**
 * IndexedDB mirror for Labour Care — documents, outbox, meta, analytics snapshot.
 */
(function (global) {
  const DB_NAME = "LabourCareOffline";
  const DB_VERSION = 1;

  function openDb() {
    return new Promise(function (resolve, reject) {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onerror = function () {
        reject(req.error);
      };
      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("documents")) {
          db.createObjectStore("documents", { keyPath: "path" });
        }
        if (!db.objectStoreNames.contains("outbox")) {
          db.createObjectStore("outbox", { keyPath: "id", autoIncrement: true });
        }
        if (!db.objectStoreNames.contains("meta")) {
          db.createObjectStore("meta", { keyPath: "key" });
        }
      };
      req.onsuccess = function () {
        resolve(req.result);
      };
    });
  }

  const OfflineStore = {
    openDb: openDb,

    putDocument: function (rec) {
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          const tx = db.transaction("documents", "readwrite");
          tx.objectStore("documents").put(rec);
          tx.oncomplete = function () {
            resolve();
          };
          tx.onerror = function () {
            reject(tx.error);
          };
        });
      });
    },

    getDocument: function (path) {
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          const tx = db.transaction("documents", "readonly");
          const req = tx.objectStore("documents").get(path);
          req.onsuccess = function () {
            resolve(req.result || null);
          };
          req.onerror = function () {
            reject(req.error);
          };
        });
      });
    },

    getAllByPrefix: function (prefix) {
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          const tx = db.transaction("documents", "readonly");
          const store = tx.objectStore("documents");
          const out = [];
          const req = store.openCursor();
          req.onsuccess = function (e) {
            const c = e.target.result;
            if (c) {
              if (c.key.indexOf(prefix) === 0) {
                out.push(c.value);
              }
              c.continue();
            } else {
              resolve(out);
            }
          };
          req.onerror = function () {
            reject(req.error);
          };
        });
      });
    },

    deleteDocument: function (path) {
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          const tx = db.transaction("documents", "readwrite");
          tx.objectStore("documents").delete(path);
          tx.oncomplete = function () {
            resolve();
          };
          tx.onerror = function () {
            reject(tx.error);
          };
        });
      });
    },

    addOutbox: function (item) {
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          const tx = db.transaction("outbox", "readwrite");
          tx.objectStore("outbox").add(item);
          tx.oncomplete = function () {
            resolve();
          };
          tx.onerror = function () {
            reject(tx.error);
          };
        });
      });
    },

    getAllOutbox: function () {
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          const tx = db.transaction("outbox", "readonly");
          const out = [];
          const req = tx.objectStore("outbox").openCursor();
          req.onsuccess = function (e) {
            const c = e.target.result;
            if (c) {
              out.push(c.value);
              c.continue();
            } else {
              resolve(out);
            }
          };
          req.onerror = function () {
            reject(req.error);
          };
        });
      });
    },

    deleteOutbox: function (id) {
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          const tx = db.transaction("outbox", "readwrite");
          tx.objectStore("outbox").delete(id);
          tx.oncomplete = function () {
            resolve();
          };
          tx.onerror = function () {
            reject(tx.error);
          };
        });
      });
    },

    setMeta: function (key, value) {
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          const tx = db.transaction("meta", "readwrite");
          tx.objectStore("meta").put({ key: key, value: value });
          tx.oncomplete = function () {
            resolve();
          };
          tx.onerror = function () {
            reject(tx.error);
          };
        });
      });
    },

    getMeta: function (key) {
      return openDb().then(function (db) {
        return new Promise(function (resolve, reject) {
          const tx = db.transaction("meta", "readonly");
          const req = tx.objectStore("meta").get(key);
          req.onsuccess = function () {
            resolve(req.result ? req.result.value : null);
          };
          req.onerror = function () {
            reject(req.error);
          };
        });
      });
    }
  };

  global.OfflineStore = OfflineStore;
})(typeof window !== "undefined" ? window : globalThis);
