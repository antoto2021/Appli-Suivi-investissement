/**
 * INVEST TRACK V5 - VERSION COMPLÈTE & LISIBLE
 * Inclus : Base de données V3, Portefeuille, Budget React, IA, Auto-Ticker
 */

const { useState, useEffect, useRef } = React;

// =================================================================
// 0. SERVICE DE BASE DE DONNÉES (IndexedDB V3)
// =================================================================

const dbService = {
    dbName: 'InvestTrackDB',
    version: 3, // Force la mise à jour de la structure DB
    db: null,

    async init() {
        if (this.db) return this.db;
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, this.version);
            
            req.onupgradeneeded = (e) => {
                console.log("DB Upgrade: Création/Mise à jour des tables...");
                const db = e.target.result;
                
                // 1. Table Budget
                if (!db.objectStoreNames.contains('budget')) {
                    db.createObjectStore('budget', { keyPath: 'id' });
                }
                
                // 2. Table Transactions Bourse
                if (!db.objectStoreNames.contains('invest_tx')) {
                    const store = db.createObjectStore('invest_tx', { keyPath: 'id', autoIncrement: true });
                    if (!store.indexNames.contains('date')) {
                        store.createIndex('date', 'date', { unique: false });
                    }
                }
                
                // 3. Table Prix Bourse
                if (!db.objectStoreNames.contains('invest_prices')) {
                    db.createObjectStore('invest_prices', { keyPath: 'ticker' });
                }
            };

            req.onsuccess = (e) => {
                this.db = e.target.result;
                console.log("✅ DB Connectée");
                resolve(this.db);
            };

            req.onerror = (e) => {
                console.error("❌ Erreur DB:", e.target.error);
                reject("DB Error: " + e.target.error);
            };
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
        } catch (e) {
            console.error(e);
            return [];
        }
    },

    async add(storeName, item) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            // Ajout d'un ID si absent (pour le budget)
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
    }
};

// =================================================================
// 1. MODULE INVESTISSEMENT (Vanilla JS)
// =================================================================

