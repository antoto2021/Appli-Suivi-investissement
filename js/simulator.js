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
        
        const projectionData = []; // Pour le graphique

        if (mode === 'unique') {
            // SCÉNARIO 1 : ACHAT UNIQUE
            const qtyBought = amount / marketPrice;
            newInvested += amount;
            newQty += qtyBought;
            finalPRU = newInvested / newQty;

            // Données graphiques simples (Avant / Après)
            projectionData.push({ x: 'Actuel', y: curPRU });
            projectionData.push({ x: 'Projeté', y: finalPRU });

        } else {
            // SCÉNARIO 2 : DCA (Projection temporelle)
            const duration = parseInt(document.getElementById('sim-duration').value) || 12; // Mois
            // Hypothèse : Le prix évolue linéairement selon le trend choisi (ex: +5% par an)
            const annualTrend = parseFloat(document.getElementById('sim-trend').value) / 100; // 0.05
            const monthlyTrend = annualTrend / 12;

            let simPrice = marketPrice;
            
            // Point de départ
            projectionData.push({ x: 'Mois 0', pr: curPRU, val: curInvested });

            for(let i = 1; i <= duration; i++) {
                // Le prix du marché évolue
                simPrice = simPrice * (1 + monthlyTrend);
                
                // On achète
                const qtyBought = amount / simPrice;
                newInvested += amount;
                newQty += qtyBought;
                
                // Le PRU évolue
                const stepPRU = newInvested / newQty;
                
                projectionData.push({ 
                    x: `Mois ${i}`, 
                    pru: stepPRU, 
                    price: simPrice,
                    val: newQty * simPrice // Valeur totale portefeuille
                });
            }
            finalPRU = newInvested / newQty;
        }

        // 3. Mise à jour UI Résultats
        
        // A. PRU
        const pruEl = document.getElementById('res-new-pru');
        pruEl.innerText = finalPRU.toFixed(2) + ' €';
        // Couleur : Vert si on baisse le PRU, Rouge si on l'augmente
        if(finalPRU < curPRU) {
            pruEl.className = "text-2xl font-black text-emerald-600";
            document.getElementById('res-pru-diff').innerHTML = `<i class="fa-solid fa-arrow-down"></i> -${(curPRU - finalPRU).toFixed(2)}€`;
            document.getElementById('res-pru-diff').className = "text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded";
        } else {
            pruEl.className = "text-2xl font-black text-orange-500";
            document.getElementById('res-pru-diff').innerHTML = `<i class="fa-solid fa-arrow-up"></i> +${(finalPRU - curPRU).toFixed(2)}€`;
            document.getElementById('res-pru-diff').className = "text-xs font-bold text-orange-600 bg-orange-50 px-2 py-1 rounded";
        }

        // B. Poids dans le portefeuille
        // On doit recalculer le total global du portefeuille
        const kpis = window.app.calcKPIs(); 
        const totalPortfolioNow = kpis.currentVal;
        const addedValue = (newInvested - curInvested); // Cash ajouté
        const totalPortfolioFuture = totalPortfolioNow + addedValue; // Approx (on ajoute le cash investi au total)

        const futureValAsset = newQty * marketPrice; // Valeur future de la ligne
        const futureWeight = (futureValAsset / totalPortfolioFuture) * 100;
        
        document.getElementById('res-weight').innerText = futureWeight.toFixed(1) + ' %';
        // Alerte si > 15% (exemple)
        if(futureWeight > 15) document.getElementById('res-weight').classList.add('text-red-600');
        else document.getElementById('res-weight').classList.remove('text-red-600');

        // C. Parts
        document.getElementById('res-qty').innerText = newQty.toFixed(4);

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
