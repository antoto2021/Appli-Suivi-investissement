/**
 * INVEST TRACK V5 - CORE LOGIC (AI ENHANCED)
 */

const { useState, useEffect, useRef } = React;

// =================================================================
// 0. DB SERVICE (IndexedDB)
// =================================================================
const dbService = {
    dbName: 'InvestTrackDB',
    storeName: 'budget',
    version: 1,
    db: null,

    async init() {
        if (this.db) return this.db;
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(this.dbName, this.version);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName, { keyPath: 'id' });
                }
            };
            req.onsuccess = (e) => { this.db = e.target.result; resolve(this.db); };
            req.onerror = (e) => reject("DB Error");
        });
    },

    async getAll() {
        await this.init();
        return new Promise((resolve) => {
            const tx = this.db.transaction(this.storeName, 'readonly');
            tx.objectStore(this.storeName).getAll().onsuccess = (e) => resolve(e.target.result || []);
        });
    },

    async add(item) {
        await this.init();
        return new Promise((resolve) => {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            tx.objectStore(this.storeName).put(item);
            tx.oncomplete = () => resolve();
        });
    },

    async delete(id) {
        await this.init();
        return new Promise((resolve) => {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            tx.objectStore(this.storeName).delete(id);
            tx.oncomplete = () => resolve();
        });
    }
};

// =================================================================
// 1. INVEST APP (Vanilla JS - Bourse)
// =================================================================
const app = {
    // ... (Code Bourse simplifié pour la concision, reprenez votre logique existante ici)
    init: function() { this.nav('home'); },
    nav: function(id) {
        document.querySelectorAll('main > section').forEach(el => el.classList.add('hidden'));
        const target = document.getElementById(id + '-view');
        if(target) target.classList.remove('hidden');
        if(id === 'dashboard') this.renderChart();
    },
    renderChart: function() {
        // Placeholder Chart rendering
        const ctx = document.getElementById('pieChart')?.getContext('2d');
        if(ctx && !this.chart) {
            this.chart = new Chart(ctx, {
                type: 'doughnut',
                data: { labels: ['PEA', 'CTO'], datasets: [{ data: [3000, 1500], backgroundColor: ['#3b82f6', '#8b5cf6'] }] }
            });
        }
    }
};

