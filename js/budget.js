// js/budget.js

// On suppose que dbService est global (window.dbService)
const { useState, useEffect, useRef } = React;

const DETECTION_KEYWORDS = {
    'Alimentation': ['course', 'super u', 'leclerc', 'auchan', 'lidl', 'carrefour', 'intermarche', 'market', 'franprix', 'monoprix', 'boulangerie', 'ms nanterre'],
    'Restauration': ['resto', 'mcdo', 'mcdonald', 'burger king', 'bk', 'kfc', 'uber', 'deliveroo', 'eat', 'tacos', 'pizza', 'sushi', 'café', 'starbucks', 'bistrot', 'restaurant', 'crous', 'bouillon', 'spiti'],
    'Transport': ['sncf', 'train', 'navigo', 'ratp', 'uber', 'bolt', 'taxi', 'essence', 'total', 'esso', 'bp', 'shell', 'peage', 'parking', 'dott', 'lime', 'scooter'],
    'Logement': ['loyer', 'edf', 'engie', 'eau', 'internet', 'bouygues', 'sfr', 'orange', 'free', 'assurance', 'taxe'],
    'Loisirs': ['netflix', 'spotify', 'cinema', 'ugc', 'gaumont', 'sport', 'fitness', 'basic fit', 'abonnement', 'shotgun', 'place', 'concert', 'al miraath'],
    'Salaire': ['salaire', 'virement', 'caf', 'cpam', 'remboursement', 'solde', 'pôle emploi', 'revenu'],
    'Investissement': ['bitstack', 'bourse', 'pea', 'cto', 'trade', 'republic', 'crypto', 'binance', 'coinbase', 'bricks', 'la premiere brique']
};

const DEFAULT_MERCHANTS = {
    'Alimentation': ['Super U', 'Lidl', 'Carrefour', 'Leclerc', 'Auchan'],
    'Restauration': ['McDonald\'s', 'Burger King', 'Uber Eats'],
    'Salaire': ['Virement', 'Employeur', 'CAF', 'Remboursement'],
    'Autre': ['Amazon', 'Fnac']
};

