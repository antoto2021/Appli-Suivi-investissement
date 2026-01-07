// js/utils.js

// --- MODULE IA (PDF/IMG SCAN) ---
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
        const color = type==='success'?'text-green-400':(type==='error'?'text-red-400':'text-slate-300');
        c.innerHTML += `<div class="mb-1 ${color}">> ${msg}</div>`;
        c.parentElement.scrollTop = c.parentElement.scrollHeight;
    },

    verifyKey: async function() {
        const key = document.getElementById('gemini-key').value.trim();
        const btn = document.getElementById('btn-verify-key');
        if(!key) return;
        btn.innerText = '...'; btn.disabled = true;

        try {
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
            const data = await r.json();
            if(!r.ok) throw new Error(data.error?.message || 'Clé invalide');

            let models = (data.models || []).filter(m => m.supportedGenerationMethods?.includes('generateContent'));
            models.sort((a,b) => {
                const n = (m) => (m.displayName || m.name).toLowerCase();
                if (n(b).includes('flash') && n(b).includes('1.5')) return 1;
                return -1;
            });

            if (models.length === 0) throw new Error("Aucun modèle compatible.");
            this.usableModels = models;
            this.apiKey = key;
            
            const best = this.usableModels[0].displayName || "Gemini Default";
            document.getElementById('gemini-status').innerHTML = `<span class="text-green-600 font-bold">✅ Prêt (${best})</span>`;
            document.getElementById('ai-step-2').classList.remove('hidden');
        } catch(e) {
            document.getElementById('gemini-status').innerHTML = `<span class="text-red-600 font-bold">❌ ${e.message}</span>`;
        } finally {
            btn.innerText = 'Vérifier'; btn.disabled = false;
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

        const prompt = `Analyse ce ticket/facture. Extrais TOUTES les transactions.
        JSON Array STRICT : [{"date":"YYYY-MM-DD", "description":"Produit/Service", "merchant":"Enseigne", "amount":-10.00, "category":"Autre"}]
        Catégories: Alimentation, Restauration, Transport, Logement, Loisirs, Salaire, Investissement.
        Dépenses en NÉGATIF.`;

        try {
            const modelName = this.usableModels[0].name.split('/').pop();
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${this.apiKey}`;
            const payload = {
                contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: this.currentMimeType, data: this.fileBase64 } }] }],
                generationConfig: { response_mime_type: "application/json" }
            };

            const res = await fetch(url, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload) });
            const d = await res.json();
            let raw = d.candidates?.[0]?.content?.parts?.[0]?.text;
            if(!raw) throw new Error("Réponse vide de l'IA");
            
            this.extracted = JSON.parse(raw);
            this.log(`Succès ! ${this.extracted.length} trouvés.`, 'success');
            this.renderPreview();
        } catch(e) {
            this.log(`Erreur: ${e.message}`, 'error');
        }
    },

    renderPreview: function() {
        const t = document.getElementById('ai-preview-table');
        document.getElementById('ai-count').innerText = `${this.extracted.length} lignes`;
        t.innerHTML = this.extracted.slice(0,10).map(r => `
            <tr class="border-b"><td class="p-1">${r.merchant}</td><td class="p-1 text-right">${r.amount}€</td></tr>
        `).join('') + (this.extracted.length>10 ? '<tr><td>...</td></tr>' : '');
        document.getElementById('ai-step-3').classList.remove('hidden');
    },

    importToBudget: async function() {
        if(!this.extracted.length) return;
        let count = 0;
        for(const item of this.extracted) {
            await dbService.add('budget', {
                id: Date.now() + Math.random(),
                date: item.date || new Date().toISOString().split('T')[0],
                description: item.description,
                merchant: item.merchant,
                amount: parseFloat(item.amount),
                category: item.category || 'Autre'
            });
            count++;
        }
        this.close();
        window.dispatchEvent(new Event('budget-update'));
        // Rafraichir le solde banque
        setTimeout(() => app.renderBank(), 500); 
        alert(`${count} importés !`);
    }
};

// --- MODULE INFO & SAUVEGARDE ---
const infoModule = {
    openModal: function() { 
        document.getElementById('info-modal-overlay').classList.remove('hidden');
        this.calcStorage();
    },
    closeModal: function() { document.getElementById('info-modal-overlay').classList.add('hidden'); },
    
    calcStorage: async function() {
        const dump = await this.getFullDump();
        const size = new Blob([JSON.stringify(dump)]).size;
        document.getElementById('storageSize').innerText = (size/1024).toFixed(2) + ' KB';
    },

    getFullDump: async function() {
        const stores = ['budget', 'invest_tx', 'invest_prices', 'settings'];
        const dump = {};
        for(const s of stores) dump[s] = await dbService.getAll(s);
        dump.meta = { date: new Date().toISOString(), version: 4 };
        return dump;
    },

    exportData: async function() {
        const data = await this.getFullDump();
        const blob = new Blob([JSON.stringify(data, null, 2)], {type : 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Backup_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
    },

    importData: function(e) {
        const file = e.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = async (ev) => {
            try {
                const data = JSON.parse(ev.target.result);
                if(confirm("Restaurer ? Cela écrasera tout.")) {
                    await dbService.clearAll();
                    if(data.budget) for(const i of data.budget) await dbService.add('budget', i);
                    if(data.invest_tx) for(const i of data.invest_tx) await dbService.add('invest_tx', i);
                    if(data.invest_prices) for(const i of data.invest_prices) await dbService.add('invest_prices', i);
                    if(data.settings) for(const i of data.settings) await dbService.add('settings', i);
                    window.location.reload();
                }
            } catch(ex) { alert("Fichier invalide"); }
        };
        reader.readAsText(file);
    },
    
    forceUpdate: function() { window.location.reload(); }
};