// =================================================================
// 2. BUDGET APP (React)
// =================================================================
const BudgetApp = () => {
    const [transactions, setTransactions] = useState([]);

    useEffect(() => {
        const load = async () => {
            const data = await dbService.getAll();
            setTransactions(data.sort((a,b) => new Date(b.date) - new Date(a.date)));
        };
        load();
        window.addEventListener('budget-update', load);
        return () => window.removeEventListener('budget-update', load);
    }, []);

    const deleteTx = async (id) => {
        await dbService.delete(id);
        window.dispatchEvent(new Event('budget-update'));
    };

    return (
        <div className="h-full flex flex-col bg-slate-50">
            <div className="p-4 overflow-y-auto pb-20 space-y-3">
                {transactions.length === 0 && <div className="text-center text-gray-400 mt-10">Aucune dépense.</div>}
                {transactions.map(t => (
                    <div key={t.id} className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm flex justify-between items-center">
                        <div>
                            <div className="font-bold text-gray-700">{t.description}</div>
                            <div className="text-xs text-gray-400">{t.date} • {t.category || 'Autre'}</div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className={`font-bold ${t.amount < 0 ? 'text-gray-800' : 'text-emerald-600'}`}>{t.amount} €</span>
                            <button onClick={() => deleteTx(t.id)} className="text-gray-300 hover:text-red-500"><i className="fa-solid fa-trash"></i></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// =================================================================
// 3. SMART PDF/IMAGE IMPORTER (MODULE IA AVANCÉ)
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
        const color = type==='success'?'text-green-400':(type==='error'?'text-red-400':(type==='warn'?'text-yellow-400':'text-slate-300'));
        c.innerHTML += `<div class="mb-1 ${color}">> ${msg}</div>`;
        c.parentElement.scrollTop = c.parentElement.scrollHeight;
    },

    verifyKey: async function() {
        const key = document.getElementById('gemini-key').value.trim();
        const btn = document.getElementById('btn-verify-key');
        const status = document.getElementById('gemini-status');
        
        if(!key) return;
        btn.innerText = '...'; btn.disabled = true;

        try {
            // Fetch models
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
            const data = await r.json();
            if(!r.ok) throw new Error(data.error?.message || 'Clé invalide');

            // Filtrer et trier les modèles (Flash > Pro 1.5 > Pro)
            const models = (data.models || []).filter(m => m.supportedGenerationMethods?.includes('generateContent'));
            if(models.length === 0) throw new Error("Aucun modèle compatible.");

            models.sort((a,b) => {
                const priority = n => { if(n.includes('flash')) return 10; if(n.includes('gemini-1.5-pro')) return 8; return 0; };
                return priority(b.name) - priority(a.name);
            });

            this.usableModels = models.map(m => ({ id: m.name.replace(/^models\//,''), name: m.displayName||m.name }));
            this.apiKey = key;

            status.innerHTML = `<span class="text-green-600 font-bold">✅ Prêt (${this.usableModels[0].name})</span>`;
            document.getElementById('ai-step-2').classList.remove('hidden');
        } catch(e) {
            status.innerHTML = `<span class="text-red-600 font-bold">❌ Erreur: ${e.message}</span>`;
        } finally {
            btn.innerText = 'Vérifier'; btn.disabled = false;
        }
    },

    handleFile: function(e) {
        const file = e.target.files[0];
        if(!file) return;
        
        // Validation Type
        const valid = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
        if(!valid.includes(file.type)) { alert("Format invalide. PDF ou Images seulement."); return; }

        this.currentMimeType = file.type;
        document.getElementById('ai-filename').innerText = file.name;
        document.getElementById('ai-file-info').classList.remove('hidden');

        const reader = new FileReader();
        reader.onload = (evt) => this.fileBase64 = evt.target.result.split(',')[1];
        reader.readAsDataURL(file);
    },

    processAuto: async function() {
        if(!this.apiKey || !this.fileBase64) return;
        
        // UI Reset
        document.getElementById('ai-step-3').classList.add('hidden');
        document.getElementById('ai-logs-container').classList.remove('hidden');
        document.getElementById('ai-console').innerHTML = '';
        this.log("Démarrage de l'analyse IA...");

        const prompt = `Extrais TOUTES les transactions. JSON STRICT Array: [{"date":"YYYY-MM-DD","description":"Nom","amount":-10.00,"category":"Autre"}]. Montants en négatif pour dépenses.`;
        let success = false;

        for(const model of this.usableModels) {
            this.log(`Tentative avec ${model.name}...`);
            try {
                const payload = {
                    contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: this.currentMimeType, data: this.fileBase64 } }] }],
                    generationConfig: { temperature: 0.1, response_mime_type: "application/json" },
                    // SAFETY SETTINGS CRITIQUES POUR EVITER LES BLOCAGES
                    safetySettings: [
                        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                    ]
                };

                const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.id}:generateContent?key=${this.apiKey}`, {
                    method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
                });

                if(!res.ok) {
                    if(res.status === 429) { this.log("Quota dépassé (429). Suivant...", 'warn'); continue; }
                    if(res.status === 503) { this.log("Surchargé (503). Suivant...", 'warn'); continue; }
                    throw new Error(res.statusText);
                }

                const d = await res.json();
                if(!d.candidates?.[0]?.content) throw new Error("Réponse vide/bloquée.");

                let raw = d.candidates[0].content.parts[0].text;
                // Nettoyage JSON robuste
                const match = raw.match(/\[[\s\S]*\]/);
                if(match) raw = match[0];
                else raw = raw.replace(/```json/g,'').replace(/```/g,'').trim();

                let json = JSON.parse(raw);
                if(!Array.isArray(json)) json = json.data || json.table || [json];

                if(json.length > 0) {
                    this.extracted = json;
                    this.log(`Succès ! ${json.length} éléments trouvés.`, 'success');
                    this.renderPreview();
                    success = true;
                    break; 
                } else {
                    this.log("Aucune donnée trouvée.", 'warn');
                }
            } catch(e) {
                this.log(`Erreur: ${e.message}`, 'error');
            }
        }

        if(!success) alert("Impossible d'extraire les données avec les modèles disponibles.");
    },

    renderPreview: function() {
        const t = document.getElementById('ai-preview-table');
        document.getElementById('ai-count').innerText = `${this.extracted.length} lignes`;
        t.innerHTML = this.extracted.slice(0,10).map(r => 
            `<tr class="border-b"><td class="p-2 text-xs">${r.date}</td><td class="p-2 text-xs truncate max-w-[100px]">${r.description}</td><td class="p-2 text-xs text-right font-bold">${r.amount}</td></tr>`
        ).join('') + (this.extracted.length>10 ? '<tr><td colspan="3" class="p-2 text-center italic text-xs">... et autres</td></tr>' : '');
        document.getElementById('ai-step-3').classList.remove('hidden');
    },

    importToBudget: async function() {
        if(!this.extracted.length) return;
        await dbService.init();
        let count = 0;
        for(const item of this.extracted) {
            await dbService.add({
                id: Date.now() + Math.random(),
                date: item.date || new Date().toISOString().split('T')[0],
                description: item.description || 'Import IA',
                amount: parseFloat(item.amount) || 0,
                category: item.category || 'Import'
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
    openModal: function() {
        document.getElementById('info-modal-overlay').classList.remove('hidden');
        document.getElementById('info-local-v').innerText = localStorage.getItem('app_hash') || 'Dev';
    },
    closeModal: function() { document.getElementById('info-modal-overlay').classList.add('hidden'); },
    forceUpdate: function() { window.location.reload(); }
};

// =================================================================
// 5. BOOTSTRAP
// =================================================================
document.addEventListener('DOMContentLoaded', () => {
    window.app = app; 
    window.pdfImporter = pdfImporter;
    window.infoModule = infoModule;
    
    app.init();
    
    const root = document.getElementById('budget-root');
    if(root) ReactDOM.createRoot(root).render(<BudgetApp />);
    
    if(window.lucide) lucide.createIcons();
});
