/**
 * INVEST TRACK V5 - CORE LOGIC (COMPLETE & AI ENHANCED)
 */

const { useState, useEffect, useRef } = React;

// =================================================================
// 0. SERVICE DE BASE DE DONNÉES (IndexedDB)
// =================================================================
const dbService = {
    dbName: 'InvestTrackDB',
    storeName: 'budget',
    version: 1,
    db: null,

    async init() {
        if (this.db) return this.db;
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, this.version);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'id' });
                }
            };
            req.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };
            req.onerror = (e) => reject("DB Error: " + e.target.error);
        });
    },

    async getAll() {
        await this.init();
        return new Promise((resolve) => {
            const tx = this.db.transaction(this.storeName, 'readonly');
            const req = tx.objectStore(this.storeName).getAll();
            req.onsuccess = () => resolve(req.result || []);
        });
    },

    async add(item) {
        await this.init();
        return new Promise((resolve) => {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            tx.objectStore(this.storeName).put(item);
            tx.oncomplete = () => resolve();
        });
    },

    async delete(id) {
        await this.init();
        return new Promise((resolve) => {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            tx.objectStore(this.storeName).delete(id);
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
    
    tickerDB: {
        'total': 'TTE.PA', 'vinci': 'DG.PA', 'air liquide': 'AI.PA', 'lvmh': 'MC.PA', 
        'sanofi': 'SAN.PA', 'schneider': 'SU.PA', 'loreal': 'OR.PA', 'hermes': 'RMS.PA',
        'bnpp': 'BNP.PA', 'axa': 'CS.PA', 'apple': 'AAPL', 'microsoft': 'MSFT', 
        'tesla': 'TSLA', 'amazon': 'AMZN', 'google': 'GOOGL', 'meta': 'META'
    },
    
    mockDividends: {
        'Action Vinci': { current: 4.50 }, 'Total Energie': { current: 3.20 },
        'Accor': { current: 1.10 }, 'Mercedes': { current: 5.30 }, 'Neurones': { current: 1.20 }
    },

    tips: ["Diversifiez !", "Intérêts composés = Magie.", "Patience est mère de vertu.", "Achetez la peur."],

    init: function() {
        this.loadData();
        this.loadDailyTip();
        this.setupAutoFill();
        this.nav('home');
    },

    nav: function(id) {
        document.querySelectorAll('main > section').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById(id + '-view');
        if(target) target.classList.remove('hidden');
        
        // Rafraîchissement des données selon la vue
        if(id === 'dashboard') { this.calcKPIs(); setTimeout(() => this.renderPie(), 100); }
        if(id === 'assets') this.renderAssets();
        if(id === 'transactions') this.renderTable();
        if(id === 'projections') setTimeout(() => this.renderProjections(), 100);
        if(id === 'dividends') this.renderDividends();
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

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
        this.transactions = [
            {date:'2024-01-31', op:'Achat', name:'Action Vinci', account:'PEA', qty:15, price:93.53, sector:'Industrie'},
            {date:'2024-11-12', op:'Achat', name:'Total Energie', account:'CTO', qty:5, price:60.32, sector:'Energie'}
        ];
        this.transactions.forEach(t => { if(t.op==='Achat') this.currentPrices[t.name] = t.price; });
        this.saveData();
    },

    updatePrice: function(name, price) {
        this.currentPrices[name] = parseFloat(price);
        this.saveData();
        this.renderAssets();
        this.toast("Prix mis à jour");
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
            const price = this.currentPrices[a.name] || (a.invested / a.qty);
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
        let growthRate = 0.05;
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
        const data = sorted.map(t => ++count);
        const labels = sorted.map(t => t.date);
        this.charts.freq = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: [{ label:'Opérations', data, borderColor:'#6366f1', pointRadius:0 }] },
            options: { maintainAspectRatio: false, scales: { x: { display: false } } }
        });
    },

    renderAssets: function() {
        const grid = document.getElementById('assetsGrid');
        if(!grid) return;
        grid.innerHTML = '';
        const assets = this.getPortfolio();
        Object.values(assets).forEach(a => {
            if(a.qty < 0.001) return;
            const pru = a.invested/a.qty;
            const curr = this.currentPrices[a.name] || pru;
            const val = a.qty * curr;
            const perf = ((val - a.invested)/a.invested)*100;
            const color = this.strColor(a.name, 95, 90);
            const border = this.strColor(a.name, 60, 50);

            grid.innerHTML += `
                <div class="bg-white rounded-xl shadow-sm border overflow-hidden" style="border-color:${border}">
                    <div class="p-4 flex justify-between items-center" style="background-color:${color}">
                        <h3 class="font-bold text-gray-800 truncate" style="color:${border}">${a.name}</h3>
                        <span class="text-xs bg-white px-2 py-1 rounded font-mono font-bold text-gray-600">${a.ticker}</span>
                    </div>
                    <div class="p-5">
                        <div class="flex justify-between items-center mb-3">
                            <span class="text-gray-500 text-xs font-bold uppercase">Cours Actuel</span>
                            <input type="number" step="0.01" value="${curr.toFixed(2)}" onchange="app.updatePrice('${a.name}', this.value)" class="price-input">
                        </div>
                        <div class="flex justify-between mb-1"><span class="text-gray-500 text-xs">PRU</span><span class="font-mono text-gray-600">${pru.toFixed(2)} €</span></div>
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
        if(!tbody) return;
        tbody.innerHTML = '';
        const sorted = [...this.transactions].sort((a,b)=>new Date(b.date)-new Date(a.date));
        
        if(sorted.length === 0 && document.getElementById('emptyState')) {
            document.getElementById('emptyState').classList.remove('hidden');
        } else if (document.getElementById('emptyState')) {
            document.getElementById('emptyState').classList.add('hidden');
        }

        sorted.forEach(tx => {
            const idx = this.transactions.indexOf(tx);
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
                        <button onclick="app.openModal('edit', ${idx})" class="text-blue-500 hover:text-blue-700 mx-1"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="app.deleteTx(${idx})" class="text-red-400 hover:text-red-600 mx-1"><i class="fa-solid fa-trash"></i></button>
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
        if(!found && document.getElementById('noDividends')) 
            document.getElementById('noDividends').classList.remove('hidden');
    },

    openModal: function(mode, idx=null) {
        document.getElementById('modalForm').classList.remove('hidden');
        document.getElementById('editIndex').value = idx !== null ? idx : '';
        document.getElementById('modalTitle').textContent = mode==='new' ? 'Nouvelle Transaction' : 'Modifier Transaction';
        if(mode==='new') {
            document.getElementById('fDate').value = new Date().toISOString().split('T')[0];
            ['fName','fTicker','fAccount','fSector','fQty','fPrice'].forEach(id => document.getElementById(id).value = '');
            document.getElementById('fOp').value = 'Achat';
        } else {
            const tx = this.transactions[idx];
            document.getElementById('fDate').value = tx.date;
            document.getElementById('fOp').value = tx.op;
            document.getElementById('fName').value = tx.name;
            document.getElementById('fTicker').value = tx.ticker||'';
            document.getElementById('fAccount').value = tx.account||'';
            document.getElementById('fSector').value = tx.sector||'';
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
            qty: parseFloat(document.getElementById('fQty').value)||0,
            price: parseFloat(document.getElementById('fPrice').value)||0
        };
        if(idx !== '') this.transactions[idx] = tx; else this.transactions.push(tx);
        this.saveData(); this.closeModal(); this.toast(idx!==''?"Modifié":"Ajouté"); this.renderTable();
    },
    deleteTx: function(idx) { if(confirm('Supprimer ?')) { this.transactions.splice(idx,1); this.saveData(); this.renderTable(); } },
    
    handleImport: function(e) {
        const r = new FileReader();
        r.onload = ev => {
            const wb = XLSX.read(new Uint8Array(ev.target.result), {type:'array'});
            const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            let count = 0;
            json.forEach(row => {
                let d = row['Date']||row['Date_Entrée'];
                if(typeof d==='number') d = new Date(Math.round((d-25569)*86400*1000)).toISOString().split('T')[0];
                const tx = {
                    date: d || new Date().toISOString().split('T')[0],
                    op: row['Operation'] || 'Achat',
                    name: row['Nom actif'] || 'Inconnu',
                    qty: parseFloat(row['Quantité']) || 0,
                    price: parseFloat(row['Prix unitaire']) || 0
                };
                if(tx.qty > 0) { this.transactions.push(tx); count++; }
            });
            this.saveData(); this.toast(`${count} importés`); this.renderTable(); e.target.value = '';
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
        const el = document.getElementById('fName');
        if(el) {
            el.addEventListener('blur', (e) => {
                const val = e.target.value.toLowerCase().trim();
                for(const [k,t] of Object.entries(this.tickerDB)) { if(val.includes(k)) { document.getElementById('fTicker').value=t; break; }}
            });
        }
    },
    searchTicker: function() { const n = document.getElementById('fName').value; if(n) window.open(`https://www.google.com/search?q=ticker+${encodeURIComponent(n)}`, '_blank'); },
    strColor: function(s,l,d) { let h=0; for(let i=0;i<s.length;i++)h=s.charCodeAt(i)+((h<<5)-h); return `hsl(${h%360},${l}%,${d}%)`; },
    loadDailyTip: function() { document.getElementById('dailyTip').textContent = `"${this.tips[new Date().getDate()%this.tips.length]}"`; },
    toast: function(m) { const t=document.getElementById('toast'); document.getElementById('toastMsg').textContent=m; t.classList.remove('translate-y-20','opacity-0'); setTimeout(()=>t.classList.add('translate-y-20','opacity-0'),2500); }
};

// =================================================================
// 2. BUDGET SCAN APP (REACT + CHARTS)
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
    const barRef = useRef(null);
    const pieRef = useRef(null);

    useEffect(() => {
        const load = async () => {
            await dbService.init();
            const data = await dbService.getAll('budget');
            setTransactions(data.sort((a,b) => new Date(b.date) - new Date(a.date)));
        };
        load();
        window.addEventListener('budget-update', load);
        return () => window.removeEventListener('budget-update', load);
    }, []);

    const getStats = () => {
        const now = new Date();
        const currentM = now.getMonth(), currentY = now.getFullYear();
        const currentTx = transactions.filter(t => { const d = new Date(t.date); return d.getMonth()===currentM && d.getFullYear()===currentY; });

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
        setTimeout(() => {
            if(pieRef.current) {
                if(window.bPie) window.bPie.destroy();
                const ctx = pieRef.current.getContext('2d');
                window.bPie = new Chart(ctx, { type: 'doughnut', data: { labels: Object.keys(cats), datasets: [{ data: Object.values(cats), backgroundColor: ['#ef4444','#f59e0b','#3b82f6','#8b5cf6','#ec4899'] }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } } });
            }
            if(barRef.current) {
                if(window.bBar) window.bBar.destroy();
                const ctx = barRef.current.getContext('2d');
                window.bBar = new Chart(ctx, { type: 'bar', data: { labels: Object.keys(sixM), datasets: [{ label: 'Dépenses', data: Object.values(sixM), backgroundColor: '#10b981', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false } });
            }
        }, 100);
    }, [transactions, view]);

    const addManual = async () => { await dbService.add({ id: Date.now(), date: new Date().toISOString().split('T')[0], description: "Nouvelle dépense", amount: -10, category: "Autre" }); window.dispatchEvent(new Event('budget-update')); };
    const updateTx = async (id, f, v) => { const tx = transactions.find(t=>t.id===id); if(tx) { await dbService.add({...tx, [f]:v}); window.dispatchEvent(new Event('budget-update')); } };
    const deleteTx = async (id) => { await dbService.delete(id); window.dispatchEvent(new Event('budget-update')); };
    const { currentTx, top5 } = getStats();

    return (
        <div className="flex flex-col h-full bg-slate-50">
            <div className="flex justify-between items-center p-4 bg-white shadow-sm mb-4">
                <div className="flex gap-2">
                    <button onClick={()=>setView('dashboard')} className={`px-3 py-1.5 rounded-lg text-sm font-bold ${view==='dashboard'?'bg-emerald-100 text-emerald-700':'text-gray-500'}`}>Dashboard</button>
                    <button onClick={()=>setView('list')} className={`px-3 py-1.5 rounded-lg text-sm font-bold ${view==='list'?'bg-emerald-100 text-emerald-700':'text-gray-500'}`}>Historique</button>
                </div>
                <button onClick={addManual} className="bg-emerald-600 text-white px-3 py-1.5 rounded text-xs font-bold">+ Manuel</button>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-20">
                {view === 'dashboard' && (
                    <div className="space-y-6">
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100"><h3 className="text-sm font-bold text-gray-700 mb-2">Dépenses (6 mois)</h3><div className="h-48 relative"><canvas ref={barRef}></canvas></div></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white p-4 rounded-xl shadow-sm"><h3 className="text-sm font-bold text-gray-700 mb-2">Répartition (Mois)</h3><div className="h-40 relative"><canvas ref={pieRef}></canvas></div></div>
                            <div className="bg-white p-4 rounded-xl shadow-sm"><h3 className="text-sm font-bold text-gray-700 mb-2">Top 5 (Mois)</h3><div className="space-y-2">{top5.map(([n,a], i) => (<div key={i} className="flex justify-between text-xs items-center"><span className="truncate w-32 font-medium">{i+1}. {n}</span><span className="font-bold">{a.toFixed(2)}€</span></div>))}</div></div>
                        </div>
                    </div>
                )}
                {view === 'list' && (
                    <div className="space-y-2">
                        <h3 className="text-xs font-bold text-gray-400 uppercase">Mois en cours ({currentTx.length})</h3>
                        {currentTx.map(t => (
                            <div key={t.id} className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm flex flex-col gap-2">
                                <div className="flex justify-between items-center"><input type="text" value={t.description} onChange={(e)=>updateTx(t.id,'description',e.target.value)} className="font-bold text-gray-700 bg-transparent w-full focus:outline-none" /><input type="number" step="0.01" value={t.amount} onChange={(e)=>updateTx(t.id,'amount',parseFloat(e.target.value))} className={`text-right w-20 font-bold bg-transparent focus:outline-none ${t.amount<0?'text-gray-800':'text-emerald-600'}`} /></div>
                                <div className="flex justify-between items-center"><div className="flex gap-2"><input type="date" value={t.date} onChange={(e)=>updateTx(t.id,'date',e.target.value)} className="text-xs text-gray-400 bg-transparent" /><select value={t.category} onChange={(e)=>updateTx(t.id,'category',e.target.value)} className="text-[10px] px-2 py-0.5 rounded bg-gray-100 text-gray-600 uppercase font-bold">{Object.keys(CATEGORIES).concat(['Autre']).map(c=><option key={c} value={c}>{c}</option>)}</select></div><button onClick={()=>deleteTx(t.id)} className="text-gray-300 hover:text-red-500"><i className="fa-solid fa-trash"></i></button></div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// =================================================================
// 3. SMART PDF/IMAGE IMPORTER (MODULE IA - CORRIGÉ & COMPLET)
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
        const color = type==='success'?'text-green-400':(type==='error'?'text-red-400':(type==='warn'?'text-yellow-400':'text-slate-300'));
        c.innerHTML += `<div class="mb-1 ${color}">> ${msg}</div>`;
        c.parentElement.scrollTop = c.parentElement.scrollHeight;
    },

    verifyKey: async function() {
        const key = document.getElementById('gemini-key').value.trim();
        const btn = document.getElementById('btn-verify-key');
        const status = document.getElementById('gemini-status');
        
        if(!key) return;
        btn.innerText = '...'; btn.disabled = true;

        try {
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
            const data = await r.json();
            if(!r.ok) throw new Error(data.error?.message || 'Clé invalide');

            const models = (data.models || []).filter(m => m.supportedGenerationMethods?.includes('generateContent'));
            if(models.length === 0) throw new Error("Aucun modèle compatible.");

            models.sort((a,b) => {
                const priority = n => { if(n.includes('flash')) return 10; if(n.includes('gemini-1.5-pro')) return 8; return 0; };
                return priority(b.name) - priority(a.name);
            });

            this.usableModels = models.map(m => ({ id: m.name.replace(/^models\//,''), name: m.displayName||m.name }));
            this.apiKey = key;

            status.innerHTML = `<span class="text-green-600 font-bold">✅ Prêt (${this.usableModels[0].name})</span>`;
            document.getElementById('ai-step-2').classList.remove('hidden');
        } catch(e) {
            status.innerHTML = `<span class="text-red-600 font-bold">❌ Erreur: ${e.message}</span>`;
        } finally {
            btn.innerText = 'Vérifier'; btn.disabled = false;
        }
    },

    handleFile: function(e) {
        const file = e.target.files[0];
        if(!file) return;
        
        const valid = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
        if(!valid.includes(file.type)) { alert("Format invalide. PDF ou Images seulement."); return; }

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
        document.getElementById('ai-console').innerHTML = '';
        this.log("Démarrage de l'analyse IA...");

        const prompt = `Extrais TOUTES les transactions. JSON STRICT Array: [{"date":"YYYY-MM-DD","description":"Nom","amount":-10.00,"category":"Autre"}]. Montants en négatif pour dépenses.`;
        let success = false;

        for(const model of this.usableModels) {
            this.log(`Tentative avec ${model.name}...`);
            try {
                const payload = {
                    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: this.currentMimeType, data: this.fileBase64 } }] }],
                    generationConfig: { temperature: 0.1, response_mime_type: "application/json" },
                    safetySettings: [
                        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                    ]
                };

                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${this.apiKey}`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
                });

                if(!res.ok) {
                    if(res.status === 429) { this.log("Quota dépassé (429). Suivant...", 'warn'); continue; }
                    if(res.status === 503) { this.log("Surchargé (503). Suivant...", 'warn'); continue; }
                    throw new Error(res.statusText);
                }

                const d = await res.json();
                if(!d.candidates?.[0]?.content) throw new Error("Réponse vide/bloquée.");

                let raw = d.candidates[0].content.parts[0].text;
                const match = raw.match(/\[[\s\S]*\]/);
                if(match) raw = match[0];
                else raw = raw.replace(/```json/g,'').replace(/```/g,'').trim();

                let json = JSON.parse(raw);
                if(!Array.isArray(json)) json = json.data || json.table || [json];

                if(json.length > 0) {
                    this.extracted = json;
                    this.log(`Succès ! ${json.length} éléments trouvés.`, 'success');
                    this.renderPreview();
                    success = true;
                    break; 
                } else {
                    this.log("Aucune donnée trouvée.", 'warn');
                }
            } catch(e) {
                this.log(`Erreur: ${e.message}`, 'error');
            }
        }

        if(!success) alert("Impossible d'extraire les données.");
    },

    renderPreview: function() {
        const t = document.getElementById('ai-preview-table');
        document.getElementById('ai-count').innerText = `${this.extracted.length} lignes`;
        t.innerHTML = this.extracted.slice(0,10).map(r => 
            `<tr class="border-b"><td class="p-2 text-xs">${r.date}</td><td class="p-2 text-xs truncate max-w-[100px]">${r.description}</td><td class="p-2 text-xs text-right font-bold">${r.amount}</td></tr>`
        ).join('') + (this.extracted.length>10 ? '<tr><td colspan="3" class="p-2 text-center italic text-xs">... et autres</td></tr>' : '');
        document.getElementById('ai-step-3').classList.remove('hidden');
    },

    importToBudget: async function() {
        if(!this.extracted.length) return;
        await dbService.init();
        let count = 0;
        for(const item of this.extracted) {
            await dbService.add({
                id: Date.now() + Math.random(),
                date: item.date || new Date().toISOString().split('T')[0],
                description: item.description || 'Import IA',
                amount: parseFloat(item.amount) || 0,
                category: item.category || 'Import'
            });
            count++;
        }
        this.close();
        window.dispatchEvent(new Event('budget-update'));
        alert(`${count} transactions importées !`);
    }
};

// =================================================================
// 4. INFO MODULE (Updates + Storage)
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
                    if(local && local !== sha) { document.getElementById('navUpdateDot')?.classList.remove('hidden'); document.getElementById('refreshUpdateDot')?.classList.remove('hidden'); }
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
// 5. BOOTSTRAP
// =================================================================
document.addEventListener('DOMContentLoaded', () => {
    window.app = app;
    window.infoModule = infoModule;
    window.pdfImporter = pdfImporter;

    app.init();
    infoModule.init();

    const rootEl = document.getElementById('budget-root');
    if(rootEl) ReactDOM.createRoot(rootEl).render(<BudgetApp />);
    
    if(window.lucide) lucide.createIcons();
});
