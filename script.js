/**
 * INVEST TRACK V5 - FINAL HYBRID CORE
 * Contient : InvestTrack (Vanilla), BudgetScan (React + IndexedDB), PDF Import (Gemini), Info System
 */

const { useState, useEffect, useRef } = React;

// =================================================================
// 0. SERVICES UTILITAIRES (IndexedDB & Helpers)
// =================================================================

const dbService = {
    dbName: 'InvestTrackDB',
    version: 1,
    db: null,

    init: function() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('budget')) {
                    db.createObjectStore('budget', { keyPath: 'id' });
                }
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };
            request.onerror = (e) => reject("Erreur DB: " + e.target.error);
        });
    },

    getAll: function(storeName) {
        return new Promise((resolve, reject) => {
            if(!this.db) return reject("DB non initialisée");
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    add: function(storeName, item) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            store.put(item); // put = insert or update
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    },

    delete: function(storeName, id) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            store.delete(id);
            tx.oncomplete = () => resolve();
        });
    },

    estimateSize: async function() {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            const used = (estimate.usage / 1024 / 1024).toFixed(2);
            return `${used} MB`;
        }
        return 'Non supporté';
    }
};

// =================================================================
// 1. INVEST TRACK LOGIC (Vanilla JS)
// =================================================================
const app = {
    transactions: [],
    currentPrices: {},
    charts: {}, // Stocke les instances Chart.js pour les détruire avant redessin
    
    // Base Tickers Auto-complétion
    tickerDB: {
        'total': 'TTE.PA', 'vinci': 'DG.PA', 'air liquide': 'AI.PA', 'lvmh': 'MC.PA', 
        'sanofi': 'SAN.PA', 'schneider': 'SU.PA', 'loreal': 'OR.PA', 'hermes': 'RMS.PA',
        'bnpp': 'BNP.PA', 'axa': 'CS.PA', 'apple': 'AAPL', 'microsoft': 'MSFT', 
        'tesla': 'TSLA', 'amazon': 'AMZN', 'google': 'GOOGL', 'meta': 'META', 
        'nvidia': 'NVDA', 'cw8': 'CW8.PA', 'sp500': 'SP500', 'accor': 'AC.PA',
        'mercedes': 'MBG.DE', 'neurones': 'NRO.PA'
    },
    
    // Mock Dividendes (Simulation API Bourse)
    mockDividends: {
        'Action Vinci': { current: 4.50 }, 'Total Energie': { current: 3.20 },
        'Accor': { current: 1.10 }, 'Mercedes': { current: 5.30 }, 'Neurones': { current: 1.20 }
    },

    tips: [
        "La diversification est la seule gratuité en finance.", "L'intérêt composé est la 8ème merveille du monde.",
        "Le temps est votre meilleur allié.", "Achetez quand le sang coule.", "Réinvestissez vos dividendes.",
        "N'investissez que ce que vous pouvez perdre."
    ],

    init: function() {
        this.loadData();
        this.loadDailyTip();
        this.setupAutoFill();
        // Force l'affichage de l'accueil au démarrage
        this.nav('home');
    },

    // --- Navigation ---
    nav: function(id) {
        // Cacher toutes les sections
        document.querySelectorAll('main > section').forEach(el => el.classList.add('hidden'));
        
        // Afficher la cible
        const target = document.getElementById(id + '-view');
        if(target) target.classList.remove('hidden');
        
        // Hooks spécifiques pour rafraîchir les graphiques
        if(id === 'dashboard') { 
            this.calcKPIs(); 
            // Petit délai pour que le DOM soit prêt pour Chart.js
            setTimeout(() => this.renderPie(), 50); 
        }
        if(id === 'assets') this.renderAssets();
        if(id === 'transactions') this.renderTable();
        if(id === 'projections') setTimeout(() => this.renderProjections(), 50);
        if(id === 'dividends') this.renderDividends();
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    // --- Gestion des Données ---
    loadData: function() {
        const tx = localStorage.getItem('invest_v5_tx');
        if(tx) this.transactions = JSON.parse(tx);
        else this.seedData();

        const pr = localStorage.getItem('invest_v5_prices');
        if(pr) this.currentPrices = JSON.parse(pr);
    },

    saveData: function() {
        localStorage.setItem('invest_v5_tx', JSON.stringify(this.transactions));
        localStorage.setItem('invest_v5_prices', JSON.stringify(this.currentPrices));
    },

    seedData: function() {
        // Données initiales si vide
        this.transactions = [
            {date:'2024-01-31', op:'Achat', name:'Action Vinci', account:'PEA', qty:15, price:93.53, sector:'Industrie'},
            {date:'2024-11-12', op:'Achat', name:'Total Energie', account:'CTO', qty:5, price:60.32, sector:'Energie'},
            {date:'2025-05-06', op:'Achat', name:'Accor', account:'PEA', qty:20, price:42.00, sector:'Tourisme'}
        ];
        this.transactions.forEach(t => { if(t.op==='Achat') this.currentPrices[t.name] = t.price; });
        this.saveData();
    },

    // --- Logique Métier ---
    updatePrice: function(name, price) {
        this.currentPrices[name] = parseFloat(price);
        this.saveData();
        this.renderAssets(); // Rafraîchir la grille
        this.toast("Prix mis à jour");
    },

    getPortfolio: function() {
        const assets = {};
        this.transactions.forEach(tx => {
            if(tx.op === 'Dividende') return;
            if(!assets[tx.name]) assets[tx.name] = { name: tx.name, qty: 0, invested: 0, ticker: tx.ticker || '' };
            
            if(tx.op === 'Achat') {
                assets[tx.name].qty += tx.qty;
                assets[tx.name].invested += (tx.qty * tx.price);
            } else if(tx.op === 'Vente') {
                // Sortie au PRU pondéré
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
            const price = this.currentPrices[a.name] || (a.invested / a.qty);
            currentVal += (a.qty * price);
        });

        const diff = currentVal - invested;
        const perf = invested > 0 ? (diff / invested) * 100 : 0;

        // Mise à jour DOM
        document.getElementById('kpiTotal').textContent = invested.toLocaleString('fr-FR', {style:'currency', currency:'EUR'});
        document.getElementById('kpiFuture').textContent = currentVal.toLocaleString('fr-FR', {style:'currency', currency:'EUR'});
        
        const diffEl = document.getElementById('kpiDiff');
        diffEl.textContent = `${diff >= 0 ? '+' : ''}${diff.toLocaleString('fr-FR', {style:'currency', currency:'EUR'})}`;
        diffEl.className = `sub-value ${diff >= 0 ? 'text-green-600' : 'text-red-500'}`;

        const perfEl = document.getElementById('kpiReturn');
        perfEl.textContent = `${perf >= 0 ? '+' : ''}${perf.toFixed(2)} %`;
        perfEl.className = `value ${perf >= 0 ? 'text-green-600' : 'text-red-500'}`;

        return { invested, currentVal, perf };
    },

    // --- Renderers (Graphiques & Tableaux) ---
    
    renderPie: function() {
        const acc = {};
        this.transactions.filter(t => t.op === 'Achat').forEach(t => {
            acc[t.account] = (acc[t.account] || 0) + (t.qty * t.price);
        });

        const ctx = document.getElementById('pieChart').getContext('2d');
        if (this.charts.pie) this.charts.pie.destroy();

        this.charts.pie = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(acc),
                datasets: [{
                    data: Object.values(acc),
                    backgroundColor: ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899']
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: 'right' } }
            }
        });
    },

    renderAssets: function() {
        const grid = document.getElementById('assetsGrid');
        grid.innerHTML = '';
        const assets = this.getPortfolio();

        Object.values(assets).forEach(a => {
            if(a.qty < 0.001) return;
            const pru = a.invested / a.qty;
            const curr = this.currentPrices[a.name] || pru;
            const val = a.qty * curr;
            const perf = ((val - a.invested) / a.invested) * 100;
            const color = this.strColor(a.name, 95, 90);
            const border = this.strColor(a.name, 60, 50);

            grid.innerHTML += `
                <div class="bg-white rounded-xl shadow-sm border overflow-hidden transition hover:-translate-y-1" style="border-color:${border}">
                    <div class="p-4 flex justify-between items-center" style="background-color:${color}">
                        <h3 class="font-bold text-gray-800 truncate" style="color:${border}">${a.name}</h3>
                        <span class="text-xs bg-white px-2 py-1 rounded font-mono font-bold text-gray-600">${a.ticker}</span>
                    </div>
                    <div class="p-5">
                        <div class="flex justify-between items-center mb-3">
                            <span class="text-gray-500 text-xs font-bold uppercase">Cours Actuel</span>
                            <input type="number" step="0.01" value="${curr.toFixed(2)}" 
                                onchange="app.updatePrice('${a.name}', this.value)" class="price-input">
                        </div>
                        <div class="flex justify-between mb-1"><span class="text-gray-500 text-xs">PRU</span><span class="font-mono text-gray-600">${pru.toFixed(2)} €</span></div>
                        <div class="flex justify-between mb-3 border-b border-dashed pb-2"><span class="text-gray-500 text-xs">Quantité</span><span class="font-mono font-semibold">${a.qty.toFixed(2)}</span></div>
                        <div class="flex justify-between items-end">
                            <div><span class="text-xs text-gray-400">Total</span><div class="font-bold text-lg text-gray-800">${val.toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}</div></div>
                            <div class="text-right"><span class="block text-xs text-gray-400">Perf.</span><span class="font-bold ${perf>=0?'text-green-600':'text-red-500'}">${perf>=0?'+':''}${perf.toFixed(1)}%</span></div>
                        </div>
                    </div>
                </div>`;
        });
    },

    renderTable: function() {
        const tbody = document.querySelector('#transactionsTable tbody');
        tbody.innerHTML = '';
        const sorted = [...this.transactions].sort((a,b) => new Date(b.date) - new Date(a.date));

        if(sorted.length === 0) document.getElementById('emptyState').classList.remove('hidden');
        else document.getElementById('emptyState').classList.add('hidden');

        sorted.forEach(tx => {
            const idx = this.transactions.indexOf(tx);
            const total = tx.op === 'Dividende' ? tx.price : (tx.qty * tx.price);
            const badge = tx.op === 'Achat' ? 'bg-blue-100 text-blue-800' : (tx.op === 'Vente' ? 'bg-red-100 text-red-800' : 'bg-emerald-100 text-emerald-800');
            
            tbody.innerHTML += `
                <tr class="bg-white border-b hover:bg-gray-50 transition">
                    <td class="px-4 py-3 font-mono text-xs">${tx.date}</td>
                    <td class="px-4 py-3"><span class="px-2 py-1 rounded text-xs ${badge}">${tx.op}</span></td>
                    <td class="px-4 py-3 font-medium text-gray-800">${tx.name}</td>
                    <td class="px-4 py-3 text-xs">${tx.account || '-'}</td>
                    <td class="px-4 py-3 text-right font-mono">${tx.op === 'Dividende' ? '-' : tx.qty}</td>
                    <td class="px-4 py-3 text-right font-mono text-xs">${tx.price.toFixed(2)}</td>
                    <td class="px-4 py-3 text-right font-bold text-gray-700">${total.toFixed(2)} €</td>
                    <td class="px-4 py-3 text-center">
                        <button onclick="app.openModal('edit', ${idx})" class="text-blue-500 hover:text-blue-700 mx-1"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="app.deleteTx(${idx})" class="text-red-400 hover:text-red-600 mx-1"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>`;
        });
    },

    renderProjections: function() {
        const years = parseInt(document.getElementById('projYears').value) || 20;
        const labels = Array.from({length: years + 1}, (_, i) => `An ${i}`);
        
        // Calcul du taux de croissance basé sur la perf réelle actuelle
        const kpis = this.calcKPIs();
        let growthRate = 0.05; // Fallback 5%
        if (kpis.invested > 0) {
            growthRate = (kpis.currentVal - kpis.invested) / kpis.invested;
            if (growthRate < 0) growthRate = 0.02; // Plancher sécurité
            if (growthRate > 0.15) growthRate = 0.15; // Plafond sécurité
        }

        // Capital de départ (Cash sorti uniquement)
        let cap = 0;
        this.transactions.forEach(t => { 
            if(t.op === 'Achat') cap += t.qty * t.price; 
            if(t.op === 'Vente') cap -= t.qty * t.price; 
        });

        const data = [cap];
        for(let i=1; i<=years; i++) {
            data.push(data[i-1] * (1 + growthRate));
        }

        const ctx = document.getElementById('mainProjectionChart').getContext('2d');
        if(this.charts.proj) this.charts.proj.destroy();
        
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(147, 51, 234, 0.4)');
        gradient.addColorStop(1, 'rgba(147, 51, 234, 0.0)');

        this.charts.proj = new Chart(ctx, {
            type: 'line',
            data: { 
                labels, 
                datasets: [{ 
                    label: `Capital (Taux appliqué: ${(growthRate*100).toFixed(1)}%)`, 
                    data, 
                    borderColor: '#9333ea', 
                    backgroundColor: gradient, 
                    fill: true, 
                    tension: 0.4 
                }] 
            },
            options: { maintainAspectRatio: false }
        });

        this.renderYearlyBar();
        this.renderFrequency();
    },

    renderYearlyBar: function() {
        const yData = {};
        this.transactions.filter(t => t.op === 'Achat').forEach(t => {
            const y = t.date.split('-')[0];
            yData[y] = (yData[y] || 0) + (t.qty * t.price);
        });

        const ctx = document.getElementById('yearlyBarChart').getContext('2d');
        if(this.charts.bar) this.charts.bar.destroy();

        this.charts.bar = new Chart(ctx, {
            type: 'bar',
            data: { 
                labels: Object.keys(yData).sort(), 
                datasets: [{ label: 'Investi', data: Object.values(yData), backgroundColor: '#10b981', borderRadius: 4 }] 
            },
            options: { maintainAspectRatio: false }
        });
    },

    renderFrequency: function() {
        let count = 0;
        const sorted = [...this.transactions].sort((a,b) => new Date(a.date) - new Date(b.date));
        const data = sorted.map(t => ++count);
        const labels = sorted.map(t => t.date);

        const ctx = document.getElementById('frequencyChart').getContext('2d');
        if(this.charts.freq) this.charts.freq.destroy();

        this.charts.freq = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: [{ label: 'Cumul Opérations', data, borderColor: '#6366f1', pointRadius: 0 }] },
            options: { maintainAspectRatio: false, scales: { x: { display: false } } }
        });
    },

    renderDividends: function() {
        const container = document.getElementById('dividendCards');
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
        if(!found) document.getElementById('noDividends').classList.remove('hidden');
    },

    // --- Helpers Utiles ---
    openModal: function(mode, idx = null) {
        document.getElementById('modalForm').classList.remove('hidden');
        document.getElementById('editIndex').value = idx !== null ? idx : '';
        document.getElementById('modalTitle').textContent = mode === 'new' ? 'Nouvelle Transaction' : 'Modifier Transaction';
        
        if (mode === 'new') {
            document.getElementById('fDate').value = new Date().toISOString().split('T')[0];
            ['fName','fTicker','fAccount','fSector','fQty','fPrice'].forEach(id => document.getElementById(id).value = '');
            document.getElementById('fOp').value = 'Achat';
        } else {
            const tx = this.transactions[idx];
            document.getElementById('fDate').value = tx.date;
            document.getElementById('fOp').value = tx.op;
            document.getElementById('fName').value = tx.name;
            document.getElementById('fTicker').value = tx.ticker || '';
            document.getElementById('fAccount').value = tx.account || '';
            document.getElementById('fSector').value = tx.sector || '';
            document.getElementById('fQty').value = tx.qty;
            document.getElementById('fPrice').value = tx.price;
        }
    },

    closeModal: function() { document.getElementById('modalForm').classList.add('hidden'); },

    saveTransaction: function() {
        const idx = document.getElementById('editIndex').value;
        const tx = {
            date: document.getElementById('fDate').value,
            op: document.getElementById('fOp').value,
            name: document.getElementById('fName').value,
            ticker: document.getElementById('fTicker').value,
            account: document.getElementById('fAccount').value,
            sector: document.getElementById('fSector').value,
            qty: parseFloat(document.getElementById('fQty').value) || 0,
            price: parseFloat(document.getElementById('fPrice').value) || 0
        };

        if (idx !== '') this.transactions[idx] = tx;
        else this.transactions.push(tx);

        this.saveData();
        this.closeModal();
        this.toast(idx !== '' ? "Modifié" : "Ajouté");
        this.renderTable();
    },

    deleteTx: function(idx) {
        if(confirm('Supprimer ?')) {
            this.transactions.splice(idx, 1);
            this.saveData();
            this.renderTable();
        }
    },

    handleImport: function(e) {
        const r = new FileReader();
        r.onload = ev => {
            const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
            const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            let count = 0;
            json.forEach(row => {
                let d = row['Date'] || row['Date_Entrée'];
                if(typeof d === 'number') d = new Date(Math.round((d - 25569) * 86400 * 1000)).toISOString().split('T')[0];
                const tx = {
                    date: d || new Date().toISOString().split('T')[0],
                    op: row['Operation'] || row['Opération'] || row['Type'] || 'Achat',
                    name: row['Nom actif'] || row['Nom_Actif'] || row['Nom'] || 'Inconnu',
                    ticker: row['Ticker'] || '',
                    account: row['Compte'] || '',
                    sector: row['Secteur'] || '',
                    qty: parseFloat(row['Quantité'] || row['Qty']) || 0,
                    price: parseFloat(row['Prix unitaire'] || row['Prix'] || row['PRU_Moyen']) || 0
                };
                // Calcul total pour dividendes si nécessaire
                if (tx.op === 'Dividende' && tx.qty > 0 && tx.price > 0) tx.price = tx.qty * tx.price;
                
                if (tx.qty > 0 || (tx.op === 'Dividende' && tx.price > 0)) {
                    this.transactions.push(tx);
                    count++;
                }
            });
            this.saveData();
            this.toast(`${count} importés`);
            this.renderTable();
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

    setupAutoFill: function() {
        document.getElementById('fName').addEventListener('blur', (e) => {
            const val = e.target.value.toLowerCase().trim();
            for (const [k, t] of Object.entries(this.tickerDB)) {
                if (val.includes(k)) {
                    document.getElementById('fTicker').value = t;
                    break;
                }
            }
        });
    },

    searchTicker: function() {
        const n = document.getElementById('fName').value;
        if(n) window.open(`https://www.google.com/search?q=ticker+${encodeURIComponent(n)}`, '_blank');
        else alert('Saisissez un nom');
    },

    strColor: function(s, l, d) {
        let h = 0;
        for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
        return `hsl(${h % 360}, ${l}%, ${d}%)`;
    },

    loadDailyTip: function() {
        document.getElementById('dailyTip').textContent = `"${this.tips[new Date().getDate() % this.tips.length]}"`;
    },

    toast: function(m) {
        const t = document.getElementById('toast');
        document.getElementById('toastMsg').textContent = m;
        t.classList.remove('translate-y-20', 'opacity-0');
        setTimeout(() => t.classList.add('translate-y-20', 'opacity-0'), 2500);
    }
};

// =================================================================
// 2. BUDGET SCAN APP (React + IndexedDB + Charts)
// =================================================================
const CATEGORIES = {
    'Alimentation': ['carrefour', 'leclerc', 'auchan', 'lidl'],
    'Restauration': ['mcdo', 'restaurant', 'uber eats'],
    'Transport': ['sncf', 'total', 'essence', 'peage'],
    'Logement': ['loyer', 'edf', 'internet'],
    'Loisirs': ['netflix', 'cinema'],
    'Salaire': ['salaire', 'virement']
};

const BudgetApp = () => {
    const [transactions, setTransactions] = useState([]);
    const [view, setView] = useState('dashboard'); // dashboard | list
    const chartRef = useRef(null);
    const pieRef = useRef(null);

    // Initialisation IndexedDB
    useEffect(() => {
        const init = async () => {
            await dbService.init();
            const data = await dbService.getAll('budget');
            setTransactions(data.sort((a, b) => new Date(b.date) - new Date(a.date)));
        };
        init();
        
        // Écouter les mises à jour depuis l'import PDF
        window.addEventListener('budget-update', init);
        return () => window.removeEventListener('budget-update', init);
    }, []);

    // --- Calcul des Stats ---
    const getStats = () => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        // 1. Mois en cours
        const currentTx = transactions.filter(t => {
            const d = new Date(t.date);
            return d.getMonth() === currentMonth && d.getFullYear() === currentYear;
        });

        // 2. Top 5 Enseignes (Dépenses uniquement)
        const merchants = {};
        currentTx.forEach(t => {
            if (t.amount < 0) {
                const name = t.description || 'Inconnu';
                merchants[name] = (merchants[name] || 0) + Math.abs(t.amount);
            }
        });
        const top5 = Object.entries(merchants).sort((a, b) => b[1] - a[1]).slice(0, 5);

        // 3. Catégories (Camembert)
        const cats = {};
        currentTx.forEach(t => {
            if (t.amount < 0) {
                cats[t.category] = (cats[t.category] || 0) + Math.abs(t.amount);
            }
        });

        // 4. 6 Derniers mois (Barres)
        const sixMonths = {};
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getMonth() + 1}/${d.getFullYear()}`;
            sixMonths[key] = 0;
        }
        transactions.forEach(t => {
            const d = new Date(t.date);
            const key = `${d.getMonth() + 1}/${d.getFullYear()}`;
            if (sixMonths.hasOwnProperty(key) && t.amount < 0) {
                sixMonths[key] += Math.abs(t.amount);
            }
        });

        return { currentTx, top5, cats, sixMonths };
    };

    // --- Gestion des Graphiques ---
    useEffect(() => {
        if (view !== 'dashboard') return;
        
        const { cats, sixMonths } = getStats();

        // Nettoyage préalable pour éviter "Canvas already in use"
        if (window.budgetBarChart instanceof Chart) window.budgetBarChart.destroy();
        if (window.budgetPieChart instanceof Chart) window.budgetPieChart.destroy();

        if (chartRef.current) {
            const ctxBar = chartRef.current.getContext('2d');
            window.budgetBarChart = new Chart(ctxBar, {
                type: 'bar',
                data: {
                    labels: Object.keys(sixMonths),
                    datasets: [{
                        label: 'Dépenses',
                        data: Object.values(sixMonths),
                        backgroundColor: '#10b981',
                        borderRadius: 4
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        if (pieRef.current) {
            const ctxPie = pieRef.current.getContext('2d');
            window.budgetPieChart = new Chart(ctxPie, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(cats),
                    datasets: [{
                        data: Object.values(cats),
                        backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b']
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
            });
        }
    }, [transactions, view]); // Redessiner si données ou vue changent

    // --- Actions ---
    const addManual = async () => {
        const newTx = {
            id: Date.now(),
            date: new Date().toISOString().split('T')[0],
            description: "Nouvelle dépense",
            amount: -10,
            category: "Autre"
        };
        await dbService.add('budget', newTx);
        refreshData();
    };

    const updateTx = async (id, field, val) => {
        const tx = transactions.find(t => t.id === id);
        if (tx) {
            const updated = { ...tx, [field]: val };
            await dbService.add('budget', updated);
            // Optimistic UI update
            setTransactions(prev => prev.map(t => t.id === id ? updated : t));
        }
    };

    const deleteTx = async (id) => {
        await dbService.delete('budget', id);
        refreshData();
    };

    const refreshData = async () => {
        const data = await dbService.getAll('budget');
        setTransactions(data.sort((a, b) => new Date(b.date) - new Date(a.date)));
    };

    const { currentTx, top5 } = getStats();

    // --- Rendu JSX ---
    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Toolbar */}
            <div className="flex justify-between items-center p-4 bg-white shadow-sm mb-4">
                <div className="flex gap-2">
                    <button onClick={() => setView('dashboard')} className={`px-4 py-2 rounded-lg text-sm font-bold transition ${view === 'dashboard' ? 'bg-emerald-100 text-emerald-700' : 'text-gray-500 hover:bg-gray-100'}`}>Dashboard</button>
                    <button onClick={() => setView('list')} className={`px-4 py-2 rounded-lg text-sm font-bold transition ${view === 'list' ? 'bg-emerald-100 text-emerald-700' : 'text-gray-500 hover:bg-gray-100'}`}>Historique</button>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => window.pdfImporter.open()} className="bg-violet-600 hover:bg-violet-700 text-white px-3 py-2 rounded-lg text-sm font-bold shadow flex items-center gap-1"><i className="fa-solid fa-file-invoice"></i> + Bulletin</button>
                    <button onClick={addManual} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-sm font-bold shadow">+ Manuel</button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-20">
                {view === 'dashboard' && (
                    <div className="space-y-6 animate-fade-in">
                        {/* Graph 6 mois */}
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                            <h3 className="text-sm font-bold text-gray-700 mb-4">Dépenses (6 derniers mois)</h3>
                            <div className="h-48 relative"><canvas ref={chartRef}></canvas></div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Camembert */}
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                                <h3 className="text-sm font-bold text-gray-700 mb-4">Répartition (Mois en cours)</h3>
                                <div className="h-40 relative"><canvas ref={pieRef}></canvas></div>
                            </div>
                            
                            {/* Top 5 */}
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                                <h3 className="text-sm font-bold text-gray-700 mb-4">Top 5 Enseignes (Mois en cours)</h3>
                                <div className="space-y-3">
                                    {top5.map(([name, amount], i) => (
                                        <div key={i} className="flex justify-between items-center text-sm">
                                            <div className="flex items-center gap-3">
                                                <span className="bg-emerald-100 text-emerald-800 w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold">{i + 1}</span>
                                                <span className="font-medium text-gray-700 truncate w-32">{name}</span>
                                            </div>
                                            <span className="font-mono font-bold text-gray-900">{amount.toFixed(2)} €</span>
                                        </div>
                                    ))}
                                    {top5.length === 0 && <p className="text-xs text-gray-400 text-center py-4">Pas de données ce mois-ci.</p>}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {view === 'list' && (
                    <div className="space-y-3 animate-fade-in">
                        <h3 className="text-sm font-bold text-gray-500 uppercase">Mois en cours ({currentTx.length})</h3>
                        {currentTx.length === 0 && <p className="text-center text-gray-400 py-8">Aucune transaction.</p>}
                        
                        {currentTx.map(t => (
                            <div key={t.id} className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm flex flex-col gap-2 relative group hover:border-emerald-200 transition">
                                <div className="flex justify-between items-center">
                                    <input type="text" value={t.description} onChange={(e) => updateTx(t.id, 'description', e.target.value)} 
                                        className="font-bold text-gray-700 bg-transparent w-full focus:outline-none focus:text-blue-600 transition" />
                                    <div className="flex items-center gap-1">
                                        <input type="number" step="0.01" value={t.amount} onChange={(e) => updateTx(t.id, 'amount', parseFloat(e.target.value))} 
                                            className={`text-right w-24 font-mono font-bold bg-transparent focus:outline-none ${t.amount < 0 ? 'text-gray-800' : 'text-emerald-600'}`} />
                                        <span className="text-xs text-gray-400">€</span>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <div className="flex gap-2">
                                        <input type="date" value={t.date} onChange={(e) => updateTx(t.id, 'date', e.target.value)} 
                                            className="text-xs text-gray-400 bg-transparent focus:text-blue-600" />
                                        <select value={t.category} onChange={(e) => updateTx(t.id, 'category', e.target.value)} 
                                            className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 uppercase font-bold tracking-wider cursor-pointer hover:bg-gray-200">
                                            {Object.keys(CATEGORIES).concat(['Autre']).map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <button onClick={() => deleteTx(t.id)} className="text-gray-300 hover:text-red-500 p-1 transition"><i className="fa-solid fa-trash"></i></button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// =================================================================
// 3. MODULE PDF / IMAGE IMPORTER (Gemini Logic)
// =================================================================
const pdfImporter = {
    apiKey: '',
    fileBase64: '',
    extracted: [],

    open: function() { document.getElementById('pdf-modal-overlay').classList.remove('hidden'); },
    close: function() { document.getElementById('pdf-modal-overlay').classList.add('hidden'); },

    verifyKey: async function() {
        const key = document.getElementById('gemini-key').value;
        if (!key) return;
        document.getElementById('gemini-status').innerText = "Vérification...";
        
        try {
            // Test simple d'appel API pour vérifier la clé
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
            if (!r.ok) throw new Error();
            this.apiKey = key;
            document.getElementById('gemini-status').innerHTML = '<span class="text-green-600 font-bold">✅ Clé valide</span>';
            document.getElementById('pdf-step-2').classList.remove('hidden');
        } catch (e) {
            document.getElementById('gemini-status').innerHTML = '<span class="text-red-600 font-bold">❌ Clé invalide</span>';
        }
    },

    handleFile: function(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            this.fileBase64 = evt.target.result.split(',')[1];
            this.processFile(file.type);
        };
        reader.readAsDataURL(file);
    },

    processFile: async function(mimeType) {
        const logs = document.getElementById('pdf-logs');
        logs.classList.remove('hidden');
        logs.innerHTML = '<div class="text-blue-300">🚀 Envoi à Gemini...</div>';

        const prompt = `
            Analyse ce document (facture ou relevé). 
            Extrais chaque transaction sous forme d'un objet JSON strict.
            Format attendu: [{"date": "YYYY-MM-DD", "description": "Nom du commerce", "amount": -12.50, "category": "Autre"}].
            Règles : 
            1. Les montants de dépenses DOIVENT être négatifs.
            2. La date doit être au format ISO YYYY-MM-DD.
            3. Catégorise intelligemment (Alimentation, Transport, etc.).
            4. Renvoie SEULEMENT le JSON, pas de texte autour.
        `;

        try {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: prompt },
                            { inline_data: { mime_type: mimeType, data: this.fileBase64 } }
                        ]
                    }]
                })
            });

            const data = await response.json();
            
            if (!data.candidates || !data.candidates[0].content) throw new Error("Réponse vide de l'IA");

            let rawText = data.candidates[0].content.parts[0].text;
            // Nettoyage du markdown JSON
            rawText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
            
            this.extracted = JSON.parse(rawText);
            
            logs.innerHTML += `<div class="text-green-400">✅ ${this.extracted.length} transactions trouvées !</div>`;
            this.previewData();

        } catch (e) {
            console.error(e);
            logs.innerHTML += `<div class="text-red-400">❌ Erreur: ${e.message}</div>`;
        }
    },

    previewData: function() {
        const table = document.getElementById('pdf-preview-table');
        let html = '<thead class="bg-gray-100"><tr><th>Date</th><th>Desc</th><th class="text-right">Mt</th></tr></thead><tbody>';
        this.extracted.forEach(r => {
            html += `<tr class="border-b"><td class="py-1">${r.date}</td><td>${r.description}</td><td class="text-right font-mono">${r.amount}</td></tr>`;
        });
        html += '</tbody>';
        table.innerHTML = html;
        document.getElementById('pdf-step-3').classList.remove('hidden');
    },

    importToBudget: async function() {
        if (!this.extracted) return;
        await dbService.init();
        for (const t of this.extracted) {
            await dbService.add('budget', { 
                id: Date.now() + Math.random(), // ID unique
                date: t.date,
                description: t.description,
                amount: parseFloat(t.amount),
                category: t.category || 'Autre'
            });
        }
        this.close();
        window.dispatchEvent(new Event('budget-update')); // Notifier React
        alert("Transactions importées avec succès !");
    }
};

// =================================================================
// 4. INFO MODULE (GitHub Updates + Storage Size)
// =================================================================
const infoModule = {
    config: { username: 'antoto2021', repo: 'Suivi-investissement' },
    slides: [
        { icon: "👋", title: "Bienvenue sur InvestTrack V5", desc: "Votre solution ultime pour gérer Patrimoine et Budget." },
        { icon: "📈", title: "Suivi Bourse", desc: "Transactions, Actifs, et Projections basées sur vos performances réelles." },
        { icon: "🧾", title: "BudgetScan (IA)", desc: "Scanner intelligent de tickets de caisse via Gemini & Stockage Local." },
        { icon: "🔄", title: "Toujours à jour", desc: "Connecté à GitHub pour récupérer les dernières améliorations en un clic." }
    ],
    slideIndex: 0,

    init: function() {
        this.renderLocalInfo();
        setTimeout(() => this.checkGitHub(true), 3000);
    },

    openModal: async function() { 
        document.getElementById('info-modal-overlay').classList.remove('hidden'); 
        this.renderLocalInfo(); 
        
        // Calcul taille stockage
        const size = await dbService.estimateSize();
        const el = document.getElementById('storage-info');
        if(el) el.innerText = size;
        
        this.checkGitHub(false);
    },

    closeModal: function() { document.getElementById('info-modal-overlay').classList.add('hidden'); },

    renderLocalInfo: function() {
        const h = localStorage.getItem('app_version_hash') || 'Init';
        document.getElementById('info-local-v').innerText = h.substring(0, 7);
    },

    checkGitHub: function(bg = false) {
        const remoteLabel = document.getElementById('info-remote-v');
        const statusMsg = document.getElementById('update-status-msg');
        
        if (!bg && remoteLabel) remoteLabel.innerText = '...';

        const url = `https://api.github.com/repos/${this.config.username}/${this.config.repo}/commits?per_page=1`;

        return fetch(url)
            .then(r => {
                if (!r.ok) throw new Error("Repo introuvable");
                return r.json();
            })
            .then(d => {
                if (d && d[0]) {
                    const remoteSha = d[0].sha;
                    const localSha = localStorage.getItem('app_version_hash');

                    if (remoteLabel) remoteLabel.innerText = remoteSha.substring(0, 7);

                    if (!localSha) {
                        localStorage.setItem('app_version_hash', remoteSha);
                        if (statusMsg) statusMsg.innerText = "Initialisé.";
                    } else if (localSha !== remoteSha) {
                        if (statusMsg) {
                            statusMsg.innerText = "⚠️ Mise à jour disponible !";
                            statusMsg.className = "text-center text-sm font-bold text-amber-600 animate-pulse";
                        }
                        // Afficher les points de notif
                        document.getElementById('navUpdateDot').classList.remove('hidden');
                        document.getElementById('refreshUpdateDot').classList.remove('hidden');
                    } else {
                        if (statusMsg) {
                            statusMsg.innerText = "✅ Application à jour.";
                            statusMsg.className = "text-center text-sm font-bold text-green-600";
                        }
                    }
                    return remoteSha;
                }
            })
            .catch(e => {
                console.error(e);
                if (!bg && remoteLabel) remoteLabel.innerText = "Err";
            });
    },

    forceUpdate: function() {
        const btn = document.getElementById('refreshBtn');
        btn.classList.add('spin-once');
        setTimeout(() => btn.classList.remove('spin-once'), 1000);

        this.checkGitHub().then((newSha) => {
            if (newSha) {
                localStorage.setItem('app_version_hash', newSha);
                setTimeout(() => window.location.reload(), 800);
            } else {
                setTimeout(() => window.location.reload(), 800);
            }
        });
    },

    startTuto: function() {
        this.closeModal();
        this.slideIndex = 0;
        document.getElementById('tuto-overlay').classList.remove('hidden');
        this.updateSlide();
    },

    updateSlide: function() {
        const s = this.slides[this.slideIndex];
        document.getElementById('tuto-title').innerText = s.title;
        document.getElementById('tuto-icon').innerText = s.icon;
        document.getElementById('tuto-desc').innerText = s.desc;
        
        const dots = document.getElementById('tuto-dots');
        dots.innerHTML = this.slides.map((_, i) => 
            `<div class="w-2 h-2 rounded-full transition ${i === this.slideIndex ? 'bg-emerald-600 w-4' : 'bg-gray-300'}"></div>`
        ).join('');
        
        document.getElementById('tuto-btn').innerText = this.slideIndex === this.slides.length - 1 ? "C'est parti ! 🚀" : "Suivant ➜";
    },

    nextSlide: function() {
        if (this.slideIndex < this.slides.length - 1) {
            this.slideIndex++;
            this.updateSlide();
        } else {
            document.getElementById('tuto-overlay').classList.add('hidden');
        }
    }
};

// =================================================================
// 5. MAIN INIT (Chargement Global)
// =================================================================
document.addEventListener('DOMContentLoaded', () => {
    // 1. Exporter les modules globaux pour l'HTML
    window.app = app;
    window.infoModule = infoModule;
    window.pdfImporter = pdfImporter;

    // 2. Initialiser les modules Vanilla
    app.init();
    infoModule.init();

    // 3. Monter l'application React Budget
    const rootEl = document.getElementById('budget-root');
    if (rootEl) {
        const root = ReactDOM.createRoot(rootEl);
        root.render(<BudgetApp />);
    }
    
    // 4. Activer les icônes
    if(window.lucide) lucide.createIcons();
});