/**
 * InvestTrack V5 Ultimate - Hybrid Core
 * * Modifications :
 * 1. Ajout de IndexedDB pour les données Budget
 * 2. Nouveaux graphiques et stats dans l'onglet Budget
 * 3. Module d'import PDF via Gemini
 */

const { useState, useEffect, useRef } = React;

// --- INDEXED DB SERVICE (Simple Wrapper) ---
const dbService = {
    dbName: 'InvestTrackDB',
    version: 1,
    db: null,

    init: function() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if(!db.objectStoreNames.contains('budget')) db.createObjectStore('budget', { keyPath: 'id' });
            };
            request.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
            request.onerror = (e) => reject(e);
        });
    },

    getAll: function(storeName) {
        return new Promise((resolve) => {
            const tx = this.db.transaction(storeName, 'readonly');
            const store = tx.objectStore(storeName);
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
        });
    },

    add: function(storeName, item) {
        return new Promise((resolve) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            store.put(item);
            tx.oncomplete = () => resolve();
        });
    },

    delete: function(storeName, id) {
        return new Promise((resolve) => {
            const tx = this.db.transaction(storeName, 'readwrite');
            const store = tx.objectStore(storeName);
            store.delete(id);
            tx.oncomplete = () => resolve();
        });
    },
    
    // Estimation taille stockage
    estimateSize: async function() {
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            return (estimate.usage / 1024 / 1024).toFixed(2) + ' MB';
        }
        return 'N/A';
    }
};

