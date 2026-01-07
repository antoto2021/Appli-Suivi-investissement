import { app } from './invest.js';
import { BudgetApp } from './budget.js';
import { pdfImporter } from './ai.js';
import { infoModule } from './utils.js';

// Rendre les modules accessibles globalement pour le HTML (onclick="app.x")
window.app = app;
window.pdfImporter = pdfImporter;
window.infoModule = infoModule;

const bootstrap = () => {
    console.log("Bootstrap Application Complete...");
    
    // Init Modules Vanilla
    app.init();
    infoModule.init();
    
    // Init React (Ma Banque)
    const rootEl = document.getElementById('budget-root');
    if(rootEl) {
        try {
            const root = ReactDOM.createRoot(rootEl);
            root.render(React.createElement(BudgetApp));
            console.log("React (Ma Banque) monté.");
        } catch(e) {
            console.error("Erreur React:", e);
        }
    }
    
    // Icons
    if(window.lucide) lucide.createIcons();
};

// Lancement
bootstrap();