const app = {
    transactions: [],
    currentPrices: {},
    charts: {},
    
    // MINI BDD : LISTE DES TICKERS (MODIFIABLE ICI)
    tickerDB: {
        // CAC 40 & SBF 120
        'total': 'TTE.PA',
        'vinci': 'DG.PA',
        'air liquide': 'AI.PA',
        'lvmh': 'MC.PA',
        'sanofi': 'SAN.PA',
        'schneider': 'SU.PA',
        'loreal': 'OR.PA',
        'hermes': 'RMS.PA',
        'bnpp': 'BNP.PA',
        'axa': 'CS.PA',
        'credit agricole': 'ACA.PA',
        'danone': 'BN.PA',
        'orange': 'ORA.PA',
        'renault': 'RNO.PA',
        'stellantis': 'STLAP.PA',
        'neurones': 'NRO',        
        'accor': 'AC',           

        // US & TECH
        'apple': 'AAPL',
        'microsoft': 'MSFT',
        'tesla': 'TSLA',
        'amazon': 'AMZN',
        'google': 'GOOGL',
        'meta': 'META',
        'nvidia': 'NVDA',
        'realty income': 'O',
        'rocket lab': 'RKLB',
        
        // ETFs
        'cw8': 'CW8.PA',        
        'sp500': 'SPX',       
        'nasdaq': 'NDX',      
        // CORRECTION ICI : On raccourcit la clé pour qu'elle soit détectée plus facilement
        'physical gold': 'IGLN', 
        'ishares gold': 'IGLN',  // Ajout d'une variante pour être sûr
        'gold etc': 'IGLN',      // Ajout d'une autre variante

        // Autres
        'CGM': 'GMF',            
        'mercedes': 'MBG',  
    },
    
    mockDividends: {
        'Action Vinci': { current: 4.50 }, 
        'Total Energie': { current: 3.20 }
    },
    tips: ["Diversifiez !", "Patience est mère de vertu.", "Achetez la peur.", "Investissez régulièrement."],

    init: async function() {
        console.log("Démarrage App Bourse...");
        await this.loadData();
        this.loadDailyTip();
        this.setupAutoFill();
        this.renderTable();
        
        // Si on rafraichit sur l'onglet portefeuille, on l'affiche
        if(!document.getElementById('assets-view').classList.contains('hidden')) {
            this.renderAssets();
        }
    },

    nav: function(id) {
        // Gestion de l'affichage des sections
        document.querySelectorAll('main > section').forEach(el => {
            el.classList.add('hidden');
            el.classList.remove('block');
        });
        
        const target = document.getElementById(id + '-view');
        if(target) {
            target.classList.remove('hidden');
            target.classList.add('block');
        }
        
        // Rafraîchissement des données selon la vue
        if(id === 'dashboard') { this.calcKPIs(); setTimeout(() => this.renderPie(), 100); }
        if(id === 'assets') this.renderAssets();
        if(id === 'transactions') this.renderTable();
        if(id === 'projections') setTimeout(() => this.renderProjections(), 100);
        if(id === 'dividends') this.renderDividends();
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    loadData: async function() {
        try {
            // Chargement Transactions
            const txData = await dbService.getAll('invest_tx');
            this.transactions = (txData && txData.length > 0) ? txData : [];

            // Chargement Prix
            const priceData = await dbService.getAll('invest_prices');
            priceData.forEach(p => this.currentPrices[p.ticker] = p.price);
            
            console.log(`Données chargées: ${this.transactions.length} transactions`);
        } catch(e) {
            console.error("Erreur chargement:", e);
        }
    },

    addTransaction: async function(tx) {
        if(!tx.id) tx.id = Date.now() + Math.random();
        
        await dbService.add('invest_tx', tx);
        
        // Mise à jour locale
        const idx = this.transactions.findIndex(t => t.id === tx.id);
        if(idx >= 0) this.transactions[idx] = tx;
        else this.transactions.push(tx);
    },

    updatePrice: async function(name, price, ticker=null) {
        const val = parseFloat(price);
        this.currentPrices[name] = val;
        
        const key = ticker || name;
        await dbService.add('invest_prices', { ticker: key, price: val });
        
        this.renderAssets();
        this.toast("Prix sauvegardé");
    },

    getPortfolio: function() {
        const assets = {};
        this.transactions.forEach(tx => {
            if(tx.op === 'Dividende') return;
            if(!assets[tx.name]) assets[tx.name] = { name: tx.name, qty: 0, invested: 0, ticker: tx.ticker||'' };
            
            if(tx.op === 'Achat') {
                assets[tx.name].qty += tx.qty;
                assets[tx.name].invested += (tx.qty * tx.price);
            } else if(tx.op === 'Vente') {
                const pru = assets[tx.name].invested / (assets[tx.name].qty + tx.qty) || 0;
                assets[tx.name].qty -= tx.qty;
                assets[tx.name].invested -= (tx.qty * pru);
            }
        });
        return assets;
    },

    calcKPIs: function() {
        const assets = this.getPortfolio();
        let invested = 0, currentVal = 0;

        Object.values(assets).forEach(a => {
            if(a.qty < 0.001) return;
            invested += a.invested;
            const price = this.currentPrices[a.name] || this.currentPrices[a.ticker] || (a.invested / a.qty);
            currentVal += (a.qty * price);
        });

        const diff = currentVal - invested;
        const perf = invested > 0 ? (diff / invested) * 100 : 0;

        // Mise à jour du DOM
        if(document.getElementById('kpiTotal')) {
            document.getElementById('kpiTotal').textContent = invested.toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
            document.getElementById('kpiFuture').textContent = currentVal.toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
            
            const diffEl = document.getElementById('kpiDiff');
            diffEl.textContent = `${diff>=0?'+':''}${diff.toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}`;
            diffEl.className = `sub-value ${diff>=0?'text-green-600':'text-red-500'}`;
            
            const perfEl = document.getElementById('kpiReturn');
            perfEl.textContent = `${perf>=0?'+':''}${perf.toFixed(2)} %`;
            perfEl.className = `value ${perf>=0?'text-green-600':'text-red-500'}`;
        }
        return { invested, currentVal };
    },

    renderPie: function() {
        const ctx = document.getElementById('pieChart')?.getContext('2d');
        if(!ctx) return;
        if(this.charts.pie) this.charts.pie.destroy();
        
        const acc = {};
        this.transactions.filter(t=>t.op==='Achat').forEach(t => acc[t.account] = (acc[t.account]||0) + (t.qty*t.price));
        
        this.charts.pie = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: Object.keys(acc), datasets: [{ data: Object.values(acc), backgroundColor: ['#3b82f6','#8b5cf6','#10b981','#f59e0b'] }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
        });
    },

    renderProjections: function() {
        const ctx = document.getElementById('mainProjectionChart')?.getContext('2d');
        if(!ctx) return;
        if(this.charts.proj) this.charts.proj.destroy();
        
        const years = parseInt(document.getElementById('projYears').value) || 20;
        const labels = Array.from({length: years+1}, (_, i) => `An ${i}`);
        
        const kpis = this.calcKPIs();
        let growthRate = 0.05; // 5% par défaut
        if(kpis.invested > 0) growthRate = Math.max(0.02, Math.min(0.15, (kpis.currentVal - kpis.invested) / kpis.invested));

        let cap = 0;
        this.transactions.forEach(t => { if(t.op==='Achat') cap += t.qty*t.price; if(t.op==='Vente') cap -= t.qty*t.price; });
        
        const data = [cap];
        for(let i=1; i<=years; i++) data.push(data[i-1] * (1 + growthRate));

        this.charts.proj = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: [{ label: `Capital (Taux: ${(growthRate*100).toFixed(1)}%)`, data, borderColor: '#9333ea', backgroundColor: 'rgba(147, 51, 234, 0.1)', fill: true }] },
            options: { maintainAspectRatio: false }
        });
        this.renderYearlyBar();
        this.renderFrequency();
    },

    renderYearlyBar: function() {
        const ctx = document.getElementById('yearlyBarChart')?.getContext('2d');
        if(!ctx) return;
        if(this.charts.bar) this.charts.bar.destroy();
        
        const yData = {};
        this.transactions.filter(t=>t.op==='Achat').forEach(t => {
            const y = t.date.split('-')[0];
            yData[y] = (yData[y]||0) + (t.qty*t.price);
        });
        
        this.charts.bar = new Chart(ctx, {
            type: 'bar',
            data: { labels: Object.keys(yData).sort(), datasets: [{ label:'Investi', data:Object.values(yData), backgroundColor:'#10b981' }] },
            options: { maintainAspectRatio: false }
        });
    },

    renderFrequency: function() {
        const ctx = document.getElementById('frequencyChart')?.getContext('2d');
        if(!ctx) return;
        if(this.charts.freq) this.charts.freq.destroy();
        
        let count = 0;
        const sorted = [...this.transactions].sort((a,b)=>new Date(a.date)-new Date(b.date));
        
        this.charts.freq = new Chart(ctx, {
            type: 'line',
            data: { labels: sorted.map(t=>t.date), datasets: [{ label:'Opérations', data: sorted.map(t => ++count), borderColor:'#6366f1', pointRadius:0 }] },
            options: { maintainAspectRatio: false, scales: { x: { display: false } } }
        });
    },

    // --- VUE PORTEFEUILLE (Nouvel onglet) ---
    renderAssets: function() {
        const grid = document.getElementById('assetsGrid');
        if(!grid) return;
        grid.innerHTML = '';
        
        const assets = this.getPortfolio();
        const sortedAssets = Object.values(assets).sort((a,b) => b.invested - a.invested);

        if (sortedAssets.length === 0) {
            grid.innerHTML = '<div class="col-span-full text-center text-gray-400 py-10">Aucune position active. Ajoutez des transactions "Achat".</div>';
            return;
        }

        sortedAssets.forEach(a => {
            if(a.qty < 0.001) return; // Position vendue

            const pru = a.invested / a.qty;
            // On cherche le prix par Nom OU par Ticker
            const currentPrice = this.currentPrices[a.name] || this.currentPrices[a.ticker] || pru;
            
            const totalValue = a.qty * currentPrice;
            const gain = totalValue - a.invested;
            const perf = ((gain) / a.invested) * 100;
            
            const isPos = gain >= 0;
            const colorClass = isPos ? 'text-green-600' : 'text-red-500';
            const borderClass = isPos ? 'border-green-200' : 'border-red-200';

            grid.innerHTML += `
                <div class="bg-white rounded-xl shadow-sm border ${borderClass} overflow-hidden flex flex-col">
                    <div class="p-4 border-b border-gray-100 flex justify-between items-start bg-slate-50">
                        <div class="overflow-hidden">
                            <h3 class="font-bold text-gray-800 text-lg truncate" title="${a.name}">${a.name}</h3>
                            <span class="text-xs font-mono bg-blue-100 text-blue-700 px-2 py-0.5 rounded">${a.ticker || 'N/A'}</span>
                        </div>
                        <div class="text-right">
                             <div class="text-xs text-gray-400 uppercase font-bold">Qté</div>
                             <div class="font-mono font-bold text-gray-700">${parseFloat(a.qty).toFixed(4).replace(/\.?0+$/,'')}</div>
                        </div>
                    </div>

                    <div class="p-4 space-y-3">
                        <div class="flex justify-between items-center bg-gray-50 p-2 rounded-lg">
                            <div class="text-left">
                                <span class="block text-[10px] text-gray-400 uppercase">PRU</span>
                                <span class="font-mono text-sm text-gray-600">${pru.toFixed(2)} €</span>
                            </div>
                            <div class="text-right">
                                <label class="block text-[10px] text-blue-500 uppercase font-bold mb-1"><i class="fa-solid fa-pen-to-square"></i> Prix Actuel</label>
                                <input 
                                    type="number" 
                                    step="0.01" 
                                    value="${currentPrice.toFixed(2)}" 
                                    onchange="app.updatePrice('${a.name}', this.value, '${a.ticker}')" 
                                    class="w-24 text-right font-bold text-gray-800 border-b-2 border-blue-200 focus:border-blue-500 outline-none bg-transparent"
                                >
                            </div>
                        </div>

                        <div class="flex justify-between items-end pt-2">
                            <div>
                                <span class="text-xs text-gray-400 block">Valeur Totale</span>
                                <div class="font-bold text-xl text-gray-800">${totalValue.toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}</div>
                            </div>
                            <div class="text-right">
                                <span class="text-xs text-gray-400 block">Perf</span>
                                <span class="font-bold text-lg ${colorClass}">
                                    ${isPos ? '+' : ''}${perf.toFixed(2)}%
                                </span>
                                <div class="text-[10px] ${colorClass} opacity-75">
                                    (${isPos ? '+' : ''}${gain.toLocaleString('fr-FR',{style:'currency',currency:'EUR'})})
                                </div>
                            </div>
                        </div>
                    </div>
                </div>`;
        });
    },

    renderTable: function() {
        const tbody = document.querySelector('#transactionsTable tbody');
        if(!tbody) return;
        tbody.innerHTML = '';
        
        const sorted = [...this.transactions].sort((a,b)=>new Date(b.date)-new Date(a.date));
        
        if(sorted.length === 0) {
            document.getElementById('emptyState')?.classList.remove('hidden');
        } else {
            document.getElementById('emptyState')?.classList.add('hidden');
        }

        sorted.forEach(tx => {
            const total = tx.op==='Dividende' ? tx.price : (tx.qty*tx.price);
            const badge = tx.op==='Achat'?'bg-blue-100 text-blue-800':(tx.op==='Vente'?'bg-red-100 text-red-800':'bg-emerald-100 text-emerald-800');
            
            tbody.innerHTML += `
                <tr class="bg-white border-b hover:bg-gray-50 transition">
                    <td class="px-4 py-3 font-mono text-xs">${tx.date}</td>
                    <td class="px-4 py-3"><span class="px-2 py-1 rounded text-xs ${badge}">${tx.op}</span></td>
                    <td class="px-4 py-3 font-medium text-gray-800">${tx.name}</td>
                    <td class="px-4 py-3 text-xs">${tx.account||'-'}</td>
                    <td class="px-4 py-3 text-right font-mono">${tx.op==='Dividende'?'-':tx.qty}</td>
                    <td class="px-4 py-3 text-right font-mono text-xs">${tx.price.toFixed(2)}</td>
                    <td class="px-4 py-3 text-right font-bold text-gray-700">${total.toFixed(2)} €</td>
                    <td class="px-4 py-3 text-center">
                        <button onclick="app.openModal('edit', ${tx.id})" class="text-blue-500 hover:text-blue-700 mx-1"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="app.deleteTx(${tx.id})" class="text-red-400 hover:text-red-600 mx-1"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>`;
        });
    },

    renderDividends: function() {
        const container = document.getElementById('dividendCards');
        if(!container) return;
        container.innerHTML = '';
        const assets = this.getPortfolio();
        let found = false;

        Object.values(assets).forEach(a => {
            if(a.qty < 0.01) return;
            const info = this.mockDividends[a.name] || { current: 0 };
            if(info.current > 0) {
                found = true;
                const total = a.qty * info.current;
                const col = this.strColor(a.name, 95, 90);
                const border = this.strColor(a.name, 60, 50);
                container.innerHTML += `
                    <div class="bg-white rounded-xl shadow-sm border p-4" style="background:${col}; border-color:${border}">
                        <div class="flex justify-between font-bold" style="color:${border}"><span>${a.name}</span><i class="fa-solid fa-coins"></i></div>
                        <div class="mt-4 flex justify-between items-end">
                            <div><p class="text-xs text-gray-500">Revenu Est.</p><p class="text-xl font-bold text-emerald-700">${total.toFixed(2)} €</p></div>
                            <div class="text-right"><p class="text-xs text-gray-500">Unit.</p><p class="font-mono">${info.current} €</p></div>
                        </div>
                    </div>`;
            }
        });
        if(!found) document.getElementById('noDividends')?.classList.remove('hidden');
    },

    openModal: function(mode, id=null) {
        document.getElementById('modalForm').classList.remove('hidden');
        document.getElementById('editIndex').value = id !== null ? id : '';
        document.getElementById('modalTitle').textContent = mode==='new' ? 'Nouvelle Transaction' : 'Modifier Transaction';
        
        if(mode==='new') {
            document.getElementById('fDate').value = new Date().toISOString().split('T')[0];
            ['fName','fTicker','fAccount','fSector','fQty','fPrice'].forEach(id => document.getElementById(id).value = '');
            document.getElementById('fOp').value = 'Achat';
        } else {
            const tx = this.transactions.find(t => t.id == id);
            if(tx) {
                document.getElementById('fDate').value = tx.date;
                document.getElementById('fOp').value = tx.op;
                document.getElementById('fName').value = tx.name;
                document.getElementById('fTicker').value = tx.ticker||'';
                document.getElementById('fAccount').value = tx.account||'';
                document.getElementById('fSector').value = tx.sector||'';
                document.getElementById('fQty').value = tx.qty;
                document.getElementById('fPrice').value = tx.price;
            }
        }
    },
    closeModal: function() { document.getElementById('modalForm').classList.add('hidden'); },
    
    saveTransaction: async function() {
        const idVal = document.getElementById('editIndex').value;
        const tx = {
            id: idVal ? parseFloat(idVal) : null,
            date: document.getElementById('fDate').value,
            op: document.getElementById('fOp').value,
            name: document.getElementById('fName').value,
            ticker: document.getElementById('fTicker').value,
            account: document.getElementById('fAccount').value,
            sector: document.getElementById('fSector').value,
            qty: parseFloat(document.getElementById('fQty').value)||0,
            price: parseFloat(document.getElementById('fPrice').value)||0
        };
        await this.addTransaction(tx);
        this.closeModal(); 
        this.toast("Sauvegardé"); 
        this.renderTable();
    },

    deleteTx: async function(id) { 
        if(confirm('Supprimer ?')) { 
            await dbService.delete('invest_tx', id);
            this.transactions = this.transactions.filter(t => t.id !== id);
            this.renderTable(); 
        } 
    },
    
    // --- GESTION IMPORT FICHIER AVEC AUTO-TICKER ---
    handleImport: async function(e) {
        const r = new FileReader();
        r.onload = async ev => {
            try {
                const wb = XLSX.read(new Uint8Array(ev.target.result), {type:'array'});
                const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
                let count = 0;
                
                for(const row of json) {
                    let d = row['Date']||row['Date_Entrée'];
                    if(typeof d==='number') d = new Date(Math.round((d-25569)*86400*1000)).toISOString().split('T')[0];
                    
                    // Tentative de détection du Ticker
                    let detectedTicker = row['Ticker'] || '';
                    if (!detectedTicker) {
                        const lowerName = (row['Nom actif'] || '').toLowerCase();
                        for (const [key, ticker] of Object.entries(this.tickerDB)) {
                            if (lowerName.includes(key)) {
                                detectedTicker = ticker;
                                break;
                            }
                        }
                    }

                    const tx = {
                        date: d || new Date().toISOString().split('T')[0],
                        op: row['Operation'] || 'Achat',
                        name: row['Nom actif'] || 'Inconnu',
                        qty: parseFloat(row['Quantité']) || 0,
                        price: parseFloat(row['Prix unitaire']) || 0,
                        account: row['Compte'] || '',
                        ticker: detectedTicker
                    };
                    if(tx.qty > 0) { await this.addTransaction(tx); count++; }
                }
                this.toast(`${count} importés`); this.renderTable();
            } catch(e) { alert("Erreur import Excel: " + e.message); }
            e.target.value = '';
        };
        r.readAsArrayBuffer(e.target.files[0]);
    },

    exportExcel: function() {
        const ws = XLSX.utils.json_to_sheet(this.transactions);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Transactions");
        XLSX.writeFile(wb, "InvestTrack_Export.xlsx");
    },
    
    // --- GESTION AUTO-FILL MANUEL ---
    setupAutoFill: function() {
        const el = document.getElementById('fName');
        if(el) {
            el.addEventListener('blur', (e) => {
                const val = e.target.value.toLowerCase().trim();
                const tickerInput = document.getElementById('fTicker');
                
                // Ne rien faire si l'utilisateur a déjà rempli
                if(tickerInput.value !== '') return;

                // Recherche
                for(const [k,t] of Object.entries(this.tickerDB)) { 
                    if(val.includes(k)) { 
                        tickerInput.value = t; 
                        this.toast(`Ticker trouvé : ${t}`);
                        break; 
                    }
                }
            });
        }
    },

    searchTicker: function() { const n = document.getElementById('fName').value; if(n) window.open(`https://www.google.com/search?q=ticker+${encodeURIComponent(n)}`, '_blank'); },
    strColor: function(s,l,d) { let h=0; for(let i=0;i<s.length;i++)h=s.charCodeAt(i)+((h<<5)-h); return `hsl(${h%360},${l}%,${d}%)`; },
    loadDailyTip: function() { document.getElementById('dailyTip').textContent = `"${this.tips[new Date().getDate()%this.tips.length]}"`; },
    toast: function(m) { const t=document.getElementById('toast'); document.getElementById('toastMsg').textContent=m; t.classList.remove('translate-y-20','opacity-0'); setTimeout(()=>t.classList.add('translate-y-20','opacity-0'),2500); }
};

