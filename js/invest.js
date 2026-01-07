// js/invest.js

const app = {
    transactions: [],
    currentPrices: {},
    charts: {},
    currentInvestTab: 'dashboard',

    // Liste des Tickers (Identique à l'original)
    tickerDB: {
        'total': 'TTE.PA', 'vinci': 'DG.PA', 'air liquide': 'AI.PA', 'lvmh': 'MC.PA',
        'sanofi': 'SAN.PA', 'schneider': 'SU.PA', 'loreal': 'OR.PA', 'hermes': 'RMS.PA',
        'bnpp': 'BNP.PA', 'axa': 'CS.PA', 'credit agricole': 'ACA.PA', 'danone': 'BN.PA',
        'orange': 'ORA.PA', 'renault': 'RNO.PA', 'stellantis': 'STLAP.PA', 'neurones': 'NRO',        
        'apple': 'AAPL', 'microsoft': 'MSFT', 'tesla': 'TSLA', 'amazon': 'AMZN', 
        'google': 'GOOGL', 'meta': 'META', 'nvidia': 'NVDA', 'realty income': 'O',
        'cw8': 'CW8.PA', 'sp500': 'SPX', 'nasdaq': 'NDX', 'bitcoin': 'BTC'
    },
    
    tips: ["Diversifiez !", "Patience.", "Achetez la peur.", "Investissez régulièrement."],

    init: async function() {
        console.log("App Init...");
        await this.loadData();
        this.loadDailyTip();
        this.setupAutoFill();
        this.nav('bank'); // Ouvre la banque par défaut
    },

    // --- NAVIGATION PRINCIPALE ---
    nav: function(mainTab) {
        document.querySelectorAll('.main-nav-btn').forEach(btn => {
            const isActive = btn.dataset.target === mainTab;
            btn.className = isActive 
                ? 'main-nav-btn px-4 py-1.5 rounded-md text-sm font-bold transition flex items-center gap-2 text-blue-600 bg-blue-50'
                : 'main-nav-btn px-4 py-1.5 rounded-md text-sm font-bold text-gray-500 hover:text-gray-700 transition flex items-center gap-2';
        });

        document.getElementById('view-bank').classList.add('hidden');
        document.getElementById('view-invest').classList.add('hidden');

        if (mainTab === 'bank') {
            document.getElementById('view-bank').classList.remove('hidden');
            this.renderBank();
        } else {
            document.getElementById('view-invest').classList.remove('hidden');
            this.navInvest(this.currentInvestTab);
        }
    },

    // --- NAVIGATION BOURSE ---
    navInvest: function(subTab) {
        this.currentInvestTab = subTab;
        document.querySelectorAll('.sub-nav-btn').forEach(btn => {
            const isActive = btn.dataset.sub === subTab;
            btn.className = isActive
                ? 'sub-nav-btn bg-blue-600 text-white shadow-md px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition'
                : 'sub-nav-btn bg-white text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition border border-gray-200';
        });

        ['dashboard', 'assets', 'transactions', 'projections'].forEach(id => {
            document.getElementById(`invest-${id}`).classList.add('hidden');
        });
        
        document.getElementById(`invest-${subTab}`).classList.remove('hidden');

        if(subTab === 'dashboard') { this.calcKPIs(); setTimeout(()=>this.renderPie(), 100); }
        if(subTab === 'assets') this.renderAssets();
        if(subTab === 'transactions') this.renderTable();
        if(subTab === 'projections') setTimeout(()=>this.renderProjections(), 100);
    },

    // --- DONNÉES & CRUD ---
    loadData: async function() {
        this.transactions = await dbService.getAll('invest_tx');
        const prices = await dbService.getAll('invest_prices');
        prices.forEach(p => this.currentPrices[p.ticker] = p.price);
    },

    addTransaction: async function(tx) {
        if(!tx.id) tx.id = Date.now() + Math.random();
        await dbService.add('invest_tx', tx);
        this.loadData(); // Recharger pour être sûr
    },

    deleteTx: async function(id) { 
        if(confirm('Supprimer ?')) { 
            await dbService.delete('invest_tx', id);
            await this.loadData();
            this.renderTable(); 
        } 
    },

    updatePrice: async function(name, price, ticker=null) {
        const val = parseFloat(price);
        this.currentPrices[name] = val;
        await dbService.add('invest_prices', { ticker: ticker || name, price: val });
        this.renderAssets();
        this.toast("Prix sauvegardé");
    },

    // --- CALCULS ---
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
        const totalPerf = invested > 0 ? (diff / invested) * 100 : 0;
        
        if(document.getElementById('kpiTotal')) {
            document.getElementById('kpiTotal').textContent = invested.toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
            document.getElementById('kpiFuture').textContent = currentVal.toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
            document.getElementById('kpiReturn').textContent = `${totalPerf>=0?'+':''}${totalPerf.toFixed(2)} %`;
            document.getElementById('kpiDiff').textContent = `${diff.toFixed(2)} €`;
        }
        return { invested, currentVal };
    },

    // --- RENDU GRAPHIQUES & TABLEAUX ---
    renderPie: function() {
        const ctx = document.getElementById('pieChart')?.getContext('2d');
        if(!ctx) return;
        if(this.charts.pie) this.charts.pie.destroy();
        const acc = {};
        this.transactions.filter(t=>t.op==='Achat').forEach(t => acc[t.account||'Défaut'] = (acc[t.account||'Défaut']||0) + (t.qty*t.price));
        this.charts.pie = new Chart(ctx, {
            type: 'doughnut',
            data: { labels: Object.keys(acc), datasets: [{ data: Object.values(acc), backgroundColor: ['#3b82f6','#8b5cf6','#10b981','#f59e0b'] }] },
            options: { maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
        });
    },

    renderAssets: function() {
        const grid = document.getElementById('assetsGrid');
        if(!grid) return;
        grid.innerHTML = '';
        const assets = this.getPortfolio();
        Object.values(assets).sort((a,b)=>b.invested-a.invested).forEach(a => {
            if(a.qty < 0.001) return;
            const pru = a.invested / a.qty;
            const price = this.currentPrices[a.name] || this.currentPrices[a.ticker] || pru;
            const val = a.qty * price;
            const gain = val - a.invested;
            
            grid.innerHTML += `
            <div class="bg-white rounded-xl shadow-sm border ${gain>=0?'border-green-200':'border-red-200'} p-4">
                <div class="flex justify-between mb-2">
                    <h3 class="font-bold text-gray-800">${a.name}</h3>
                    <span class="text-xs bg-slate-100 px-2 rounded">${a.ticker}</span>
                </div>
                <div class="flex justify-between items-center text-sm">
                    <div class="text-gray-500">PRU: ${pru.toFixed(2)}</div>
                    <input type="number" value="${price.toFixed(2)}" onchange="app.updatePrice('${a.name}', this.value, '${a.ticker}')" class="w-20 text-right font-bold border-b focus:outline-none">
                </div>
                <div class="mt-2 flex justify-between font-bold">
                    <div>${val.toFixed(0)} €</div>
                    <div class="${gain>=0?'text-green-600':'text-red-500'}">${gain>0?'+':''}${gain.toFixed(0)} €</div>
                </div>
            </div>`;
        });
    },

    renderTable: function() {
        const tbody = document.querySelector('#transactionsTable tbody');
        if(!tbody) return;
        tbody.innerHTML = '';
        const sorted = [...this.transactions].sort((a,b)=>new Date(b.date)-new Date(a.date));
        sorted.forEach(tx => {
            const total = tx.op==='Dividende' ? tx.price : (tx.qty*tx.price);
            tbody.innerHTML += `
            <tr class="bg-white border-b hover:bg-gray-50">
                <td class="px-3 py-2 text-xs">${tx.date}</td>
                <td class="px-3 py-2"><span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100">${tx.op}</span></td>
                <td class="px-3 py-2 text-sm font-medium">${tx.name}</td>
                <td class="px-3 py-2 text-right text-xs font-bold">${total.toFixed(2)} €</td>
                <td class="px-3 py-2 text-center"><button onclick="app.deleteTx(${tx.id})" class="text-red-400 hover:text-red-600"><i class="fa-solid fa-trash"></i></button></td>
            </tr>`;
        });
    },
    
    renderProjections: function() {
        const ctx = document.getElementById('mainProjectionChart')?.getContext('2d');
        if(!ctx) return;
        if(this.charts.proj) this.charts.proj.destroy();
        const years = parseInt(document.getElementById('projYears').value) || 10;
        const currentYear = new Date().getFullYear();
        const kpis = this.calcKPIs();
        
        const labels = Array.from({length: years + 1}, (_, i) => currentYear + i);
        const data = [];
        let val = kpis.currentVal;
        labels.forEach(() => { data.push(val); val *= 1.05; }); // +5% par an fixe

        this.charts.proj = new Chart(ctx, {
            type: 'line',
            data: { labels, datasets: [{ label: 'Projection (+5%)', data, borderColor: '#8b5cf6', fill: true, backgroundColor: '#8b5cf61a' }] },
            options: { maintainAspectRatio: false }
        });
    },

    // --- BANQUE ---
    updateBankBalance: async function() {
        const cur = await this.getSetting('bankStartBalance') || 0;
        const val = prompt("Solde Début de Mois :", cur);
        if(val !== null) {
            await dbService.add('settings', { key: 'bankStartBalance', value: parseFloat(val) });
            this.renderBank();
        }
    },
    getSetting: async function(key) {
        const d = await dbService.getAll('settings');
        return d.find(i=>i.key===key)?.value || 0;
    },
    renderBank: async function() {
        const start = await this.getSetting('bankStartBalance');
        document.getElementById('bankStartBalance').textContent = start.toLocaleString('fr-FR') + ' €';

        const budget = await dbService.getAll('budget');
        let dep = 0, rev = 0;
        budget.forEach(t => t.amount < 0 ? dep += Math.abs(t.amount) : rev += t.amount);

        let invOut = 0, invIn = 0;
        this.transactions.forEach(t => {
            const tot = t.qty * t.price;
            if(t.op==='Achat') invOut += tot;
            else if(t.op==='Vente') invIn += tot;
            else if(t.op==='Dividende') invIn += t.price;
        });

        const final = start + (rev + invIn) - (dep + invOut);
        
        document.getElementById('bankCurrentBalance').textContent = final.toLocaleString('fr-FR', {style:'currency', currency:'EUR'});
        document.getElementById('bankOutBudget').textContent = '-' + dep.toFixed(2) + ' €';
        document.getElementById('bankOutInvest').textContent = '-' + invOut.toFixed(2) + ' €';
    },

    // --- MODALES & UTILS ---
    openModal: function(mode) {
        document.getElementById('modalForm').classList.remove('hidden');
        if(mode==='new') {
            document.getElementById('fDate').value = new Date().toISOString().split('T')[0];
            ['fName','fTicker','fQty','fPrice'].forEach(i=>document.getElementById(i).value='');
        }
    },
    closeModal: function() { document.getElementById('modalForm').classList.add('hidden'); },
    
    saveTransaction: async function() {
        const tx = {
            id: Date.now(),
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
        if(this.currentInvestTab === 'transactions') this.renderTable();
        if(this.currentInvestTab === 'assets') this.renderAssets();
        this.toast("Enregistré");
    },
    
    setupAutoFill: function() {
        document.getElementById('fName').addEventListener('blur', (e) => {
            const val = e.target.value.toLowerCase();
            for(const [k,t] of Object.entries(this.tickerDB)) {
                if(val.includes(k) && !document.getElementById('fTicker').value) {
                    document.getElementById('fTicker').value = t;
                    this.toast("Ticker auto: " + t);
                }
            }
        });
    },
    
    exportExcel: function() {
        const ws = XLSX.utils.json_to_sheet(this.transactions);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Transactions");
        XLSX.writeFile(wb, "Export_InvestTrack.xlsx");
    },
    
    searchTicker: function() { const n=document.getElementById('fName').value; if(n) window.open(`https://www.google.com/search?q=ticker+${n}`, '_blank'); },
    loadDailyTip: function() { document.getElementById('dailyTip').textContent = this.tips[Math.floor(Math.random()*this.tips.length)]; },
    toast: function(m) { const t=document.getElementById('toast'); document.getElementById('toastMsg').textContent=m; t.classList.remove('opacity-0'); setTimeout(()=>t.classList.add('opacity-0'), 2000); }
};