// =================================================================
// 1. INVEST TRACK LOGIC (Vanilla JS)
// =================================================================
const app = {
    // ... (Code existant identique, je le raccourcis ici pour la lisibilité mais il faut le garder complet)
    transactions: [],
    currentPrices: {},
    tickerDB: { 'total': 'TTE.PA', 'vinci': 'DG.PA', 'accor': 'AC.PA' /* etc */ },
    
    init: function() {
        this.loadData();
        // ... (reste du code init)
    },
    
    nav: function(id) {
        document.querySelectorAll('main > section').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById(id + '-view');
        if(target) target.classList.remove('hidden');
        
        // Hooks
        if(id === 'dashboard') { this.calcKPIs(); this.renderPie(); }
        if(id === 'assets') this.renderAssets();
        if(id === 'transactions') this.renderTable();
        if(id === 'projections') this.renderProjections();
        if(id === 'dividends') this.renderDividends();
        
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    // ... (Fonctions loadData, saveData, updatePrice, renderAssets, etc. comme V4.4)
    // Pour ne pas dépasser la limite de caractères, je suppose que vous avez le code V4.4 pour cette partie "Vanilla JS".
    // Je réintègre juste les bases indispensables.
    loadData: function() {
        const tx = localStorage.getItem('invest_v5_tx');
        if(tx) this.transactions = JSON.parse(tx);
        const pr = localStorage.getItem('invest_v5_prices');
        if(pr) this.currentPrices = JSON.parse(pr);
    },
    saveData: function() {
        localStorage.setItem('invest_v5_tx', JSON.stringify(this.transactions));
        localStorage.setItem('invest_v5_prices', JSON.stringify(this.currentPrices));
    },
    // ... (ajoutez ici toutes les méthodes de l'objet app de la réponse précédente)
    calcKPIs: function() { /* ... */ return {invested:0, currentVal:0}; }, 
    renderPie: function() {},
    renderAssets: function() {},
    renderTable: function() {},
    renderProjections: function() {},
    renderDividends: function() {},
    openModal: function() { document.getElementById('modalForm').classList.remove('hidden'); },
    closeModal: function() { document.getElementById('modalForm').classList.add('hidden'); },
    saveTransaction: function() { /* ... */ this.closeModal(); },
    handleImport: function() {},
    exportExcel: function() {},
    searchTicker: function() {},
    deleteTx: function() {},
    toast: function(m) { /* ... */ }
};

// =================================================================
// 2. BUDGET SCAN APP (React - Enhanced)
// =================================================================
const CATEGORIES = {
    'Alimentation': ['carrefour', 'leclerc', 'auchan', 'lidl'],
    'Restauration': ['mcdo', 'restaurant', 'uber eats'],
    'Transport': ['sncf', 'total', 'essence', 'peage'],
    'Logement': ['loyer', 'edf', 'internet'],
    'Loisirs': ['netflix', 'cinema'],
    'Salaire': ['salaire', 'virement']
};

const BudgetApp = () => {
    const [transactions, setTransactions] = useState([]);
    const [view, setView] = useState('dashboard'); // dashboard, list
    const chartRef = useRef(null);
    const pieRef = useRef(null);

    // Init IndexedDB & Load
    useEffect(() => {
        const init = async () => {
            await dbService.init();
            const data = await dbService.getAll('budget');
            setTransactions(data.sort((a,b) => new Date(b.date) - new Date(a.date)));
        };
        init();
        
        // Listen to external event from PDF importer
        window.addEventListener('budget-update', init);
        return () => window.removeEventListener('budget-update', init);
    }, []);

    // Helper: Stats du mois en cours
    const getMonthStats = () => {
        const now = new Date();
        const currentMonthTx = transactions.filter(t => {
            const d = new Date(t.date);
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        });
        
        // Top 5 Enseignes (Marques)
        const merchants = {};
        currentMonthTx.forEach(t => {
            if(t.amount < 0) { // Dépenses uniquement
                merchants[t.description] = (merchants[t.description] || 0) + Math.abs(t.amount);
            }
        });
        const topMerchants = Object.entries(merchants)
            .sort((a,b) => b[1] - a[1])
            .slice(0, 5);

        // Catégories (Camembert)
        const cats = {};
        currentMonthTx.forEach(t => {
            if(t.amount < 0) cats[t.category] = (cats[t.category] || 0) + Math.abs(t.amount);
        });

        return { currentMonthTx, topMerchants, cats };
    };

    // Helper: 6 derniers mois (Barres)
    const getSixMonthsStats = () => {
        const months = {};
        const now = new Date();
        for(let i=0; i<6; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getMonth()+1}/${d.getFullYear()}`;
            months[key] = 0;
        }
        
        transactions.forEach(t => {
            const d = new Date(t.date);
            const key = `${d.getMonth()+1}/${d.getFullYear()}`;
            if(months.hasOwnProperty(key) && t.amount < 0) {
                months[key] += Math.abs(t.amount);
            }
        });
        return months; // { "5/2025": 1200, ... }
    };

    // Rendering Charts (useEffect)
    useEffect(() => {
        if(view !== 'dashboard' || transactions.length === 0) return;

        const { cats } = getMonthStats();
        const sixMonths = getSixMonthsStats();

        // 1. Bar Chart (6 mois)
        if(chartRef.current) {
            const ctx = chartRef.current.getContext('2d');
            if(window.budgetBarChart) window.budgetBarChart.destroy();
            window.budgetBarChart = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: Object.keys(sixMonths).reverse(),
                    datasets: [{
                        label: 'Dépenses',
                        data: Object.values(sixMonths).reverse(),
                        backgroundColor: '#10b981',
                        borderRadius: 4
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false }
            });
        }

        // 2. Pie Chart (Catégories)
        if(pieRef.current) {
            const ctx = pieRef.current.getContext('2d');
            if(window.budgetPieChart) window.budgetPieChart.destroy();
            window.budgetPieChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: Object.keys(cats),
                    datasets: [{
                        data: Object.values(cats),
                        backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b']
                    }]
                },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right' } } }
            });
        }
    }, [transactions, view]);

    // Actions
    const addTx = async (tx) => {
        await dbService.add('budget', tx);
        const data = await dbService.getAll('budget');
        setTransactions(data.sort((a,b) => new Date(b.date) - new Date(a.date)));
    };

    const addManual = () => {
        addTx({
            id: Date.now(),
            date: new Date().toISOString().split('T')[0],
            description: "Nouvelle dépense",
            amount: -10,
            category: "Autre"
        });
    };

    const updateTx = async (id, field, val) => {
        const tx = transactions.find(t => t.id === id);
        if(tx) {
            const updated = { ...tx, [field]: val };
            await dbService.add('budget', updated);
            // Local update pour fluidité
            setTransactions(prev => prev.map(t => t.id===id ? updated : t));
        }
    };

    const deleteTx = async (id) => {
        await dbService.delete('budget', id);
        setTransactions(prev => prev.filter(t => t.id !== id));
    };

    // --- Rendu ---
    const { currentMonthTx, topMerchants } = getMonthStats();

    return (
        <div className="flex flex-col h-full bg-slate-50">
            {/* Toolbar */}
            <div className="flex gap-2 p-4 bg-white shadow-sm mb-4">
                <button onClick={()=>setView('dashboard')} className={`px-4 py-2 rounded-lg text-sm font-bold ${view==='dashboard'?'bg-emerald-100 text-emerald-700':'text-gray-500'}`}>Dashboard</button>
                <button onClick={()=>setView('list')} className={`px-4 py-2 rounded-lg text-sm font-bold ${view==='list'?'bg-emerald-100 text-emerald-700':'text-gray-500'}`}>Historique</button>
                <div className="flex-1"></div>
                <button onClick={addManual} className="bg-emerald-600 text-white px-3 py-2 rounded-lg text-sm font-bold">+ Manuel</button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-20">
                
                {view === 'dashboard' && (
                    <div className="space-y-6">
                        {/* 1. Bar Chart 6 mois */}
                        <div className="bg-white p-4 rounded-xl shadow-sm">
                            <h3 className="text-sm font-bold text-gray-700 mb-2">Dépenses (6 derniers mois)</h3>
                            <div className="h-48 relative"><canvas ref={chartRef}></canvas></div>
                        </div>

                        {/* 2. Grid Pie + Top 5 */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-white p-4 rounded-xl shadow-sm">
                                <h3 className="text-sm font-bold text-gray-700 mb-2">Répartition (Mois en cours)</h3>
                                <div className="h-40 relative"><canvas ref={pieRef}></canvas></div>
                            </div>
                            <div className="bg-white p-4 rounded-xl shadow-sm">
                                <h3 className="text-sm font-bold text-gray-700 mb-2">Top 5 Enseignes</h3>
                                <div className="space-y-2">
                                    {topMerchants.map(([name, amount], i) => (
                                        <div key={i} className="flex justify-between text-sm items-center">
                                            <div className="flex items-center gap-2">
                                                <span className="bg-emerald-100 text-emerald-800 w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold">{i+1}</span>
                                                <span className="truncate w-32">{name}</span>
                                            </div>
                                            <span className="font-mono font-bold">{amount.toFixed(2)} €</span>
                                        </div>
                                    ))}
                                    {topMerchants.length === 0 && <p className="text-xs text-gray-400">Pas assez de données.</p>}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {view === 'list' && (
                    <div className="space-y-2">
                        <h3 className="text-sm font-bold text-gray-500 mb-2 uppercase">Mois en cours ({currentMonthTx.length})</h3>
                        {currentMonthTx.length === 0 && <p className="text-center text-gray-400 py-4">Aucune transaction ce mois-ci.</p>}
                        
                        {currentMonthTx.map(t => (
                            <div key={t.id} className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm flex flex-col gap-2">
                                <div className="flex justify-between items-center">
                                    <input type="text" value={t.description} onChange={(e)=>updateTx(t.id,'description',e.target.value)} 
                                        className="font-bold text-gray-700 bg-transparent w-full focus:outline-none" />
                                    <div className="flex items-center gap-1">
                                        <input type="number" step="0.01" value={t.amount} onChange={(e)=>updateTx(t.id,'amount',parseFloat(e.target.value))} 
                                            className={`text-right w-20 font-mono font-bold bg-transparent focus:outline-none ${t.amount<0?'text-gray-800':'text-emerald-600'}`} />
                                        <span className="text-xs text-gray-400">€</span>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center">
                                    <div className="flex gap-2">
                                        <input type="date" value={t.date} onChange={(e)=>updateTx(t.id,'date',e.target.value)} 
                                            className="text-xs text-gray-400 bg-transparent" />
                                        <select value={t.category} onChange={(e)=>updateTx(t.id,'category',e.target.value)} 
                                            className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 uppercase">
                                            {Object.keys(CATEGORIES).concat(['Autre']).map(c=><option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <button onClick={()=>deleteTx(t.id)} className="text-gray-300 hover:text-red-500"><i className="fa-solid fa-trash"></i></button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

// =================================================================
// 3. MODULE PDF / IMAGE IMPORTER (Gemini Logic)
// =================================================================
const pdfImporter = {
    apiKey: '',
    fileBase64: '',
    
    open: function() { document.getElementById('pdf-modal-overlay').classList.remove('hidden'); },
    close: function() { document.getElementById('pdf-modal-overlay').classList.add('hidden'); },
    
    verifyKey: async function() {
        const key = document.getElementById('gemini-key').value;
        if(!key) return;
        document.getElementById('gemini-status').innerText = "Vérification...";
        try {
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
            if(!r.ok) throw new Error();
            this.apiKey = key;
            document.getElementById('gemini-status').innerHTML = '<span class="text-green-600">✅ Clé valide</span>';
            document.getElementById('pdf-step-2').classList.remove('hidden');
        } catch(e) {
            document.getElementById('gemini-status').innerHTML = '<span class="text-red-600">❌ Clé invalide</span>';
        }
    },

    handleFile: function(e) {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            this.fileBase64 = evt.target.result.split(',')[1];
            this.processFile();
        };
        reader.readAsDataURL(file);
    },

    processFile: async function() {
        const logs = document.getElementById('pdf-logs');
        logs.classList.remove('hidden');
        logs.innerHTML += '<div>🚀 Envoi à Gemini...</div>';
        
        const prompt = `Extrais toutes les transactions de ce document. Renvoie UNIQUEMENT un tableau JSON. 
        Format: [{"date": "YYYY-MM-DD", "description": "Nom", "amount": -10.50, "category": "Autre"}]. 
        Montants négatifs pour dépenses.`;

        try {
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: "application/pdf", data: this.fileBase64 } }] }] })
            });
            const d = await r.json();
            const raw = d.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
            const data = JSON.parse(raw);
            
            logs.innerHTML += `<div class="text-green-400">✅ ${data.length} transactions trouvées.</div>`;
            this.previewData(data);
        } catch(e) {
            logs.innerHTML += `<div class="text-red-400">❌ Erreur: ${e.message}</div>`;
        }
    },

    previewData: function(data) {
        this.extracted = data;
        const table = document.getElementById('pdf-preview-table');
        table.innerHTML = data.map(r => `<tr><td>${r.date}</td><td>${r.description}</td><td class="text-right">${r.amount}</td></tr>`).join('');
        document.getElementById('pdf-step-3').classList.remove('hidden');
    },

    importToBudget: async function() {
        if(!this.extracted) return;
        await dbService.init();
        for(const t of this.extracted) {
            await dbService.add('budget', { id: Date.now()+Math.random(), ...t });
        }
        this.close();
        window.dispatchEvent(new Event('budget-update')); // Refresh React
        alert("Importé avec succès !");
    }
};

// =================================================================
// 4. INFO MODULE (GitHub Updates + Storage Size)
// =================================================================
const infoModule = {
    // ... (Code existant identique, je rajoute juste la taille du stockage)
    config: { username: 'antoto2021', repo: 'Suivi-investissement' },
    slides: [], slideIndex: 0,

    init: async function() {
        // ... (init existant)
        this.renderLocalInfo();
        setTimeout(() => this.checkGitHub(true), 3000);
        
        // Storage size
        const size = await dbService.estimateSize();
        if(document.getElementById('storage-info')) document.getElementById('storage-info').innerText = size;
    },
    
    // ... (rest of methods: openModal, closeModal, checkGitHub, forceUpdate, startTuto...)
    // Assurez-vous de coller tout le bloc de la réponse précédente ici
    openModal: function() { 
        document.getElementById('info-modal-overlay').classList.remove('hidden'); 
        this.renderLocalInfo(); 
        dbService.estimateSize().then(s => document.getElementById('storage-info').innerText = s);
    },
    closeModal: function() { document.getElementById('info-modal-overlay').classList.add('hidden'); },
    renderLocalInfo: function() { document.getElementById('info-local-v').innerText = localStorage.getItem('app_version_hash')?.substring(0,7) || 'Init'; },
    checkGitHub: function(bg=false) { /* Copier depuis réponse précédente */ },
    forceUpdate: function() { /* Copier depuis réponse précédente */ },
    startTuto: function() { /* ... */ },
    nextSlide: function() { /* ... */ }
};

// =================================================================
// 5. MAIN INIT
// =================================================================
document.addEventListener('DOMContentLoaded', () => {
    // Exporter
    window.app = app;
    window.infoModule = infoModule;
    window.pdfImporter = pdfImporter;

    // Init
    app.init();
    infoModule.init(); // Lance aussi l'estimation stockage
    
    // Mount React
    const root = ReactDOM.createRoot(document.getElementById('budget-root'));
    root.render(<BudgetApp />);
});


