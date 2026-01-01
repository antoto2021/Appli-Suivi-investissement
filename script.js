/**
 * InvestTrack V5 Ultimate - Hybrid Core
 * Vanilla JS (Invest) + React (Budget) + GitHub API (Info)
 */

const { useState, useEffect, useRef } = React;

// =================================================================
// 1. INVEST TRACK LOGIC (Vanilla JS)
// =================================================================
const app = {
    transactions: [],
    currentPrices: {},
    charts: {},
    tickerDB: {
        'total': 'TTE.PA', 'vinci': 'DG.PA', 'air liquide': 'AI.PA', 'lvmh': 'MC.PA', 
        'sanofi': 'SAN.PA', 'schneider': 'SU.PA', 'loreal': 'OR.PA', 'hermes': 'RMS.PA',
        'bnpp': 'BNP.PA', 'axa': 'CS.PA', 'apple': 'AAPL', 'microsoft': 'MSFT', 
        'tesla': 'TSLA', 'amazon': 'AMZN', 'google': 'GOOGL', 'meta': 'META', 
        'nvidia': 'NVDA', 'cw8': 'CW8.PA', 'sp500': 'SP500', 'accor': 'AC.PA'
    },
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
    },

    // --- Navigation ---
    nav: function(id) {
        document.querySelectorAll('main > section').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById(id + '-view');
        if(target) target.classList.remove('hidden');
        
        // Hooks de rendu
        if(id === 'dashboard') { this.calcKPIs(); this.renderPie(); }
        if(id === 'assets') this.renderAssets();
        if(id === 'transactions') this.renderTable();
        if(id === 'projections') this.renderProjections();
        if(id === 'dividends') this.renderDividends();
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    // --- Data Management ---
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

    // --- Core Logic ---
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
            if(tx.op === 'Achat') { assets[tx.name].qty += tx.qty; assets[tx.name].invested += (tx.qty*tx.price); }
            else if(tx.op === 'Vente') { 
                const pru = assets[tx.name].invested / (assets[tx.name].qty + tx.qty); 
                assets[tx.name].qty -= tx.qty; 
                assets[tx.name].invested -= (tx.qty*pru);
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
            const price = this.currentPrices[a.name] || (a.invested/a.qty);
            currentVal += (a.qty * price);
        });
        const diff = currentVal - invested;
        const perf = invested > 0 ? (diff/invested)*100 : 0;

        document.getElementById('kpiTotal').textContent = invested.toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
        document.getElementById('kpiFuture').textContent = currentVal.toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
        
        const diffEl = document.getElementById('kpiDiff');
        diffEl.textContent = `${diff>=0?'+':''}${diff.toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}`;
        diffEl.className = `sub-value ${diff>=0?'text-green-600':'text-red-500'}`;
        
        const perfEl = document.getElementById('kpiReturn');
        perfEl.textContent = `${perf>=0?'+':''}${perf.toFixed(2)} %`;
        perfEl.className = `value ${perf>=0?'text-green-600':'text-red-500'}`;
        return { invested, currentVal, perf };
    },

    // --- Renderers ---
    renderAssets: function() {
        const grid = document.getElementById('assetsGrid');
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
                <div class="bg-white rounded-xl shadow-sm border overflow-hidden transition hover:-translate-y-1" style="border-color:${border}">
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
        const sorted = [...this.transactions].sort((a,b)=>new Date(b.date)-new Date(a.date));
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
        
        const kpis = this.calcKPIs();
        let growthRate = 0.05; 
        if (kpis.invested > 0) {
            growthRate = (kpis.currentVal - kpis.invested) / kpis.invested;
            if(growthRate < 0) growthRate = 0.02; 
            if(growthRate > 0.15) growthRate = 0.15; 
        }

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
            data: { labels, datasets: [{ label: `Capital (Taux appliqué: ${(growthRate*100).toFixed(1)}%)`, data, borderColor: '#9333ea', backgroundColor: gradient, fill: true, tension: 0.4 }] },
            options: { maintainAspectRatio: false }
        });
        
        this.renderYearlyBar(); this.renderFrequency();
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
            type: 'bar', data: { labels: Object.keys(yData).sort(), datasets: [{ label:'Investi', data:Object.values(yData), backgroundColor:'#10b981', borderRadius:4 }] },
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
            const info = this.mockDividends[a.name] || {current:0};
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

    // --- Helpers ---
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
                    op: row['Operation'] || row['Opération'] || row['Type'] || 'Achat',
                    name: row['Nom actif'] || row['Nom_Actif'] || row['Nom'] || 'Inconnu',
                    ticker: row['Ticker'] || '',
                    account: row['Compte'] || '',
                    sector: row['Secteur'] || '',
                    qty: parseFloat(row['Quantité']||row['Qty']) || 0,
                    price: parseFloat(row['Prix unitaire']||row['Prix']||row['PRU_Moyen']) || 0
                };
                if(tx.op === 'Dividende' && tx.qty > 0 && tx.price > 0) tx.price = tx.qty * tx.price;
                if(tx.qty > 0 || (tx.op==='Dividende' && tx.price>0)) { this.transactions.push(tx); count++; }
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
        document.getElementById('fName').addEventListener('blur', (e) => {
            const val = e.target.value.toLowerCase().trim();
            for(const [k,t] of Object.entries(this.tickerDB)) { if(val.includes(k)) { document.getElementById('fTicker').value=t; break; }}
        });
    },
    searchTicker: function() {
        const n = document.getElementById('fName').value;
        if(n) window.open(`https://www.google.com/search?q=ticker+${encodeURIComponent(n)}`, '_blank');
        else alert('Saisissez un nom');
    },
    
    strColor: function(s,l,d) { let h=0; for(let i=0;i<s.length;i++)h=s.charCodeAt(i)+((h<<5)-h); return `hsl(${h%360},${l}%,${d}%)`; },
    loadDailyTip: function() { document.getElementById('dailyTip').textContent = `"${this.tips[new Date().getDate()%this.tips.length]}"`; },
    toast: function(m) { const t=document.getElementById('toast'); document.getElementById('toastMsg').textContent=m; t.classList.remove('translate-y-20','opacity-0'); setTimeout(()=>t.classList.add('translate-y-20','opacity-0'),2500); }
};

