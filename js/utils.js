window.infoModule = {
    config: { username: 'antoto2021', repo: 'Appli-Suivi-investissement' },
    
    init: async function() { 
        // Vérification silencieuse au démarrage
        this.renderLocalInfo(); 
        setTimeout(() => this.checkGitHub(true), 3000); 
    },

    openModal: function() { 
        document.getElementById('info-modal-overlay').classList.remove('hidden'); 
        this.renderLocalInfo(); 
        this.checkStorage(); // Calcul du stockage à l'ouverture
        // On ne lance pas checkGitHub auto à l'ouverture pour laisser l'utilisateur cliquer s'il veut
    },

    closeModal: function() { 
        document.getElementById('info-modal-overlay').classList.add('hidden'); 
    },

    renderLocalInfo: function() { 
        const hash = localStorage.getItem('app_version_hash');
        document.getElementById('info-local-v').innerText = hash ? hash.substring(0,7) : 'Non défini'; 
    },

    // Vérification GitHub (Mode manuel ou silencieux)
    checkGitHub: function(bg=false) {
        const btn = document.getElementById('btn-check-update');
        const remoteLabel = document.getElementById('info-remote-v');
        
        if(!bg && btn) {
            btn.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Vérification...';
            btn.disabled = true;
        }

        return fetch(`https://api.github.com/repos/${this.config.username}/${this.config.repo}/commits?per_page=1`)
            .then(r => r.json())
            .then(d => {
                if(d && d[0]) {
                    const sha = d[0].sha;
                    const shortSha = sha.substring(0,7);
                    
                    // Mise à jour de l'affichage
                    if(remoteLabel) remoteLabel.innerText = shortSha;
                    
                    const local = localStorage.getItem('app_version_hash');
                    
                    // Comparaison
                    if(local && local !== sha) { 
                        document.getElementById('navUpdateDot')?.classList.remove('hidden');
                        document.getElementById('update-indicator')?.classList.remove('hidden');
                        if(!bg) this.toast("Nouvelle version disponible !");
                    } else {
                        if(!bg) this.toast("Vous êtes à jour.");
                    }

                    // On sauvegarde le hash pour la prochaine fois
                    if(!local) localStorage.setItem('app_version_hash', sha);
                    
                    return sha;
                }
            })
            .catch(e => { 
                console.error(e);
                if(remoteLabel) remoteLabel.innerText = 'Erreur réseau';
            })
            .finally(() => {
                if(!bg && btn) {
                    btn.innerHTML = '<i class="fa-solid fa-rotate"></i> Vérifier maintenant';
                    btn.disabled = false;
                }
            });
    },

    // Calcul de l'espace utilisé (Approximation ou API Storage Manager)
    checkStorage: async function() {
        const el = document.getElementById('storage-usage');
        if(!el) return;
        el.innerText = 'Calcul...';

        if (navigator.storage && navigator.storage.estimate) {
            try {
                const estimate = await navigator.storage.estimate();
                const used = estimate.usage || 0;
                el.innerText = this.formatBytes(used);
            } catch(e) {
                el.innerText = 'N/A';
            }
        } else {
            el.innerText = 'Non supporté';
        }
    },

    formatBytes: function(bytes, decimals = 2) {
        if (!+bytes) return '0 B';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    },

    // Helper pour afficher une notification (utilise le toast existant de invest.js s'il est accessible, sinon alert)
    toast: function(msg) {
        if(window.app && window.app.toast) {
            window.app.toast(msg);
        } else {
            console.log(msg);
        }
    },

    // Cette fonction reste dispo si vous voulez forcer la MAJ un jour, 
    // mais elle n'est plus appelée par le bouton "Vérifier".
    forceUpdate: function() {
        this.checkGitHub().then(sha => { 
            if(sha) localStorage.setItem('app_version_hash', sha); 
            setTimeout(() => window.location.reload(), 800); 
        });
    }
};
