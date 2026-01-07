import { dbService } from './db.js';

export const pdfImporter = {
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

            let models = (data.models || []).filter(m => m.supportedGenerationMethods?.includes('generateContent'));

            models.sort((a,b) => {
                const getScore = (m) => {
                    const n = (m.displayName || m.name).toLowerCase();
                    if (n.includes('flash') && n.includes('1.5')) return 100;
                    if (n.includes('pro') && n.includes('1.5')) return 90;
                    if (n.includes('gemini-pro')) return 80;
                    return 0;
                };
                return getScore(b) - getScore(a);
            });

            if (models.length === 0) throw new Error("Aucun modèle compatible trouvé.");

            this.usableModels = models;
            this.apiKey = key;

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

        for(const model of this.usableModels) {
            const modelName = model.name.split('/').pop();
            this.log(`Tentative avec ${modelName}...`);
            
            try {
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
                break; 

            } catch(e) {
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