// =================================================================
// 2. INFO MODULE LOGIC
// =================================================================
const infoModule = {
    config: { username: 'antoto2021', repo: 'Green-Codex' },
    slides: [
        { icon: "👋", title: "Bienvenue sur InvestTrack V5", desc: "Votre solution ultime pour gérer Patrimoine et Budget." },
        { icon: "📈", title: "Suivi Bourse", desc: "Transactions, Actifs, et Projections basées sur vos performances réelles." },
        { icon: "🧾", title: "BudgetScan (Nouveau)", desc: "Scanner intelligent de tickets de caisse. Catégorisation automatique via OCR." },
        { icon: "🔄", title: "Toujours à jour", desc: "Connecté à GitHub pour récupérer les dernières améliorations en un clic." }
    ],
    slideIndex: 0,

    init: function() {
        this.renderLocalInfo();
        setTimeout(() => this.checkGitHub(true), 3000);
    },

    openModal: function() { document.getElementById('info-modal-overlay').classList.remove('hidden'); this.renderLocalInfo(); },
    closeModal: function() { document.getElementById('info-modal-overlay').classList.add('hidden'); },

    renderLocalInfo: function() {
        const h = localStorage.getItem('app_version_hash') || 'Init';
        document.getElementById('info-local-v').innerText = h.substring(0,7);
    },

    checkGitHub: function(bg=false) {
        const btn = document.querySelector('#info-remote-v');
        if(!bg) btn.innerText = '...';
        fetch(`https://api.github.com/repos/${this.config.username}/${this.config.repo}/commits?per_page=1`)
            .then(r => r.json())
            .then(d => {
                if(d[0]) {
                    const sha = d[0].sha;
                    document.getElementById('info-remote-v').innerText = sha.substring(0,7);
                    const local = localStorage.getItem('app_version_hash');
                    if(local && local !== sha) {
                        document.getElementById('navUpdateDot').classList.remove('hidden');
                    }
                    if(!local) localStorage.setItem('app_version_hash', sha);
                }
            })
            .catch(e => { if(!bg) btn.innerText = 'Err'; });
    },

    forceUpdate: function() {
        const btn = document.getElementById('refreshBtn');
        btn.classList.add('animate-spin');
        this.checkGitHub().then(() => {
            setTimeout(() => window.location.reload(), 1000);
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
        dots.innerHTML = this.slides.map((_,i) => `<div class="w-2 h-2 rounded-full transition ${i===this.slideIndex?'bg-emerald-600 w-4':'bg-gray-300'}"></div>`).join('');
        document.getElementById('tuto-btn').innerText = this.slideIndex === this.slides.length - 1 ? "C'est parti ! 🚀" : "Suivant ➜";
    },

    nextSlide: function() {
        if(this.slideIndex < this.slides.length - 1) {
            this.slideIndex++;
            this.updateSlide();
        } else {
            document.getElementById('tuto-overlay').classList.add('hidden');
        }
    }
};

// =================================================================
// 3. BUDGET SCAN APP (React)
// =================================================================
const CATEGORIES = {
    'Alimentation': ['carrefour', 'leclerc', 'auchan', 'lidl', 'courses'],
    'Restauration': ['mcdo', 'uber', 'deliveroo', 'restaurant', 'cafe'],
    'Transport': ['sncf', 'total', 'essence', 'peage', 'uber', 'parking'],
    'Logement': ['loyer', 'edf', 'eau', 'internet'],
    'Loisirs': ['netflix', 'cinema', 'sport'],
    'Salaire': ['salaire', 'virement', 'cpam']
};
const CAT_COLORS = {'Alimentation':'bg-green-100 text-green-800','Transport':'bg-blue-100 text-blue-800','Salaire':'bg-teal-100 text-teal-800','Autre':'bg-gray-100 text-gray-600'};

const BudgetApp = () => {
    const [step, setStep] = useState('upload');
    const [transactions, setTransactions] = useState([]);
    const [status, setStatus] = useState('');
    const fileRef = useRef(null);

    useEffect(() => {
        const saved = localStorage.getItem('budget_scan_tx');
        if(saved) { setTransactions(JSON.parse(saved)); setStep('results'); }
    }, []);

    useEffect(() => { localStorage.setItem('budget_scan_tx', JSON.stringify(transactions)); }, [transactions]);
    useEffect(() => { if(window.lucide) window.lucide.createIcons(); }, [step, transactions]);

    const processImage = async (file) => {
        setStep('processing'); setStatus('Analyse OCR...');
        try {
            const worker = await Tesseract.createWorker('fra', 1, { logger: m => { if(m.status==='recognizing text') setStatus(`Lecture: ${Math.round(m.progress*100)}%`); }});
            const ret = await worker.recognize(file);
            const lines = ret.data.text.split('\n');
            const newTx = [];
            lines.forEach(line => {
                const clean = line.trim();
                if(clean.length < 5) return;
                const dateMatch = clean.match(/(\d{2}[\/\.-]\d{2}(?:[\/\.-]\d{2,4})?)/);
                const amtMatch = clean.match(/(-?\s?\d{1,3}(?:[\s\.]\d{3})*(?:[\.,]\d{2}))/);
                if(dateMatch && amtMatch) {
                    let amt = parseFloat(amtMatch[0].replace(/\s/g,'').replace(',','.').replace(/O/g,'0'));
                    if(!isNaN(amt)) {
                        let desc = clean.replace(dateMatch[0],'').replace(amtMatch[0],'').replace(/[|*_]/g,'').trim();
                        let cat = 'Autre';
                        for(const [c, kws] of Object.entries(CATEGORIES)) { if(kws.some(k => desc.toLowerCase().includes(k))) { cat = c; break; } }
                        newTx.push({ id: Date.now()+Math.random(), date: dateMatch[0], description: desc||'Inconnu', amount: amt, category: cat });
                    }
                }
            });
            setTransactions(prev => [...newTx, ...prev]);
            setStep('results'); await worker.terminate();
        } catch(e) { alert('Erreur lecture'); setStep('upload'); }
    };

    const addManual = () => {
        setTransactions(p => [{id:Date.now(), date:new Date().toLocaleDateString('fr-FR'), description:'Nouvelle dépense', amount:-10, category:'Autre'}, ...p]);
    };

    const updateTx = (id, f, v) => setTransactions(p => p.map(t => t.id===id ? {...t, [f]:v} : t));
    const delTx = (id) => setTransactions(p => p.filter(t => t.id!==id));
    const total = transactions.reduce((acc,t) => acc+t.amount, 0);

    return (
        <div className="max-w-md mx-auto h-full flex flex-col bg-gray-50 rounded-xl shadow-inner border border-gray-200 overflow-hidden">
            <div className="bg-emerald-600 text-white p-4 flex justify-between items-center shadow-md">
                <h2 className="font-bold flex items-center gap-2"><i data-lucide="scan-line"></i> BudgetScan</h2>
                {step==='results' && <button onClick={()=>setStep('upload')} className="text-xs bg-emerald-800 px-2 py-1 rounded">Nouveau</button>}
            </div>
            <div className="flex-1 overflow-y-auto p-4 hide-scrollbar">
                {step === 'upload' && (
                    <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
                        <div className="bg-white p-8 rounded-full shadow-sm text-emerald-500"><i data-lucide="camera" className="w-12 h-12"></i></div>
                        <p className="text-gray-500 text-sm px-6">Prenez une photo de votre ticket de caisse.</p>
                        <input type="file" accept="image/*" className="hidden" ref={fileRef} onChange={(e)=>processImage(e.target.files[0])} />
                        <button onClick={()=>fileRef.current.click()} className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold shadow-lg hover:bg-emerald-700 flex items-center gap-2"><i data-lucide="upload"></i> Scanner / Importer</button>
                        {transactions.length > 0 && <button onClick={()=>setStep('results')} className="text-gray-400 text-sm underline">Retour à la liste</button>}
                    </div>
                )}
                {step === 'processing' && (
                    <div className="flex flex-col items-center justify-center h-full">
                        <div className="loader mb-4"></div>
                        <p className="text-gray-500 text-sm animate-pulse">{status}</p>
                    </div>
                )}
                {step === 'results' && (
                    <div className="space-y-4">
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-emerald-100 text-center">
                            <span className="text-xs text-gray-400 uppercase font-bold">Solde Détecté</span>
                            <div className={`text-2xl font-bold ${total>=0?'text-emerald-600':'text-red-500'}`}>{total.toFixed(2)} €</div>
                        </div>
                        <div className="flex justify-between items-center px-1">
                            <h3 className="font-bold text-gray-700 text-sm">Historique</h3>
                            <button onClick={addManual} className="bg-white border border-gray-200 text-gray-600 px-3 py-1 rounded-full text-xs hover:bg-gray-50">+ Manuel</button>
                        </div>
                        <div className="space-y-2 pb-20">
                            {transactions.map(t => (
                                <div key={t.id} className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm relative group">
                                    <div className="flex justify-between mb-2">
                                        <input type="text" value={t.description} onChange={(e)=>updateTx(t.id,'description',e.target.value)} className="font-bold text-gray-700 bg-transparent w-full focus:outline-none focus:text-blue-600" />
                                        <div className="flex items-center gap-1">
                                            <input type="number" step="0.01" value={t.amount} onChange={(e)=>updateTx(t.id,'amount',parseFloat(e.target.value))} className={`text-right w-20 font-mono font-bold bg-transparent focus:outline-none ${t.amount<0?'text-gray-800':'text-emerald-600'}`} />
                                            <span className="text-xs text-gray-400">€</span>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <div className="flex gap-2">
                                            <input type="text" value={t.date} onChange={(e)=>updateTx(t.id,'date',e.target.value)} className="text-xs text-gray-400 w-16 bg-transparent" />
                                            <select value={t.category} onChange={(e)=>updateTx(t.id,'category',e.target.value)} className={`text-[10px] px-2 py-0.5 rounded-full appearance-none bg-gray-100 text-gray-600 font-bold uppercase tracking-wider`}>
                                                {Object.keys(CATEGORIES).concat(['Autre']).map(c=><option key={c} value={c}>{c}</option>)}
                                            </select>
                                        </div>
                                        <button onClick={()=>delTx(t.id)} className="text-gray-300 hover:text-red-500"><i data-lucide="trash-2" className="w-4 h-4"></i></button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// =================================================================
// 4. MAIN INIT
// =================================================================
document.addEventListener('DOMContentLoaded', () => {
    app.init();
    infoModule.init();
    const root = ReactDOM.createRoot(document.getElementById('budget-root'));
    root.render(<BudgetApp />);
});