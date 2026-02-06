window.app = {
    transactions: [],
    currentPrices: {},
    charts: {},
    simData: { monthlySavings: 0, initialized: false },
    assetFilter: 'Tout',
    
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
        if(document.getElementById('dailyTip')) this.loadDailyTip();
        this.setupAutoFill();
        this.renderTable();
        
        // Charge les données banque au démarrage si on est sur la vue banque
        this.renderBankSummary(); 
        
        // Écouteur pour mettre à jour la banque quand le budget change (depuis React)
        window.addEventListener('budget-update', () => this.renderBankSummary());
    },

    init: async function() {
        console.log("Démarrage App Bourse...");
        await this.loadData();
        
        // --- NOUVEAU : On génère les lignes DCA manquantes ---
        await this.checkAndGenerateDCA();
        // ----------------------------------------------------

        if(document.getElementById('dailyTip')) this.loadDailyTip();
        this.setupAutoFill();
        this.renderTable();
        this.renderBankSummary(); 
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
        const target = document.getElementById(id + '-view');
        if(target) {
            target.classList.remove('hidden');
            target.classList.add('block');
        } else {
            const subTarget = document.getElementById(id + '-view');
            if(subTarget) subTarget.classList.remove('hidden');
        }
        
        // Logique spécifique par vue
        if(id === 'dashboard') { 
            this.calcKPIs(); 
            setTimeout(() => { 
                this.renderPie(); 
                this.renderSectorChart(); 
                this.renderYearlyBar(); 
            }, 100); 
        }
        if(id === 'assets') this.renderAssets();
        if(id === 'transactions') this.renderTable();
        
        // --- LA LIGNE MANQUANTE EST ICI ---
        if(id === 'dividends') this.renderDividends();
        // ----------------------------------

        if(id === 'projections') { 
            this.initSimulatorInputs(); 
            requestAnimationFrame(() => this.updateSimulations()); 
        }
        
        if(id === 'bank') { 
            this.renderBankSummary(); 
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

    // Vérifie les DCA et génère les transactions d'achat pour les échéances passées
    checkAndGenerateDCA: async function() {
        console.log("--- Début vérification DCA (Mode Strict) ---");
        const now = new Date();
        let changesMade = false;

        // On filtre les configurations DCA
        const dcaMasters = this.transactions.filter(t => t.op === 'DCA');

        for (const master of dcaMasters) {
            const startDate = new Date(master.date);
            // Sécurités pour éviter les boucles infinies
            const durationMonths = parseInt(master.dcaDuration) || 12;
            const freqPerMonth = parseInt(master.dcaFreq) || 1;
            
            // Calcul du montant unitaire
            const totalOccurrences = durationMonths * freqPerMonth;
            const amountPerExec = master.dcaTotal / totalOccurrences;

            // Boucle sur chaque occurrence théorique
            for (let i = 0; i < totalOccurrences; i++) {
                
                // --- CALCUL DE DATE PRÉCIS (MOIS PAR MOIS) ---
                let targetDate = new Date(startDate);
                
                if(freqPerMonth === 1) {
                    // Si mensuel : on ajoute i mois pile
                    targetDate.setMonth(startDate.getMonth() + i);
                } else {
                    // Si fréquence élevée (hebdo/bi-mensuel) : on garde l'ajout de jours
                    const daysInterval = 30 / freqPerMonth;
                    targetDate.setDate(startDate.getDate() + Math.round(i * daysInterval));
                }

                // Si la date est dans le futur, on arrête
                if (targetDate > now) break;

                const dateStr = targetDate.toISOString().split('T')[0];
                
                // --- LA VÉRIFICATION ANTI-DOUBLON (SIMPLIFIÉE) ---
                // On cherche s'il existe DÉJÀ une ligne dans le journal qui correspond
                const exists = this.transactions.some(t => 
                    t.op === 'Achat' &&            // C'est un achat
                    t.name === master.name &&      // Du même actif
                    t.date === dateStr             // À la même date
                );

                if (exists) {
                    // console.log(`Déjà fait : ${master.name} le ${dateStr}`);
                    continue; // On passe au suivant
                }

                // --- CRÉATION SI INEXISTANT ---
                console.log(`[NOUVEAU] Génération DCA : ${master.name} le ${dateStr}`);
                
                const estimatedPrice = this.currentPrices[master.ticker] || this.currentPrices[master.name] || master.price || 100;
                
                const newTx = {
                    id: Date.now() + Math.random(), // ID unique
                    date: dateStr,
                    op: 'Achat',
                    name: master.name,
                    ticker: master.ticker,
                    account: master.account,
                    sector: master.sector,
                    qty: amountPerExec / estimatedPrice,
                    price: estimatedPrice,
                    // On ajoute ces tags pour info, mais on ne base plus la vérif dessus
                    dcaRef: `dca-${master.id}-${i}`, 
                    isAutoDCA: true
                };

                await window.dbService.add('invest_tx', newTx);
                this.transactions.push(newTx);
                changesMade = true;
            }
        }

        if (changesMade) {
            this.toast("Journal mis à jour (DCA) ✅");
            this.renderTable();
        }
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
        
        // On trie par date pour que le calcul du PRU soit chronologique et juste
        const sortedTxs = [...this.transactions].sort((a,b) => new Date(a.date) - new Date(b.date));

        sortedTxs.forEach(tx => {
            // ON IGNORE LES MASTERS DCA (Ce sont juste des configs maintenant)
            if(tx.op === 'DCA' || tx.op === 'Dividende') return;

            if(!assets[tx.name]) assets[tx.name] = { 
                name: tx.name, qty: 0, invested: 0, ticker: tx.ticker||'', account: tx.account || 'Autre'
            };
            
            if(tx.op === 'Achat') {
                assets[tx.name].qty += tx.qty;
                assets[tx.name].invested += (tx.qty * tx.price);
                // Met à jour le compte avec le dernier mouvement
                if(tx.account) assets[tx.name].account = tx.account; 
            } 
            else if(tx.op === 'Vente') {
                // Calcul du PRU avant la vente pour sortir la bonne valeur
                const pru = assets[tx.name].qty > 0 ? (assets[tx.name].invested / assets[tx.name].qty) : 0;
                assets[tx.name].qty -= tx.qty;
                // On sort du capital investi à hauteur du PRU (pas du prix de vente)
                assets[tx.name].invested -= (tx.qty * pru);
            }
        });

        // Nettoyage des petits résidus de flottants (ex: 0.0000001)
        Object.keys(assets).forEach(k => {
            if(assets[k].qty < 0.0001) delete assets[k];
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

    // --- NOUVELLE LOGIQUE SIMULATEUR & PROJECTIONS ---

    // 1. Calculer l'épargne moyenne historique pour pré-remplir
    calcAverageSavings: function() {
        if(this.transactions.length < 2) return 100; // Valeur par défaut
        
        // On cherche le premier et dernier achat
        const sorted = [...this.transactions].sort((a,b) => new Date(a.date) - new Date(b.date));
        const firstDate = new Date(sorted[0].date);
        const lastDate = new Date();
        
        // Nombre de mois écoulés
        const months = (lastDate.getFullYear() - firstDate.getFullYear()) * 12 + (lastDate.getMonth() - firstDate.getMonth());
        const effectiveMonths = Math.max(1, months);

        // Total investi (Cash sorti de la poche)
        let totalInvested = 0;
        this.transactions.forEach(t => {
            if(t.op === 'Achat') totalInvested += (t.qty * t.price);
            if(t.op === 'Vente') totalInvested -= (t.qty * t.price); // On simplifie
        });

        return Math.round(totalInvested / effectiveMonths);
    },

        // 2. Initialiser les champs du simulateur avec les données réelles
    initSimulatorInputs: function() {
        // On force la récupération des valeurs même si déjà initialisé
        const elInit = document.getElementById('simInitial');
        const elMonth = document.getElementById('simMonthly');
        
        let currentVal = 0; 
        let avgSave = 100;

        try {
            const kpis = this.calcKPIs();
            currentVal = Math.round(kpis.currentVal || 0);
            avgSave = this.calcAverageSavings() || 100;
        } catch(e) { console.warn("Données non prêtes", e); }

        // Remplissage si les champs sont vides
        if(elInit && !elInit.value) elInit.value = currentVal;
        if(elMonth && !elMonth.value) elMonth.value = avgSave;

        this.simData.initialized = true;
    },

    // 3. Fonction principale appelée par les inputs "onchange"
        updateSimulations: function() {
        // On lance d'abord le simulateur de patrimoine
        this.renderWealthSimulator();
        this.renderCompoundInterest();

        // ASTUCE : On recalcule le patrimoine final "Réel" ici pour le passer au graphique de rente
        // (C'est le même calcul que dans renderWealthSimulator, mais on a besoin de la valeur)
        const initial = parseFloat(document.getElementById('simInitial')?.value) || 0;
        const monthly = parseFloat(document.getElementById('simMonthly')?.value) || 0;
        const yieldPct = parseFloat(document.getElementById('simYield')?.value) / 100 || 0.08;
        const years = parseInt(document.getElementById('simYears')?.value) || 20;
        const inflation = parseFloat(document.getElementById('simInflation')?.value) / 100 || 0;
        
        let balance = initial;
        const monthlyRate = yieldPct / 12;

        for(let i = 0; i < years; i++) { // Loop simple sur les années
             for(let m = 0; m < 12; m++) {
                balance += monthly;
                balance *= (1 + monthlyRate);
            }
        }
        
        // Ajustement inflation pour avoir le "Vrai" capital de départ de la retraite
        const finalRealWealth = balance / Math.pow(1 + inflation, years);

        // On lance le graphique de décaissement avec cette valeur
        this.renderDrawdownChart(finalRealWealth);
    },
   
    renderAssetFilters: function() {
        const container = document.getElementById('assetFilterContainer');
        if(!container) return;

        // 1. Récupérer la liste unique des comptes présents dans les transactions
        const uniqueAccounts = new Set(this.transactions.map(t => t.account || 'Autre').filter(a => a.trim() !== ''));
        const accounts = ['Tout', ...Array.from(uniqueAccounts).sort()];

        // 2. Générer le HTML des boutons
        container.innerHTML = accounts.map(acc => {
            const isActive = this.assetFilter === acc;
            const style = isActive 
                ? 'bg-blue-600 text-white shadow-md border-blue-600' 
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50';
            
            return `<button onclick="window.app.setAssetFilter('${acc}')" 
                    class="px-4 py-1.5 text-xs font-bold rounded-full transition whitespace-nowrap border ${style}">
                    ${acc}
                </button>`;
        }).join('');
    },

    setAssetFilter: function(acc) {
        this.assetFilter = acc;
        this.renderAssets(); // On relance l'affichage avec le nouveau filtre
    },
    
    renderAssets: function() {
        const grid = document.getElementById('assetsGrid');
        if(!grid) return;
        
        this.renderAssetFilters();
        grid.innerHTML = '';
        
        const assets = this.getPortfolio();
        let sortedAssets = Object.values(assets).sort((a,b) => b.invested - a.invested);

        if (this.assetFilter !== 'Tout') {
            sortedAssets = sortedAssets.filter(a => a.account === this.assetFilter);
        }

        if (sortedAssets.length === 0) {
            grid.innerHTML = `<div class="col-span-full text-center text-gray-400 py-10">Aucun actif trouvé pour "${this.assetFilter}".</div>`;
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

            // Badge DCA
            const dcaBadge = a.activeDCA 
                ? `<span class="inline-flex items-center gap-1 bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded-full border border-indigo-200 shadow-sm animate-pulse ml-2">
                     <i class="fa-solid fa-hourglass-half"></i> DCA
                   </span>` 
                : '';

            grid.innerHTML += `
                <div class="bg-white rounded-xl shadow-sm border ${borderClass} overflow-hidden flex flex-col relative group animate-fade-in">
                    
                    <div class="p-4 border-b border-gray-100 flex justify-between items-start bg-slate-50">
                        
                        <div class="overflow-hidden flex-1">
                            <div class="flex items-center">
                                <h3 class="font-bold text-gray-800 text-lg truncate" title="${a.name}">${a.name}</h3>
                                ${dcaBadge}
                            </div>
                            <div class="flex gap-2 mt-1">
                                <span class="text-[10px] font-mono bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-bold">${a.ticker || 'N/A'}</span>
                                <span class="text-[10px] bg-gray-200 text-gray-600 px-2 py-0.5 rounded font-bold">${a.account}</span>
                            </div>
                        </div>

                        <div class="text-right flex flex-col items-end gap-2 pl-2">
                             <button onclick="window.simulator.open('${a.name}')" class="bg-white text-blue-500 hover:bg-blue-600 hover:text-white border border-blue-200 w-8 h-8 rounded-lg flex items-center justify-center shadow-sm transition md:opacity-0 md:group-hover:opacity-100" title="Simuler un achat">
                                <i class="fa-solid fa-calculator text-sm"></i>
                            </button>

                            <div>
                                 <div class="text-xs text-gray-400 uppercase font-bold">Qté</div>
                                 <div class="font-mono font-bold text-gray-700">${parseFloat(a.qty).toFixed(4).replace(/\.?0+$/,'')}</div>
                            </div>
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
                                    class="w-20 text-right font-bold text-gray-800 border-b-2 border-blue-200 focus:border-blue-500 outline-none bg-transparent">
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
        const tbody = document.querySelector('#transactionsTable tbody');
        const mobileList = document.getElementById('transactionsMobileList');
        if(!tbody || !mobileList) return;
        
        tbody.innerHTML = '';
        mobileList.innerHTML = ''; 
        
        const sorted = [...this.transactions].sort((a,b)=>new Date(b.date)-new Date(a.date));
        
        if(sorted.length === 0) document.getElementById('emptyState')?.classList.remove('hidden');
        else document.getElementById('emptyState')?.classList.add('hidden');

        sorted.forEach(tx => {
            let total = tx.op==='Dividende' ? tx.price : (tx.qty*tx.price);
            let badgeColor = 'bg-gray-100 text-gray-800';
            let icon = 'fa-arrow-right';
            let details = tx.qty + ' x ' + tx.price;
            let statusHTML = '';

            // --- LOGIQUE DCA ---
            if(tx.op === 'DCA') {
                badgeColor = 'bg-indigo-100 text-indigo-800';
                icon = 'fa-rotate';
                total = tx.dcaTotal || 0;
                details = `${tx.dcaDuration} mois • ${tx.dcaFreq}/mois`;

                // Calcul Sablier (Temps restant)
                const startDate = new Date(tx.date);
                const endDate = new Date(startDate);
                endDate.setMonth(startDate.getMonth() + (tx.dcaDuration || 0));
                
                const now = new Date();
                const diffTime = endDate - now;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                if (diffDays > 0) {
                    const monthsLeft = Math.floor(diffDays / 30);
                    const label = monthsLeft > 0 ? `${monthsLeft} mois` : `${diffDays} jours`;
                    statusHTML = `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full border border-indigo-100"><i class="fa-solid fa-hourglass-half"></i> Reste ${label}</span>`;
                } else {
                    statusHTML = `<span class="inline-flex items-center gap-1 text-[10px] font-bold text-green-600 bg-green-50 px-2 py-1 rounded-full border border-green-100"><i class="fa-solid fa-check"></i> Terminé</span>`;
                }
            } else if(tx.op === 'Achat') { 
                badgeColor = 'bg-blue-100 text-blue-800'; icon = 'fa-arrow-down'; 
            } else if(tx.op === 'Vente') { 
                badgeColor = 'bg-emerald-100 text-emerald-800'; icon = 'fa-arrow-up'; 
            } else if(tx.op === 'Dividende') { 
                badgeColor = 'bg-yellow-100 text-yellow-800'; icon = 'fa-coins'; details = 'Revenu';
            }

            // Affichage Desktop
            tbody.innerHTML += `
                <tr class="bg-white border-b hover:bg-gray-50 transition">
                    <td class="px-4 py-3 font-mono text-xs whitespace-nowrap">${tx.date}</td>
                    <td class="px-4 py-3"><span class="px-2 py-1 rounded text-xs ${badgeColor}">${tx.op}</span></td>
                    <td class="px-4 py-3 font-bold text-gray-700">${tx.name} <div class="md:hidden">${statusHTML}</div></td>
                    <td class="px-4 py-3 text-xs text-gray-500">${tx.account||'-'}</td>
                    <td class="px-4 py-3 text-right font-mono">${tx.op==='DCA' ? '<i class="fa-solid fa-infinity text-xs text-gray-400"></i>' : (tx.op==='Dividende'?'-':tx.qty)}</td>
                    <td class="px-4 py-3 text-right font-mono text-xs text-gray-400">${tx.price > 0 ? tx.price.toFixed(2) : '-'}</td>
                    <td class="px-4 py-3 text-right font-bold text-gray-800">${total.toFixed(2)} €</td>
                    <td class="px-4 py-3 text-center whitespace-nowrap">
                        <div class="hidden md:block mb-1">${statusHTML}</div>
                        <button onclick="window.app.openModal('edit', ${tx.id})" class="text-blue-500 hover:text-blue-700 mx-1 p-1"><i class="fa-solid fa-pen"></i></button>
                        <button onclick="window.app.deleteTx(${tx.id})" class="text-red-400 hover:text-red-600 mx-1 p-1"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>`;

            // Affichage Mobile
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
                            <div class="text-[10px] text-gray-400">${details}</div>
                        </div>
                    </div>
                    ${tx.op === 'DCA' ? `<div class="mt-1 flex justify-end">${statusHTML}</div>` : ''}
                    <div class="flex justify-end gap-3 mt-2 border-t pt-2 border-gray-50">
                        <button onclick="window.app.openModal('edit', ${tx.id})" class="text-xs font-bold text-blue-600 flex items-center gap-1"><i class="fa-solid fa-pen"></i> Modifier</button>
                        <button onclick="window.app.deleteTx(${tx.id})" class="text-xs font-bold text-red-500 flex items-center gap-1"><i class="fa-solid fa-trash"></i> Suppr.</button>
                    </div>
                </div>`;
        });
    },

    // Calcule la quantité d'actions détenue à une date précise
    // Amélioration : Vérifie le NOM ou le TICKER
    getQtyAtDate: function(assetName, assetTicker, dateStr) {
        const targetDate = new Date(dateStr);
        let qty = 0;
        
        // On trie pour rejouer l'histoire chronologiquement
        const sorted = [...this.transactions].sort((a,b) => new Date(a.date) - new Date(b.date));
        
        for (const tx of sorted) {
            if (new Date(tx.date) > targetDate) break;
            
            // LA CORRECTION EST ICI :
            // On considère que c'est le bon actif si le Nom match OU si le Ticker match
            const isMatch = (tx.name === assetName) || (assetTicker && tx.ticker && tx.ticker === assetTicker);
            
            if (isMatch) {
                if (tx.op === 'Achat' || tx.op === 'DCA') qty += tx.qty;
                if (tx.op === 'Vente') qty -= tx.qty;
            }
        }
        return qty;
    },
    
    renderDividends: function() {
        const container = document.getElementById('dividendCards');
        if(!container) return;
        
        container.innerHTML = '';
        const assets = this.getPortfolio();
        let found = false;
        
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        Object.values(assets).forEach(a => {
            if(a.qty < 0.01) return;

            // 1. FILTRE : On cherche les dividendes de cet actif
            const txs = this.transactions.filter(t => 
                t.op === 'Dividende' && (
                    t.name === a.name || 
                    (a.ticker && t.ticker && t.ticker === a.ticker)
                )
            );
            
            if (txs.length === 0) return;
            found = true;

            let projectedAnnual = 0;
            let totalReceivedLast12m = 0;
            const historyByYear = {};

            // --- 2. TRAITEMENT DES DONNÉES (CORRECTION ICI) ---
            txs.forEach(t => {
                const year = t.date.substring(2, 4); // "23", "24"
                
                // CORRECTION : On multiplie le Prix par la Quantité pour avoir le TOTAL REÇU
                // (Si vous n'avez pas mis de quantité, on assume 1 par défaut)
                const realAmountReceived = t.price * (t.qty || 1);

                // Calcul sommes 12 derniers mois
                if(new Date(t.date) >= oneYearAgo) {
                    totalReceivedLast12m += realAmountReceived;
                }

                // Aggrégation pour le Graphique
                if(!historyByYear[year]) historyByYear[year] = 0;
                historyByYear[year] += realAmountReceived;
            });

            // --- 3. PROJECTION FUTURE ---
            const recentDivs = txs.filter(t => new Date(t.date) >= oneYearAgo);
            
            if (recentDivs.length > 0) {
                let annualUnitDiv = 0;
                recentDivs.forEach(tx => {
                    const realAmountReceived = tx.price * (tx.qty || 1);
                    
                    // On recalcule le dividende par action historique
                    // (Montant Total Reçu / Nombre d'actions possédées CE JOUR LÀ)
                    const qtyOwnedAtDate = this.getQtyAtDate(a.name, a.ticker, tx.date);
                    
                    if (qtyOwnedAtDate > 0) {
                        annualUnitDiv += (realAmountReceived / qtyOwnedAtDate);
                    }
                });
                projectedAnnual = annualUnitDiv * a.qty;
            } else {
                // Cas : Pas de dividende récent = Projection 0 (Alert)
                projectedAnnual = 0;
            }

            // --- 4. AFFICHAGE ---
            const pru = a.invested / a.qty;
            const yieldPct = pru > 0 ? ((projectedAnnual / (a.qty * pru)) * 100).toFixed(2) : 0;
            const border = this.strColor(a.name, 60, 50);

            // Génération Histogramme
            let chartHtml = '';
            const years = Object.keys(historyByYear).sort();
            
            if (years.length > 0) {
                const maxVal = Math.max(...Object.values(historyByYear));
                const bars = years.map(y => {
                    const val = historyByYear[y];
                    const heightPct = (val / maxVal) * 100;
                    const finalHeight = Math.max(heightPct, 15); 
                    
                    return `
                        <div class="flex flex-col items-center justify-end group w-6 cursor-help">
                            <div class="w-full opacity-60 group-hover:opacity-100 transition-all rounded-t-sm relative" 
                                    style="height:${finalHeight}%; background-color: ${border};">
                                    <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block bg-slate-800 text-white text-[8px] p-1 rounded whitespace-nowrap z-20">
                                    20${y}: ${val.toFixed(2)}€
                                    </div>
                            </div>
                            <span class="text-[8px] text-gray-400 mt-1">20${y}</span>
                        </div>
                    `;
                }).join('');
                chartHtml = `<div class="flex items-end gap-1 h-12 mt-2 border-b border-gray-100 pb-1">${bars}</div>`;
            }

            const receivedHtml = totalReceivedLast12m > 0 
                ? `<span class="text-[9px] font-normal text-gray-400 block mt-0.5">Reçu (12m): ${totalReceivedLast12m.toFixed(2)}€</span>`
                : '';

            container.innerHTML += `
                <div class="bg-white rounded-xl shadow-sm border p-4 relative overflow-visible flex flex-col justify-between h-auto" 
                     style="border-color:${border}; border-width:1px; border-left-width:4px;">
                    
                    <div class="flex justify-between font-bold z-10 relative" style="color:${border}">
                        <span class="truncate pr-2 text-sm text-gray-800">${a.name}</span>
                        <span class="text-[9px] bg-gray-100 text-gray-500 px-1 rounded border border-gray-200">${a.ticker || 'N/A'}</span>
                    </div>
                    
                    <div class="z-10 relative mb-1">
                        ${chartHtml}
                    </div>
                    
                    <div class="z-10 relative mt-1 flex justify-between items-end">
                        <div>
                            <p class="text-[9px] text-gray-500 uppercase font-bold tracking-wider">Rente Future</p>
                            <p class="text-xl font-black text-gray-800 leading-none">${projectedAnnual.toLocaleString('fr-FR', {style:'currency', currency:'EUR'})}</p>
                            ${receivedHtml}
                        </div>
                        <div class="text-right">
                            <p class="text-[9px] text-gray-500 uppercase">Yield</p>
                            <p class="font-bold text-gray-700 text-sm">${yieldPct}%</p>
                        </div>
                    </div>
                </div>`;
        });

        if(!found) {
            container.innerHTML = `
                <div class="col-span-full flex flex-col items-center justify-center text-gray-300 py-12">
                    <i class="fa-solid fa-chart-bar text-4xl mb-3 opacity-20"></i>
                    <p class="text-sm">Aucun historique de dividende détecté.</p>
                </div>`;
        }
    },
    
    openModal: function(mode, id=null) {
        document.getElementById('modalForm').classList.remove('hidden');
        document.getElementById('editIndex').value = id !== null ? id : '';
        document.getElementById('modalTitle').textContent = mode==='new' ? 'Nouvelle Transaction' : 'Modifier Transaction';
        
        // Reset fields logic
        document.getElementById('standardFields').classList.remove('hidden');
        document.getElementById('dcaFields').classList.add('hidden');

        if(mode==='new') {
            document.getElementById('fDate').value = new Date().toISOString().split('T')[0];
            ['fName','fTicker','fAccount','fSector','fQty','fPrice','fDcaDuration','fDcaTotal'].forEach(id => document.getElementById(id).value = '');
            document.getElementById('fOp').value = 'Achat';
            document.getElementById('fDcaFreq').value = '1';
        } else {
            const tx = this.transactions.find(t => t.id == id);
            if(tx) {
                document.getElementById('fDate').value = tx.date;
                document.getElementById('fOp').value = tx.op;
                document.getElementById('fName').value = tx.name;
                document.getElementById('fTicker').value = tx.ticker||'';
                document.getElementById('fAccount').value = tx.account||'';
                document.getElementById('fSector').value = tx.sector||'';
                
                // Gestion affichage si c'est un DCA existant
                if (tx.op === 'DCA') {
                    this.toggleDCAFields();
                    document.getElementById('fDcaDuration').value = tx.dcaDuration || '';
                    document.getElementById('fDcaFreq').value = tx.dcaFreq || '1';
                    document.getElementById('fDcaTotal').value = tx.dcaTotal || '';
                } else {
                    document.getElementById('fQty').value = tx.qty;
                    document.getElementById('fPrice').value = tx.price;
                }
            }
        }
    },
    
    closeModal: function() { document.getElementById('modalForm').classList.add('hidden'); },
    
    saveTransaction: async function() {
        const idVal = document.getElementById('editIndex').value;
        const op = document.getElementById('fOp').value;
        
        const tx = {
            id: idVal ? parseFloat(idVal) : null,
            date: document.getElementById('fDate').value,
            op: op,
            name: document.getElementById('fName').value,
            ticker: document.getElementById('fTicker').value,
            account: document.getElementById('fAccount').value,
            sector: document.getElementById('fSector').value,
            qty: parseFloat(document.getElementById('fQty').value)||0,
            price: parseFloat(document.getElementById('fPrice').value)||0,
            // Nouveaux champs DCA
            dcaDuration: op === 'DCA' ? parseFloat(document.getElementById('fDcaDuration').value) : null,
            dcaFreq: op === 'DCA' ? parseFloat(document.getElementById('fDcaFreq').value) : null,
            dcaTotal: op === 'DCA' ? parseFloat(document.getElementById('fDcaTotal').value) : null
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
                    // 1. Gestion de la Date
                    let d = row['Date'] || row['Date_Entrée'];
                    if(typeof d === 'number') {
                        // Conversion date Excel (nombre) vers JS
                        d = new Date(Math.round((d - 25569) * 86400 * 1000)).toISOString().split('T')[0];
                    }

                    // 2. Gestion Intelligente du Ticker
                    // Priorité 1 : Le ticker est dans le fichier Excel (Colonne 'Ticker')
                    let finalTicker = '';
                    if (row['Ticker'] && typeof row['Ticker'] === 'string') {
                        finalTicker = row['Ticker'].trim();
                    }

                    // Priorité 2 : Si pas de ticker dans le fichier, on tente la détection auto via le Nom
                    if (!finalTicker) {
                        const lowerName = (row['Nom actif'] || '').toLowerCase();
                        for (const [key, t] of Object.entries(this.tickerDB)) {
                            if (lowerName.includes(key)) { 
                                finalTicker = t; 
                                break; 
                            }
                        }
                    }

                    // 3. Gestion du Secteur (Colonne 'Secteur' ou 'Sector')
                    const sector = row['Secteur'] || row['Sector'] || '';

                    const tx = {
                        date: d || new Date().toISOString().split('T')[0],
                        op: row['Operation'] || 'Achat',
                        name: row['Nom actif'] || 'Inconnu',
                        qty: parseFloat(row['Quantité']) || 0,
                        price: parseFloat(row['Prix unitaire']) || 0,
                        account: row['Compte'] || '',
                        ticker: finalTicker, // Le ticker déterminé ci-dessus
                        sector: sector       // Le secteur lu dans le fichier
                    };

                    if(tx.qty > 0 || tx.op === 'Dividende') { 
                        await this.addTransaction(tx); 
                        count++; 
                    }
                }
                this.toast(`${count} importés avec succès`); 
                this.renderTable();
            } catch(e) { 
                alert("Erreur import Excel: " + e.message); 
            }
            e.target.value = ''; // Reset pour permettre de réimporter le même fichier si besoin
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
    
    toggleDCAFields: function() {
        const op = document.getElementById('fOp').value;
        const isDCA = op === 'DCA';
        const std = document.getElementById('standardFields');
        const dca = document.getElementById('dcaFields');
        
        if (isDCA) {
            std.classList.add('hidden');
            dca.classList.remove('hidden');
            // On force les champs classiques à 0 pour ne pas perturber les calculs si on repasse en DCA
            document.getElementById('fQty').value = 0;
            document.getElementById('fPrice').value = 0;
        } else {
            std.classList.remove('hidden');
            dca.classList.add('hidden');
        }
    },

    searchTicker: function() { const n = document.getElementById('fName').value; if(n) window.open(`https://www.google.com/search?q=ticker+${encodeURIComponent(n)}`, '_blank'); },
    strColor: function(s,l,d) { let h=0; for(let i=0;i<s.length;i++)h=s.charCodeAt(i)+((h<<5)-h); return `hsl(${h%360},${l}%,${d}%)`; },
    loadDailyTip: function() { document.getElementById('dailyTip').textContent = `"${this.tips[new Date().getDate()%this.tips.length]}"`; },
    toast: function(m) { const t=document.getElementById('toast'); document.getElementById('toastMsg').textContent=m; t.classList.remove('translate-y-20','opacity-0'); setTimeout(()=>t.classList.add('translate-y-20','opacity-0'),2500); }
};
