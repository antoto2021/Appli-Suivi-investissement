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
    version: 4, // Force la mise à jour de la structure DB
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

                // NOUVELLE TABLE : Paramètres (pour le solde banque)
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
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
    // NOUVELLE FONCTION POUR VIDER LA DB (pour la restauration)
    async clearAll() {
        await this.init();
        const stores = ['budget', 'invest_tx', 'invest_prices', 'settings'];
        const promises = stores.map(name => {
            return new Promise((resolve) => {
                const tx = this.db.transaction(name, 'readwrite');
                tx.objectStore(name).clear();
                tx.oncomplete = () => resolve();
            });
        });
        await Promise.all(promises);
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
        // CAC 40 & Europe
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
        'mercedes': 'MBG',

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
        'physical gold': 'IGLN', 
        'ishares gold': 'IGLN',  // Ajout d'une variante pour être sûr
        'gold etc': 'IGLN',      // Ajout d'une autre variante
        
        //NON COTÉ & CRYPTO
        // On invente des codes (Tickers) pour que le prix manuel fonctionne
        'CGM': 'GMF',
        'la premiere brique': 'LPB', // Code inventé LPB
        'la premier': 'LPB',         // Variante vue sur votre relevé (MGP*La Premier)
        'mgp*la premier': 'LPB',     // Variante exacte du relevé
        'bricks': 'BRICKS',
        'bitstack': 'BTC',           // On associe Bitstack au Bitcoin par défaut
        'bitcoin': 'BTC',
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

        // 1. Performance Cumulée Totale (Classique : Combien j'ai gagné au total ?)
        const diff = currentVal - invested;
        const totalPerf = invested > 0 ? (diff / invested) * 100 : 0;

        // 2. Taux de Rendement Annuel Moyen (CAGR : Vitesse de croissance par an)
        let cagr = 0;
        const dates = this.transactions.map(t => new Date(t.date).getTime());
        if (dates.length > 0 && invested > 0 && currentVal > 0) {
            const firstDate = Math.min(...dates);
            const now = new Date().getTime();
            const yearsElapsed = (now - firstDate) / (1000 * 60 * 60 * 24 * 365.25);
            
            // Formule CAGR : (ValeurFin / ValeurInit)^(1/n) - 1
            if (yearsElapsed > 0.1) { 
                cagr = (Math.pow(currentVal / invested, 1 / yearsElapsed) - 1) * 100;
            } else {
                cagr = totalPerf; // Si < 1 mois, approx
            }
        }

        // Mise à jour du DOM
        if(document.getElementById('kpiTotal')) {
            document.getElementById('kpiTotal').textContent = invested.toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
            document.getElementById('kpiFuture').textContent = currentVal.toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
            
            const diffEl = document.getElementById('kpiDiff');
            diffEl.textContent = `${diff>=0?'+':''}${diff.toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}`;
            diffEl.className = `sub-value ${diff>=0?'text-green-600':'text-red-500'}`;
            
            // Affichage Perf Cumulée (Gros chiffre)
            const perfEl = document.getElementById('kpiReturn');
            perfEl.textContent = `${totalPerf>=0?'+':''}${totalPerf.toFixed(2)} %`;
            perfEl.className = `value ${totalPerf>=0?'text-green-600':'text-red-500'}`;

            // --- MODIF : Renommer le titre pour être clair ---
            const labelEl = perfEl.previousElementSibling; 
            if(labelEl && labelEl.classList.contains('label')) labelEl.textContent = "Perf. Cumulée Totale";

            // --- AJOUT : Bulle Taux Annuel Moyen (CAGR) ---
            let cagrEl = document.getElementById('kpiCagrBadge');
            if (!cagrEl) {
                cagrEl = document.createElement('div');
                cagrEl.id = 'kpiCagrBadge';
                perfEl.parentNode.insertBefore(cagrEl, perfEl.nextSibling); // Insérer sous le %
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

    // --- PROJECTION UPDATE: Courbes Multiples & Taux Réel ---
    renderProjections: function() {
        const ctx = document.getElementById('mainProjectionChart')?.getContext('2d');
        if(!ctx) return;
        if(this.charts.proj) this.charts.proj.destroy();

        const projectionYears = parseInt(document.getElementById('projYears').value) || 20;
        const currentYear = new Date().getFullYear();
        
        // 1. Déterminer l'année de départ
        const txYears = this.transactions.map(t => new Date(t.date).getFullYear());
        const startYear = txYears.length > 0 ? Math.min(...txYears) : currentYear;
        const totalYears = (currentYear - startYear) + projectionYears;
        const labels = Array.from({length: totalYears + 1}, (_, i) => startYear + i);

        // 2. Calcul du Rendement Réel (CAGR approximatif)
        const kpis = this.calcKPIs();
        let annualRate = 0.05; // Fallback 5%
        
        if (kpis.invested > 0) {
            const yearsSinceStart = Math.max(1, currentYear - startYear);
            const ratio = kpis.currentVal / kpis.invested;
            if(ratio > 0) annualRate = Math.pow(ratio, 1/yearsSinceStart) - 1;
            // Cap de sécurité (-20% à +30%)
            annualRate = Math.max(-0.20, Math.min(0.30, annualRate));
        }

        // 3. Construction des données (Passé & Futur)
        const dataInvested = [];
        const dataValue = []; // Historique lissé + Futur
        
        let lastInvested = 0;
        let lastValue = 0;

        labels.forEach(year => {
            if (year <= currentYear) {
                // --- PASSÉ (Historique) ---
                let investedAtYear = 0;
                this.transactions.forEach(t => {
                    if(new Date(t.date).getFullYear() <= year) {
                        if(t.op==='Achat') investedAtYear += t.qty * t.price;
                        if(t.op==='Vente') investedAtYear -= t.qty * t.price;
                    }
                });
                dataInvested.push(investedAtYear);
                lastInvested = investedAtYear;

                // Reconstruction valeur historique (Interpolation)
                if (year === currentYear) {
                    dataValue.push(kpis.currentVal);
                    lastValue = kpis.currentVal;
                } else if (kpis.invested > 0) {
                    // Ratio de perf actuel appliqué à l'investi de l'époque
                    const historicalRatio = kpis.currentVal / kpis.invested;
                    dataValue.push(investedAtYear * historicalRatio); 
                } else {
                    dataValue.push(0);
                }

            } else {
                // --- FUTUR (Projection) ---
                dataInvested.push(lastInvested); // Cash investi reste plat
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
                    { 
                        label: `Trajectoire Portefeuille (Taux annuel moyen ${rateTxt})`, 
                        data: dataValue, 
                        borderColor: '#8b5cf6', // Violet
                        backgroundColor: 'rgba(139, 92, 246, 0.1)', 
                        fill: true, 
                        tension: 0.4,
                        pointRadius: 2
                    },
                    { 
                        label: 'Historique Valeur (Estimé)', 
                        data: dataValue.slice(0, (currentYear - startYear) + 1), // S'arrête aujourd'hui
                        borderColor: '#3b82f6', // Bleu
                        borderDash: [2, 2], 
                        fill: false,
                        pointRadius: 0
                    },
                    { 
                        label: 'Cumul Investi (Cash)', 
                        data: dataInvested, 
                        borderColor: '#f97316', // Orange
                        borderDash: [5, 5], 
                        backgroundColor: 'transparent',
                        pointRadius: 0,
                        tension: 0.1
                    }
                ] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: { y: { ticks: { callback: v => (v/1000).toFixed(0)+'k€' } } }
            }
        });
        
        this.renderYearlyBar();
        this.renderSectorChart(); // Nouveau graphique
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
        // Cible le nouvel ID 'sectorChart' (ou fallback sur l'ancien 'frequencyChart' si HTML pas jour)
        const canvas = document.getElementById('sectorChart') || document.getElementById('frequencyChart');
        if(!canvas) return;
        const ctx = canvas.getContext('2d');

        // NETTOYAGE CRITIQUE : Vérifie et détruit toute instance existante sur ce canvas
        // C'est souvent ce qui empêche le graphique de s'afficher lors d'un changement de type
        const existingChart = Chart.getChart(canvas);
        if (existingChart) existingChart.destroy();
        
        // Nettoyage des références internes
        if(this.charts.sec) this.charts.sec = null;

        // Calcul des données
        const sectors = {};
        this.transactions.filter(t => t.op === 'Achat').forEach(t => {
            const s = t.sector || 'Autre';
            sectors[s] = (sectors[s] || 0) + (t.qty * t.price);
        });

        // Si aucune donnée, on arrête
        if (Object.keys(sectors).length === 0) return;

        // Création du graphique
        this.charts.sec = new Chart(ctx, {
            type: 'polarArea',
            data: { 
                labels: Object.keys(sectors), 
                datasets: [{ 
                    data: Object.values(sectors), 
                    backgroundColor: ['#3b82f6cc','#10b981cc','#f59e0bcc','#ef4444cc','#8b5cf6cc', '#6366f1cc', '#ec4899cc'],
                    borderWidth: 1
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                plugins: { 
                    legend: { position: 'right', labels: { boxWidth: 12, font: {size: 11} } } 
                },
                scales: { 
                    r: { ticks: { display: false }, grid: { color: '#f3f4f6' } } 
                }
            }
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

    // --- LOGIQUE BANQUE ---
    bankBalance: 0,

    updateBankBalance: async function() {
        const current = await this.getSetting('bankStartBalance') || 0;
        const newVal = prompt("Entrez le solde de référence (ex: début du mois) :", current);
        if(newVal !== null) {
            await dbService.add('settings', { key: 'bankStartBalance', value: parseFloat(newVal) });
            this.renderBank();
        }
    },

    getSetting: async function(key) {
        const data = await dbService.getAll('settings');
        const item = data.find(i => i.key === key);
        return item ? item.value : 0;
    },

    renderBank: async function() {
        // 1. Récupérer le solde de départ
        const startBalance = await this.getSetting('bankStartBalance');
        document.getElementById('bankStartBalance').textContent = startBalance.toLocaleString('fr-FR', {style:'currency', currency:'EUR'});

        // 2. Calculer les totaux Budget (Dépenses) & Revenus (Salaire/Autre positif dans budget)
        const budgetTx = await dbService.getAll('budget');
        let totalBudgetOut = 0;
        let totalIncome = 0;

        // On filtre sur le mois en cours ? Pour l'instant on prend TOUT car le "Solde Initial" est un point fixe absolu
        // Si tu veux gérer par mois, il faudra stocker une date avec le solde initial.
        // Ici version simple : Solde Initial + Tous les mouvements enregistrés = Solde Actuel.
        
        budgetTx.forEach(t => {
            if(t.amount < 0) totalBudgetOut += Math.abs(t.amount);
            else totalIncome += t.amount;
        });

        // 3. Calculer les flux Investissement
        // Achat = Sortie de cash (-), Vente = Entrée de cash (+), Dividende = Entrée (+)
        let totalInvestOut = 0;
        let totalInvestIn = 0;
        
        this.transactions.forEach(t => {
            const total = t.qty * t.price; // Approximation pour Achat/Vente
            if(t.op === 'Achat') totalInvestOut += total;
            else if(t.op === 'Vente') totalInvestIn += total;
            else if(t.op === 'Dividende') totalInvestIn += t.price; // Prix stocke le montant du dividende dans ton code actuel
        });

        // 4. Calcul Final
        // Solde = Départ + (Revenus + Ventes + Dividendes) - (Dépenses + Achats)
        const totalIn = totalIncome + totalInvestIn;
        const finalBalance = startBalance + totalIn - totalBudgetOut - totalInvestOut;

        // 5. Affichage
        document.getElementById('bankCurrentBalance').textContent = finalBalance.toLocaleString('fr-FR', {style:'currency', currency:'EUR'});
        document.getElementById('bankOutBudget').textContent = '-' + totalBudgetOut.toLocaleString('fr-FR', {minimumFractionDigits: 2}) + ' €';
        document.getElementById('bankOutInvest').textContent = '-' + totalInvestOut.toLocaleString('fr-FR', {minimumFractionDigits: 2}) + ' €';
        document.getElementById('bankIn').textContent = '+' + totalIn.toLocaleString('fr-FR', {minimumFractionDigits: 2}) + ' €';
    },

    // AJOUTER L'APPEL A renderBank DANS nav()
    nav: function(id) {
        // ... code existant ...
        if(id === 'bank') this.renderBank(); // <--- AJOUTER ICI
        // ...
    },
};

// =================================================================
// 2. BUDGET SCAN APP (REACT) - VERSION FINALE
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
    const [filterMonth, setFilterMonth] = useState('Tout'); // Filtre Mensuel Ajouté
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
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

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
                    merchant: t.merchant || '' 
                }));
                setTransactions(safeData.sort((a,b) => new Date(b.date) - new Date(a.date)));
            } catch (e) { console.error("Err Budget Load", e); }
        };
        load();
        window.addEventListener('budget-update', load);
        return () => window.removeEventListener('budget-update', load);
    }, []);

    // Auto-détection catégorie
    useEffect(() => {
        if (!newTx.description) return;
        const text = newTx.description.toLowerCase();
        for (const [cat, keywords] of Object.entries(DETECTION_KEYWORDS)) {
            if (keywords.some(k => text.includes(k))) {
                setNewTx(prev => ({ ...prev, category: cat }));
                break;
            }
        }
    }, [newTx.description]);

    // Stats
    const getStats = () => {
        const now = new Date();
        const currentM = now.getMonth();
        const currentY = now.getFullYear();

        const currentTx = transactions.filter(t => {
            const d = new Date(t.date);
            return d.getMonth() === currentM && d.getFullYear() === currentY;
        });

        // Top 5 Enseignes
        const merchants = {};
        currentTx.forEach(t => {
            if (t.amount < 0) {
                const name = t.merchant || t.description;
                merchants[name] = (merchants[name] || 0) + Math.abs(t.amount);
            }
        });
        const top5 = Object.entries(merchants).sort((a, b) => b[1] - a[1]).slice(0, 5);

        // Camembert
        const cats = {};
        currentTx.forEach(t => {
            if (t.amount < 0) cats[t.category] = (cats[t.category] || 0) + Math.abs(t.amount);
        });

        // 6 Derniers mois
        const sixM = {};
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getMonth() + 1}/${d.getFullYear()}`;
            sixM[key] = 0;
        }
        transactions.forEach(t => {
            if (t.amount < 0) {
                const d = new Date(t.date);
                const k = `${d.getMonth() + 1}/${d.getFullYear()}`;
                if (sixM.hasOwnProperty(k)) sixM[k] += Math.abs(t.amount);
            }
        });

        return { currentTx, top5, cats, sixM };
    };

    // Charts
    useEffect(() => {
        if (view !== 'dashboard') return;
        const { cats, sixM } = getStats();

        // Nettoyage Instances
        if(window.bPie instanceof Chart) window.bPie.destroy();
        if(window.bBar instanceof Chart) window.bBar.destroy();

        setTimeout(() => {
            if (pieRef.current) {
                const ctxPie = pieRef.current.getContext('2d');
                window.bPie = new Chart(ctxPie, {
                    type: 'doughnut',
                    data: {
                        labels: Object.keys(cats),
                        datasets: [{
                            data: Object.values(cats),
                            backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b']
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } } } }
                });
            }
            if (barRef.current) {
                const ctxBar = barRef.current.getContext('2d');
                window.bBar = new Chart(ctxBar, {
                    type: 'bar',
                    data: {
                        labels: Object.keys(sixM),
                        datasets: [{
                            label: 'Dépenses',
                            data: Object.values(sixM),
                            backgroundColor: '#10b981',
                            borderRadius: 4
                        }]
                    },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
                });
            }
        }, 100);
    }, [transactions, view]);

    // Actions
    const openAddModal = () => { setNewTx({ description: '', merchant: '', amount: '', date: new Date().toISOString().split('T')[0], category: 'Autre' }); setIsModalOpen(true); };

    const saveManual = async (e) => {
        e.preventDefault();
        if(!newTx.description || !newTx.amount) return;

        const finalMerchant = newTx.merchant || newTx.description; 
        await dbService.add('budget', { 
            id: Date.now(), 
            date: newTx.date, 
            description: newTx.description,
            merchant: finalMerchant,
            amount: -Math.abs(parseFloat(newTx.amount)), 
            category: newTx.category 
        });

        // Apprentissage Enseigne
        if (newTx.merchant && merchantDB[newTx.category]) {
            const currentList = merchantDB[newTx.category];
            const exists = currentList.some(m => m.toLowerCase() === newTx.merchant.toLowerCase());
            if (!exists) {
                const updatedList = [...currentList, newTx.merchant].sort();
                const newDB = { ...merchantDB, [newTx.category]: updatedList };
                setMerchantDB(newDB);
                localStorage.setItem('invest_v5_merchants', JSON.stringify(newDB));
            }
        } else if (newTx.merchant && !merchantDB[newTx.category]) {
            const newDB = { ...merchantDB, [newTx.category]: [newTx.merchant] };
            setMerchantDB(newDB);
            localStorage.setItem('invest_v5_merchants', JSON.stringify(newDB));
        }
        
        setIsModalOpen(false);
        window.dispatchEvent(new Event('budget-update'));
    };

    const updateTx = async (id, f, v) => {
        const tx = transactions.find(t=>t.id===id);
        if(tx) {
            const up = {...tx, [f]:v};
            await dbService.add('budget', up);
            window.dispatchEvent(new Event('budget-update'));
        }
    };
    const deleteTx = async (id) => {
        if(confirm("Supprimer ?")) {
            await dbService.delete('budget', id);
            window.dispatchEvent(new Event('budget-update'));
        }
    };

    // Filtres List
    const availableYears = React.useMemo(() => {
        try { const years = new Set(transactions.map(t => (t.date ? String(t.date).substring(0,4) : '2024'))); return ['Tout', ...Array.from(years).sort().reverse()]; } catch(e) { return ['Tout']; }
    }, [transactions]);

    const filteredList = transactions.filter(t => {
        if(!t.date) return false;
        const d = new Date(t.date);
        const y = d.getFullYear().toString();
        const m = (d.getMonth() + 1).toString();
        const yMatch = filterYear === 'Tout' || y === filterYear;
        const mMatch = filterMonth === 'Tout' || m === filterMonth;
        return yMatch && mMatch;
    });

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
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                            <h3 className="text-sm font-bold text-gray-700 mb-2">Dépenses (6 mois)</h3>
                            <div className="h-48 relative"><canvas ref={barRef}></canvas></div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                                <h3 className="text-sm font-bold text-gray-700 mb-2">Top Dépenses (Ce mois)</h3>
                                <div className="space-y-2">
                                    {top5.map(([n,a], i) => (
                                        <div key={i} className="flex justify-between text-xs items-center border-b border-gray-50 last:border-0 pb-1">
                                            <div className="flex items-center gap-2">
                                                <span className="bg-emerald-100 text-emerald-800 w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold">{i+1}</span>
                                                <span className="truncate flex-1 font-medium text-gray-600">{n}</span>
                                            </div>
                                            <span className="font-bold text-gray-800">{a.toFixed(2)}€</span>
                                        </div>
                                    ))}
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
                        {/* FILTRES */}
                        <div className="bg-white p-3 rounded-xl border border-gray-100 shadow-sm">
                            <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar mb-2 border-b border-gray-50">
                                {availableYears.map(y => (
                                    <button key={y} onClick={() => setFilterYear(y)} 
                                        className={`px-3 py-1 text-xs rounded-full font-bold whitespace-nowrap transition ${filterYear === y ? 'bg-emerald-600 text-white shadow-sm' : 'bg-gray-50 text-gray-600 border border-gray-200'}`}>
                                        {y}
                                    </button>
                                ))}
                            </div>
                            <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                                <button onClick={() => setFilterMonth('Tout')} className={`px-3 py-1 text-xs rounded-full font-bold whitespace-nowrap transition ${filterMonth === 'Tout' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-white text-gray-500 border border-gray-100'}`}>Tous</button>
                                {monthNames.map((m, i) => (
                                    <button key={i} onClick={() => setFilterMonth((i+1).toString())} 
                                        className={`px-3 py-1 text-xs rounded-full font-bold whitespace-nowrap transition ${filterMonth === (i+1).toString() ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-white text-gray-500 border border-gray-100'}`}>
                                        {m}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex justify-between items-center px-1">
                            <h3 className="text-xs font-bold text-gray-400 uppercase">
                                {filterMonth !== 'Tout' ? monthNames[parseInt(filterMonth)-1] : ''} {filterYear}
                            </h3>
                            <span className="text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">{filteredList.length} ops</span>
                        </div>

                        <div className="space-y-2">
                            {filteredList.length === 0 ? (<div className="text-center py-10 bg-white rounded-xl border border-dashed border-gray-200"><p className="text-sm text-gray-400">Aucune donnée pour cette période.</p></div>) : (
                                filteredList.map(t => (
                                    <div key={t.id} className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm flex flex-col gap-2 relative group hover:border-emerald-200 transition">
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="flex-1 overflow-hidden">
                                                <input type="text" value={t.merchant || t.description} readOnly className="font-bold text-gray-700 bg-transparent w-full focus:outline-none text-sm truncate" />
                                                <div className="text-[10px] text-gray-400 italic truncate">{t.description}</div>
                                            </div>
                                            <input type="number" step="0.01" value={t.amount} onChange={(e)=>updateTx(t.id,'amount',parseFloat(e.target.value))} className={`text-right w-20 font-mono font-bold bg-transparent focus:outline-none rounded ${t.amount<0?'text-slate-700':'text-emerald-600'}`} />
                                        </div>
                                        <div className="flex justify-between items-center text-xs mt-1">
                                            <div className="flex gap-2 items-center flex-wrap">
                                                <input type="date" value={t.date} onChange={(e)=>updateTx(t.id,'date',e.target.value)} className="text-gray-400 bg-transparent border-none p-0" />
                                                <select value={t.category} onChange={(e)=>updateTx(t.id,'category',e.target.value)} className="text-[10px] px-2 py-0.5 rounded bg-gray-50 text-gray-500 uppercase font-bold border border-gray-100 outline-none">
                                                    {Object.keys(DETECTION_KEYWORDS).concat(['Autre', 'Import']).map(c=><option key={c} value={c}>{c}</option>)}
                                                </select>
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

            {/* MODALE D'AJOUT MANUEL */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl overflow-hidden animate-fade-in">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-gray-800">Ajout Intelligent</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                        </div>
                        <form onSubmit={saveManual} className="p-5 space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
                                <input type="text" required placeholder="Ex: Resto, Courses..." className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                    value={newTx.description} onChange={e => setNewTx({...newTx, description: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Montant (€)</label>
                                    <input type="number" step="0.01" required placeholder="0.00" className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={newTx.amount} onChange={e => setNewTx({...newTx, amount: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Date</label>
                                    <input type="date" required className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                        value={newTx.date} onChange={e => setNewTx({...newTx, date: e.target.value})} />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1 flex justify-between">
                                    <span>Catégorie</span>{newTx.description && <span className="text-emerald-600 text-[10px] italic">Détecté auto</span>}
                                </label>
                                <select className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none bg-white font-bold text-gray-700"
                                    value={newTx.category} onChange={e => setNewTx({...newTx, category: e.target.value})}>
                                    {Object.keys(DETECTION_KEYWORDS).concat(['Autre']).map(c => (<option key={c} value={c}>{c}</option>))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Enseigne (Optionnel)</label>
                                <input type="text" list="merchants-list" placeholder="Sélectionner ou écrire..." className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                    value={newTx.merchant} onChange={e => setNewTx({...newTx, merchant: e.target.value})} />
                                <datalist id="merchants-list">{(merchantDB[newTx.category] || []).map((m, idx) => (<option key={idx} value={m} />))}</datalist>
                            </div>
                            <button type="submit" className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-700 transition mt-2">Valider</button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

// =================================================================
// 3. IA MODULE (PDF/IMG) - CORRECTIF SELECTION MODÈLES
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
        
        btn.innerText = '...'; 
        btn.disabled = true;

        try {
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
            const data = await r.json();
            
            if(!r.ok) throw new Error(data.error?.message || 'Clé invalide');

            // Filtrer uniquement les modèles capables de générer du contenu
            let models = (data.models || []).filter(m => m.supportedGenerationMethods?.includes('generateContent'));

            // --- TRI INTELLIGENT ---
            // On force Gemini 1.5 Flash en premier, puis Pro, et on relègue les modèles expérimentaux (robotics, etc.) à la fin
            models.sort((a,b) => {
                const getScore = (m) => {
                    const n = (m.displayName || m.name).toLowerCase();
                    if (n.includes('flash') && n.includes('1.5')) return 100; // Priorité Absolue
                    if (n.includes('pro') && n.includes('1.5')) return 90;
                    if (n.includes('gemini-pro')) return 80;
                    return 0; // Les modèles expérimentaux auront 0
                };
                return getScore(b) - getScore(a);
            });

            if (models.length === 0) throw new Error("Aucun modèle compatible trouvé.");

            this.usableModels = models;
            this.apiKey = key;

            // Afficher le modèle qui sera utilisé pour rassurer
            const bestModelName = this.usableModels[0].displayName || this.usableModels[0].name.split('/').pop();
            document.getElementById('gemini-status').innerHTML = `<span class="text-green-600 font-bold">✅ Prêt (${bestModelName})</span>`;
            document.getElementById('ai-step-2').classList.remove('hidden');

        } catch(e) {
            document.getElementById('gemini-status').innerHTML = `<span class="text-red-600 font-bold">❌ ${e.message}</span>`;
        } finally {
            btn.innerText = 'Vérifier'; 
            btn.disabled = false;
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
        document.getElementById('ai-console').innerHTML = ''; 
        this.log("Analyse IA en cours...");

        // Liste des catégories valides pour aider l'IA
        const validCats = ['Alimentation', 'Restauration', 'Transport', 'Logement', 'Loisirs', 'Salaire', 'Investissement', 'Autre'];
        
        const prompt = `
            Analyse ce document. Extrais TOUTES les transactions.
            RÈGLES :
            1. JSON Array STRICT : [{"date":"YYYY-MM-DD", "description":"Libellé", "merchant":"Enseigne", "amount":-10.00, "category":"Autre"}]
            2. "merchant" : Nom court de l'enseigne (ex: Uber, Leclerc).
            3. "category" : Choisis parmi : ${validCats.join(', ')}.
            4. Dépenses en NÉGATIF.
        `;

        let success = false;

        // Boucle sur les modèles triés (Flash en premier)
        for(const model of this.usableModels) {
            const modelName = model.name.split('/').pop();
            this.log(`Tentative avec ${modelName}...`);
            
            try {
                // Endpoint standard
                const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.apiKey}`;
                
                const payload = {
                    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: this.currentMimeType, data: this.fileBase64 } }] }],
                    generationConfig: { temperature: 0.1, response_mime_type: "application/json" }
                };

                const res = await fetch(url, {
                    method: 'POST', 
                    headers: {'Content-Type': 'application/json'}, 
                    body: JSON.stringify(payload)
                });

                if(!res.ok) {
                    const errData = await res.json();
                    throw new Error(errData.error?.message || res.statusText);
                }

                const d = await res.json();
                if(!d.candidates || !d.candidates[0].content) throw new Error("Réponse vide.");

                let raw = d.candidates[0].content.parts[0].text;
                const match = raw.match(/\[[\s\S]*\]/);
                if(match) raw = match[0];

                const json = JSON.parse(raw);
                this.extracted = Array.isArray(json) ? json : [json];

                this.log(`Succès ! ${this.extracted.length} éléments trouvés.`, 'success');
                this.renderPreview();
                success = true;
                break; // On sort de la boucle si ça marche

            } catch(e) {
                // Affichage détaillé de l'erreur
                this.log(`Échec : ${e.message}`, 'error');
            }
        }

        if(!success) {
            this.log("Aucun modèle n'a réussi à lire l'image.", 'error');
            alert("Impossible d'extraire les données. Vérifiez votre clé API ou le format de l'image.");
        }
    },

    renderPreview: function() {
        const t = document.getElementById('ai-preview-table');
        document.getElementById('ai-count').innerText = `${this.extracted.length} lignes`;
        
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
                merchant: item.merchant || item.description || '',
                amount: parseFloat(item.amount) || 0,
                category: item.category || 'Autre'
            });
            count++;
        }
        
        this.close();
        window.dispatchEvent(new Event('budget-update'));
        alert(`${count} transactions importées !`);
    }
};

// =================================================================
// 4. INFO MODULE
// =================================================================

const infoModule = {
    config: { username: 'antoto2021', repo: 'Suivi-investissement' },
    
    init: async function() { 
        this.renderLocalInfo(); 
        this.calcStorage();
        setTimeout(() => this.checkGitHub(true), 3000); 
    },

    openModal: function() { 
        document.getElementById('info-modal-overlay').classList.remove('hidden'); 
        this.renderLocalInfo(); 
        this.calcStorage();
        this.checkGitHub(false); 
    },
    
    closeModal: function() { document.getElementById('info-modal-overlay').classList.add('hidden'); },
    
    renderLocalInfo: function() { 
        document.getElementById('info-local-v').innerText = localStorage.getItem('app_version_hash')?.substring(0,7) || 'Init'; 
    },

    // --- NOUVEAU : Calcul taille stockage ---
    calcStorage: async function() {
        const estSize = new Blob([JSON.stringify(await this.getFullDump())]).size;
        let unit = 'B';
        let val = estSize;
        if(val > 1024) { val /= 1024; unit = 'KB'; }
        if(val > 1024) { val /= 1024; unit = 'MB'; }
        document.getElementById('storageSize').innerText = `${val.toFixed(2)} ${unit}`;
    },

    // --- NOUVEAU : Sauvegarde JSON ---
    getFullDump: async function() {
        const stores = ['budget', 'invest_tx', 'invest_prices', 'settings'];
        const dump = {};
        for(const s of stores) {
            dump[s] = await dbService.getAll(s);
        }
        dump.meta = { date: new Date().toISOString(), version: 4 };
        return dump;
    },

    exportData: async function() {
        const data = await this.getFullDump();
        const blob = new Blob([JSON.stringify(data, null, 2)], {type : 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `InvestTrack_Backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        app.toast("Sauvegarde téléchargée !");
    },

    // --- NOUVEAU : Restauration JSON ---
    importData: function(e) {
        const file = e.target.files[0];
        if(!file) return;
        
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if(!data.meta || !data.budget) throw new Error("Format invalide");
                
                if(confirm(`Restaurer la sauvegarde du ${data.meta.date} ?\nATTENTION : Cela écrasera les données actuelles !`)) {
                    await dbService.clearAll();
                    
                    // Réinjection
                    if(data.budget) for(const i of data.budget) await dbService.add('budget', i);
                    if(data.invest_tx) for(const i of data.invest_tx) await dbService.add('invest_tx', i);
                    if(data.invest_prices) for(const i of data.invest_prices) await dbService.add('invest_prices', i);
                    if(data.settings) for(const i of data.settings) await dbService.add('settings', i);
                    
                    alert("Restauration terminée ! La page va se recharger.");
                    window.location.reload();
                }
            } catch(ex) {
                alert("Erreur fichier : " + ex.message);
            }
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset input
    },

    checkGitHub: function(bg=false) {
        // ... (Code existant identique) ...
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
        // ... (Code existant identique) ...
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
