// js/main.js - Version Corrigée

const bootstrap = () => {
    console.log("Bootstrap Application Complete...");
    
    // 1. Init Modules Vanilla (app et infoModule sont maintenant globaux)
    if(window.app) window.app.init();
    if(window.infoModule) window.infoModule.init();
    
    // 2. Init React (Ma Banque)
    const rootEl = document.getElementById('budget-root');
    if(rootEl && window.BudgetApp) {
        try {
            const root = ReactDOM.createRoot(rootEl);
            // On utilise window.BudgetApp
            root.render(React.createElement(window.BudgetApp));
            console.log("React (Ma Banque) monté.");
        } catch(e) {
            console.error("Erreur React:", e);
        }
    }
    
    // 3. Icons
    if(window.lucide) lucide.createIcons();
};

// Lancement
bootstrap();
