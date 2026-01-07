window.app = {
    transactions: [],
    currentPrices: {},
    charts: {},
    
    tickerDB: {
        'total': 'TTE.PA', 'vinci': 'DG.PA', 'air liquide': 'AI.PA', 'lvmh': 'MC.PA',
        'sanofi': 'SAN.PA', 'schneider': 'SU.PA', 'loreal': 'OR.PA', 'hermes': 'RMS.PA',
        'bnpp': 'BNP.PA', 'axa': 'CS.PA', 'credit agricole': 'ACA.PA', 'danone': 'BN.PA',
        'orange': 'ORA.PA', 'renault': 'RNO.PA', 'stellantis': 'STLAP.PA', 'neurones': 'NRO',        
        'accor': 'AC', 'mercedes': 'MBG',
        'apple': 'AAPL', 'microsoft': 'MSFT', 'tesla': 'TSLA', 'amazon': 'AMZN',
        'google': 'GOOGL', 'meta': 'META', 'nvidia': 'NVDA', 'realty income': 'O', 'rocket lab': 'RKLB',
        'cw8': 'CW8.PA', 'sp500': 'SPX', 'nasdaq': 'NDX', 'physical gold': 'IGLN', 
        'ishares gold': 'IGLN', 'gold etc': 'IGLN',
        'CGM': 'GMF', 'la premiere brique': 'LPB', 'la premier': 'LPB', 
        'mgp*la premier': 'LPB', 'bricks': 'BRICKS', 'bitstack': 'BTC', 'bitcoin': 'BTC',
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
        
        // Charge les données banque au démarrage si on est sur la vue banque
        this.renderBankSummary(); 
        
        // Écouteur pour mettre à jour la banque quand le budget change (depuis React)
        window.addEventListener('budget-update', () => this.renderBankSummary());
    },

    // --- NOUVELLE LOGIQUE BANQUE ---
    renderBankSummary: async function() {
        // 1. Récupérer le solde initial (sauvegardé ou 0)
        const inputEl = document.getElementById('bankInitialBalance');
        if(!inputEl) return;
        
        let initial = parseFloat(inputEl.value);
        if(isNaN(initial)) {
            // Essayer de charger depuis le stockage local
            const saved = localStorage.getItem('bank_initial_balance');
            initial = saved ? parseFloat(saved) : 0;
            inputEl.value = initial || '';
        } else {
            // Sauvegarder la nouvelle valeur entrée
            localStorage.setItem('bank_initial_balance', initial);
        }

        // 2. Récupérer toutes les données pour calculer les flux du MOIS EN COURS
        // On a besoin du dbService qui est maintenant global (window.dbService)
        const budgetTx = await window.dbService.getAll('budget');
        const investTx = await window.dbService.getAll('invest_tx');
        
        const now = new Date();
        const currentMonth = now.getMonth(); 
        const currentYear = now.getFullYear();

        let income = 0;
        let expense = 0;
        let invested = 0;

        // Calcul Dépenses & Revenus (BudgetScan)
        budgetTx.forEach(t => {
            const d = new Date(t.date);
            if(d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
                if(t.amount > 0) income += t.amount; // Positif = Revenu (Salaire, etc)
                else expense += Math.abs(t.amount);  // Négatif = Dépense
            }
        });

        // Calcul Investissements (Achats Bourse du mois)
        investTx.forEach(t => {
            const d = new Date(t.date);
            if(d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
                if(t.op === 'Achat') invested += (t.qty * t.price);
                // Optionnel: Si vous vendez, ça pourrait être considéré comme du revenu "cash" sur le compte, 
                // mais restons simple pour l'instant.
            }
        });

        // 3. Calcul Final
        const currentBalance = initial + income - expense - invested;

        // 4. Affichage
        document.getElementById('bankCurrentBalance').textContent = currentBalance.toLocaleString('fr-FR', {style:'currency', currency:'EUR'});
        document.getElementById('bankIncome').textContent = `+${income.toFixed(2)} €`;
        document.getElementById('bankExpenses').textContent = `-${expense.toFixed(2)} €`;
        document.getElementById('bankInvest').textContent = `-${invested.toFixed(2)} €`;
    },

    nav: function(id) {
        // Cacher toutes les sections
        document.querySelectorAll('main > section').forEach(el => {
            el.classList.add('hidden');
            el.classList.remove('block');
        });
        
        // Afficher la section demandée
        // Si on demande 'bank', on affiche bank-view
        // Si on demande 'dashboard', on affiche dashboard-view, etc.
        const target = document.getElementById(id + '-view');
        if(target) {
            target.classList.remove('hidden');
            target.classList.add('block');
        } else {
            // Fallback: Si on demande un sous-onglet investissement (ex: assets)
            // On affiche quand même la section, car j'ai gardé les IDs assets-view, transactions-view dans le HTML
            const subTarget = document.getElementById(id + '-view');
            if(subTarget) subTarget.classList.remove('hidden');
        }
        
        // Logique spécifique par vue
        if(id === 'dashboard') { this.calcKPIs(); setTimeout(() => this.renderPie(), 100); }
        if(id === 'assets') this.renderAssets();
        if(id === 'transactions') this.renderTable();
        if(id === 'projections') setTimeout(() => this.renderProjections(), 100);
        if(id === 'bank') { 
            this.renderBankSummary(); 
            // On déclenche aussi un petit event pour React au cas où
            window.dispatchEvent(new Event('budget-update'));
        }
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    loadData: async function() {
        try {
            const txData = await dbService.getAll('invest_tx');
            this.transactions = (txData && txData.length > 0) ? txData : [];
            const priceData = await dbService.getAll('invest_prices');
            priceData.forEach(p => this.currentPrices[p.ticker] = p.price);
        } catch(e) { console.error("Erreur chargement:", e); }
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

    deleteTx: async function(id) { 
        if(confirm('Supprimer cette transaction ?')) { 
            await dbService.delete('invest_tx', id);
            this.transactions = this.transactions.filter(t => t.id !== id);
            this.renderTable(); 
        } 
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
        const totalPerf = invested > 0 ? (diff / invested) * 100 : 0;

        let cagr = 0;
        const dates = this.transactions.map(t => new Date(t.date).getTime());
        if (dates.length > 0 && invested > 0 && currentVal > 0) {
            const firstDate = Math.min(...dates);
            const yearsElapsed = (new Date().getTime() - firstDate) / (1000 * 60 * 60 * 24 * 365.25);
            if (yearsElapsed > 0.1) cagr = (Math.pow(currentVal / invested, 1 / yearsElapsed) - 1) * 100;
            else cagr = totalPerf; 
        }

        if(document.getElementById('kpiTotal')) {
            document.getElementById('kpiTotal').textContent = invested.toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
            document.getElementById('kpiFuture').textContent = currentVal.toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
            
            const diffEl = document.getElementById('kpiDiff');
            diffEl.textContent = `${diff>=0?'+':''}${diff.toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}`;
            diffEl.className = `sub-value ${diff>=0?'text-green-600':'text-red-500'}`;
            
            const perfEl = document.getElementById('kpiReturn');
            perfEl.textContent = `${totalPerf>=0?'+':''}${totalPerf.toFixed(2)} %`;
            perfEl.className = `value ${totalPerf>=0?'text-green-600':'text-red-500'}`;
            if(perfEl.previousElementSibling) perfEl.previousElementSibling.textContent = "Perf. Cumulée Totale";

            let cagrEl = document.getElementById('kpiCagrBadge');
            if (!cagrEl) {
                cagrEl = document.createElement('div');
                cagrEl.id = 'kpiCagrBadge';
                perfEl.parentNode.insertBefore(cagrEl, perfEl.nextSibling);
            }
            const cagrColor = cagr >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800';
            cagrEl.className = `mt-2 inline-block px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wide ${cagrColor}`;
            cagrEl.innerHTML = `Annuel Moy. : ${cagr>=0?'+':''}${cagr.toFixed(2)}%`;
        }
        
        return { invested, currentVal, perf: totalPerf, cagr };
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

        const projectionYears = parseInt(document.getElementById('projYears')?.value) || 20;
        const currentYear = new Date().getFullYear();
        const txYears = this.transactions.map(t => new Date(t.date).getFullYear());
        const startYear = txYears.length > 0 ? Math.min(...txYears) : currentYear;
        const totalYears = (currentYear - startYear) + projectionYears;
        const labels = Array.from({length: totalYears + 1}, (_, i) => startYear + i);

        const kpis = this.calcKPIs();
        let annualRate = 0.05; 
        if (kpis.invested > 0) {
            const yearsSinceStart = Math.max(1, currentYear - startYear);
            const ratio = kpis.currentVal / kpis.invested;
            if(ratio > 0) annualRate = Math.pow(ratio, 1/yearsSinceStart) - 1;
            annualRate = Math.max(-0.20, Math.min(0.30, annualRate));
        }

        const dataInvested = [];
        const dataValue = []; 
        let lastInvested = 0, lastValue = 0;

        labels.forEach(year => {
            if (year <= currentYear) {
                let investedAtYear = 0;
                this.transactions.forEach(t => {
                    if(new Date(t.date).getFullYear() <= year) {
                        if(t.op==='Achat') investedAtYear += t.qty * t.price;
                        if(t.op==='Vente') investedAtYear -= t.qty * t.price;
                    }
                });
                dataInvested.push(investedAtYear);
                lastInvested = investedAtYear;

                if (year === currentYear) {
                    dataValue.push(kpis.currentVal);
                    lastValue = kpis.currentVal;
                } else if (kpis.invested > 0) {
                    const historicalRatio = kpis.currentVal / kpis.invested;
                    dataValue.push(investedAtYear * historicalRatio); 
                } else {
                    dataValue.push(0);
                }
            } else {
                dataInvested.push(lastInvested);
                lastValue = lastValue * (1 + annualRate);
                dataValue.push(lastValue);
            }
        });

        const rateTxt = (annualRate * 100).toFixed(2) + '%';
        this.charts.proj = new Chart(ctx, {
            type: 'line',
            data: { 
                labels, 
                datasets: [
                    { label: `Trajectoire (Taux annuel ${rateTxt})`, data: dataValue, borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.1)', fill: true, tension: 0.4 },
                    { label: 'Historique Estimé', data: dataValue.slice(0, (currentYear - startYear) + 1), borderColor: '#3b82f6', borderDash: [2, 2], fill: false },
                    { label: 'Cumul Investi (Cash)', data: dataInvested, borderColor: '#f97316', borderDash: [5, 5], backgroundColor: 'transparent', pointRadius: 0 }
                ] 
            },
            options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, scales: { y: { ticks: { callback: v => (v/1000).toFixed(0)+'k€' } } } }
        });
        
        this.renderYearlyBar();
        this.renderSectorChart();
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

    renderSectorChart: function() {
        const canvas = document.getElementById('sectorChart') || document.getElementById('frequencyChart');
        if(!canvas) return;
        const ctx = canvas.getContext('2d');
        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();
        if(this.charts.sec) this.charts.sec = null;

        const sectors = {};
        this.transactions.filter(t => t.op === 'Achat').forEach(t => {
            const s = t.sector || 'Autre';
            sectors[s] = (sectors[s] || 0) + (t.qty * t.price);
        });

        if (Object.keys(sectors).length === 0) return;

        this.charts.sec = new Chart(ctx, {
            type: 'polarArea',
            data: { 
                labels: Object.keys(sectors), 
                datasets: [{ data: Object.values(sectors), backgroundColor: ['#3b82f6cc','#10b981cc','#f59e0bcc','#ef4444cc','#8b5cf6cc', '#6366f1cc', '#ec4899cc'], borderWidth: 1 }] 
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 12, font: {size: 11} } } }, scales: { r: { ticks: { display: false }, grid: { color: '#f3f4f6' } } } }
        });
    },

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
                            <div class="text-left">
                                <span class="block text-[10px] text-gray-400 uppercase">PRU</span>
                                <span class="font-mono text-sm text-gray-600">${pru.toFixed(2)} €</span>
                            </div>
                            <div class="text-right">
                                <label class="block text-[10px] text-blue-500 uppercase font-bold mb-1"><i class="fa-solid fa-pen-to-square"></i> Prix Actuel</label>
                                <input type="number" step="0.01" value="${currentPrice.toFixed(2)}" 
                                    onchange="app.updatePrice('${a.name}', this.value, '${a.ticker}')" 
                                    class="w-24 text-right font-bold text-gray-800 border-b-2 border-blue-200 focus:border-blue-500 outline-none bg-transparent">
                            </div>
                        </div>
                        <div class="flex justify-between items-end pt-2">
                            <div>
                                <span class="text-xs text-gray-400 block">Valeur Totale</span>
                                <div class="font-bold text-xl text-gray-800">${totalValue.toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}</div>
                            </div>
                            <div class="text-right">
                                <span class="text-xs text-gray-400 block">Perf</span>
                                <span class="font-bold text-lg ${colorClass}">${isPos ? '+' : ''}${perf.toFixed(2)}%</span>
                                <div class="text-[10px] ${colorClass} opacity-75">(${isPos ? '+' : ''}${gain.toLocaleString('fr-FR',{style:'currency',currency:'EUR'})})</div>
                            </div>
                        </div>
                    </div>
                </div>`;
        });
    },

    renderTable: function() {
        // 1. Gestion du Tableau Desktop
        const tbody = document.querySelector('#transactionsTable tbody');
        // 2. Gestion de la Liste Mobile
        const mobileList = document.getElementById('transactionsMobileList');
        
        if(!tbody || !mobileList) return;
        
        tbody.innerHTML = '';
        mobileList.innerHTML = ''; // On vide aussi la vue mobile
        
        const sorted = [...this.transactions].sort((a,b)=>new Date(b.date)-new Date(a.date));
        
        if(sorted.length === 0) {
            document.getElementById('emptyState')?.classList.remove('hidden');
        } else {
            document.getElementById('emptyState')?.classList.add('hidden');
        }

        sorted.forEach(tx => {
            const total = tx.op==='Dividende' ? tx.price : (tx.qty*tx.price);
            
            // Couleurs des badges
            let badgeColor = 'bg-gray-100 text-gray-800';
            let icon = 'fa-arrow-right';
            if(tx.op === 'Achat') { badgeColor = 'bg-blue-100 text-blue-800'; icon = 'fa-arrow-down'; }
            if(tx.op === 'Vente') { badgeColor = 'bg-emerald-100 text-emerald-800'; icon = 'fa-arrow-up'; } // Vente = Encaissement (Vert)
            if(tx.op === 'Dividende') { badgeColor = 'bg-yellow-100 text-yellow-800'; icon = 'fa-coins'; }

            // --- VUE DESKTOP (Tableau) ---
            tbody.innerHTML += `
                <tr class="bg-white border-b hover:bg-gray-50 transition">
                    <td class="px-4 py-3 font-mono text-xs whitespace-nowrap">${tx.date}</td>
                    <td class="px-4 py-3"><span class="px-2 py-1 rounded text-xs ${badgeColor}">${tx.op}</span></td>
                    <td class="px-4 py-3 font-bold text-gray-700">${tx.name}</td>
                    <td class="px-4 py-3 text-xs text-gray-500">${tx.account||'-'}</td>
                    <td class="px-4 py-3 text-right font-mono">${tx.op==='Dividende'?'-':tx.qty}</td>
                    <td class="px-4 py-3 text-right font-mono text-xs text-gray-400">${tx.price.toFixed(2)}</td>
                    <td class="px-4 py-3 text-right font-bold text-gray-800">${total.toFixed(2)} €</td>
                    <td class="px-4 py-3 text-center whitespace-nowrap">
                        <button onclick="window.app.openModal('edit', ${tx.id})" class="text-blue-500 hover:text-blue-700 mx-1 p-1"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="window.app.deleteTx(${tx.id})" class="text-red-400 hover:text-red-600 mx-1 p-1"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>`;

            // --- VUE MOBILE (Cartes) ---
            mobileList.innerHTML += `
                <div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-2 relative">
                    <div class="flex justify-between items-start">
                        <div class="flex items-center gap-3 overflow-hidden">
                            <div class="w-8 h-8 rounded-full ${badgeColor} flex items-center justify-center flex-shrink-0 text-xs">
                                <i class="fa-solid ${icon}"></i>
                            </div>
                            <div class="truncate">
                                <div class="font-bold text-gray-800 truncate text-sm">${tx.name}</div>
                                <div class="text-[10px] text-gray-400 font-mono">${tx.date} • ${tx.account || 'N/A'}</div>
                            </div>
                        </div>
                        <div class="text-right flex-shrink-0 ml-2">
                            <div class="font-bold text-gray-800 text-sm">${total.toFixed(2)} €</div>
                            <div class="text-[10px] text-gray-400">${tx.op === 'Dividende' ? 'Revenu' : tx.qty + ' x ' + tx.price}</div>
                        </div>
                    </div>
                    
                    <div class="flex justify-end gap-3 mt-2 border-t pt-2 border-gray-50">
                        <button onclick="window.app.openModal('edit', ${tx.id})" class="text-xs font-bold text-blue-600 flex items-center gap-1"><i class="fa-solid fa-pen"></i> Modifier</button>
                        <button onclick="window.app.deleteTx(${tx.id})" class="text-xs font-bold text-red-500 flex items-center gap-1"><i class="fa-solid fa-trash"></i> Suppr.</button>
                    </div>
                </div>`;
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
    
    triggerGlobalExport: async function() {
        this.toast("Export en cours...");
        await dbService.exportFullJSON();
        this.toast("Sauvegarde téléchargée");
    },
    
    triggerGlobalImport: function() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            if(e.target.files[0]) {
                try {
                    this.toast("Restauration...");
                    await dbService.importFullJSON(e.target.files[0]);
                    alert("Restauration réussie ! La page va se recharger.");
                    location.reload();
                } catch(err) {
                    alert("Erreur: " + err);
                }
            }
        };
        input.click();
    },

    setupAutoFill: function() {
        const el = document.getElementById('fName');
        if(el) {
            el.addEventListener('blur', (e) => {
                const val = e.target.value.toLowerCase().trim();
                const tickerInput = document.getElementById('fTicker');
                if(tickerInput.value !== '') return;
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
