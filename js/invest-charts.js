// js/invest-charts.js
// Ce fichier gère uniquement l'affichage des graphiques (Chart.js)

window.app = window.app || {};

// On étend l'objet window.app avec les fonctions graphiques
Object.assign(window.app, {

    // 1. Graphique Camembert : Répartition par Compte (PEA, CTO, Crypto...)
    renderPie: function() {
        const ctx = document.getElementById('pieChart')?.getContext('2d');
        if(!ctx) return;
        
        // Nettoyage ancien graph
        if(this.charts.pie) this.charts.pie.destroy();

        const assets = this.getPortfolio();
        const accounts = {};
        
        // On additionne les montants par type de compte
        Object.values(assets).forEach(a => {
            const price = this.currentPrices[a.name] || this.currentPrices[a.ticker] || (a.invested/a.qty);
            const val = a.qty * price;
            if(val > 1) { // On ignore les poussières
                const acc = a.account || 'Autre';
                accounts[acc] = (accounts[acc] || 0) + val;
            }
        });

        this.charts.pie = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: Object.keys(accounts),
                datasets: [{
                    data: Object.values(accounts),
                    backgroundColor: ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'],
                    borderWidth: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'right' }
                }
            }
        });
    },

    // 2. Graphique Secteurs (Version Pourcentages)
    renderSectorChart: function() {
        const ctx = document.getElementById('sectorChart')?.getContext('2d');
        if(!ctx) return;
        if(this.charts.sec) this.charts.sec.destroy();

        const sectors = {};
        const pf = this.getPortfolio();
        let totalVal = 0;
        
        // Calcul des montants par secteur
        Object.values(pf).forEach(asset => {
            if(asset.qty < 0.001) return;
            // On cherche le secteur dans la dernière transaction connue de cet actif
            const lastTx = this.transactions.find(t => t.ticker === asset.ticker || t.name === asset.name);
            const s = asset.sector || (lastTx ? lastTx.sector : 'Autre') || 'Autre';
            
            const price = this.currentPrices[asset.name] || this.currentPrices[asset.ticker] || (asset.invested/asset.qty);
            const val = asset.qty * price;
            
            sectors[s] = (sectors[s] || 0) + val;
            totalVal += val;
        });

        // Conversion en Pourcentages
        const sectorLabels = Object.keys(sectors);
        const sectorPercentages = Object.values(sectors).map(v => ((v / totalVal) * 100).toFixed(1));

        this.charts.sec = new Chart(ctx, {
            type: 'pie',
            data: { 
                labels: sectorLabels, 
                datasets: [{ 
                    data: sectorPercentages,
                    backgroundColor: [
                        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
                        '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1', 
                        '#14b8a6', '#64748b', '#d946ef', '#f43f5e', '#0ea5e9', 
                        '#22c55e', '#eab308', '#a855f7'
                    ],
                    borderWidth: 1
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                plugins: { 
                    legend: { 
                        position: 'right', 
                        labels: { boxWidth: 12, font: {size: 11} } 
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return ' ' + context.label + ': ' + context.raw + ' %';
                            }
                        }
                    }
                }
            }
        });
    },

    // 3. Graphique Barres : Historique Cash Investi par Année
    renderYearlyBar: function() {
        const ctx = document.getElementById('yearlyBarChart')?.getContext('2d');
        if(!ctx) return;
        if(this.charts.bar) this.charts.bar.destroy();

        const years = {};
        // On parcourt tout l'historique
        this.transactions.forEach(t => {
            if(t.op === 'Achat' || t.op === 'DCA') {
                const y = t.date.substring(0, 4);
                years[y] = (years[y] || 0) + (t.price * t.qty);
            }
            // Optionnel : Soustraire les ventes ? 
            // years[y] -= (t.price * t.qty) pour le Net Invested
        });

        const sortedYears = Object.keys(years).sort();
        
        this.charts.bar = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: sortedYears,
                datasets: [{
                    label: 'Cash Investi (€)',
                    data: sortedYears.map(y => years[y]),
                    backgroundColor: '#3b82f6',
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } }
            }
        });
    },

    // --- GRAPHIQUES DE L'ONGLET PROJECTIONS (SIMULATEUR PATRIMOINE) ---

    // 4. Graphique : Projection Patrimoine (Réel vs Inflation)
    renderWealthChart: function(labels, nominalData, realData) {
        const ctx = document.getElementById('wealthSimulatorChart')?.getContext('2d');
        if(!ctx) return;
        if(this.charts.wealth) this.charts.wealth.destroy();

        this.charts.wealth = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Patrimoine Nominal (Brut)',
                        data: nominalData,
                        borderColor: '#8b5cf6', // Violet
                        backgroundColor: 'rgba(139, 92, 246, 0.1)',
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: 'Pouvoir d\'Achat Réel (Ajusté Inflation)',
                        data: realData,
                        borderColor: '#10b981', // Emerald
                        borderDash: [5, 5],
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    y: {
                        ticks: { callback: (v) => v >= 1000 ? (v/1000).toFixed(0)+'k€' : v }
                    }
                }
            }
        });
    },

    // 5. Graphique : Intérêts Composés (Capital vs Intérêts)
    renderCompoundChart: function(labels, principalData, interestData) {
        const ctx = document.getElementById('compoundInterestChart')?.getContext('2d');
        if(!ctx) return;
        if(this.charts.compound) this.charts.compound.destroy();

        this.charts.compound = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Capital Versé (Effort épargne)',
                        data: principalData,
                        backgroundColor: '#94a3b8', // Slate
                        stack: 'Stack 0'
                    },
                    {
                        label: 'Intérêts Cumulés (Gains)',
                        data: interestData,
                        backgroundColor: '#10b981', // Emerald
                        stack: 'Stack 0'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { stacked: true },
                    y: { 
                        stacked: true,
                        ticks: { callback: (v) => v >= 1000 ? (v/1000).toFixed(0)+'k€' : v }
                    }
                }
            }
        });
    },

    // 6. Graphique : Retraite (Phase de consommation)
    renderDrawdownChart: function(labels, capitalCurve) {
        const ctx = document.getElementById('drawdownChart')?.getContext('2d');
        if(!ctx) return;
        if(this.charts.drawdown) this.charts.drawdown.destroy();

        this.charts.drawdown = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Capital Restant',
                    data: capitalCurve,
                    borderColor: '#3b82f6',
                    backgroundColor: (context) => {
                        const ctx = context.chart.ctx;
                        const gradient = ctx.createLinearGradient(0, 0, 0, 300);
                        gradient.addColorStop(0, 'rgba(59, 130, 246, 0.2)');
                        gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
                        return gradient;
                    },
                    fill: true,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    }

});
