export const dbService = {
    dbName: 'InvestTrackDB',
    version: 4,
    db: null,

    async init() {
        if (this.db) return this.db;
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, this.version);
            
            req.onupgradeneeded = (e) => {
                console.log("DB Upgrade: Mise à jour des tables...");
                const db = e.target.result;
                
                // Table Budget (Ma Banque)
                if (!db.objectStoreNames.contains('budget')) {
                    db.createObjectStore('budget', { keyPath: 'id' });
                }
                
                // Table Transactions Bourse
                if (!db.objectStoreNames.contains('invest_tx')) {
                    const store = db.createObjectStore('invest_tx', { keyPath: 'id', autoIncrement: true });
                    if (!store.indexNames.contains('date')) store.createIndex('date', 'date', { unique: false });
                }
                
                // Table Prix Bourse
                if (!db.objectStoreNames.contains('invest_prices')) {
                    db.createObjectStore('invest_prices', { keyPath: 'ticker' });
                }
            };

            req.onsuccess = (e) => {
                this.db = e.target.result;
                console.log("✅ DB Connectée");
                resolve(this.db);
            };

            req.onerror = (e) => reject("DB Error: " + e.target.error);
        });
    },

    async getAll(storeName) {
        await this.init();
        return new Promise((resolve) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const req = tx.objectStore(storeName).getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
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

    async exportFullJSON() {
        try {
            const budget = await this.getAll('budget');
            const investTx = await this.getAll('invest_tx');
            const investPrices = await this.getAll('invest_prices');
            
            const data = {
                version: "V5",
                timestamp: new Date().toISOString(),
                budget: budget,
                invest_tx: investTx,
                invest_prices: investPrices
            };

            const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `InvestTrack_FullBackup_${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            return true;
        } catch (e) {
            console.error("Erreur Export JSON", e);
            alert("Erreur lors de l'export.");
            return false;
        }
    },

    async importFullJSON(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = async (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (!data.budget && !data.invest_tx) throw new Error("Format invalide");

                    await this.init();
                    
                    if (data.budget && Array.isArray(data.budget)) {
                        for (const item of data.budget) await this.add('budget', item);
                    }
                    if (data.invest_tx && Array.isArray(data.invest_tx)) {
                        for (const item of data.invest_tx) await this.add('invest_tx', item);
                    }
                    if (data.invest_prices && Array.isArray(data.invest_prices)) {
                        for (const item of data.invest_prices) await this.add('invest_prices', item);
                    }

                    resolve(true);
                } catch (err) {
                    reject(err);
                }
            };
            reader.readAsText(file);
        });
    }
};