// =================================================================
// 2. BUDGET SCAN APP (REACT) - AVEC AUTO-CATÉGORISATION & ENSEIGNES
// =================================================================

// 1. Mots-clés pour DÉTECTER la catégorie via la description
const DETECTION_KEYWORDS = {
    'Alimentation': ['course', 'super u', 'leclerc', 'auchan', 'lidl', 'carrefour', 'intermarche', 'market', 'franprix', 'monoprix', 'boulangerie', 'ms nanterre'],
    'Restauration': ['resto', 'mcdo', 'mcdonald', 'burger king', 'bk', 'kfc', 'uber', 'deliveroo', 'eat', 'tacos', 'pizza', 'sushi', 'café', 'starbucks', 'bistrot', 'restaurant', 'crous', 'bouillon', 'spiti'],
    'Transport': ['sncf', 'train', 'navigo', 'ratp', 'uber', 'bolt', 'taxi', 'essence', 'total', 'esso', 'bp', 'shell', 'peage', 'parking', 'dott', 'lime', 'scooter'],
    'Logement': ['loyer', 'edf', 'engie', 'eau', 'internet', 'bouygues', 'sfr', 'orange', 'free', 'assurance', 'taxe'],
    'Loisirs': ['netflix', 'spotify', 'cinema', 'ugc', 'gaumont', 'sport', 'fitness', 'basic fit', 'abonnement', 'shotgun', 'place', 'concert', 'al miraath'],
    'Salaire': ['salaire', 'virement', 'caf', 'cpam', 'remboursement', 'solde'],
    'Investissement': ['bitstack', 'bourse', 'pea', 'cto', 'trade', 'republic', 'crypto', 'binance', 'coinbase', 'bricks', 'la premiere brique']
};

