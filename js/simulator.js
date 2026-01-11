// js/simulator.js - Module de Simulation d'Investissement

window.simulator = {
    currentAsset: null,
    charts: {},

    // 1. Ouvre la modale et pré-remplit les données
    open: function(assetName) {
        this.currentAsset = assetName;
        
        // Récupérer les infos actuelles depuis l'app principale
        const portfolio = window.app.getPortfolio();
        const asset = portfolio[assetName];
        const currentPrice = window.app.currentPrices[asset.ticker || assetName] || (asset.invested / asset.qty);

        // Remplir l'UI - Infos Actuelles
        document.getElementById('sim-asset-name').innerText = assetName;
        document.getElementById('sim-current-qty').innerText = parseFloat(asset.qty).toFixed(4);
        document.getElementById('sim-current-pru').innerText = (asset.invested / asset.qty).toFixed(2) + ' €';
        document.getElementById('sim-current-price').value = currentPrice.toFixed(2); // Pré-rempli mais modifiable

        // Reset Inputs
        document.getElementById('sim-mode').value = 'unique';
        this.toggleMode();
        document.getElementById('sim-amount').value = '';
        
        // Afficher Modale
        document.getElementById('simulator-modal').classList.remove('hidden');
        
        // Premier calcul à vide
        this.calculate();
    },

    close: function() {
        document.getElementById('simulator-modal').classList.add('hidden');
    },

    toggleMode: function() {
        const mode = document.getElementById('sim-mode').value;
        if(mode === 'dca') {
            document.getElementById('sim-dca-options').classList.remove('hidden');
            document.getElementById('lbl-amount').innerText = 'Montant Mensuel (€)';
        } else {
            document.getElementById('sim-dca-options').classList.add('hidden');
            document.getElementById('lbl-amount').innerText = 'Montant Investissement (€)';
        }
        this.calculate();
    },

    // 2. Cœur du réacteur : Les Calculs
    calculate: function() {
        const portfolio = window.app.getPortfolio();
        const asset = portfolio[this.currentAsset];
        if(!asset) return;

        // Entrées
        const mode = document.getElementById('sim-mode').value;
        const marketPrice = parseFloat(document.getElementById('sim-current-price').value) || 0;
        const amount = parseFloat(document.getElementById('sim-amount').value) || 0;
        
        // Données Actuelles
        const curQty = asset.qty;
        const curInvested = asset.invested;
        const curPRU = curInvested / curQty;

        // Calculs Projetés
        let newQty = curQty;
        let newInvested = curInvested;
        let finalPRU = curPRU;
        
        const projectionData = []; 

        if (mode === 'unique') {
            // Achat Unique
            const qtyBought = amount / marketPrice;
            newInvested += amount;
            newQty += qtyBought;
            finalPRU = newInvested / newQty;

            projectionData.push({ x: 'Actuel', y: curPRU });
            projectionData.push({ x: 'Projeté', y: finalPRU });

        } else {
            // DCA
            const duration = parseInt(document.getElementById('sim-duration').value) || 12; 
            const annualTrend = parseFloat(document.getElementById('sim-trend').value) / 100; 
            const monthlyTrend = annualTrend / 12;

            let simPrice = marketPrice;
            projectionData.push({ x: 'Mois 0', pr: curPRU, val: curInvested });

            for(let i = 1; i <= duration; i++) {
                simPrice = simPrice * (1 + monthlyTrend);
                const qtyBought = amount / simPrice;
                newInvested += amount;
                newQty += qtyBought;
                const stepPRU = newInvested / newQty;
                
                projectionData.push({ 
                    x: `Mois ${i}`, 
                    pru: stepPRU, 
                    price: simPrice,
                    val: newQty * simPrice 
                });
            }
            finalPRU = newInvested / newQty;
        }

        // --- MISE À JOUR UI RÉSULTATS ---
        
        // 1. PRU (Avec écart)
        const pruEl = document.getElementById('res-new-pru');
        const pruDiffEl = document.getElementById('res-pru-diff');
        pruEl.innerText = finalPRU.toFixed(2) + ' €';
        
        if(finalPRU < curPRU) {
            pruEl.className = "text-base md:text-lg font-black text-emerald-600";
            pruDiffEl.innerHTML = `<i class="fa-solid fa-arrow-down"></i> -${(curPRU - finalPRU).toFixed(2)}€`;
            pruDiffEl.className = "mt-1 inline-block text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded";
        } else if (finalPRU > curPRU) {
            pruEl.className = "text-base md:text-lg font-black text-orange-500";
            pruDiffEl.innerHTML = `<i class="fa-solid fa-arrow-up"></i> +${(finalPRU - curPRU).toFixed(2)}€`;
            pruDiffEl.className = "mt-1 inline-block text-[9px] font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded";
        } else {
            pruEl.className = "text-base md:text-lg font-black text-slate-800";
            pruDiffEl.innerHTML = "Inchangé";
            pruDiffEl.className = "mt-1 inline-block text-[9px] text-slate-400";
        }

        // 2. QUANTITÉ (Avec gain d'actifs)
        document.getElementById('res-qty').innerText = newQty.toFixed(4);
        
        const gainedQty = newQty - curQty;
        const qtyDiffEl = document.getElementById('res-qty-diff');
        if(gainedQty > 0) {
            qtyDiffEl.innerHTML = `<i class="fa-solid fa-plus"></i> ${gainedQty.toFixed(4)}`;
            qtyDiffEl.className = "mt-1 inline-block text-[9px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded";
        } else {
            qtyDiffEl.innerHTML = "-";
            qtyDiffEl.className = "mt-1 inline-block text-[9px] text-slate-300";
        }

        // 3. POIDS (Avec augmentation %)
        const kpis = window.app.calcKPIs(); 
        const totalPortfolioNow = kpis.currentVal;
        
        // Poids Actuel (Basé sur le prix simulé pour comparer ce qui est comparable)
        const currentValAsset = curQty * marketPrice;
        const currentWeight = totalPortfolioNow > 0 ? (currentValAsset / totalPortfolioNow) * 100 : 0;

        // Poids Futur
        const addedValue = (newInvested - curInvested); 
        const totalPortfolioFuture = totalPortfolioNow + addedValue; 
        const futureValAsset = newQty * marketPrice; 
        const futureWeight = totalPortfolioFuture > 0 ? (futureValAsset / totalPortfolioFuture) * 100 : 0;
        
        const weightDiff = futureWeight - currentWeight;

        const weightEl = document.getElementById('res-weight');
        weightEl.innerText = futureWeight.toFixed(1) + ' %';
        
        // Alerte Poids > 15% (Rouge) sinon Violet
        if(futureWeight > 15) weightEl.className = "text-base md:text-lg font-bold text-red-600";
        else weightEl.className = "text-base md:text-lg font-bold text-purple-600";

        const weightDiffEl = document.getElementById('res-weight-diff');
        if(weightDiff > 0.01) {
            weightDiffEl.innerHTML = `<i class="fa-solid fa-arrow-up"></i> +${weightDiff.toFixed(1)}%`;
            weightDiffEl.className = "mt-1 inline-block text-[9px] font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded";
        } else {
            weightDiffEl.innerHTML = "-";
            weightDiffEl.className = "mt-1 inline-block text-[9px] text-slate-300";
        }

        // 4. Graphiques
        this.renderCharts(mode, curPRU, finalPRU, marketPrice, projectionData);
    },

    renderCharts: function(mode, oldPRU, newPRU, marketPrice, data) {
        const ctx = document.getElementById('simChart').getContext('2d');
        if(this.charts.main) this.charts.main.destroy();

        if (mode === 'unique') {
            // Graphique Barres : PRU vs Prix Marché
            this.charts.main = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: ['Ancien PRU', 'Nouveau PRU', 'Prix Marché'],
                    datasets: [{
                        label: 'Prix (€)',
                        data: [oldPRU, newPRU, marketPrice],
                        backgroundColor: [
                            '#94a3b8', // Gris
                            newPRU < oldPRU ? '#10b981' : '#f59e0b', // Vert si baisse, Orange si hausse
                            '#3b82f6'  // Bleu
                        ],
                        borderRadius: 6,
                        barThickness: 40
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: false } }
                }
            });
        } else {
            // Graphique Ligne : Évolution DCA (PRU vs Prix)
            this.charts.main = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: data.map(d => d.x),
                    datasets: [
                        {
                            label: 'Votre PRU Moyen',
                            data: data.map(d => d.pru),
                            borderColor: '#8b5cf6', // Violet
                            borderWidth: 3,
                            tension: 0.4
                        },
                        {
                            label: 'Prix Action (Simulé)',
                            data: data.map(d => d.price),
                            borderColor: '#94a3b8', // Gris
                            borderDash: [5, 5],
                            borderWidth: 2,
                            tension: 0.4
                        }
                    ]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    scales: { y: { beginAtZero: false } }
                }
            });
        }
    }
};
