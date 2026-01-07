// js/db.js
const dbService = {
    dbName: 'InvestTrackDB',
    version: 4, // Version 4 pour activer la table 'settings' (Banque)
    db: null,

    async init() {
        if (this.db) return this.db;
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, this.version);
            
            req.onupgradeneeded = (e) => {
                console.log("Mise à jour BDD...");
                const db = e.target.result;
                
                if (!db.objectStoreNames.contains('budget')) {
                    db.createObjectStore('budget', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('invest_tx')) {
                    const store = db.createObjectStore('invest_tx', { keyPath: 'id', autoIncrement: true });
                    store.createIndex('date', 'date', { unique: false });
                }
                if (!db.objectStoreNames.contains('invest_prices')) {
                    db.createObjectStore('invest_prices', { keyPath: 'ticker' });
                }
                // Table pour le solde banque et config
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
            };

            req.onsuccess = (e) => {
                this.db = e.target.result;
                console.log("✅ BDD Chargée");
                resolve(this.db);
            };

            req.onerror = (e) => reject("Erreur BDD: " + e.target.error);
        });
    },

    async getAll(storeName) {
        try {
            await this.init();
            return new Promise((resolve) => {
                const tx = this.db.transaction(storeName, 'readonly');
                const req = tx.objectStore(storeName).getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => resolve([]);
            });
        } catch (e) { return []; }
    },

    async add(storeName, item) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            if(storeName === 'budget' && !item.id) item.id = Date.now();
            const req = tx.objectStore(storeName).put(item);
            req.onsuccess = () => resolve(item);
            req.onerror = (e) => reject(e);
        });
    },

    async delete(storeName, id) {
        await this.init();
        return new Promise((resolve) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            tx.objectStore(storeName).delete(id);
            tx.oncomplete = () => resolve();
        });
    },

    async clearAll() {
        await this.init();
        const stores = ['budget', 'invest_tx', 'invest_prices', 'settings'];
        const promises = stores.map(name => {
            return new Promise((resolve) => {
                const tx = this.db.transaction(name, 'readwrite');
                tx.objectStore(name).clear();
                tx.oncomplete = () => resolve();
            });
        });
        await Promise.all(promises);
    }
};