// 2. Liste initiale des ENSEIGNES (s'enrichit automatiquement)
const DEFAULT_MERCHANTS = {
    'Alimentation': ['Super U', 'Lidl', 'Carrefour', 'Leclerc', 'Auchan', 'MS Nanterre', 'Al Miraath'],
    'Restauration': ['McDonald\'s', 'Burger King', 'Uber Eats', 'O Tacos', 'KFC', 'Starbucks', 'Crous', 'Spiti Sou', 'Le XV'],
    'Transport': ['SNCF', 'Total Energies', 'Esso', 'Uber', 'Dott', 'RATP'],
    'Logement': ['EDF', 'Bouygues Telecom', 'Loyer'],
    'Loisirs': ['Netflix', 'Shotgun', 'UGC', 'Apple Services'],
    'Salaire': ['Salaire', 'CAF', 'CPAM'],
    'Investissement': ['Bitstack', 'Trade Republic', 'La Première Brique'],
    'Autre': ['Amazon', 'Fnac']
};

const BudgetApp = () => {
    const [transactions, setTransactions] = useState([]);
    const [view, setView] = useState('dashboard'); 
    const [filterYear, setFilterYear] = useState('Tout'); 
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // État pour les enseignes (chargé depuis le stockage ou par défaut)
    const [merchantDB, setMerchantDB] = useState(() => {
        const saved = localStorage.getItem('invest_v5_merchants');
        return saved ? JSON.parse(saved) : DEFAULT_MERCHANTS;
    });

    // Formulaire
    const [newTx, setNewTx] = useState({ description: '', merchant: '', amount: '', date: '', category: 'Autre' });

    const barRef = useRef(null);
    const pieRef = useRef(null);

    // Chargement Données
    useEffect(() => {
        const load = async () => {
            try {
                await dbService.init();
                const data = await dbService.getAll('budget');
                const safeData = (data || []).map(t => ({
                    ...t,
                    date: t.date || new Date().toISOString().split('T')[0],
                    amount: parseFloat(t.amount) || 0,
                    description: t.description || 'Inconnu',
                    category: t.category || 'Autre',
                    merchant: t.merchant || '' // Nouveau champ enseigne
                }));
                setTransactions(safeData.sort((a,b) => new Date(b.date) - new Date(a.date)));
            } catch (e) { console.error("Err Budget Load", e); }
        };
        load();
        window.addEventListener('budget-update', load);
        return () => window.removeEventListener('budget-update', load);
    }, []);

    // --- MAGIE ICI : Auto-détection de la catégorie ---
    useEffect(() => {
        if (!newTx.description) return;
        const text = newTx.description.toLowerCase();

        // On parcourt les mots-clés de détection
        for (const [cat, keywords] of Object.entries(DETECTION_KEYWORDS)) {
            if (keywords.some(k => text.includes(k))) {
                setNewTx(prev => ({ ...prev, category: cat }));
                break; // On s'arrête à la première catégorie trouvée
            }
        }
    }, [newTx.description]);

    // Sauvegarde de la transaction + Apprentissage nouvelle enseigne
    const saveManual = async (e) => {
        e.preventDefault();
        if(!newTx.description || !newTx.amount) return;

        // 1. Sauvegarde Transaction
        // Note: Si l'utilisateur n'a pas rempli "Enseigne", on utilise la Description
        const finalMerchant = newTx.merchant || newTx.description; 

        await dbService.add('budget', { 
            id: Date.now(), 
            date: newTx.date, 
            description: newTx.description, // Description libre (ex: "Resto avec potes")
            merchant: finalMerchant,        // Enseigne structurée (ex: "McDonald's")
            amount: -Math.abs(parseFloat(newTx.amount)), 
            category: newTx.category 
        });

        // 2. Apprentissage : Ajouter l'enseigne à la liste si elle n'existe pas
        if (newTx.merchant && merchantDB[newTx.category]) {
            const currentList = merchantDB[newTx.category];
            // On vérifie si l'enseigne existe déjà (insensible à la casse)
            const exists = currentList.some(m => m.toLowerCase() === newTx.merchant.toLowerCase());
            
            if (!exists) {
                const updatedList = [...currentList, newTx.merchant].sort();
                const newDB = { ...merchantDB, [newTx.category]: updatedList };
                setMerchantDB(newDB);
                localStorage.setItem('invest_v5_merchants', JSON.stringify(newDB)); // Sauvegarde persistante
            }
        } else if (newTx.merchant && !merchantDB[newTx.category]) {
            // Cas où la catégorie n'a pas encore de liste
            const newDB = { ...merchantDB, [newTx.category]: [newTx.merchant] };
            setMerchantDB(newDB);
            localStorage.setItem('invest_v5_merchants', JSON.stringify(newDB));
        }
        
        setIsModalOpen(false);
        window.dispatchEvent(new Event('budget-update'));
    };

    // ... (Le reste des fonctions getStats, updateTx, deleteTx, render graphiques reste IDENTIQUE) ...
    // Je réécris les fonctions courtes pour que le bloc soit complet et fonctionnel

    const getStats = () => {
        const now = new Date();
        const currentM = now.getMonth(), currentY = now.getFullYear();
        const currentTx = transactions.filter(t => { const d = new Date(t.date); return d.getMonth()===currentM && d.getFullYear()===currentY; });
        // On utilise 'merchant' s'il existe, sinon 'description' pour le Top 5
        const merchants = {};
        currentTx.forEach(t => { 
            const name = t.merchant || t.description;
            if(t.amount < 0) merchants[name] = (merchants[name]||0) + Math.abs(t.amount); 
        });
        const top5 = Object.entries(merchants).sort((a,b) => b[1]-a[1]).slice(0,5);
        const cats = {};
        currentTx.forEach(t => { if(t.amount < 0) cats[t.category] = (cats[t.category]||0) + Math.abs(t.amount); });
        const sixM = {};
        for(let i=5; i>=0; i--) { const d = new Date(now.getFullYear(), now.getMonth()-i, 1); sixM[`${d.getMonth()+1}/${d.getFullYear()}`] = 0; }
        transactions.forEach(t => { if(t.amount < 0) { const d = new Date(t.date); const k = `${d.getMonth()+1}/${d.getFullYear()}`; if(sixM.hasOwnProperty(k)) sixM[k] += Math.abs(t.amount); } });
        return { currentTx, top5, cats, sixM };
    };

    useEffect(() => {
        if(view !== 'dashboard') return;
        const { cats, sixM } = getStats();
        const timer = setTimeout(() => {
            if(pieRef.current) {
                if(window.bPie) window.bPie.destroy();
                const ctx = pieRef.current.getContext('2d');
                window.bPie = new Chart(ctx, { type: 'doughnut', data: { labels: Object.keys(cats), datasets: [{ data: Object.values(cats), backgroundColor: ['#ef4444','#f59e0b','#3b82f6','#8b5cf6','#ec4899','#10b981', '#6366f1'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } } } } });
            }
            if(barRef.current) {
                if(window.bBar) window.bBar.destroy();
                const ctx = barRef.current.getContext('2d');
                window.bBar = new Chart(ctx, { type: 'bar', data: { labels: Object.keys(sixM), datasets: [{ label: 'Dépenses', data: Object.values(sixM), backgroundColor: '#10b981', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
            }
        }, 100);
        return () => clearTimeout(timer);
    }, [transactions, view]);

    const openAddModal = () => { setNewTx({ description: '', merchant: '', amount: '', date: new Date().toISOString().split('T')[0], category: 'Autre' }); setIsModalOpen(true); };
    const updateTx = async (id, f, v) => { const tx = transactions.find(t=>t.id===id); if(tx) { await dbService.add('budget', {...tx, [f]:v}); window.dispatchEvent(new Event('budget-update')); } };
    const deleteTx = async (id) => { if(confirm("Supprimer ?")) { await dbService.delete('budget', id); window.dispatchEvent(new Event('budget-update')); } };
    
    const availableYears = React.useMemo(() => {
        try { const years = new Set(transactions.map(t => (t.date ? String(t.date).substring(0,4) : '2024'))); return ['Tout', ...Array.from(years).sort().reverse()]; } catch(e) { return ['Tout']; }
    }, [transactions]);
    const filteredList = transactions.filter(t => filterYear === 'Tout' ? true : t.date && String(t.date).startsWith(filterYear));
    const { top5 } = getStats();

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            <div className="flex justify-between items-center p-4 bg-white shadow-sm mb-2 sticky top-0 z-20">
                <div className="flex gap-2">
                    <button onClick={()=>setView('dashboard')} className={`px-3 py-1.5 rounded-lg text-sm font-bold transition ${view==='dashboard'?'bg-emerald-100 text-emerald-700':'text-gray-500 hover:bg-gray-100'}`}>Dashboard</button>
                    <button onClick={()=>setView('list')} className={`px-3 py-1.5 rounded-lg text-sm font-bold transition ${view==='list'?'bg-emerald-100 text-emerald-700':'text-gray-500 hover:bg-gray-100'}`}>Historique</button>
                </div>
                <button onClick={openAddModal} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-xs font-bold transition shadow">+ Manuel</button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-24" style={{ height: 'calc(100vh - 180px)' }}>
                {view === 'dashboard' && (
                    <div className="space-y-6 animate-fade-in pb-10">
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100"><h3 className="text-sm font-bold text-gray-700 mb-2">Dépenses (6 mois)</h3><div className="h-48 relative"><canvas ref={barRef}></canvas></div></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100"><h3 className="text-sm font-bold text-gray-700 mb-2">Top Dépenses (Ce mois)</h3><div className="space-y-2">{top5.map(([n,a], i) => (<div key={i} className="flex justify-between text-xs items-center border-b border-gray-50 last:border-0 pb-1"><span className="truncate flex-1 font-medium text-gray-600">{i+1}. {n}</span><span className="font-bold text-gray-800">{a.toFixed(2)}€</span></div>))}{top5.length===0 && <p className="text-xs text-gray-400">Rien ce mois-ci.</p>}</div></div>
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100"><h3 className="text-sm font-bold text-gray-700 mb-2">Répartition</h3><div className="h-40 relative"><canvas ref={pieRef}></canvas></div></div>
                        </div>
                    </div>
                )}
                {view === 'list' && (
                    <div className="space-y-4 animate-fade-in pb-10">
                        <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">{availableYears.map(y => (<button key={y} onClick={() => setFilterYear(y)} className={`px-3 py-1 text-xs rounded-full font-bold whitespace-nowrap transition ${filterYear === y ? 'bg-emerald-600 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200'}`}>{y}</button>))}</div>
                        <div className="space-y-2">
                            <h3 className="text-xs font-bold text-gray-400 uppercase flex justify-between"><span>{filterYear}</span><span>{filteredList.length} lignes</span></h3>
                            {filteredList.length === 0 ? (<div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-200"><p className="text-sm text-gray-400">Aucune donnée.</p></div>) : (
                                filteredList.map(t => (
                                    <div key={t.id} className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm flex flex-col gap-2">
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="flex-1">
                                                <input type="text" value={t.merchant || t.description} readOnly className="font-bold text-gray-700 bg-transparent w-full focus:outline-none text-sm" />
                                                <div className="text-[10px] text-gray-400 italic truncate">{t.description}</div>
                                            </div>
                                            <input type="number" step="0.01" value={t.amount} onChange={(e)=>updateTx(t.id,'amount',parseFloat(e.target.value))} className={`text-right w-24 font-mono font-bold bg-transparent focus:outline-none rounded ${t.amount<0?'text-slate-700':'text-emerald-600'}`} />
                                        </div>
                                        <div className="flex justify-between items-center text-xs mt-1">
                                            <div className="flex gap-2 items-center flex-wrap">
                                                <input type="date" value={t.date} onChange={(e)=>updateTx(t.id,'date',e.target.value)} className="text-gray-400 bg-transparent border-none p-0" />
                                                <select value={t.category} onChange={(e)=>updateTx(t.id,'category',e.target.value)} className="px-2 py-0.5 rounded bg-gray-50 text-gray-500 uppercase font-bold border border-gray-100 outline-none">{Object.keys(DETECTION_KEYWORDS).concat(['Autre', 'Import']).map(c=><option key={c} value={c}>{c}</option>)}</select>
                                            </div>
                                            <button onClick={()=>deleteTx(t.id)} className="text-gray-300 hover:text-red-500 px-2"><i className="fa-solid fa-trash"></i></button>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* MODALE D'AJOUT MANUEL INTELLIGENTE */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl overflow-hidden animate-fade-in">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-gray-800">Ajout Intelligent</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                        </div>
                        <form onSubmit={saveManual} className="p-5 space-y-4">
                            
                            {/* 1. Description qui déclenche la détection */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
                                <input 
                                    type="text" 
                                    required
                                    placeholder="Ex: Resto, Courses..." 
                                    className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                    value={newTx.description}
                                    onChange={e => setNewTx({...newTx, description: e.target.value})}
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Montant (€)</label>
                                    <input 
                                        type="number" 
                                        step="0.01" 
                                        required
                                        placeholder="0.00" 
                                        className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={newTx.amount}
                                        onChange={e => setNewTx({...newTx, amount: e.target.value})}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Date</label>
                                    <input 
                                        type="date" 
                                        required
                                        className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={newTx.date}
                                        onChange={e => setNewTx({...newTx, date: e.target.value})}
                                    />
                                </div>
                            </div>

                            {/* 2. Catégorie (Auto-détectée mais modifiable) */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1 flex justify-between">
                                    <span>Catégorie</span>
                                    {newTx.description && <span className="text-emerald-600 text-[10px] italic">Détecté auto</span>}
                                </label>
                                <select 
                                    className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-bold text-gray-700"
                                    value={newTx.category}
                                    onChange={e => setNewTx({...newTx, category: e.target.value})}
                                >
                                    {Object.keys(DETECTION_KEYWORDS).concat(['Autre']).map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </div>

                            {/* 3. Enseigne (Liste déroulante qui s'adapte à la catégorie + saisie libre) */}
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Enseigne (Optionnel)</label>
                                <input 
                                    type="text" 
                                    list="merchants-list"
                                    placeholder="Sélectionner ou écrire..." 
                                    className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                    value={newTx.merchant}
                                    onChange={e => setNewTx({...newTx, merchant: e.target.value})}
                                />
                                {/* La liste change selon la catégorie sélectionnée */}
                                <datalist id="merchants-list">
                                    {(merchantDB[newTx.category] || []).map((m, idx) => (
                                        <option key={idx} value={m} />
                                    ))}
                                </datalist>
                                <p className="text-[10px] text-gray-400 mt-1 italic">Si vous tapez une nouvelle enseigne, elle sera mémorisée.</p>
                            </div>

                            <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition mt-2">
                                Valider la dépense
                            </button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

// =================================================================
// 3. IA MODULE (PDF/IMG) - AVEC DÉTECTION ENSEIGNE & CATÉGORIES
// =================================================================
const pdfImporter = {
    apiKey: '', 
    fileBase64: '', 
    currentMimeType: '', 
    extracted: [], 
    usableModels: [],

    open: function() { document.getElementById('pdf-modal-overlay').classList.remove('hidden'); },
    close: function() { document.getElementById('pdf-modal-overlay').classList.add('hidden'); },

    log: function(msg, type='info') {
        const c = document.getElementById('ai-console');
        if(!c) return;
        const color = type==='success'?'text-green-400':(type==='error'?'text-red-400':(type==='warn'?'text-yellow-400':'text-slate-300'));
        c.innerHTML += `<div class="mb-1 ${color}">> ${msg}</div>`;
        c.parentElement.scrollTop = c.parentElement.scrollHeight;
    },

    verifyKey: async function() {
        const key = document.getElementById('gemini-key').value.trim();
        const btn = document.getElementById('btn-verify-key');
        if(!key) return;
        btn.innerText = '...'; btn.disabled = true;

        try {
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
            const data = await r.json();
            if(!r.ok) throw new Error(data.error?.message || 'Clé invalide');

            this.usableModels = (data.models || []).filter(m => m.supportedGenerationMethods?.includes('generateContent'));
            this.apiKey = key;

            document.getElementById('gemini-status').innerHTML = `<span class="text-green-600 font-bold">✅ Prêt</span>`;
            document.getElementById('ai-step-2').classList.remove('hidden');
        } catch(e) {
            document.getElementById('gemini-status').innerHTML = `<span class="text-red-600 font-bold">❌ ${e.message}</span>`;
        } finally {
            btn.innerText = 'Vérifier'; btn.disabled = false;
        }
    },

    handleFile: function(e) {
        const file = e.target.files[0];
        if(!file) return;
        this.currentMimeType = file.type;
        document.getElementById('ai-filename').innerText = file.name;
        document.getElementById('ai-file-info').classList.remove('hidden');
        const reader = new FileReader();
        reader.onload = (evt) => this.fileBase64 = evt.target.result.split(',')[1];
        reader.readAsDataURL(file);
    },

    processAuto: async function() {
        if(!this.apiKey || !this.fileBase64) return;
        
        document.getElementById('ai-step-3').classList.add('hidden');
        document.getElementById('ai-logs-container').classList.remove('hidden');
        document.getElementById('ai-console').innerHTML = ''; // Clear logs
        this.log("Analyse IA en cours...");

        // --- PROMPT AMÉLIORÉ ---
        // On donne la liste des catégories valides à l'IA
        const validCats = ['Alimentation', 'Restauration', 'Transport', 'Logement', 'Loisirs', 'Salaire', 'Investissement', 'Autre'];
        
        const prompt = `
            Analyse ce document bancaire/facture. Extrais TOUTES les transactions.
            
            RÈGLES STRICTES :
            1. Sortie UNIQUEMENT en JSON Array.
            2. Format : [{"date":"YYYY-MM-DD", "description":"Libellé complet", "merchant":"Nom Enseigne Courte", "amount":-10.00, "category":"UneCategorieValide"}]
            3. "merchant" : Extrais juste le nom de l'enseigne (ex: "McDonald's", "Total", "Leclerc"). Si pas clair, laisse vide.
            4. "category" : Choisis OBLIGATOIREMENT parmi cette liste : ${validCats.join(', ')}.
            5. "amount" : Les dépenses DOIVENT être en NÉGATIF (ex: -15.50). Les revenus en POSITIF.
        `;

        try {
            const model = this.usableModels[0] || {id: 'gemini-1.5-flash'};
            
            const payload = {
                contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: this.currentMimeType, data: this.fileBase64 } }] }],
                generationConfig: { temperature: 0.1, response_mime_type: "application/json" }
            };

            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${this.apiKey}`, {
                method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
            });

            if(!res.ok) throw new Error(res.statusText);

            const d = await res.json();
            let raw = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
            
            // Nettoyage Markdown éventuel
            const match = raw.match(/\[[\s\S]*\]/);
            if(match) raw = match[0];

            const json = JSON.parse(raw);
            this.extracted = Array.isArray(json) ? json : [json];

            this.log(`Succès ! ${this.extracted.length} transactions trouvées.`, 'success');
            this.renderPreview();

        } catch(e) {
            this.log(`Erreur: ${e.message}`, 'error');
        }
    },

    renderPreview: function() {
        const t = document.getElementById('ai-preview-table');
        document.getElementById('ai-count').innerText = `${this.extracted.length} lignes`;
        
        // On affiche aussi la colonne Enseigne dans l'aperçu
        t.innerHTML = `
            <thead>
                <tr class="text-xs text-gray-400 border-b">
                    <th class="p-2 text-left">Date</th>
                    <th class="p-2 text-left">Enseigne</th>
                    <th class="p-2 text-left">Catégorie</th>
                    <th class="p-2 text-right">Montant</th>
                </tr>
            </thead>
            <tbody>
                ${this.extracted.slice(0,10).map(r => `
                    <tr class="border-b">
                        <td class="p-2 text-xs">${r.date}</td>
                        <td class="p-2 text-xs font-bold text-gray-700">${r.merchant || '-'}</td>
                        <td class="p-2 text-xs text-gray-500">${r.category}</td>
                        <td class="p-2 text-xs text-right font-mono ${r.amount<0?'text-slate-700':'text-emerald-600'}">${r.amount}</td>
                    </tr>
                `).join('')}
            </tbody>
        `;
        
        if (this.extracted.length > 10) {
            t.innerHTML += `<tr><td colspan="4" class="p-2 text-center italic text-xs">... et ${this.extracted.length - 10} autres</td></tr>`;
        }

        document.getElementById('ai-step-3').classList.remove('hidden');
    },

    importToBudget: async function() {
        if(!this.extracted.length) return;
        await dbService.init();
        let count = 0;
        
        for(const item of this.extracted) {
            await dbService.add('budget', {
                id: Date.now() + Math.random(),
                date: item.date || new Date().toISOString().split('T')[0],
                description: item.description || 'Import IA',
                merchant: item.merchant || item.description || '', // On sauve l'enseigne !
                amount: parseFloat(item.amount) || 0,
                category: item.category || 'Autre'
            });
            count++;
        }
        
        this.close();
        window.dispatchEvent(new Event('budget-update'));
        alert(`${count} transactions importées avec succès !`);
    }
};

// =================================================================
// 4. INFO MODULE
// =================================================================

const infoModule = {
    config: { username: 'antoto2021', repo: 'Suivi-investissement' },
    init: async function() { this.renderLocalInfo(); setTimeout(() => this.checkGitHub(true), 3000); },
    openModal: function() { document.getElementById('info-modal-overlay').classList.remove('hidden'); this.renderLocalInfo(); this.checkGitHub(false); },
    closeModal: function() { document.getElementById('info-modal-overlay').classList.add('hidden'); },
    renderLocalInfo: function() { document.getElementById('info-local-v').innerText = localStorage.getItem('app_version_hash')?.substring(0,7) || 'Init'; },
    checkGitHub: function(bg=false) {
        const btn = document.querySelector('#info-remote-v');
        if(!bg && btn) btn.innerText = '...';
        return fetch(`https://api.github.com/repos/${this.config.username}/${this.config.repo}/commits?per_page=1`)
            .then(r => r.json())
            .then(d => {
                if(d && d[0]) {
                    const sha = d[0].sha;
                    if(document.getElementById('info-remote-v')) document.getElementById('info-remote-v').innerText = sha.substring(0,7);
                    const local = localStorage.getItem('app_version_hash');
                    if(local && local !== sha) { 
                        document.getElementById('navUpdateDot')?.classList.remove('hidden'); 
                        document.getElementById('refreshUpdateDot')?.classList.remove('hidden'); 
                    }
                    if(!local) localStorage.setItem('app_version_hash', sha);
                    return sha;
                }
            })
            .catch(e => { if(!bg && btn) btn.innerText = 'Err'; });
    },
    forceUpdate: function() {
        const btn = document.getElementById('refreshBtn');
        btn.classList.add('spin-once');
        this.checkGitHub().then(sha => { if(sha) localStorage.setItem('app_version_hash', sha); setTimeout(() => window.location.reload(), 800); });
    }
};

// =================================================================
// 5. BOOTSTRAP (INITIALISATION IMMÉDIATE)
// =================================================================

// Initialisation Directe (Pour contourner Babel latency)
const bootstrap = () => {
    console.log("Bootstrap Application Complete...");
    
    // Globals
    window.app = app;
    window.infoModule = infoModule;
    window.pdfImporter = pdfImporter;
    
    // Init Modules Vanilla
    app.init();
    infoModule.init();
    
    // Init React
    const rootEl = document.getElementById('budget-root');
    if(rootEl) {
        try {
            const root = ReactDOM.createRoot(rootEl);
            root.render(<BudgetApp />);
            console.log("React monté.");
        } catch(e) {
            console.error("Erreur React:", e);
        }
    }
    
    // Icons
    if(window.lucide) lucide.createIcons();
};

// Appel immédiat
bootstrap();
