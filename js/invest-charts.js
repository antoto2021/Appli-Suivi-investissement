// js/invest-charts.js - Gestion des graphiques

// On s'assure que l'objet global existe
window.app = window.app || {};

// On attache les fonctions graphiques à l'objet app existant
Object.assign(window.app, {

    renderPie: function() {
        const ctx = document.getElementById('pieChart')?.getContext('2d');
        if(!ctx) return;
        if(this.charts.pie) this.charts.pie.destroy();
        
        const acc = {};
        // On regroupe les montants par compte
        this.transactions.filter(t => t.op === 'Achat').forEach(t => {
            // Si le nom du compte est vide, on met "Autre"
            const accountName = t.account || 'Autre';
            acc[accountName] = (acc[accountName] || 0) + (t.qty * t.price);
        });
        
        this.charts.pie = new Chart(ctx, {
            type: 'doughnut',
            data: { 
                labels: Object.keys(acc), 
                datasets: [{ 
                    data: Object.values(acc), 
                    backgroundColor: [
                        '#3b82f6', // Blue
                        '#8b5cf6', // Violet
                        '#10b981', // Emerald
                        '#f59e0b', // Amber
                        '#ef4444', // Red
                        '#ec4899', // Pink
                        '#06b6d4', // Cyan
                        '#84cc16', // Lime
                        '#f97316', // Orange
                        '#6366f1', // Indigo
                        '#14b8a6', // Teal
                        '#64748b'  // Slate (Gris)
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
                        labels: {
                            boxWidth: 12,
                            font: { size: 11 }
                        }
                    } 
                } 
            }
        });
    },

    // 4. Graphique 1 : SIMULATEUR PATRIMOINE (Inspiré de Finary Wealth Simulator)
    // Logique : Calcul mensuel précis pour projeter le patrimoine total
    // Affiche : Patrimoine Nominal (Brut) vs Patrimoine Réel (Ajusté de l'inflation)
    renderWealthSimulator: function() {
        const ctx = document.getElementById('wealthSimulatorChart')?.getContext('2d');
        if(!ctx) return;
        if(this.charts.wealth) this.charts.wealth.destroy();

        // Récupération Inputs
        const initial = parseFloat(document.getElementById('simInitial')?.value) || 0;
        const monthly = parseFloat(document.getElementById('simMonthly')?.value) || 0;
        const yieldPct = parseFloat(document.getElementById('simYield')?.value) / 100 || 0.08;
        const years = parseInt(document.getElementById('simYears')?.value) || 20;
        const inflation = parseFloat(document.getElementById('simInflation')?.value) / 100 || 0;
        const withdrawalRate = parseFloat(document.getElementById('simWithdrawal')?.value) / 100 || 0.04;
        
        const labels = [];
        const dataNominal = [];
        const dataReal = [];
        const currentYear = new Date().getFullYear();

        let balance = initial;
        const monthlyRate = yieldPct / 12;

        for(let i = 0; i <= years; i++) {
            labels.push(currentYear + i);
            dataNominal.push(balance);

            // Valeur Réelle (Ajustée inflation)
            const realValue = balance / Math.pow(1 + inflation, i);
            dataReal.push(realValue);

            // Calcul année suivante (mois par mois)
            if (i < years) {
                for(let m = 0; m < 12; m++) {
                    balance += monthly;
                    balance *= (1 + monthlyRate);
                }
            }
        }

        // --- Calcul de la Rente Mensuelle (Nouveau) ---
        const finalNominal = dataNominal[dataNominal.length-1];
        const monthlyPassiveIncome = (finalNominal * withdrawalRate) / 12;
        
        const elPassive = document.getElementById('simPassiveIncome');
        if(elPassive) elPassive.innerText = monthlyPassiveIncome.toLocaleString('fr-FR', {maximumFractionDigits:0}) + ' €';

        const finalReal = dataReal[dataReal.length-1];
        document.getElementById('finalRealWealth').innerHTML = `
            ${finalReal.toLocaleString('fr-FR', {style:'currency', currency:'EUR', maximumFractionDigits:0})}
            <span class="text-xs text-gray-400 block font-normal">Brut: ${finalNominal.toLocaleString('fr-FR', {style:'currency', currency:'EUR', maximumFractionDigits:0})}</span>
        `;

        this.charts.wealth = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Patrimoine Nominal (Brut)',
                        data: dataNominal,
                        borderColor: '#2563eb',
                        backgroundColor: 'rgba(37, 99, 235, 0.05)',
                        borderWidth: 3,
                        pointRadius: 0,
                        pointHoverRadius: 6,
                        fill: true,
                        tension: 0.4
                    },
                    {
                        label: `Pouvoir d'Achat (Net Inflation ${document.getElementById('simInflation').value}%)`,
                        data: dataReal,
                        borderColor: '#9ca3af',
                        borderWidth: 2,
                        borderDash: [4, 4],
                        pointRadius: 0,
                        fill: false,
                        tension: 0.4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top', align: 'end', labels: { boxWidth: 10, usePointStyle: true } },
                    tooltip: {
                        callbacks: { label: (c) => c.dataset.label + ': ' + Math.round(c.raw).toLocaleString() + ' €' }
                    }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: { border: { display: false }, ticks: { callback: v => (v/1000).toFixed(0) + 'k€' } }
                }
            }
        });
    },

    // 5. Graphique 2 : EFFET BOULE DE NEIGE (Inspiré de Finary Compound Interest)
    // Logique : Stacked Bar pour montrer la part des intérêts vs versements
    renderCompoundInterest: function() {
        const ctx = document.getElementById('compoundInterestChart')?.getContext('2d');
        if(!ctx) return;
        if(this.charts.compound) this.charts.compound.destroy();

        // Récup Inputs
        const initial = parseFloat(document.getElementById('simInitial')?.value) || 0;
        const monthly = parseFloat(document.getElementById('simMonthly')?.value) || 0;
        const yieldPct = parseFloat(document.getElementById('simYield')?.value) / 100 || 0.08;
        const years = parseInt(document.getElementById('simYears')?.value) || 20;

        const labels = [];
        const dInitial = [];    // Base (Gris)
        const dDeposits = [];   // Versements (Bleu)
        const dInterests = [];  // Intérêts (Vert/Violet)
        const currentYear = new Date().getFullYear();

        let balance = initial;
        let totalDeposited = 0; // Cumul des versements SEULS (sans intérêts)
        const monthlyRate = yieldPct / 12;

        for(let i = 0; i <= years; i++) {
            labels.push(currentYear + i);
            
            // 1. La part "Capital Initial" reste fixe visuellement
            dInitial.push(initial);
            
            // 2. La part "Versements" est le cumul pur des ajouts mensuels
            dDeposits.push(totalDeposited);

            // 3. La part "Intérêts" est le reste : (Valeur Totale - (Initial + Versements))
            const totalInterests = balance - (initial + totalDeposited);
            dInterests.push(totalInterests > 0 ? totalInterests : 0);

            // Calcul année suivante (mois par mois)
            if (i < years) {
                for(let m = 0; m < 12; m++) {
                    balance += monthly;           // Ajout au solde réel
                    balance *= (1 + monthlyRate); // Intérêts composés
                    totalDeposited += monthly;    // Suivi des versements seuls
                }
            }
        }

        const finalInterest = dInterests[dInterests.length-1];
        document.getElementById('totalInterests').innerText = finalInterest.toLocaleString('fr-FR', {style:'currency', currency:'EUR', maximumFractionDigits:0});

        this.charts.compound = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Intérêts Composés',
                        data: dInterests,
                        backgroundColor: '#10b981', // Vert Emeraude (Le gain)
                        stack: 'Stack 0'
                    },
                    {
                        label: 'Vos Versements',
                        data: dDeposits,
                        backgroundColor: '#3b82f6', // Bleu (L'effort)
                        stack: 'Stack 0'
                    },
                    {
                        label: 'Capital Initial',
                        data: dInitial,
                        backgroundColor: '#94a3b8', // Gris (Le socle)
                        stack: 'Stack 0'
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                scales: {
                    x: { stacked: true, grid: { display: false } },
                    y: { 
                        stacked: true,
                        border: { display: false },
                        ticks: { callback: v => (v/1000).toFixed(0) + 'k€' }
                    }
                },
                plugins: {
                    legend: { position: 'top', align: 'end', labels: { boxWidth: 10, usePointStyle: true } },
                    tooltip: {
                        backgroundColor: 'rgba(255, 255, 255, 0.9)',
                        titleColor: '#1e293b',
                        bodyColor: '#475569',
                        borderColor: '#e2e8f0',
                        borderWidth: 1,
                        padding: 10,
                        callbacks: {
                            label: (context) => context.dataset.label + ': ' + Math.round(context.raw).toLocaleString() + ' €'
                        }
                    }
                }
            }
        });
    },

    renderProjections: function() {
        const ctx = document.getElementById('mainProjectionChart')?.getContext('2d');
        if(!ctx) return;
        if(this.charts.proj) this.charts.proj.destroy();

        // 1. Récupération de la durée choisie par l'utilisateur
        const projectionYears = parseInt(document.getElementById('projYears')?.value) || 20;
        
        const currentYear = new Date().getFullYear();
        const txYears = this.transactions.map(t => new Date(t.date).getFullYear());
        const startYear = txYears.length > 0 ? Math.min(...txYears) : currentYear;
        
        // Calcul précis de l'ancienneté du portefeuille (en années décimales)
        const dates = this.transactions.map(t => new Date(t.date).getTime());
        const firstTimestamp = dates.length > 0 ? Math.min(...dates) : new Date().getTime();
        const yearsElapsed = (new Date().getTime() - firstTimestamp) / (1000 * 60 * 60 * 24 * 365.25);

        const totalYears = (currentYear - startYear) + projectionYears;
        const labels = Array.from({length: totalYears + 1}, (_, i) => startYear + i);

        const kpis = this.calcKPIs();
        
        // 2. CORRECTION DU TAUX (Calculateur intelligent)
        // Par défaut, on prend 8% (moyenne historique bourse)
        let annualRate = 0.08; 
        
        if (kpis.invested > 0 && yearsElapsed > 0.5) {
            // Si le portefeuille a plus de 6 mois, on calcule le vrai CAGR
            const ratio = kpis.currentVal / kpis.invested;
            // Formule CAGR : (Valeur Finale / Valeur Initiale)^(1/Années) - 1
            const calculatedCagr = Math.pow(ratio, 1/yearsElapsed) - 1;
            
            // On "bride" le taux entre -10% et +15% pour éviter les projections délirantes
            // (ex: si vous avez fait +20% en 1 mois, on ne projette pas +240% par an)
            annualRate = Math.max(-0.10, Math.min(0.15, calculatedCagr));
        }

        const dataInvested = [];
        const dataValue = []; 
        let lastInvested = 0;
        let lastValue = 0;

        labels.forEach(year => {
            if (year <= currentYear) {
                // --- PARTIE PASSÉ (Historique) ---
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
                    // Pour l'année en cours, on prend la VRAIE valeur actuelle
                    dataValue.push(kpis.currentVal);
                    lastValue = kpis.currentVal;
                } else if (kpis.invested > 0) {
                    // Pour le passé, on reconstruit une courbe lissée proportionnelle
                    const historicalRatio = kpis.currentVal / kpis.invested;
                    dataValue.push(investedAtYear * historicalRatio); 
                } else {
                    dataValue.push(0);
                }
            } else {
                // --- PARTIE FUTUR (Projection) ---
                // On garde le montant investi constant (on suppose 0 nouvel apport pour voir l'effet pur des intérêts)
                dataInvested.push(lastInvested);
                
                // Formule Intérêts Composés : Valeur N-1 * (1 + Taux)
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
                        label: `Trajectoire (${rateTxt}/an)`, 
                        data: dataValue, 
                        borderColor: '#8b5cf6', // Violet
                        backgroundColor: 'rgba(139, 92, 246, 0.1)', 
                        fill: true, 
                        tension: 0.4,
                        pointRadius: 0,
                        pointHoverRadius: 6
                    },
                    { 
                        label: 'Cash Investi', 
                        data: dataInvested, 
                        borderColor: '#94a3b8', // Gris
                        borderDash: [5, 5], 
                        borderWidth: 2,
                        backgroundColor: 'transparent', 
                        pointRadius: 0,
                        pointHoverRadius: 0
                    }
                ] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false, 
                interaction: { mode: 'index', intersect: false }, 
                plugins: {
                    legend: { position: 'top' },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                let label = context.dataset.label || '';
                                if (label) label += ': ';
                                if (context.parsed.y !== null) {
                                    label += new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(context.parsed.y);
                                }
                                return label;
                            }
                        }
                    }
                },
                scales: { 
                    y: { 
                        ticks: { callback: v => (v/1000).toFixed(0)+'k€' },
                        grid: { color: '#f3f4f6' }
                    },
                    x: {
                        grid: { display: false }
                    }
                } 
            }
        });
        
        // On relance les autres graphiques annexes si besoin
        this.renderYearlyBar();
        this.renderSectorChart();
    },
    
    renderYearlyBar: function() {
        const ctx = document.getElementById('yearlyBarChart')?.getContext('2d');
        if(!ctx) return;
        if(this.charts.bar) this.charts.bar.destroy();
        
        const yData = {};
        // On ne compte que les ACHATS pour voir l'effort d'épargne réel
        this.transactions.filter(t => t.op === 'Achat').forEach(t => {
            const y = t.date.split('-')[0]; // Extrait l'année "2023" de "2023-05-12"
            yData[y] = (yData[y] || 0) + (t.qty * t.price);
        });
        
        const sortedYears = Object.keys(yData).sort();
        
        this.charts.bar = new Chart(ctx, {
            type: 'bar',
            data: { 
                labels: sortedYears, 
                datasets: [{ 
                    label: 'Montant Investi', 
                    data: sortedYears.map(y => yData[y]), 
                    backgroundColor: '#3b82f6',
                    borderRadius: 4
                }] 
            },
            options: { 
                responsive: true, 
                maintainAspectRatio: false,
                scales: {
                    y: { ticks: { callback: v => (v/1000).toFixed(0) + 'k€' } }
                }
            }
        });
    },

    renderSectorChart: function() {
        const ctx = document.getElementById('sectorChart')?.getContext('2d');
        if(!ctx) return;
        if(this.charts.sec) this.charts.sec.destroy();

        const sectors = {};
        const pf = this.getPortfolio();
        let totalVal = 0;
        
        // 1. Calcul des montants par secteur
        Object.values(pf).forEach(asset => {
            if(asset.qty < 0.001) return;
            const lastTx = this.transactions.find(t => t.ticker === asset.ticker || t.name === asset.name);
            const s = lastTx?.sector || 'Autre';
            
            const price = this.currentPrices[asset.name] || this.currentPrices[asset.ticker] || (asset.invested/asset.qty);
            const val = asset.qty * price;
            
            sectors[s] = (sectors[s] || 0) + val;
            totalVal += val;
        });

        // 2. Conversion en Pourcentages
        const sectorLabels = Object.keys(sectors);
        const sectorPercentages = Object.values(sectors).map(v => ((v / totalVal) * 100).toFixed(1));

        this.charts.sec = new Chart(ctx, {
            type: 'pie', // On passe en "Camembert" classique (plus lisible que PolarArea)
            data: { 
                labels: sectorLabels, 
                datasets: [{ 
                    data: sectorPercentages, // On affiche directement les %
                    backgroundColor: [
                        '#3b82f6', // Blue
                        '#10b981', // Emerald
                        '#f59e0b', // Amber
                        '#ef4444', // Red
                        '#8b5cf6', // Violet
                        '#ec4899', // Pink
                        '#06b6d4', // Cyan
                        '#84cc16', // Lime
                        '#f97316', // Orange
                        '#6366f1', // Indigo
                        '#14b8a6', // Teal
                        '#64748b', // Slate
                        '#d946ef', // Fuchsia
                        '#f43f5e', // Rose
                        '#0ea5e9', // Sky
                        '#22c55e', // Green
                        '#eab308', // Yellow
                        '#a855f7'  // Purple
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

    // 6. Graphique 3 : DECUMULATION (Combien de temps dure l'argent ?)
    renderDrawdownChart: function(finalWealth) {
        const ctx = document.getElementById('drawdownChart')?.getContext('2d');
        if(!ctx) return;
        if(this.charts.drawdown) this.charts.drawdown.destroy();

        // On récupère les paramètres actuels
        const withdrawalRate = parseFloat(document.getElementById('simWithdrawal')?.value) / 100 || 0.04;
        const inflation = parseFloat(document.getElementById('simInflation')?.value) / 100 || 0;
        
        // HYPOTHÈSE RETRAITE : Une fois à la retraite, on investit plus prudemment.
        // On fixe arbitrairement le rendement retraite à 5% (ou on prend le yield actuel - 2%)
        // Ici pour simplifier, disons 5% nominal.
        const retirementYield = 0.05; 

        // Rente annuelle désirée (basée sur le taux de retrait appliqué au capital final)
        // C'est la somme qu'on veut retirer chaque année, ajustée de l'inflation future
        let annualWithdrawal = finalWealth * withdrawalRate;

        // Simulation sur 40 ans de retraite
        const duration = 40;
        const labels = [];
        const dataBalance = [];
        
        let currentCapital = finalWealth;
        let capitalDepletedYear = null;

        for(let i = 1; i <= duration; i++) {
            labels.push(`Année ${i}`);
            
            // 1. Le capital génère des intérêts (prudents)
            currentCapital *= (1 + retirementYield);
            
            // 2. On retire la rente (qui augmente avec l'inflation pour garder le pouvoir d'achat)
            // Note: Pour simplifier l'affichage "Réel", on peut tout garder en monnaie constante,
            // mais ici on simule le nominal pour voir la chute.
            // Approche simplifiée : Capital Réel.
            // Taux Réel = (1+Nominal)/(1+Inflation) - 1
            const realYield = ((1 + retirementYield) / (1 + inflation)) - 1;
            
            // On refait le calcul en "Réel" pour être cohérent avec le graph 1
            // Si on est en "Réel", la rente est FIXE (puisque l'inflation est annulée)
            // Mais le capital ne grandit que du Taux Réel.
        }

        // --- RE-CALCUL PLUS VISUEL (Approche Cash Flow) ---
        // On recommence proprement :
        // On part du Capital Réel Final (pouvoir d'achat).
        // On retire X% de ce capital chaque année (Rente fixe en pouvoir d'achat).
        // Le reste du capital grandit au (Taux Nominal 5% - Inflation).
        
        const realRetirementYield = ((1 + 0.05) / (1 + inflation)) - 1;
        const fixedRealWithdrawal = finalWealth * withdrawalRate;
        
        currentCapital = finalWealth;
        dataBalance.length = 0; // Reset
        labels.length = 0;

        for(let i = 0; i <= duration; i++) {
            labels.push(`+${i} ans`);
            dataBalance.push(Math.max(0, currentCapital));

            if (currentCapital <= 0 && capitalDepletedYear === null) {
                capitalDepletedYear = i;
            }

            // Calcul année suivante
            // Solde = (Solde - Retrait) * (1 + Rendement)
            // On retire l'argent au début de l'année pour vivre
            currentCapital -= fixedRealWithdrawal;
            currentCapital *= (1 + realRetirementYield);
        }

        // Mise à jour du texte indicateur
        const elLongevity = document.getElementById('capitalLongevity');
        if (capitalDepletedYear === null) {
            elLongevity.innerHTML = `<span class="text-green-500">Infinie (Rente Perpétuelle)</span>`;
        } else {
            elLongevity.innerHTML = `<span class="text-orange-500">${capitalDepletedYear} ans</span>`;
        }

        // Couleur des barres : Rouge si épuisé, Bleu sinon
        const colors = dataBalance.map(v => v > 0 ? '#3b82f6' : '#ef4444');

        this.charts.drawdown = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Capital Restant (Pouvoir d\'achat)',
                    data: dataBalance,
                    backgroundColor: colors,
                    borderRadius: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { display: false, min: 0 },
                    x: { grid: { display: false }, ticks: { maxTicksLimit: 10 } }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (c) => 'Reste : ' + Math.round(c.raw).toLocaleString() + ' €'
                        }
                    }
                }
            }
        });
    }

});
