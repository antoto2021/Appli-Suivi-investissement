/**
 * INVEST TRACK V5 - FINAL INTEGRATED BUILD
 * Includes: Unified DB (V3), React Budget, Portfolio View, AI, Auto-Ticker
 */

const { useState, useEffect, useRef } = React;

// =================================================================
// 0. SERVICE DE BASE DE DONNÉES UNIFIÉ (IndexedDB V3)
// =================================================================
const dbService = {
    dbName: 'InvestTrackDB',
    version: 3, 
    db: null,

    async init() {
        if (this.db) return this.db;
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, this.version);
            
            req.onupgradeneeded = (e) => {
                console.log("DB Upgrade: Création des tables...");
                const db = e.target.result;
                if (!db.objectStoreNames.contains('budget')) db.createObjectStore('budget', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('invest_tx')) {
                    const store = db.createObjectStore('invest_tx', { keyPath: 'id', autoIncrement: true });
                    if (!store.indexNames.contains('date')) store.createIndex('date', 'date', { unique: false });
                }
                if (!db.objectStoreNames.contains('invest_prices')) db.createObjectStore('invest_prices', { keyPath: 'ticker' });
            };

            req.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
            req.onerror = (e) => { console.error("DB Error:", e); reject(e); };
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
    }
};

// =================================================================
// 1. MODULE INVESTISSEMENT (Vanilla JS)
// =================================================================
const app = {
    transactions: [],
    currentPrices: {},
    charts: {},
    
// MINI BDD : CORRESPONDANCE NOMS -> TICKERS : Modifie cette liste pour ajouter tes propres actifs.
    // Clé (gauche) : Mot clé en minuscule (partie du nom).
    // Valeur (droite) : Le Ticker boursier exact.
    tickerDB: {
        // --- FRANCE (CAC 40 / SBF 120) ---
        'total': 'TTE.PA',        // TotalEnergies
        'vinci': 'DG.PA',         // Vinci
        'air liquide': 'AI.PA',   // Air Liquide
        'lvmh': 'MC.PA',          // LVMH
        'sanofi': 'SAN.PA',       // Sanofi
        'schneider': 'SU.PA',     // Schneider Electric
        'loreal': 'OR.PA',        // L'Oréal
        'hermes': 'RMS.PA',       // Hermès
        'bnpp': 'BNP.PA',         // BNP Paribas
        'axa': 'CS.PA',           // AXA
        'credit agricole': 'ACA.PA', // Crédit Agricole
        'danone': 'BN.PA',        // Danone
        'orange': 'ORA.PA',       // Orange
        'renault': 'RNO.PA',      // Renault
        'stellantis': 'STLAP.PA', // Stellantis
        'neurones': 'NRO',        // Neurones
        'accor': 'AC',            // Accor Groupe

        // --- USA (Tech & Indices) ---
        'apple': 'AAPL',          // Apple
        'microsoft': 'MSFT',      // Microsoft
        'tesla': 'TSLA',          // Tesla
        'amazon': 'AMZN',         // Amazon
        'google': 'GOOGL',        // Alphabet
        'meta': 'META',           // Meta (Facebook)
        'nvidia': 'NVDA',         // Nvidia
        'realty income': 'O',     // Realty Income (Immo)
        'rocket lab': 'RKLB',      // Rocket Lab
        
        // --- ETFS ---
        'cw8': 'CW8.PA',          // ETF World (Amundi)
        'sp500': 'SPX',        // ETF S&P 500 (BNP)
        'nasdaq': 'NDX',       // ETF Nasdaq
        'Ishares Physical Gold ETC': 'IGLN',    // ETF Or

        // --- Autres ---
        'CGM': 'GMF',             // GMF assurence vie
        'mercedes': 'MBG',        // Mercedes
    },
    
    mockDividends: { 'Action Vinci': { current: 4.50 }, 'Total Energie': { current: 3.20 } },
    tips: ["Diversifiez !", "Intérêts composés = Magie.", "Patience est mère de vertu.", "Achetez la peur."],

    init: async function() {
        console.log("Init App Bourse...");
        await this.loadData();
        this.loadDailyTip();
        this.setupAutoFill();
        this.renderTable();
        // Si on est sur l'onglet assets, on le charge
        if(!document.getElementById('assets-view').classList.contains('hidden')) {
            this.renderAssets();
        }
    },

    nav: function(id) {
        document.querySelectorAll('main > section').forEach(el => el.classList.add('hidden'));
        document.querySelectorAll('main > section').forEach(el => el.classList.remove('block'));
        
        const target = document.getElementById(id + '-view');
        if(target) {
            target.classList.remove('hidden');
            target.classList.add('block');
        }
        
        if(id === 'dashboard') { this.calcKPIs(); setTimeout(() => this.renderPie(), 100); }
        if(id === 'assets') this.renderAssets();
        if(id === 'transactions') this.renderTable();
        if(id === 'projections') setTimeout(() => this.renderProjections(), 100);
        if(id === 'dividends') this.renderDividends();
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    loadData: async function() {
        try {
            const txData = await dbService.getAll('invest_tx');
            this.transactions = (txData && txData.length > 0) ? txData : [];
            const priceData = await dbService.getAll('invest_prices');
            priceData.forEach(p => this.currentPrices[p.ticker] = p.price);
        } catch(e) { console.error(e); }
    },

    addTransaction: async function(tx) {
        if(!tx.id) tx.id = Date.now() + Math.random();
        await dbService.add('invest_tx', tx);
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
        this.charts.pie = new Chart(ctx, { type: 'doughnut', data: { labels: Object.keys(acc), datasets: [{ data: Object.values(acc), backgroundColor: ['#3b82f6','#8b5cf6','#10b981','#f59e0b'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } } });
    },

    renderProjections: function() {
        const ctx = document.getElementById('mainProjectionChart')?.getContext('2d');
        if(!ctx) return;
        if(this.charts.proj) this.charts.proj.destroy();
        const years = parseInt(document.getElementById('projYears').value) || 20;
        const labels = Array.from({length: years+1}, (_, i) => `An ${i}`);
        
        const kpis = this.calcKPIs();
        let growthRate = 0.05;
        if(kpis.invested > 0) growthRate = Math.max(0.02, Math.min(0.15, (kpis.currentVal - kpis.invested) / kpis.invested));

        let cap = 0;
        this.transactions.forEach(t => { if(t.op==='Achat') cap += t.qty*t.price; if(t.op==='Vente') cap -= t.qty*t.price; });
        const data = [cap];
        for(let i=1; i<=years; i++) data.push(data[i-1] * (1 + growthRate));

        this.charts.proj = new Chart(ctx, { type: 'line', data: { labels, datasets: [{ label: `Capital (Taux: ${(growthRate*100).toFixed(1)}%)`, data, borderColor: '#9333ea', backgroundColor: 'rgba(147, 51, 234, 0.1)', fill: true }] }, options: { maintainAspectRatio: false } });
        this.renderYearlyBar();
        this.renderFrequency();
    },

    renderYearlyBar: function() {
        const ctx = document.getElementById('yearlyBarChart')?.getContext('2d');
        if(!ctx) return;
        if(this.charts.bar) this.charts.bar.destroy();
        const yData = {};
        this.transactions.filter(t=>t.op==='Achat').forEach(t => { const y = t.date.split('-')[0]; yData[y] = (yData[y]||0) + (t.qty*t.price); });
        this.charts.bar = new Chart(ctx, { type: 'bar', data: { labels: Object.keys(yData).sort(), datasets: [{ label:'Investi', data:Object.values(yData), backgroundColor:'#10b981' }] }, options: { maintainAspectRatio: false } });
    },

    renderFrequency: function() {
        const ctx = document.getElementById('frequencyChart')?.getContext('2d');
        if(!ctx) return;
        if(this.charts.freq) this.charts.freq.destroy();
        let count = 0;
        const sorted = [...this.transactions].sort((a,b)=>new Date(a.date)-new Date(b.date));
        const data = sorted.map(t => ++count);
        this.charts.freq = new Chart(ctx, { type: 'line', data: { labels: sorted.map(t=>t.date), datasets: [{ label:'Opérations', data, borderColor:'#6366f1', pointRadius:0 }] }, options: { maintainAspectRatio: false, scales: { x: { display: false } } } });
    },

    // --- NOUVELLE FONCTION RENDER ASSETS (PORTEFEUILLE) ---
    renderAssets: function() {
        const grid = document.getElementById('assetsGrid');
        if(!grid) return;
        grid.innerHTML = ''; 
        const assets = this.getPortfolio();
        const sortedAssets = Object.values(assets).sort((a,b) => b.invested - a.invested);

        if (sortedAssets.length === 0) {
            grid.innerHTML = '<div class="col-span-full text-center text-gray-400 py-10">Aucune position. Ajoutez des transactions "Achat".</div>';
            return;
        }

        sortedAssets.forEach(a => {
            if(a.qty < 0.001) return;
            const pru = a.invested / a.qty;
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
                            <div class="text-left"><span class="block text-[10px] text-gray-400 uppercase">PRU</span><span class="font-mono text-sm text-gray-600">${pru.toFixed(2)} €</span></div>
                            <div class="text-right">
                                <label class="block text-[10px] text-blue-500 uppercase font-bold mb-1"><i class="fa-solid fa-pen-to-square"></i> Prix Actuel</label>
                                <input type="number" step="0.01" value="${currentPrice.toFixed(2)}" onchange="app.updatePrice('${a.name}', this.value, '${a.ticker}')" class="w-24 text-right font-bold text-gray-800 border-b-2 border-blue-200 focus:border-blue-500 outline-none bg-transparent">
                            </div>
                        </div>
                        <div class="flex justify-between items-end pt-2">
                            <div><span class="text-xs text-gray-400 block">Total</span><div class="font-bold text-xl text-gray-800">${totalValue.toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}</div></div>
                            <div class="text-right">
                                <span class="text-xs text-gray-400 block">Perf</span>
                                <span class="font-bold text-lg ${colorClass}">${isPos?'+':''}${perf.toFixed(2)}%</span>
                                <div class="text-[10px] ${colorClass} opacity-75">(${isPos?'+':''}${gain.toLocaleString('fr-FR',{style:'currency',currency:'EUR'})})</div>
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
        
        if(sorted.length === 0) document.getElementById('emptyState')?.classList.remove('hidden');
        else document.getElementById('emptyState')?.classList.add('hidden');

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
                container.innerHTML += `<div class="bg-white rounded-xl shadow-sm border p-4" style="background:${col}; border-color:${border}"><div class="flex justify-between font-bold" style="color:${border}"><span>${a.name}</span><i class="fa-solid fa-coins"></i></div><div class="mt-4 flex justify-between items-end"><div><p class="text-xs text-gray-500">Revenu Est.</p><p class="text-xl font-bold text-emerald-700">${total.toFixed(2)} €</p></div><div class="text-right"><p class="text-xs text-gray-500">Unit.</p><p class="font-mono">${info.current} €</p></div></div></div>`;
            }
        });
        if(!found) document.getElementById('noDividends')?.classList.remove('hidden');
    },

    openModal: function(mode, id=null) {
        document.getElementById('modalForm').classList.remove('hidden');
        document.getElementById('editIndex').value = id !== null ? id : '';
        document.getElementById('modalTitle').textContent = mode==='new' ? 'Nouvelle Transaction' : 'Modifier';
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
        this.closeModal(); this.toast("Sauvegardé"); this.renderTable();
    },

    deleteTx: async function(id) { 
        if(confirm('Supprimer ?')) { 
            await dbService.delete('invest_tx', id);
            this.transactions = this.transactions.filter(t => t.id !== id);
            this.renderTable(); 
        } 
    },
    
    // --- IMPORT AUTO-FILL TICKER ---
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
                    
                    let detectedTicker = row['Ticker'] || '';
                    if (!detectedTicker) {
                        const lowerName = (row['Nom actif'] || '').toLowerCase();
                        for (const [key, ticker] of Object.entries(this.tickerDB)) {
                            if (lowerName.includes(key)) { detectedTicker = ticker; break; }
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
    
    // --- AUTO-FILL MANUEL ---
    setupAutoFill: function() {
        const el = document.getElementById('fName');
        if(el) {
            el.addEventListener('blur', (e) => {
                const val = e.target.value.toLowerCase().trim();
                const tickerInput = document.getElementById('fTicker');
                if(tickerInput.value !== '') return;
                for(const [k,t] of Object.entries(this.tickerDB)) { 
                    if(val.includes(k)) { tickerInput.value=t; this.toast(`Ticker: ${t}`); break; }
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
// 2. BUDGET SCAN APP (REACT)
// =================================================================
const CATEGORIES = {
    'Alimentation': ['carrefour', 'leclerc', 'auchan', 'lidl', 'courses'],
    'Restauration': ['mcdo', 'uber', 'deliveroo', 'restaurant', 'cafe'],
    'Transport': ['sncf', 'total', 'essence', 'peage', 'uber', 'parking'],
    'Logement': ['loyer', 'edf', 'eau', 'internet'],
    'Loisirs': ['netflix', 'cinema', 'sport'],
    'Salaire': ['salaire', 'virement', 'cpam']
};

const BudgetApp = () => {
    const [transactions, setTransactions] = useState([]);
    const [view, setView] = useState('dashboard'); 
    const [filterYear, setFilterYear] = useState('Tout'); 
    const barRef = useRef(null);
    const pieRef = useRef(null);

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
                    category: t.category || 'Autre'
                }));
                setTransactions(safeData.sort((a,b) => new Date(b.date) - new Date(a.date)));
            } catch (e) { console.error("Err Budget Load", e); }
        };
        load();
        window.addEventListener('budget-update', load);
        return () => window.removeEventListener('budget-update', load);
    }, []);

    const getStats = () => {
        const now = new Date();
        const currentM = now.getMonth(), currentY = now.getFullYear();
        const currentTx = transactions.filter(t => { 
            const d = new Date(t.date); 
            return d.getMonth()===currentM && d.getFullYear()===currentY; 
        });
        const merchants = {};
        currentTx.forEach(t => { if(t.amount < 0) merchants[t.description] = (merchants[t.description]||0) + Math.abs(t.amount); });
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
                window.bPie = new Chart(ctx, { type: 'doughnut', data: { labels: Object.keys(cats), datasets: [{ data: Object.values(cats), backgroundColor: ['#ef4444','#f59e0b','#3b82f6','#8b5cf6','#ec4899','#10b981'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } } } } });
            }
            if(barRef.current) {
                if(window.bBar) window.bBar.destroy();
                const ctx = barRef.current.getContext('2d');
                window.bBar = new Chart(ctx, { type: 'bar', data: { labels: Object.keys(sixM), datasets: [{ label: 'Dépenses', data: Object.values(sixM), backgroundColor: '#10b981', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
            }
        }, 100);
        return () => clearTimeout(timer);
    }, [transactions, view]);

    const addManual = async () => { await dbService.add('budget', { id: Date.now(), date: new Date().toISOString().split('T')[0], description: "Dépense manuelle", amount: -10, category: "Autre" }); window.dispatchEvent(new Event('budget-update')); };
    const updateTx = async (id, f, v) => { const tx = transactions.find(t=>t.id===id); if(tx) { await dbService.add('budget', {...tx, [f]:v}); window.dispatchEvent(new Event('budget-update')); } };
    const deleteTx = async (id) => { if(confirm("Supprimer ?")) { await dbService.delete('budget', id); window.dispatchEvent(new Event('budget-update')); } };
    
    const availableYears = React.useMemo(() => {
        try {
            const years = new Set(transactions.map(t => (t.date ? String(t.date).substring(0,4) : '2024')));
            return ['Tout', ...Array.from(years).sort().reverse()];
        } catch(e) { return ['Tout']; }
    }, [transactions]);

    const filteredList = transactions.filter(t => {
        if (filterYear === 'Tout') return true;
        return t.date && String(t.date).startsWith(filterYear);
    });

    const { top5 } = getStats();

    return (
        <div className="flex flex-col h-full bg-slate-50 relative">
            <div className="flex justify-between items-center p-4 bg-white shadow-sm mb-2 sticky top-0 z-20">
                <div className="flex gap-2">
                    <button onClick={()=>setView('dashboard')} className={`px-3 py-1.5 rounded-lg text-sm font-bold transition ${view==='dashboard'?'bg-emerald-100 text-emerald-700':'text-gray-500 hover:bg-gray-100'}`}>Dashboard</button>
                    <button onClick={()=>setView('list')} className={`px-3 py-1.5 rounded-lg text-sm font-bold transition ${view==='list'?'bg-emerald-100 text-emerald-700':'text-gray-500 hover:bg-gray-100'}`}>Historique</button>
                </div>
                <button onClick={addManual} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-xs font-bold transition shadow">+ Manuel</button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-24" style={{ height: 'calc(100vh - 180px)' }}>
                {view === 'dashboard' && (
                    <div className="space-y-6 animate-fade-in pb-10">
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                            <h3 className="text-sm font-bold text-gray-700 mb-2">Dépenses (6 mois)</h3>
                            <div className="h-48 relative"><canvas ref={barRef}></canvas></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                                <h3 className="text-sm font-bold text-gray-700 mb-2">Top Dépenses (Ce mois)</h3>
                                <div className="space-y-2">
                                    {top5.map(([n,a], i) => (<div key={i} className="flex justify-between text-xs items-center border-b border-gray-50 last:border-0 pb-1"><span className="truncate flex-1 font-medium text-gray-600">{i+1}. {n}</span><span className="font-bold text-gray-800">{a.toFixed(2)}€</span></div>))}
                                    {top5.length===0 && <p className="text-xs text-gray-400">Rien ce mois-ci.</p>}
                                </div>
                            </div>
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                                <h3 className="text-sm font-bold text-gray-700 mb-2">Répartition</h3>
                                <div className="h-40 relative"><canvas ref={pieRef}></canvas></div>
                            </div>
                        </div>
                    </div>
                )}
                {view === 'list' && (
                    <div className="space-y-4 animate-fade-in pb-10">
                        <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
                            {availableYears.map(y => (
                                <button key={y} onClick={() => setFilterYear(y)} className={`px-3 py-1 text-xs rounded-full font-bold whitespace-nowrap transition ${filterYear === y ? 'bg-emerald-600 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200'}`}>{y}</button>
                            ))}
                        </div>
                        <div className="space-y-2">
                            <h3 className="text-xs font-bold text-gray-400 uppercase flex justify-between"><span>{filterYear}</span><span>{filteredList.length} lignes</span></h3>
                            {filteredList.length === 0 ? (<div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-200"><p className="text-sm text-gray-400">Aucune donnée.</p></div>) : (
                                filteredList.map(t => (
                                    <div key={t.id} className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm flex flex-col gap-2">
                                        <div className="flex justify-between items-center gap-2">
                                            <input type="text" value={t.description} onChange={(e)=>updateTx(t.id,'description',e.target.value)} className="font-bold text-gray-700 bg-transparent w-full focus:outline-none text-sm" />
                                            <input type="number" step="0.01" value={t.amount} onChange={(e)=>updateTx(t.id,'amount',parseFloat(e.target.value))} className={`text-right w-24 font-mono font-bold bg-transparent focus:outline-none rounded ${t.amount<0?'text-slate-700':'text-emerald-600'}`} />
                                        </div>
                                        <div className="flex justify-between items-center text-xs">
                                            <div className="flex gap-2 items-center flex-wrap">
                                                <input type="date" value={t.date} onChange={(e)=>updateTx(t.id,'date',e.target.value)} className="text-gray-400 bg-transparent border-none p-0" />
                                                <select value={t.category} onChange={(e)=>updateTx(t.id,'category',e.target.value)} className="px-2 py-0.5 rounded bg-gray-50 text-gray-500 uppercase font-bold border border-gray-100 outline-none">{Object.keys(CATEGORIES).concat(['Autre', 'Import']).map(c=><option key={c} value={c}>{c}</option>)}</select>
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
        </div>
    );
};

// =================================================================
// 3. IA MODULE (PDF/IMG)
// =================================================================
const pdfImporter = {
    apiKey: '', fileBase64: '', currentMimeType: '', extracted: [], usableModels: [],
    open: function() { document.getElementById('pdf-modal-overlay').classList.remove('hidden'); },
    close: function() { document.getElementById('pdf-modal-overlay').classList.add('hidden'); },
    log: function(msg, type='info') {
        const c = document.getElementById('ai-console');
        if(!c) return;
        const color = type==='success'?'text-green-400':(type==='error'?'text-red-400':(type==='warn'?'text-yellow-400':'text-slate-300'));
        c.innerHTML += `<div class="mb-1 ${color}">> ${msg}</div>`; c.parentElement.scrollTop = c.parentElement.scrollHeight;
    },
    verifyKey: async function() {
        const key = document.getElementById('gemini-key').value.trim();
        if(!key) return;
        try {
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
            const data = await r.json();
            if(!r.ok) throw new Error(data.error?.message || 'Clé invalide');
            this.usableModels = (data.models || []).filter(m => m.supportedGenerationMethods?.includes('generateContent'));
            this.apiKey = key;
            document.getElementById('gemini-status').innerHTML = `<span class="text-green-600 font-bold">✅ Prêt</span>`;
            document.getElementById('ai-step-2').classList.remove('hidden');
        } catch(e) { document.getElementById('gemini-status').innerHTML = `<span class="text-red-600 font-bold">❌ ${e.message}</span>`; }
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
        this.log("Analyse IA...");
        const prompt = `Extrais TOUTES les transactions. JSON STRICT Array: [{"date":"YYYY-MM-DD","description":"Nom","amount":-10.00,"category":"Autre"}]. IMPORTANT: Les dépenses doivent avoir un montant NÉGATIF.`;
        try {
            const model = this.usableModels[0] || {id: 'gemini-1.5-flash'};
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${this.apiKey}`, {
                method: 'POST', headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: this.currentMimeType, data: this.fileBase64 } }] }] })
            });
            const d = await res.json();
            let raw = d.candidates?.[0]?.content?.parts?.[0]?.text || '';
            const match = raw.match(/\[[\s\S]*\]/);
            if(match) raw = match[0];
            const json = JSON.parse(raw);
            this.extracted = Array.isArray(json) ? json : [json];
            this.log(`Succès ! ${this.extracted.length} lignes.`, 'success');
            this.renderPreview();
        } catch(e) { this.log(`Erreur: ${e.message}`, 'error'); }
    },
    renderPreview: function() {
        const t = document.getElementById('ai-preview-table');
        document.getElementById('ai-count').innerText = `${this.extracted.length} lignes`;
        t.innerHTML = this.extracted.slice(0,10).map(r => `<tr class="border-b"><td class="p-2 text-xs">${r.date}</td><td class="p-2 text-xs truncate max-w-[100px]">${r.description}</td><td class="p-2 text-xs text-right font-bold">${r.amount}</td></tr>`).join('');
        document.getElementById('ai-step-3').classList.remove('hidden');
    },
    importToBudget: async function() {
        await dbService.init();
        let count = 0;
        for(const item of this.extracted) {
            await dbService.add('budget', { id: Date.now()+Math.random(), date: item.date||new Date().toISOString().split('T')[0], description: item.description||'IA', amount: parseFloat(item.amount)||0, category: item.category||'Import' });
            count++;
        }
        this.close(); window.dispatchEvent(new Event('budget-update')); alert(`${count} importés !`);
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
            .then(r => r.json()).then(d => {
                if(d && d[0]) {
                    const sha = d[0].sha;
                    if(document.getElementById('info-remote-v')) document.getElementById('info-remote-v').innerText = sha.substring(0,7);
                    if(localStorage.getItem('app_version_hash') !== sha) { document.getElementById('navUpdateDot')?.classList.remove('hidden'); document.getElementById('refreshUpdateDot')?.classList.remove('hidden'); }
                    return sha;
                }
            }).catch(e => { if(!bg && btn) btn.innerText = 'Err'; });
    },
    forceUpdate: function() {
        const btn = document.getElementById('refreshBtn');
        btn.classList.add('spin-once');
        this.checkGitHub().then(sha => { if(sha) localStorage.setItem('app_version_hash', sha); setTimeout(() => window.location.reload(), 800); });
    }
};

// =================================================================
// 5. BOOTSTRAP (INITIALISATION)
// =================================================================
const bootstrap = () => {
    console.log("Bootstrap...");
    window.app = app;
    window.infoModule = infoModule;
    window.pdfImporter = pdfImporter;
    
    app.init();
    infoModule.init();
    
    const rootEl = document.getElementById('budget-root');
    if(rootEl) {
        try { ReactDOM.createRoot(rootEl).render(<BudgetApp />); } 
        catch(e) { console.error("React Error", e); }
    }
    if(window.lucide) lucide.createIcons();
};

bootstrap();
