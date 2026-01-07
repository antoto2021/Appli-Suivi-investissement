// js/budget.js
const { useState, useEffect } = React;

const DETECTION_KEYWORDS = {
    'Alimentation': ['course', 'super u', 'leclerc', 'lidl', 'carrefour', 'intermarche', 'boulangerie'],
    'Restauration': ['resto', 'mcdo', 'burger', 'uber', 'eat', 'pizza', 'sushi', 'starbucks'],
    'Transport': ['sncf', 'train', 'uber', 'bolt', 'essence', 'total', 'peage', 'parking'],
    'Logement': ['loyer', 'edf', 'engie', 'eau', 'internet', 'bouygues', 'sfr', 'orange'],
    'Loisirs': ['netflix', 'spotify', 'cinema', 'ugc', 'sport', 'fitness'],
    'Salaire': ['salaire', 'virement', 'caf', 'cpam']
};

const BudgetApp = () => {
    const [transactions, setTransactions] = useState([]);
    const [newTx, setNewTx] = useState({ description: '', amount: '', date: '', category: 'Autre' });

    const loadData = async () => {
        const data = await dbService.getAll('budget');
        setTransactions((data||[]).sort((a,b) => new Date(b.date) - new Date(a.date)));
    };

    useEffect(() => {
        loadData();
        window.addEventListener('budget-update', loadData);
        return () => window.removeEventListener('budget-update', loadData);
    }, []);

    // Auto-détection
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

    const saveManual = async (e) => {
        e.preventDefault();
        if(!newTx.description || !newTx.amount) return;
        await dbService.add('budget', { 
            id: Date.now(), 
            date: newTx.date || new Date().toISOString().split('T')[0],
            description: newTx.description,
            amount: -Math.abs(parseFloat(newTx.amount)), // Toujours négatif pour dépense manuelle
            category: newTx.category 
        });
        setNewTx({ description: '', amount: '', date: '', category: 'Autre' });
        loadData();
        setTimeout(() => app.renderBank(), 500); // Mise à jour globale
    };

    const deleteTx = async (id) => {
        if(confirm("Supprimer ?")) {
            await dbService.delete('budget', id);
            loadData();
            setTimeout(() => app.renderBank(), 500);
        }
    };

    return (
        <div className="flex flex-col h-full">
            {/* Formulaire ajout rapide */}
            <form onSubmit={saveManual} className="p-3 bg-white border-b border-gray-100 flex gap-2 flex-wrap items-end">
                <div className="flex-1 min-w-[120px]">
                    <label className="text-[10px] uppercase font-bold text-gray-400">Description</label>
                    <input type="text" className="w-full border-b border-gray-300 py-1 text-sm focus:border-blue-500 outline-none"
                        value={newTx.description} onChange={e => setNewTx({...newTx, description: e.target.value})} placeholder="Ex: McDo" />
                </div>
                <div className="w-20">
                    <label className="text-[10px] uppercase font-bold text-gray-400">Prix</label>
                    <input type="number" step="0.01" className="w-full border-b border-gray-300 py-1 text-sm font-bold focus:border-blue-500 outline-none"
                        value={newTx.amount} onChange={e => setNewTx({...newTx, amount: e.target.value})} placeholder="0.00" />
                </div>
                <div className="w-28">
                    <label className="text-[10px] uppercase font-bold text-gray-400">Catégorie</label>
                    <select className="w-full text-xs py-1 bg-transparent border-b border-gray-300"
                        value={newTx.category} onChange={e => setNewTx({...newTx, category: e.target.value})}>
                        {Object.keys(DETECTION_KEYWORDS).concat(['Autre']).map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                </div>
                <button type="submit" className="bg-emerald-600 text-white p-2 rounded-lg hover:bg-emerald-700 shadow"><i className="fa-solid fa-plus"></i></button>
            </form>

            {/* Liste */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {transactions.length === 0 ? <p className="text-center text-gray-400 text-xs py-4">Aucune dépense.</p> : 
                    transactions.map(t => (
                        <div key={t.id} className="flex justify-between items-center bg-white p-2 rounded border border-gray-50 shadow-sm hover:border-blue-100 transition">
                            <div className="overflow-hidden">
                                <p className="font-bold text-gray-700 text-sm truncate">{t.description}</p>
                                <p className="text-[10px] text-gray-400">{t.date} • {t.category} • {t.merchant || ''}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className={`font-mono font-bold text-sm ${t.amount<0?'text-slate-700':'text-emerald-600'}`}>{t.amount.toFixed(2)}€</span>
                                <button onClick={()=>deleteTx(t.id)} className="text-gray-300 hover:text-red-400"><i className="fa-solid fa-xmark"></i></button>
                            </div>
                        </div>
                    ))
                }
            </div>
        </div>
    );
};
