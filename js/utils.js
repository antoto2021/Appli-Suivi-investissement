export const infoModule = {
    config: { username: 'antoto2021', repo: 'Appli-Suivi-investissement' },
    init: async function() { this.renderLocalInfo(); setTimeout(() => this.checkGitHub(true), 3000); },
    openModal: function() { document.getElementById('info-modal-overlay').classList.remove('hidden'); this.renderLocalInfo(); this.checkGitHub(false); },
    closeModal: function() { document.getElementById('info-modal-overlay').classList.add('hidden'); },
    renderLocalInfo: function() { document.getElementById('info-local-v').innerText = localStorage.getItem('app_version_hash')?.substring(0,7) || 'Init'; },
    checkGitHub: function(bg=false) {
        const btn = document.querySelector('#info-remote-v');
        if(!bg && btn) btn.innerText = '...';
        return fetch(`https://api.github.com/repos/${this.config.username}/${this.config.repo}/commits?per_page=1`)
            .then(r => r.json())
            .then(d => {
                if(d && d[0]) {
                    const sha = d[0].sha;
                    if(document.getElementById('info-remote-v')) document.getElementById('info-remote-v').innerText = sha.substring(0,7);
                    const local = localStorage.getItem('app_version_hash');
                    if(local && local !== sha) { 
                        document.getElementById('navUpdateDot')?.classList.remove('hidden'); 
                        document.getElementById('refreshUpdateDot')?.classList.remove('hidden'); 
                    }
                    if(!local) localStorage.setItem('app_version_hash', sha);
                    return sha;
                }
            })
            .catch(e => { if(!bg && btn) btn.innerText = 'Err'; });
    },
    forceUpdate: function() {
        const btn = document.getElementById('refreshBtn');
        btn.classList.add('spin-once');
        this.checkGitHub().then(sha => { if(sha) localStorage.setItem('app_version_hash', sha); setTimeout(() => window.location.reload(), 800); });
    }
};
