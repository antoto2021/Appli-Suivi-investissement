/**
 * InvestTrack V5 - Core Logic
 */

const app = {
    transactions: [],
    currentPrices: {},
    charts: {},
    
    // Base de données Tickers Auto
    tickerDB: {
        'total': 'TTE.PA', 'totalenergies': 'TTE.PA', 'vinci': 'DG.PA', 'action vinci': 'DG.PA',
        'air liquide': 'AI.PA', 'lvmh': 'MC.PA', 'sanofi': 'SAN.PA', 'schneider': 'SU.PA',
        'loreal': 'OR.PA', 'hermes': 'RMS.PA', 'bnpp': 'BNP.PA', 'axa': 'CS.PA',
        'apple': 'AAPL', 'microsoft': 'MSFT', 'tesla': 'TSLA', 'amazon': 'AMZN',
        'google': 'GOOGL', 'meta': 'META', 'nvidia': 'NVDA', 'cw8': 'CW8.PA',
        'sp500': 'SP500', 'accor': 'AC.PA', 'mercedes': 'MBG.DE', 'neurones': 'NRO.PA'
    },

    // Données Mock Dividendes (Simulation)
    mockDividends: {
        'Action Vinci': { current: 4.50 }, 'Total Energie': { current: 3.20 },
        'Accor': { current: 1.10 }, 'Mercedes': { current: 5.30 }, 'Neurones': { current: 1.20 },
        'DEFAULT': { current: 0.00 }
    },

    tips: [
        "La diversification est la seule gratuité en finance.", "L'intérêt composé est la 8ème merveille du monde.",
        "Le temps est votre meilleur allié.", "Achetez quand le sang coule.", "Réinvestissez vos dividendes.",
        "N'investissez que ce que vous pouvez perdre.", "Faites vos propres recherches (DYOR).",
        "Attention aux frais de gestion des fonds.", "Lisser vos points d'entrée (DCA) réduit le risque."
    ],

    init: function() {
        this.loadData();
        this.loadDailyTip();
        this.setupAutoFill();
        // this.nav('home'); // Décommenter pour forcer l'accueil au reload
    },

    // --- NAVIGATION ---
    nav: function(id) {
        document.querySelectorAll('main > section').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById(id + '-view');
        if(target) target.classList.remove('hidden');
        
        // Triggers
        if(id === 'dashboard') { this.calcGlobalKPIs(); this.renderPie(); }
        if(id === 'assets') this.renderAssets();
        if(id === 'transactions') this.renderTable();
        if(id === 'projections') this.renderProjections();
        if(id === 'dividends') this.renderDividends();
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    // --- DATA ---
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
            {date:'2024-11-12', op:'Achat', name:'Total Energie', account:'CTO', qty:5, price:60.32, sector:'Energie'},
            {date:'2025-05-06', op:'Achat', name:'Accor', account:'PEA', qty:20, price:42.00, sector:'Tourisme'}
        ];
        this.transactions.forEach(t => { if(t.op==='Achat') this.currentPrices[t.name] = t.price; });
        this.saveData();
    },

    // --- LOGIC ---
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
            if(!assets[tx.name]) assets[tx.name] = { name: tx.name, qty: 0, invested: 0, ticker: tx.ticker || '' };
            
            if(tx.op === 'Achat') {
                assets[tx.name].qty += tx.qty;
                assets[tx.name].invested += (tx.qty * tx.price);
            } else if(tx.op === 'Vente') {
                assets[tx.name].qty -= tx.qty;
                // Sortie au PRU moyen pondéré
                const pru = assets[tx.name].invested / (assets[tx.name].qty + tx.qty);
                assets[tx.name].invested -= (tx.qty * pru);
            }
        });
        return assets;
    },

    calcGlobalKPIs: function() {
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

        document.getElementById('kpiTotal').textContent = invested.toLocaleString('fr-FR', {style:'currency', currency:'EUR'});
        document.getElementById('kpiFuture').textContent = currentVal.toLocaleString('fr-FR', {style:'currency', currency:'EUR'});
        
        const diffEl = document.getElementById('kpiDiff');
        diffEl.textContent = `${diff>=0?'+':''}${diff.toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}`;
        diffEl.className = `sub-value ${diff>=0?'text-green-600':'text-red-500'}`;

        const perfEl = document.getElementById('kpiReturn');
        perfEl.textContent = `${perf>=0?'+':''}${perf.toFixed(2)} %`;
        perfEl.className = `value ${perf>=0?'text-green-600':'text-red-500'}`;
        
        return { invested, currentVal, perf };
    },

    // --- RENDERERS ---
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

            const html = `
                <div class="bg-white rounded-xl shadow-sm border overflow-hidden card-hover" style="border-color:${border}">
                    <div class="p-4 flex justify-between items-center" style="background-color:${color}">
                        <h3 class="font-bold text-gray-800 truncate" style="color:${border}">${a.name}</h3>
                        <span class="text-xs bg-white px-2 py-1 rounded font-mono font-bold text-gray-600">${a.ticker}</span>
                    </div>
                    <div class="p-5">
                        <div class="flex justify-between items-center mb-3">
                            <span class="text-gray-500 text-sm">Cours Actuel (€)</span>
                            <input type="number" step="0.01" value="${curr.toFixed(2)}" 
                                onchange="app.updatePrice('${a.name}', this.value)" class="price-input">
                        </div>
                        <div class="flex justify-between mb-1"><span class="text-gray-500 text-sm">PRU</span><span class="font-mono text-gray-600">${pru.toFixed(2)} €</span></div>
                        <div class="flex justify-between mb-3 border-b border-dashed pb-2"><span class="text-gray-500 text-sm">Quantité</span><span class="font-mono font-semibold">${a.qty.toFixed(2)}</span></div>
                        <div class="flex justify-between items-end">
                            <div><span class="text-xs text-gray-400">Total</span><div class="font-bold text-lg text-gray-800">${val.toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}</div></div>
                            <div class="text-right"><span class="block text-xs text-gray-400">Perf.</span><span class="font-bold ${perf>=0?'text-green-600':'text-red-500'}">${perf>=0?'+':''}${perf.toFixed(1)}%</span></div>
                        </div>
                    </div>
                </div>`;
            grid.innerHTML += html;
        });
    },

    renderTable: function() {
        const tbody = document.querySelector('#transactionsTable tbody');
        tbody.innerHTML = '';
        const sorted = [...this.transactions].sort((a,b) => new Date(b.date) - new Date(a.date));
        
        if(sorted.length===0) document.getElementById('emptyState').classList.remove('hidden');
        else document.getElementById('emptyState').classList.add('hidden');

        sorted.forEach(tx => {
            const idx = this.transactions.indexOf(tx);
            const total = tx.op==='Dividende' ? tx.price : (tx.qty*tx.price);
            const badge = tx.op==='Achat'?'bg-blue-100 text-blue-800':(tx.op==='Vente'?'bg-red-100 text-red-800':'bg-emerald-100 text-emerald-800');
            
            const tr = `
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
            tbody.innerHTML += tr;
        });
    },

    renderProjections: function() {
        const years = parseInt(document.getElementById('projYears').value) || 20;
        const labels = Array.from({length: years+1}, (_, i) => `An ${i}`);
        
        // 1. Calculer le taux de croissance réel actuel
        const kpis = this.calcGlobalKPIs();
        let growthRate = 0.05; // Défaut 5%
        if (kpis.invested > 0) {
            // On utilise la performance globale actuelle comme proxy du rendement annuel futur
            // C'est une approximation pour la démo
            growthRate = (kpis.currentVal - kpis.invested) / kpis.invested;
            // Cap pour éviter des projections folles si perf actuelle extrême
            if(growthRate < 0) growthRate = 0.02; // Si perte, on projette 2% conservateur
            if(growthRate > 0.15) growthRate = 0.15; // Cap 15%
        }

        // 2. Capital de départ (Cash investi uniquement)
        let cap = 0;
        this.transactions.forEach(t => { 
            if(t.op==='Achat') cap += t.qty*t.price; 
            if(t.op==='Vente') cap -= t.qty*t.price; 
        });

        const data = [cap];
        for(let i=1; i<=years; i++) data.push(data[i-1] * (1 + growthRate));

        const ctx = document.getElementById('mainProjectionChart').getContext('2d');
        if(this.charts.proj) this.charts.proj.destroy();
        
        const gradient = ctx.createLinearGradient(0,0,0,400);
        gradient.addColorStop(0, 'rgba(147, 51, 234, 0.4)'); gradient.addColorStop(1, 'rgba(147, 51, 234, 0.0)');

        this.charts.proj = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: [{ 
                label: `Capital (Taux appliqué: ${(growthRate*100).toFixed(1)}%)`, 
                data, borderColor: '#9333ea', backgroundColor: gradient, fill: true, tension: 0.4 
            }] },
            options: { maintainAspectRatio: false }
        });

        this.renderYearlyBar();
        this.renderFrequency();
    },

    renderYearlyBar: function() {
        const yData = {};
        this.transactions.filter(t=>t.op==='Achat').forEach(t => {
            const y = t.date.split('-')[0];
            yData[y] = (yData[y]||0) + (t.qty*t.price);
        });
        const ctx = document.getElementById('yearlyBarChart').getContext('2d');
        if(this.charts.bar) this.charts.bar.destroy();
        this.charts.bar = new Chart(ctx, {
            type: 'bar',
            data: { labels: Object.keys(yData).sort(), datasets: [{ label:'Investi', data:Object.values(yData), backgroundColor:'#10b981', borderRadius:4 }] },
            options: { maintainAspectRatio: false }
        });
    },

    renderFrequency: function() {
        let count = 0;
        const data = this.transactions.sort((a,b)=>new Date(a.date)-new Date(b.date)).map(t => ++count);
        const labels = this.transactions.map(t=>t.date);
        const ctx = document.getElementById('frequencyChart').getContext('2d');
        if(this.charts.freq) this.charts.freq.destroy();
        this.charts.freq = new Chart(ctx, {
            type: 'line', data: { labels, datasets: [{ label:'Opérations', data, borderColor:'#6366f1', pointRadius:0 }] },
            options: { maintainAspectRatio: false, scales: { x: { display: false } } }
        });
    },

    renderPie: function() {
        const acc = {};
        this.transactions.filter(t=>t.op==='Achat').forEach(t => acc[t.account] = (acc[t.account]||0) + (t.qty*t.price));
        const ctx = document.getElementById('pieChart').getContext('2d');
        if(this.charts.pie) this.charts.pie.destroy();
        this.charts.pie = new Chart(ctx, {
            type: 'doughnut', data: { labels: Object.keys(acc), datasets: [{ data:Object.values(acc), backgroundColor:['#3b82f6','#8b5cf6','#10b981','#f59e0b'] }] },
            options: { maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
        });
    },

    renderDividends: function() {
        const container = document.getElementById('dividendCards');
        container.innerHTML = '';
        const assets = this.getPortfolio();
        let found = false;

        Object.values(assets).forEach(a => {
            if(a.qty < 0.01) return;
            const info = this.mockDividends[a.name] || this.mockDividends['DEFAULT'];
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

    // --- FORMULAIRES & MODALS ---
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

        if(idx !== '') this.transactions[idx] = tx;
        else this.transactions.push(tx);

        this.saveData();
        this.closeModal();
        this.toast(idx!==''?"Modifié":"Ajouté");
        this.renderTable();
    },

    deleteTx: function(idx) {
        if(confirm('Supprimer ?')) {
            this.transactions.splice(idx, 1);
            this.saveData();
            this.renderTable();
        }
    },

    // --- TOOLS ---
    setupAutoFill: function() {
        const nameInput = document.getElementById('fName');
        const tickerInput = document.getElementById('fTicker');
        nameInput.addEventListener('blur', () => {
            const val = nameInput.value.toLowerCase().trim();
            // Recherche exacte ou partielle
            for (const [key, ticker] of Object.entries(this.tickerDB)) {
                if (val.includes(key)) {
                    tickerInput.value = ticker;
                    break;
                }
            }
        });
    },

    searchTicker: function() {
        const name = document.getElementById('fName').value;
        if(name) window.open(`https://www.google.com/search?q=ticker+${encodeURIComponent(name)}`, '_blank');
        else alert("Saisissez un nom d'actif d'abord");
    },

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
                    op: row['Operation'] || row['Opération'] || row['Type'] || 'Achat',
                    name: row['Nom actif'] || row['Nom_Actif'] || row['Nom'] || 'Inconnu',
                    ticker: row['Ticker'] || '',
                    account: row['Compte'] || '',
                    sector: row['Secteur'] || '',
                    qty: parseFloat(row['Quantité']||row['Qty']) || 0,
                    price: parseFloat(row['Prix unitaire']||row['Prix']||row['PRU_Moyen']) || 0
                };
                // Logique import dividende: si qty et price unit fournis, calculer total
                if(tx.op === 'Dividende' && tx.qty > 0 && tx.price > 0) tx.price = tx.qty * tx.price;

                if(tx.qty > 0 || (tx.op==='Dividende' && tx.price>0)) {
                    this.transactions.push(tx);
                    count++;
                }
            });
            this.saveData();
            this.toast(`${count} transactions importées`);
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

    strColor: function(str, s, l) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
        return `hsl(${hash % 360}, ${s}%, ${l}%)`;
    },

    loadDailyTip: function() {
        const idx = new Date().getDate() % this.tips.length;
        document.getElementById('dailyTip').textContent = `"${this.tips[idx]}"`;
    },

    toast: function(msg) {
        const t = document.getElementById('toast');
        document.getElementById('toastMsg').textContent = msg;
        t.classList.remove('translate-y-20', 'opacity-0');
        setTimeout(() => t.classList.add('translate-y-20', 'opacity-0'), 3000);
    }
};

// Initialisation au chargement
document.addEventListener('DOMContentLoaded', () => app.init());


