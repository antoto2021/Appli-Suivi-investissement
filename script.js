/**
 * InvestTrack V5.1 - Core Logic with Budget OCR
 */

const app = {
    transactions: [],
    currentPrices: {},
    budgetItems: [], // New for V5.1
    charts: {},
    
    // Config
    tickerDB: {
        'total': 'TTE.PA', 'vinci': 'DG.PA', 'air liquide': 'AI.PA', 'lvmh': 'MC.PA', 'sanofi': 'SAN.PA',
        'schneider': 'SU.PA', 'loreal': 'OR.PA', 'hermes': 'RMS.PA', 'bnpp': 'BNP.PA', 'axa': 'CS.PA',
        'apple': 'AAPL', 'microsoft': 'MSFT', 'tesla': 'TSLA', 'amazon': 'AMZN', 'google': 'GOOGL',
        'cw8': 'CW8.PA', 'sp500': 'SP500', 'accor': 'AC.PA', 'mercedes': 'MBG.DE'
    },
    mockDividends: {
        'Action Vinci': { current: 4.50 }, 'Total Energie': { current: 3.20 }, 'Accor': { current: 1.10 },
        'Mercedes': { current: 5.30 }, 'Neurones': { current: 1.20 }, 'DEFAULT': { current: 0.00 }
    },
    categories: {
        'Alimentation': ['carrefour', 'leclerc', 'auchan', 'lidl', 'intermarche', 'monoprix', 'courses'],
        'Restauration': ['mcdo', 'restaurant', 'uber', 'deliveroo', 'cafe', 'bistro', 'burger'],
        'Transport': ['sncf', 'uber', 'bolt', 'total', 'esso', 'bp', 'parking', 'peage'],
        'Logement': ['edf', 'engie', 'loyer', 'assurance', 'eau', 'gaz', 'internet', 'orange', 'sfr'],
        'Loisirs': ['netflix', 'spotify', 'cinema', 'sport', 'gym', 'fnac', 'amazon']
    },
    tips: [
        "La diversification est la seule gratuité en finance.", "L'intérêt composé est la 8ème merveille du monde.",
        "Le temps est votre meilleur allié.", "Réinvestissez vos dividendes.", "N'investissez que ce que vous pouvez perdre."
    ],

    init: function() {
        this.loadData();
        this.loadDailyTip();
        this.setupAutoFill();
    },

    nav: function(id) {
        document.querySelectorAll('main > section').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById(id + '-view');
        if(target) target.classList.remove('hidden');
        
        if(id === 'dashboard') { this.calcGlobalKPIs(); this.renderPie(); }
        if(id === 'assets') this.renderAssets();
        if(id === 'transactions') this.renderTable();
        if(id === 'projections') this.renderProjections();
        if(id === 'dividends') this.renderDividends();
        if(id === 'budget') this.renderBudget(); // New
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    // --- CORE DATA ---
    loadData: function() {
        const tx = localStorage.getItem('invest_v5_tx');
        if(tx) this.transactions = JSON.parse(tx);
        else this.seedData();

        const pr = localStorage.getItem('invest_v5_prices');
        if(pr) this.currentPrices = JSON.parse(pr);

        const bdg = localStorage.getItem('invest_v5_budget');
        if(bdg) this.budgetItems = JSON.parse(bdg);
    },

    saveData: function() {
        localStorage.setItem('invest_v5_tx', JSON.stringify(this.transactions));
        localStorage.setItem('invest_v5_prices', JSON.stringify(this.currentPrices));
        localStorage.setItem('invest_v5_budget', JSON.stringify(this.budgetItems));
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

    // --- BUDGET & OCR LOGIC ---
    
    addBudgetLine: function() {
        this.budgetItems.unshift({
            id: Date.now(),
            date: new Date().toLocaleDateString('fr-FR'),
            desc: 'Nouvelle dépense',
            amount: -10.00,
            cat: 'Autre'
        });
        this.saveData();
        this.renderBudget();
    },

    handleScan: async function(e) {
        const file = e.target.files[0];
        if(!file) return;

        // UI Feedback
        document.getElementById('scanLoader').classList.remove('hidden');
        document.getElementById('scanStatus').textContent = "Chargement moteur OCR...";

        try {
            const worker = await Tesseract.createWorker('fra', 1, {
                logger: m => {
                    if(m.status === 'recognizing text') {
                        document.getElementById('scanStatus').textContent = `Lecture: ${Math.round(m.progress*100)}%`;
                    }
                }
            });

            const ret = await worker.recognize(file);
            const text = ret.data.text;
            
            // Parsing
            const lines = text.split('\n');
            let count = 0;
            
            lines.forEach(line => {
                // Regex: Date JJ/MM or JJ-MM & Amount
                const dateMatch = line.match(/(\d{2}[\/\.-]\d{2}(?:[\/\.-]\d{2,4})?)/);
                const amountMatch = line.match(/(-?\s?\d{1,3}(?:[\s\.]\d{3})*(?:[\.,]\d{2}))/);

                if(dateMatch && amountMatch) {
                    let amount = parseFloat(amountMatch[0].replace(/\s/g,'').replace(',','.').replace(/O/g,'0'));
                    if(isNaN(amount)) return;
                    
                    // Simple logic: if not explicitly negative on receipt but clearly a payment, assume expense
                    if(amount > 0) amount = -amount; 

                    let desc = line.replace(dateMatch[0],'').replace(amountMatch[0],'').replace(/[|*_]/g,'').trim();
                    if(desc.length < 3) desc = "Achat inconnu";

                    // Categorize
                    let cat = 'Autre';
                    const lower = desc.toLowerCase();
                    for(const [k, v] of Object.entries(this.categories)) {
                        if(v.some(kw => lower.includes(kw))) { cat = k; break; }
                    }

                    this.budgetItems.unshift({
                        id: Date.now() + Math.random(),
                        date: dateMatch[0],
                        desc: desc,
                        amount: amount,
                        cat: cat
                    });
                    count++;
                }
            });

            await worker.terminate();
            this.saveData();
            this.renderBudget();
            this.toast(`${count} lignes détectées`);

        } catch(err) {
            console.error(err);
            alert("Erreur lecture image");
        } finally {
            document.getElementById('scanLoader').classList.add('hidden');
            e.target.value = '';
        }
    },

    updateBudget: function(id, field, val) {
        const item = this.budgetItems.find(i => i.id == id);
        if(item) {
            item[field] = field === 'amount' ? parseFloat(val) : val;
            this.saveData();
            this.renderBudget(); // Refresh for totals
        }
    },

    deleteBudget: function(id) {
        if(confirm('Supprimer ?')) {
            this.budgetItems = this.budgetItems.filter(i => i.id != id);
            this.saveData();
            this.renderBudget();
        }
    },

    renderBudget: function() {
        const list = document.getElementById('budgetList');
        list.innerHTML = '';
        
        let inc = 0, exp = 0;
        this.budgetItems.forEach(b => {
            if(b.amount > 0) inc += b.amount; else exp += b.amount;
            
            const div = document.createElement('div');
            div.className = "bg-white p-3 rounded-lg shadow-sm border border-gray-100 flex flex-col gap-2 relative group";
            div.innerHTML = `
                <div class="flex justify-between items-start">
                    <input type="text" class="budget-input font-medium text-gray-800" value="${b.desc}" onchange="app.updateBudget(${b.id}, 'desc', this.value)">
                    <div class="flex items-center gap-1 w-24 justify-end">
                        <input type="number" step="0.01" class="budget-input font-bold text-right ${b.amount<0?'text-gray-900':'text-emerald-600'}" value="${b.amount}" onchange="app.updateBudget(${b.id}, 'amount', this.value)">
                        <span class="text-xs text-gray-400">€</span>
                    </div>
                </div>
                <div class="flex justify-between items-center">
                    <div class="flex gap-2 w-full">
                        <input type="text" class="budget-input text-xs text-gray-400 w-20" value="${b.date}" onchange="app.updateBudget(${b.id}, 'date', this.value)">
                        <select class="text-xs bg-gray-50 border-none rounded px-2 py-1" onchange="app.updateBudget(${b.id}, 'cat', this.value)">
                            ${Object.keys(this.categories).concat(['Autre', 'Salaire', 'Santé']).map(c => `<option value="${c}" ${c===b.cat?'selected':''}>${c}</option>`).join('')}
                        </select>
                    </div>
                    <button onclick="app.deleteBudget(${b.id})" class="text-gray-300 hover:text-red-500"><i class="fa-solid fa-trash"></i></button>
                </div>
            `;
            list.appendChild(div);
        });

        document.getElementById('budgIncome').textContent = `+${inc.toFixed(2)} €`;
        document.getElementById('budgExpense').textContent = `${exp.toFixed(2)} €`;
        document.getElementById('budgBalance').textContent = `${(inc+exp).toFixed(2)} €`;
        
        if(this.budgetItems.length === 0) document.getElementById('budgetEmpty').classList.remove('hidden');
        else document.getElementById('budgetEmpty').classList.add('hidden');
    },

    // --- INVEST LOGIC (Ported from V4) ---
    
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
            if(tx.op === 'Achat') { assets[tx.name].qty += tx.qty; assets[tx.name].invested += (tx.qty * tx.price); }
            else if(tx.op === 'Vente') { 
                assets[tx.name].qty -= tx.qty; 
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
                <div class="bg-white rounded-xl shadow-sm border overflow-hidden card-hover" style="border-color:${border}">
                    <div class="p-4 flex justify-between items-center" style="background-color:${color}">
                        <h3 class="font-bold text-gray-800 truncate" style="color:${border}">${a.name}</h3>
                        <span class="text-xs bg-white px-2 py-1 rounded font-mono font-bold text-gray-600">${a.ticker}</span>
                    </div>
                    <div class="p-5">
                        <div class="flex justify-between items-center mb-3">
                            <span class="text-gray-500 text-sm">Cours Actuel (€)</span>
                            <input type="number" step="0.01" value="${curr.toFixed(2)}" onchange="app.updatePrice('${a.name}', this.value)" class="price-input">
                        </div>
                        <div class="flex justify-between mb-1"><span class="text-gray-500 text-sm">PRU</span><span class="font-mono text-gray-600">${pru.toFixed(2)} €</span></div>
                        <div class="flex justify-between mb-3 border-b border-dashed pb-2"><span class="text-gray-500 text-sm">Quantité</span><span class="font-mono font-semibold">${a.qty.toFixed(2)}</span></div>
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
        if(sorted.length===0) document.getElementById('emptyState').classList.remove('hidden');
        else document.getElementById('emptyState').classList.add('hidden');
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

    renderProjections: function() {
        const years = parseInt(document.getElementById('projYears').value) || 20;
        const labels = Array.from({length: years+1}, (_, i) => `An ${i}`);
        const kpis = this.calcGlobalKPIs();
        let growthRate = 0.05;
        if (kpis.invested > 0) {
            growthRate = (kpis.currentVal - kpis.invested) / kpis.invested;
            if(growthRate < 0) growthRate = 0.02; if(growthRate > 0.15) growthRate = 0.15;
        }
        let cap = 0;
        this.transactions.forEach(t => { if(t.op==='Achat') cap += t.qty*t.price; if(t.op==='Vente') cap -= t.qty*t.price; });
        const data = [cap];
        for(let i=1; i<=years; i++) data.push(data[i-1] * (1 + growthRate));
        const ctx = document.getElementById('mainProjectionChart').getContext('2d');
        if(this.charts.proj) this.charts.proj.destroy();
        const gradient = ctx.createLinearGradient(0,0,0,400);
        gradient.addColorStop(0, 'rgba(147, 51, 234, 0.4)'); gradient.addColorStop(1, 'rgba(147, 51, 234, 0.0)');
        this.charts.proj = new Chart(ctx, { type: 'line', data: { labels, datasets: [{ label: `Capital (Taux: ${(growthRate*100).toFixed(1)}%)`, data, borderColor: '#9333ea', backgroundColor: gradient, fill: true, tension: 0.4 }] }, options: { maintainAspectRatio: false } });
        this.renderYearlyBar(); this.renderFrequency();
    },

    renderYearlyBar: function() {
        const yData = {};
        this.transactions.filter(t=>t.op==='Achat').forEach(t => { yData[t.date.split('-')[0]] = (yData[t.date.split('-')[0]]||0) + (t.qty*t.price); });
        const ctx = document.getElementById('yearlyBarChart').getContext('2d');
        if(this.charts.bar) this.charts.bar.destroy();
        this.charts.bar = new Chart(ctx, { type: 'bar', data: { labels: Object.keys(yData).sort(), datasets: [{ label:'Investi', data:Object.values(yData), backgroundColor:'#10b981', borderRadius:4 }] }, options: { maintainAspectRatio: false } });
    },

    renderFrequency: function() {
        let count = 0;
        const data = this.transactions.sort((a,b)=>new Date(a.date)-new Date(b.date)).map(t => ++count);
        const ctx = document.getElementById('frequencyChart').getContext('2d');
        if(this.charts.freq) this.charts.freq.destroy();
        this.charts.freq = new Chart(ctx, { type: 'line', data: { labels: this.transactions.map(t=>t.date), datasets: [{ label:'Opérations', data, borderColor:'#6366f1', pointRadius:0 }] }, options: { maintainAspectRatio: false, scales: { x: { display: false } } } });
    },

    renderPie: function() {
        const acc = {};
        this.transactions.filter(t=>t.op==='Achat').forEach(t => acc[t.account] = (acc[t.account]||0) + (t.qty*t.price));
        const ctx = document.getElementById('pieChart').getContext('2d');
        if(this.charts.pie) this.charts.pie.destroy();
        this.charts.pie = new Chart(ctx, { type: 'doughnut', data: { labels: Object.keys(acc), datasets: [{ data:Object.values(acc), backgroundColor:['#3b82f6','#8b5cf6','#10b981','#f59e0b'] }] }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'right' } } } });
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
                container.innerHTML += `<div class="bg-white rounded-xl shadow-sm border p-4" style="background:${col}"><div class="flex justify-between font-bold"><span>${a.name}</span><i class="fa-solid fa-coins text-yellow-600"></i></div><div class="mt-4 flex justify-between items-end"><div><p class="text-xs text-gray-500">Revenu Est.</p><p class="text-xl font-bold text-emerald-700">${total.toFixed(2)} €</p></div><div class="text-right"><p class="text-xs text-gray-500">Unit.</p><p class="font-mono">${info.current} €</p></div></div></div>`;
            }
        });
        if(!found) document.getElementById('noDividends').classList.remove('hidden');
    },

    // --- HELPERS ---
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
        const tx = { date: document.getElementById('fDate').value, op: document.getElementById('fOp').value, name: document.getElementById('fName').value, ticker: document.getElementById('fTicker').value, account: document.getElementById('fAccount').value, sector: document.getElementById('fSector').value, qty: parseFloat(document.getElementById('fQty').value)||0, price: parseFloat(document.getElementById('fPrice').value)||0 };
        if(idx !== '') this.transactions[idx] = tx; else this.transactions.push(tx);
        this.saveData(); this.closeModal(); this.toast(idx!==''?"Modifié":"Ajouté"); this.renderTable();
    },
    deleteTx: function(idx) { if(confirm('Supprimer ?')) { this.transactions.splice(idx, 1); this.saveData(); this.renderTable(); } },
    setupAutoFill: function() {
        const ni = document.getElementById('fName'); const ti = document.getElementById('fTicker');
        ni.addEventListener('blur', () => { for (const [k, t] of Object.entries(this.tickerDB)) if (ni.value.toLowerCase().includes(k)) { ti.value = t; break; } });
    },
    searchTicker: function() { const n = document.getElementById('fName').value; if(n) window.open(`https://www.google.com/search?q=ticker+${encodeURIComponent(n)}`, '_blank'); },
    handleImport: function(e) {
        const r = new FileReader(); r.onload = ev => {
            const wb = XLSX.read(new Uint8Array(ev.target.result), {type:'array'});
            const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
            let count = 0;
            json.forEach(row => {
                let d = row['Date']||row['Date_Entrée'];
                if(typeof d==='number') d = new Date(Math.round((d-25569)*86400*1000)).toISOString().split('T')[0];
                const tx = { date: d || new Date().toISOString().split('T')[0], op: row['Operation'] || row['Opération'] || row['Type'] || 'Achat', name: row['Nom actif'] || row['Nom_Actif'] || row['Nom'] || 'Inconnu', ticker: row['Ticker'] || '', account: row['Compte'] || '', sector: row['Secteur'] || '', qty: parseFloat(row['Quantité']||row['Qty']) || 0, price: parseFloat(row['Prix unitaire']||row['Prix']||row['PRU_Moyen']) || 0 };
                if(tx.op === 'Dividende' && tx.qty > 0 && tx.price > 0) tx.price = tx.qty * tx.price;
                if(tx.qty > 0 || (tx.op==='Dividende' && tx.price>0)) { this.transactions.push(tx); count++; }
            });
            this.saveData(); this.toast(`${count} importés`); this.renderTable(); e.target.value = '';
        }; r.readAsArrayBuffer(e.target.files[0]);
    },
    exportExcel: function() { const ws = XLSX.utils.json_to_sheet(this.transactions); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Transactions"); XLSX.writeFile(wb, "InvestTrack_Export.xlsx"); },
    strColor: function(str, s, l) { let h = 0; for (let i = 0; i < str.length; i++) h = str.charCodeAt(i) + ((h << 5) - h); return `hsl(${h % 360}, ${s}%, ${l}%)`; },
    loadDailyTip: function() { document.getElementById('dailyTip').textContent = `"${this.tips[new Date().getDate() % this.tips.length]}"`; },
    toast: function(msg) { const t = document.getElementById('toast'); document.getElementById('toastMsg').textContent = msg; t.classList.remove('translate-y-20', 'opacity-0'); setTimeout(() => t.classList.add('translate-y-20', 'opacity-0'), 3000); }
};
document.addEventListener('DOMContentLoaded', () => app.init());