window.BudgetApp = () => {
    const [transactions, setTransactions] = useState([]);
    const [view, setView] = useState('dashboard'); 
    const [filterYear, setFilterYear] = useState('Tout'); 
    const [filterMonth, setFilterMonth] = useState('Tout');
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    // Nouvel état : type de transaction (expense ou income)
    const [txType, setTxType] = useState('expense'); 

    const [merchantDB, setMerchantDB] = useState(() => {
        const saved = localStorage.getItem('invest_v5_merchants');
        return saved ? JSON.parse(saved) : DEFAULT_MERCHANTS;
    });

    const [newTx, setNewTx] = useState({ description: '', merchant: '', amount: '', date: '', category: 'Autre' });
    const barRef = useRef(null);
    const pieRef = useRef(null);
    const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

    // Chargement initial
    useEffect(() => {
        const load = async () => {
            try {
                await window.dbService.init();
                const data = await window.dbService.getAll('budget');
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

    // Écouteur pour ouvrir la modal "Revenus" depuis l'extérieur (index.html)
    useEffect(() => {
        const handleOpenIncome = () => {
            setNewTx({ 
                description: 'Virement', 
                merchant: '', 
                amount: '', 
                date: new Date().toISOString().split('T')[0], 
                category: 'Salaire' 
            });
            setTxType('income'); // On force le mode Revenu
            setIsModalOpen(true);
        };
        window.addEventListener('open-income-modal', handleOpenIncome);
        return () => window.removeEventListener('open-income-modal', handleOpenIncome);
    }, []);

    // Détection auto catégorie
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

    const getStats = () => {
        const now = new Date();
        const currentM = now.getMonth();
        const currentY = now.getFullYear();

        const currentTx = transactions.filter(t => {
            const d = new Date(t.date);
            return d.getMonth() === currentM && d.getFullYear() === currentY;
        });

        const merchants = {};
        currentTx.forEach(t => {
            if (t.amount < 0) {
                const name = t.merchant || t.description;
                merchants[name] = (merchants[name] || 0) + Math.abs(t.amount);
            }
        });
        const top5 = Object.entries(merchants).sort((a, b) => b[1] - a[1]).slice(0, 5);

        const cats = {};
        currentTx.forEach(t => {
            if (t.amount < 0) cats[t.category] = (cats[t.category] || 0) + Math.abs(t.amount);
        });

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

    // Graphiques
    useEffect(() => {
        if (view !== 'dashboard') return;
        const { cats, sixM } = getStats();
        if(window.bPie instanceof Chart) window.bPie.destroy();
        if(window.bBar instanceof Chart) window.bBar.destroy();

        setTimeout(() => {
            if (pieRef.current) {
                const ctxPie = pieRef.current.getContext('2d');
                window.bPie = new Chart(ctxPie, {
                    type: 'doughnut',
                    data: { labels: Object.keys(cats), datasets: [{ data: Object.values(cats), backgroundColor: ['#ef4444', '#f59e0b', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b', '#10b981'] }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: { boxWidth: 10, font: { size: 10 } } } } }
                });
            }
            if (barRef.current) {
                const ctxBar = barRef.current.getContext('2d');
                window.bBar = new Chart(ctxBar, {
                    type: 'bar',
                    data: { labels: Object.keys(sixM), datasets: [{ label: 'Dépenses', data: Object.values(sixM), backgroundColor: '#10b981', borderRadius: 4 }] },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
                });
            }
        }, 100);
    }, [transactions, view]);

    const openAddModal = () => { 
        setNewTx({ description: '', merchant: '', amount: '', date: new Date().toISOString().split('T')[0], category: 'Autre' }); 
        setTxType('expense'); // Par défaut, c'est une dépense
        setIsModalOpen(true); 
    };

    const saveManual = async (e) => {
        e.preventDefault();
        if(!newTx.description || !newTx.amount) return;
        
        const finalMerchant = newTx.merchant || newTx.description;
        const rawAmount = parseFloat(newTx.amount);
        
        // Calcul du montant final (Positif si Revenu, Négatif si Dépense)
        const finalAmount = txType === 'income' ? Math.abs(rawAmount) : -Math.abs(rawAmount);

        await window.dbService.add('budget', { 
            id: Date.now(), 
            date: newTx.date, 
            description: newTx.description,
            merchant: finalMerchant, 
            amount: finalAmount, 
            category: newTx.category 
        });

        // Sauvegarde de l'enseigne
        if (newTx.merchant) {
            const catList = merchantDB[newTx.category] || [];
            if (!catList.includes(newTx.merchant)) {
                const newDB = { ...merchantDB, [newTx.category]: [...catList, newTx.merchant].sort() };
                setMerchantDB(newDB);
                localStorage.setItem('invest_v5_merchants', JSON.stringify(newDB));
            }
        }
        
        setIsModalOpen(false);
        window.dispatchEvent(new Event('budget-update'));
    };

    const updateTx = async (id, f, v) => {
        const tx = transactions.find(t=>t.id===id);
        if(tx) {
            const up = {...tx, [f]:v};
            await window.dbService.add('budget', up);
            window.dispatchEvent(new Event('budget-update'));
        }
    };

    const deleteTx = async (id) => {
        if(confirm("Supprimer ?")) {
            await window.dbService.delete('budget', id);
            window.dispatchEvent(new Event('budget-update'));
        }
    };

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
            <div className="flex justify-between items-center p-3 md:p-4 bg-white shadow-sm mb-2 sticky top-0 z-20">
                <div className="flex gap-2 items-center overflow-x-auto no-scrollbar">
                    <span className="font-bold text-gray-800 mr-2 hidden md:block">Ma Banque</span>
                    <button onClick={()=>setView('dashboard')} className={`px-2 md:px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold transition whitespace-nowrap ${view==='dashboard'?'bg-emerald-100 text-emerald-700':'text-gray-500 hover:bg-gray-100'}`}>
                        <span className="md:hidden">Vues</span><span className="hidden md:inline">Vue d'ensemble</span>
                    </button>
                    <button onClick={()=>setView('list')} className={`px-2 md:px-3 py-1.5 rounded-lg text-xs md:text-sm font-bold transition whitespace-nowrap ${view==='list'?'bg-emerald-100 text-emerald-700':'text-gray-500 hover:bg-gray-100'}`}>
                        <span className="md:hidden">Hist.</span><span className="hidden md:inline">Historique</span>
                    </button>
                </div>
                <button onClick={openAddModal} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-xs font-bold transition shadow flex-shrink-0 ml-2">
                    <span className="md:hidden">+ Add</span><span className="hidden md:inline">+ Dépense</span>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-24" style={{ height: 'calc(100vh - 180px)' }}>
                {view === 'dashboard' && (
                    <div className="space-y-6 animate-fade-in pb-10">
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                            <h3 className="text-sm font-bold text-gray-700 mb-2">Évolution des Dépenses (6 mois)</h3>
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
                        {/* Filtres Année / Mois */}
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
                                    <div key={t.id} className={`bg-white p-3 rounded-lg border shadow-sm flex flex-col gap-2 relative group transition ${t.amount > 0 ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-red-500 border-gray-100'}`}>
                                        <div className="flex justify-between items-start gap-2">
                                            <div className="flex-1 overflow-hidden">
                                                <input type="text" value={t.merchant || t.description} readOnly className="font-bold text-gray-700 bg-transparent w-full focus:outline-none text-sm truncate" />
                                                <div className="text-[10px] text-gray-400 italic truncate">{t.description}</div>
                                            </div>
                                            <div className={`text-right w-24 font-mono font-bold ${t.amount < 0 ? 'text-slate-700' : 'text-green-600'}`}>
                                                {t.amount > 0 ? '+' : ''}{t.amount.toFixed(2)} €
                                            </div>
                                        </div>
                                        <div className="flex justify-between items-center text-xs mt-1">
                                            <div className="flex gap-2 items-center flex-wrap">
                                                <div className="text-gray-400">{t.date}</div>
                                                <span className="text-[10px] px-2 py-0.5 rounded bg-gray-50 text-gray-500 uppercase font-bold border border-gray-100">
                                                    {t.category}
                                                </span>
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

            {/* MODALE D'AJOUT / MODIFICATION */}
            {isModalOpen && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-sm rounded-xl shadow-2xl overflow-hidden animate-fade-in">
                        <div className="p-4 border-b flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-gray-800">Ajout Transaction</h3>
                            <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">✕</button>
                        </div>
                        
                        <form onSubmit={saveManual} className="p-5 space-y-4">
                            
                            {/* Sélecteur TYPE (Dépense / Revenu) */}
                            <div className="flex bg-gray-100 p-1 rounded-lg">
                                <button type="button" onClick={() => setTxType('expense')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${txType === 'expense' ? 'bg-white text-red-500 shadow-sm' : 'text-gray-500'}`}>
                                    Dépense (-)
                                </button>
                                <button type="button" onClick={() => setTxType('income')} className={`flex-1 py-1.5 text-xs font-bold rounded-md transition ${txType === 'income' ? 'bg-white text-green-600 shadow-sm' : 'text-gray-500'}`}>
                                    Revenu (+)
                                </button>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Description</label>
                                <input type="text" required placeholder="Ex: Salaire, Resto..." className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                    value={newTx.description} onChange={e => setNewTx({...newTx, description: e.target.value})} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Montant (€)</label>
                                    <input type="number" step="0.01" required placeholder="0.00" className={`w-full border rounded-lg p-2 text-sm focus:ring-2 outline-none font-bold ${txType==='income'?'text-green-600 focus:ring-green-500':'text-gray-800 focus:ring-red-500'}`}
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
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Détail / Enseigne (Optionnel)</label>
                                <input type="text" list="merchants-list" placeholder="Sélectionner ou écrire..." className="w-full border rounded-lg p-2 text-sm focus:ring-2 focus:ring-emerald-500 outline-none"
                                    value={newTx.merchant} onChange={e => setNewTx({...newTx, merchant: e.target.value})} />
                                <datalist id="merchants-list">{(merchantDB[newTx.category] || []).map((m, idx) => (<option key={idx} value={m} />))}</datalist>
                            </div>
                            <button type="submit" className={`w-full text-white py-3 rounded-xl font-bold transition mt-2 ${txType==='income'?'bg-green-600 hover:bg-green-700':'bg-red-500 hover:bg-red-600'}`}>Valider</button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};
