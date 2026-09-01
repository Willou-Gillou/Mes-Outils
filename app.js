// ==== INITIALISATIONS GLOBALES V0.16.3 ====
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
const APP_VERSION = '3.4.12';
const DRIVE_FILE_NAME = 'app_sys_data_v1.dat';
const DRIVE_CLIENT_ID = '68487410553-mp697niljk1ov3sn2ucjfe8ckkqds48p.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.send';
const DRIVE_LS = 'finances_drive_';

var appSecretKey=null; var transactions=[], rules=[], categories={}, selectedBankForImport="";
let dbSortCol='dateOp', dbSortDir=-1, catModalTxId=null, catModalSelectedCat1=null, catModalSelectedCat2=null, catModalSource=null;
var driveAccessToken=null, driveFileId=null, driveTokenClient=null, saveTimer=null, saveMaxWaitTimer=null;
var driveDataLoaded = false; // true uniquement après chargement confirmé depuis Drive
// ── Multi-compte ──
var accounts = JSON.parse(localStorage.getItem('f_accounts')||'[{"id":"default","name":"Mon Compte"}]');
var currentAccountId = localStorage.getItem('f_current_account')||'default';
let driveFileIdMap = {};
// v3.4.5 : le nom de fichier Drive d'un compte est dérivé de son id STABLE (ex: "acc_1735600000000"),
// jamais de sa position dans le tableau `accounts` — cette position dépend de l'ordre de fusion local
// et peut différer d'un navigateur à l'autre, ce qui faisait pointer un même compte vers des fichiers
// Drive différents (et donc en écraser/corrompre un autre) selon le navigateur utilisé.
function getAccountDriveFilename(accountId){
    var id = accountId || currentAccountId;
    if (id === 'default') return 'appsysdata-default.dat';
    return 'appsysdata-' + id + '.dat';
}
function saveAccountsList(){ localStorage.setItem('f_accounts', JSON.stringify(accounts)); }

var collapsedGroups = new Set(), collapsedYears = new Set();
let duplicateFilterActive = false;
let fltNoteNotEmpty = false;
let dbPage = 0;
let tcdDetailSortCol = localStorage.getItem('tcdDetailSortCol') || 'dateOp';
let tcdDetailSortDir = parseInt(localStorage.getItem('tcdDetailSortDir') || '-1');
let uncatSortCol = localStorage.getItem('uncatSortCol') || 'dateOp';
let uncatSortDir = parseInt(localStorage.getItem('uncatSortDir') || '-1');
let duplicateIds = new Set();
let uncatColFilters = {dateOp:'', dateExpense:'', details:'', cat:'', note:'', amount:'', catNotEmpty: false, noteNotEmpty: false};
var tcdFilter = { cat1: new Set(), cat2: new Set(), yearsOp: new Set(), yearsExpense: new Set(), fiscalYearsOp: new Set(), fiscalYearsExpense: new Set(), months: new Set() }; // sets = éléments EXCLUS
var budgetFilter = { cat1: new Set(), cat2: new Set() }; // sets = éléments EXCLUS (filtre onglet Budget)
// ── v3.0.8 : Quittances ──────────────────────────────────────────────────────
var quittancesEnabled = false;
var quittancesBiens = []; 
// ── v3.0.8 : Exercice fiscal (par compte) ──────────────────────────────────────
var fiscalStartMonth = 1; // 1=Janvier (par défaut), 1-12
// ── v3.0.8 : Budget / Projection (par compte) ──────────────────────────────────
var budgetEnabled = false;
var regulEnabled = false;
var currentRegulBienId = null;
// ── v3.4.10 : Graphiques (par compte, activé par défaut) ────────────────────────
var chartsEnabled = true;
// ── v3.3.6 : Diagnostic intégré (réglage global, sans distinction de compte) ──
var diagEnabled = localStorage.getItem('f_diag_enabled') === '1';
var fiscalStartMonthSyndic = 10;
var budgetData = {}; // { [fiscalYearLabel]: { [cat1]: { [cat2]: { [month01..12]: montant } } } }// [{id, nom, bailleur:{nom,adresse,email,tel,signatureTexte,logoDataUrl}, locataires:[{nom,adresse}], designations:[{texte}], echeancier:[{date,libelle,montant,statut}], commentaires, faitA}]
var currentQuittanceBienId = null;
let _lastR1Keys = [];
let selectedUncatTxId = null;
let selectedUncatIds = new Set();
let tcdMap = {}; tcdMap['GRAND_TOTAL'] = [];
let tcdTabulator = null; 
let budgetTxMap = {};

$('versionLabel').textContent = `v${APP_VERSION}`;
document.title = 'Mes finances - v' + APP_VERSION;
// Cache-busting : si une version différente est détectée en localStorage, forcer un hard-reload une seule fois
(function() {
    try {
        var storedVersion = localStorage.getItem('f_app_version_seen');
        if (storedVersion !== APP_VERSION) {
            if (storedVersion) window._diagForceOpen = true; // v3.3.6 : mise à jour détectée → ouvrir le Diagnostic
            localStorage.setItem('f_app_version_seen', APP_VERSION);
            if (storedVersion && 'caches' in window) {
                caches.keys().then(function(names) { names.forEach(function(n) { caches.delete(n); }); });
            }
        }
    } catch(e) {}
})();

// ==== CONFIGURATION POLICE ====
let currentFontSize = parseInt(localStorage.getItem('f_fontSize') || '14', 10);
document.documentElement.style.setProperty('--font-size', currentFontSize + 'px');

window.adjustFont = function(dir) {
    currentFontSize += dir;
    if(currentFontSize < 10) currentFontSize = 10;
    if(currentFontSize > 24) currentFontSize = 24;
    document.documentElement.style.setProperty('--font-size', currentFontSize + 'px');
    localStorage.setItem('f_fontSize', currentFontSize); triggerSave(false);
};

// Appliquer couleur TCD sauvegardée immédiatement (avant rendu)
(function(){ const c=localStorage.getItem('f_tcd_header_color'); if(c) document.documentElement.style.setProperty('--tcd-header-color',c); })();

document.addEventListener('DOMContentLoaded', () => {
    window.renderAccountUI();
    let savedPivot = localStorage.getItem('f_pivot_v2');
    if(savedPivot) {
        try {
            let conf = JSON.parse(savedPivot);
            if(conf.r1) $('pivotRows').value = conf.r1;
            if(conf.r2 !== undefined) $('pivotRows2').value = conf.r2;
            if(conf.axe) $('timeAxe').value = conf.axe;
        } catch(e){}
    }
    // v3.0.8 : séquence Google d'abord, MDP ensuite
    driveShowLoading('Connexion à Google Drive...');
    let _apiAttempts = 0;
    let _apiCheck = setInterval(() => {
        if(typeof gapi !== 'undefined' && typeof google !== 'undefined' && google.accounts) {
            clearInterval(_apiCheck);
            initDrive();
        } else {
            _apiAttempts++;
            if(_apiAttempts > 60) { // ~12 secondes
                clearInterval(_apiCheck);
                driveHideLoading();
                $('driveLoginOverlay').innerHTML = '<div style="text-align:center;max-width:420px;padding:24px;background:white;border-radius:12px;box-shadow:var(--shadow);">'
                    + '<h2 style="margin-bottom:8px;">⚠️ Connexion impossible</h2>'
                    + '<p style="color:var(--ink-soft);margin-bottom:20px;">Les API Google Drive ne sont pas disponibles.<br>Vérifiez votre connexion ou désactivez votre bloqueur de publicités.</p>'
                    + '<button class="btn btn-primary" onclick="location.reload()" style="width:100%;padding:14px;">🔄 Réessayer</button>'
                    + '</div>';
                $('driveLoginOverlay').classList.add('open');
            }
        }
    }, 200);
});

// ==== ECHAP GESTION ====
document.addEventListener('keydown', e => {
    if(e.key === 'Escape') {
        let overlayOpen = false;
        $$('.overlay').forEach(o => { if(o.classList.contains('open') && o.id !== 'authOverlay') { o.classList.remove('open'); overlayOpen = true; } });
        if(!overlayOpen && $('view-data').classList.contains('active')) {
            let hasSelection = $$('.row-cb:checked').length > 0;
            let quickInput = $('bulkQuickCatInput');
            let hasQuickSearch = quickInput && quickInput.value !== '';
            
            if (hasSelection || hasQuickSearch) {
                if (quickInput) quickInput.value = '';
                let dd = $('bulkQuickCatDropdown');
                if (dd) dd.style.display = 'none';
                let allCb = $('selectAllCb');
                if (allCb) allCb.checked = false;
                $$('.row-cb').forEach(c => c.checked = false);
                window.updateBulkActions();
                window.renderDataTable();
            } else if(duplicateFilterActive) {
                window.toggleDuplicateFilter();
            } else if(fltNoteNotEmpty) {
                window.toggleFltNoteNotEmpty();
            } else {
                let cleared = false;
                $$('.col-filter').forEach(inp => { if(inp.value !== '') { inp.value = ''; cleared = true; } });
                if(cleared) window.renderDataTable();
            }
        }
        if(!overlayOpen && $('view-categorize').classList.contains('active')) {
            let quickInput = $('quickCatInput');
            let hasQuickSearch = quickInput && quickInput.value !== '';
            let anyFilter = ['ufDateOp','ufDateExpense','ufDetails','ufCat','ufNote','ufAmount'].some(id => { let el=$(id); return el && el.value !== ''; });
            
            if (hasQuickSearch) {
                quickInput.value = '';
                let dd = $('quickCatDropdown');
                if (dd) dd.style.display = 'none';
                selectedUncatTxId = null; selectedUncatIds.clear(); window.renderUncategorized();
            } else if (selectedUncatIds.size > 0) {
                selectedUncatTxId = null; selectedUncatIds.clear(); window.renderUncategorized();
            } else if(anyFilter || uncatColFilters.catNotEmpty) {
                window.resetUncatFilters();
            }
        }
    }
});

// ==== UTILITAIRES ET TRI ====
function escapeHtml(unsafe) { return (unsafe||'').toString().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); }
function formatCurrency(val) { return new Intl.NumberFormat('fr-FR', {style:'currency',currency:'EUR'}).format(val||0); }
function getC1Opts(sv) { 
    let keys = Object.keys(categories);
    if(sv && !keys.includes(sv)) keys.push(sv);
    return `<option value="">-- Cat 1 --</option>` + keys.sort(customSortCmp).map(k=>`<option value="${escapeHtml(k)}" ${k===sv?'selected':''}>${escapeHtml(k)}</option>`).join(''); 
}
function getC2Opts(c1,sv) { 
    let arr = (c1 && categories[c1]) ? [...categories[c1]] : [];
    if(sv && !arr.includes(sv)) arr.push(sv);
    return `<option value="">-- Cat 2 --</option>` + arr.sort(customSortCmp).map(c=>`<option value="${escapeHtml(c)}" ${c===sv?'selected':''}>${escapeHtml(c)}</option>`).join(''); 
}
function showSaveError(e) {
    const t = $('toast');
    t.textContent = '⚠ Sauvegarde Drive échouée : ' + (e && e.message ? e.message : 'erreur inconnue') + ' — Réessayez ou vérifiez votre connexion.';
    t.classList.add('show','toast-error');
    setTimeout(()=>{ t.classList.remove('show','toast-error'); }, 6000);
}
function showToast(msg) { const t=$('toast'); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),3000); }
function mergeRules() { if(!rules || !Array.isArray(rules)) rules=[]; let m={}; rules.forEach(r => { let k=(r.cat1||'')+"|||"+(r.cat2||''); if(!m[k])m[k]={c1:r.cat1,c2:r.cat2,p:new Set()}; if(r.pattern&&typeof r.pattern==='string')r.pattern.split(';').forEach(p=>{if(p.trim())m[k].p.add(p.trim());}); }); rules = Object.values(m).map(r => ({cat1:r.c1,cat2:r.c2,pattern:Array.from(r.p).join(' ; ')})); }
function customSortCmp(a, b) {
    let sa = String(a).toUpperCase(), sb = String(b).toUpperCase();
    let wA = sa.startsWith('_') ? 1 : (sa.startsWith('-') ? 2 : 3);
    let wB = sb.startsWith('_') ? 1 : (sb.startsWith('-') ? 2 : 3);
    if (wA !== wB) return wA - wB;
    return sa.localeCompare(sb);
}

// ==== REDIMENSIONNEMENT COLONNES ====
document.addEventListener('DOMContentLoaded', () => { ['uncatTable','dataTable','rulesTable'].forEach(initResizers); });
function initResizers(tableId) {
    const table = $(tableId); if(!table) return;
    table.querySelectorAll('th').forEach((th, i) => {
        let rs = th.querySelector('.resizer'); if(rs) rs.remove();
        rs = document.createElement('div'); rs.classList.add('resizer'); th.appendChild(rs);
        let startX, startW;
        const mm = e => { const w=startW+(e.pageX-startX); if(w>40){th.style.width=`${w}px`;th.style.minWidth=`${w}px`;th.style.maxWidth=`${w}px`;} };
        const mu = () => { rs.classList.remove('resizing'); document.removeEventListener('mousemove', mm); document.removeEventListener('mouseup', mu); let cw=JSON.parse(localStorage.getItem('f_cw'))||{}; cw[`${tableId}_${i}`]=th.style.width; localStorage.setItem('f_cw',JSON.stringify(cw)); };
        rs.addEventListener('mousedown', e => { startX=e.pageX; startW=th.offsetWidth; document.addEventListener('mousemove', mm); document.addEventListener('mouseup', mu); rs.classList.add('resizing'); e.stopPropagation(); e.preventDefault(); });
        rs.addEventListener('dblclick', e => {
            let maxW=0, s=document.createElement('span'); s.style.cssText='visibility:hidden;position:absolute;white-space:nowrap;font:'+window.getComputedStyle(th).font; s.textContent=th.textContent.replace('↕','').trim(); document.body.appendChild(s); maxW=s.offsetWidth+32; document.body.removeChild(s);
            let c=0; for(let row of table.querySelectorAll('tbody tr')){ if(c++>50)break; let td=row.children[i]; if(td){let inp=td.querySelector('input,select'),txt=inp?inp.value:td.textContent,s2=document.createElement('span');s2.style.cssText=s.style.cssText;s2.style.font=window.getComputedStyle(td).font;s2.textContent=txt;document.body.appendChild(s2);maxW=Math.max(maxW,s2.offsetWidth+32);document.body.removeChild(s2);}}
            let nw=Math.max(60,maxW); th.style.width=`${nw}px`;th.style.minWidth=`${nw}px`;th.style.maxWidth=`${nw}px`; let cw=JSON.parse(localStorage.getItem('f_cw'))||{}; cw[`${tableId}_${i}`]=`${nw}px`; localStorage.setItem('f_cw',JSON.stringify(cw)); e.stopPropagation();
        });
        let cw = JSON.parse(localStorage.getItem('f_cw'))||{}; if(cw[`${tableId}_${i}`]){th.style.width=cw[`${tableId}_${i}`];th.style.minWidth=cw[`${tableId}_${i}`];th.style.maxWidth=cw[`${tableId}_${i}`];}
    });
}
// v3.4.9 : factorisé pour pouvoir aussi activer un onglet par programme (restauration de
// l'onglet actif d'un compte, sans réagir comme un clic utilisateur qui déclencherait une sauvegarde).
function activateTab(target, silent) {
    let btn = document.querySelector(`.tab-btn[data-target="${target}"]`);
    if (!btn || btn.style.display === 'none') return false;
    $$('.tab-btn').forEach(b => b.classList.remove('active'));
    $$('.view').forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    $(target).classList.add('active');
    if (!silent) window.renderViewsSafe();
    return true;
}
$$('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
    tcdSaveScroll();
    activateTab(btn.dataset.target);
    localStorage.setItem('f_active_tab_' + currentAccountId, btn.dataset.target);
    triggerSave(false, true); // silencieux : changer d'onglet ne doit pas afficher "Sauvegarde en cours..."
    window.closeMobileHeaderMenu();
}));

// v3.3.9 : Menu déroulant mobile (regroupe compte/sync/import/police pour garder les onglets tout en haut)
window.toggleMobileHeaderMenu = function() {
    let row = $('headerControlsRow');
    if (row) row.classList.toggle('mobile-menu-open');
};
window.closeMobileHeaderMenu = function() {
    let row = $('headerControlsRow');
    if (row) row.classList.remove('mobile-menu-open');
};
document.addEventListener('click', (e) => {
    let row = $('headerControlsRow'), toggle = $('mobileMenuToggle');
    if (!row || !row.classList.contains('mobile-menu-open')) return;
    if (row.contains(e.target) || (toggle && toggle.contains(e.target))) return;
    window.closeMobileHeaderMenu();
});

// v3.3.6 : état initial de l'onglet Diagnostic (réglage global, indépendant du compte/déverrouillage)
applyDiagOptionState();
if (window._diagForceOpen) {
    let diagTab = $('tabDiagnostic');
    if (diagTab) {
        diagTab.style.display = '';
        setTimeout(() => { diagTab.click(); window.runDiagnostics(); }, 300);
    }
}

// Restaurer état TCD avant premier rendu
tcdLoadCollapsed();
loadTcdFilter();
// Listener scroll direct sur le wrapper (fiable cross-browser)
let _tcdScrollThrottleTimer = null;
function tcdSaveScrollThrottled() {
    // v3.3.7 : limite les écritures localStorage à 1 max toutes les 150ms pendant un scroll continu
    // (les appels directs à tcdSaveScroll() ailleurs — fermeture d'onglet, changement de visibilité — restent immédiats)
    if (_tcdScrollThrottleTimer) return;
    tcdSaveScroll();
    _tcdScrollThrottleTimer = setTimeout(() => { _tcdScrollThrottleTimer = null; }, 150);
}
(function attachWrapperScroll() {
    let w = document.getElementById('tcdScrollWrapper');
    if (w) { w.addEventListener('scroll', tcdSaveScrollThrottled); }
    else { requestAnimationFrame(attachWrapperScroll); }
})();
// Sauvegarder scroll juste avant refresh/fermeture
window.addEventListener('beforeunload', tcdSaveScroll);
// Sauvegarder aussi quand l'onglet perd le focus (changement d'onglet navigateur)
document.addEventListener('visibilitychange', () => { if (document.hidden) tcdSaveScroll(); });

// ==== CONNECTION DRIVE ====
const driveShowLoading=txt=>{$('loadingText').textContent=txt;$('driveLoadingOverlay').classList.add('open');$('driveLoginOverlay').classList.remove('open');};
const driveHideLoading=()=>{$('driveLoadingOverlay').classList.remove('open');};
const driveShowLogin=()=>{driveDataLoaded=true; driveHideLoading();$('driveLoginOverlay').classList.add('open');};

$('appPassword').addEventListener('keypress', e => { if(e.key==='Enter') $('unlockBtn').click(); });
$('unlockBtn').addEventListener('click', () => {
    const pwd = $('appPassword').value.trim(); if(!pwd) return alert("Mot de passe requis.");
    appSecretKey = pwd;
    $('authOverlay').classList.remove('open');
    driveShowLoading('Chargement des données...');
    fetchDriveData().catch(() => { driveDataLoaded=true; driveShowLogin(); });
});

const buildEncryptedPayload = () => {
    let activeTabBtn = document.querySelector('.tab-btn.active');
    let activeTab = activeTabBtn ? activeTabBtn.dataset.target : 'view-summary';
    let settings = {
        tcdHeaderColor: localStorage.getItem('f_tcd_header_color') || '',
        fontSize: localStorage.getItem('f_fontSize') || '14',
        tcdFontSize: localStorage.getItem('f_tcd_fontsize') || '13',
        budgetFontSize: localStorage.getItem('f_budget_fontsize') || '13',
        regulFontSize: localStorage.getItem('f_regul_fontsize') || '13',
        pivot: localStorage.getItem('f_pivot_v2') || '',
        collapsedGroups: [...collapsedGroups],
        collapsedYears:  [...collapsedYears],
        tcdFilter: { cat1:[...tcdFilter.cat1], cat2:[...tcdFilter.cat2], yearsOp:[...tcdFilter.yearsOp], yearsExpense:[...tcdFilter.yearsExpense], months:[...tcdFilter.months] },
        budgetFilter: { cat1:[...budgetFilter.cat1], cat2:[...budgetFilter.cat2] },
        tcdRedCells: (window.appState && window.appState.tcdRedCells) ? window.appState.tcdRedCells : {},
        settingsTs: Date.now(),
    };
    return JSON.stringify({vault: CryptoJS.AES.encrypt(JSON.stringify({transactions,rules,categories,version:APP_VERSION,accounts,settings,accountId:currentAccountId,savedCharts:savedCharts,quittancesBiens:quittancesBiens,quittancesEnabled:quittancesEnabled,budgetData:budgetData,budgetEnabled:budgetEnabled,regulEnabled:regulEnabled,fiscalStartMonthSyndic:fiscalStartMonthSyndic,fiscalStartMonth:fiscalStartMonth,activeTab:activeTab,chartsEnabled:chartsEnabled}),appSecretKey).toString()});
};
function decryptPayload(remoteData) {
    if(!remoteData.vault) { driveDataLoaded=true; return true; }
    try {
        const p = JSON.parse(CryptoJS.AES.decrypt(remoteData.vault, appSecretKey).toString(CryptoJS.enc.Utf8));
        if(!p) throw new Error("Bad pwd");
        // Sécurité: vérifier que ce fichier appartient bien au compte actif
        // Si accountId ne correspond pas → ne PAS appliquer les transactions (mauvais fichier)
        // Mais récupérer quand même la liste des comptes pour pouvoir recharger le bon
        if(p.accountId && p.accountId !== currentAccountId) {
            // Mauvais fichier chargé — fusionner la liste des comptes (jamais de remplacement pur)
            if(p.accounts && Array.isArray(p.accounts)) {
                let merged = accounts.slice();
                p.accounts.forEach(function(remoteAcc) {
                    if (!merged.find(function(a){ return a.id === remoteAcc.id; })) {
                        merged.push(remoteAcc);
                    }
                });
                accounts = merged;
                saveAccountsList();
            }
            // Switcher vers le bon compte et recharger
            currentAccountId = p.accountId;
            localStorage.setItem('f_current_account', currentAccountId);
            driveFileIdMap = {}; // reset cache fichier
            if(!window._redirectCount) window._redirectCount = 0;
            window._redirectCount++;
            if(window._redirectCount > 3) {
                window._redirectCount = 0;
                driveHideLoading();
                alert('Impossible de charger le bon compte. Vérifiez votre configuration.');
                return 'redirect';
            }
            setTimeout(() => fetchDriveData(), 300);
            return false; // signaler qu'il faut recharger
        }
        transactions=p.transactions||[]; rules=p.rules||[];
        if(p.categories) categories = p.categories;
        if(p.savedCharts) savedCharts = p.savedCharts;
        quittancesBiens = Array.isArray(p.quittancesBiens) ? p.quittancesBiens : [];
        let _todayStr = new Date().toISOString().slice(0,10);
        quittancesBiens.forEach(b => { b.signatureDate = _todayStr; });
        if (typeof p.quittancesEnabled === 'boolean') {
            quittancesEnabled = p.quittancesEnabled;
            localStorage.setItem('f_quittances_enabled_' + currentAccountId, quittancesEnabled ? '1' : '0');
        }
        // Graphiques : activé par défaut (chartsEnabled vaut true tant qu'aucune valeur explicite
        // n'a été sauvegardée) — donc les comptes existants créés avant cette option restent activés.
        if (typeof p.chartsEnabled === 'boolean') {
            chartsEnabled = p.chartsEnabled;
            localStorage.setItem('f_charts_enabled_' + currentAccountId, chartsEnabled ? '1' : '0');
        }
        if (typeof applyChartsOptionState === 'function') applyChartsOptionState();
        currentQuittanceBienId = quittancesBiens.length ? quittancesBiens[0].id : null;
        if (typeof applyQuittancesOptionState === 'function') applyQuittancesOptionState();
        budgetData = (p.budgetData && typeof p.budgetData === 'object') ? p.budgetData : {};
        if (typeof p.budgetEnabled === 'boolean') {
            budgetEnabled = p.budgetEnabled;
            localStorage.setItem('f_budget_enabled_' + currentAccountId, budgetEnabled ? '1' : '0');
        }
        if (typeof applyBudgetOptionState === 'function') applyBudgetOptionState();
    regulEnabled = localStorage.getItem('f_regul_enabled_' + currentAccountId) === '1';
    applyRegulOptionState();
        if (typeof p.regulEnabled === 'boolean') {
            regulEnabled = p.regulEnabled;
            localStorage.setItem('f_regul_enabled_' + currentAccountId, regulEnabled ? '1' : '0');
        }
        if (p.fiscalStartMonthSyndic) {
            fiscalStartMonthSyndic = parseInt(p.fiscalStartMonthSyndic) || 10;
            localStorage.setItem('f_fiscal_syndic_' + currentAccountId, fiscalStartMonthSyndic);
        }
        if (p.fiscalStartMonth) {
            fiscalStartMonth = parseInt(p.fiscalStartMonth) || 1;
            localStorage.setItem('f_fiscal_start_' + currentAccountId, fiscalStartMonth);
        }
        if (typeof applyFiscalStartMonthState === 'function') applyFiscalStartMonthState();
        currentRegulBienId = quittancesBiens.length ? quittancesBiens[0].id : null;
        if (typeof applyRegulOptionState === 'function') applyRegulOptionState();
        // Fusionner la liste des comptes depuis Drive avec la liste locale (jamais de remplacement pur)
        // Chaque fichier de compte ne contient qu'un instantané de la liste à sa dernière sauvegarde ;
        // remplacer purement ferait disparaître les comptes créés après cet instantané.
        if(p.accounts && Array.isArray(p.accounts) && p.accounts.length > 0) {
            let merged = accounts.slice();
            p.accounts.forEach(function(remoteAcc) {
                if (!merged.find(function(a){ return a.id === remoteAcc.id; })) {
                    merged.push(remoteAcc);
                } else {
                    // Mettre à jour le nom si modifié côté distant, sans perdre l'entrée locale
                    let localAcc = merged.find(function(a){ return a.id === remoteAcc.id; });
                    if (localAcc && remoteAcc.name) localAcc.name = remoteAcc.name;
                }
            });
            accounts = merged;
            saveAccountsList();
        }
        // currentAccountId N'EST JAMAIS MODIFIÉ ici
        // Restaurer les paramètres depuis Drive
        if(p.settings) {
            let s = p.settings;
            // Comparer timestamps : Drive gagne seulement si plus récent que local
            let localTs  = parseInt(localStorage.getItem('f_settings_ts') || '0');
            let driveTs  = parseInt(s.settingsTs || '0');
            let driveFresher = driveTs >= localTs;
            if(driveFresher) localStorage.setItem('f_settings_ts', driveTs);
            if(s.tcdHeaderColor) { localStorage.setItem('f_tcd_header_color', s.tcdHeaderColor); document.documentElement.style.setProperty('--tcd-header-color', s.tcdHeaderColor); let pk=$('tcdColorPicker'); if(pk) pk.value=s.tcdHeaderColor; }
            if(s.tcdFontSize) { localStorage.setItem('f_tcd_fontsize', s.tcdFontSize); let px=s.tcdFontSize+'px'; document.querySelectorAll('#summaryGrid .tcd-native th, #summaryGrid .tcd-native td').forEach(el=>{el.style.fontSize=px;el.style.height=px;}); }
            if(s.budgetFontSize) { localStorage.setItem('f_budget_fontsize', s.budgetFontSize); }
            if(s.regulFontSize) { localStorage.setItem('f_regul_fontsize', s.regulFontSize); }
            if(s.fontSize) { localStorage.setItem('f_fontSize', s.fontSize); currentFontSize=parseInt(s.fontSize)||14; document.documentElement.style.setProperty('--font-size', currentFontSize+'px'); }            // Paramètres vue TCD : appliquer seulement si Drive est plus récent
            if(driveFresher) {
                if(s.pivot) { localStorage.setItem('f_pivot_v2', s.pivot); try { let c=JSON.parse(s.pivot); if(c.r1){let el=$('pivotRows');if(el)el.value=c.r1;} if(c.r2!==undefined){let el=$('pivotRows2');if(el)el.value=c.r2;} if(c.axe){let el=$('timeAxe');if(el)el.value=c.axe;} } catch(e){} }
                if(s.collapsedGroups) { collapsedGroups = new Set(s.collapsedGroups); localStorage.setItem('tcd_cg', JSON.stringify(s.collapsedGroups)); }
                if(s.collapsedYears)  { collapsedYears  = new Set(s.collapsedYears);  localStorage.setItem('tcd_cy', JSON.stringify(s.collapsedYears)); }
                if(s.tcdFilter) {
                    let tf = s.tcdFilter;
                    tcdFilter.cat1   = new Set(tf.cat1   || []);
                    tcdFilter.cat2   = new Set(tf.cat2   || []);
                    tcdFilter.yearsOp = new Set(tf.yearsOp || tf.years || []);
                    tcdFilter.yearsExpense = new Set(tf.yearsExpense || []);
                    tcdFilter.months = new Set(tf.months || []);
                    localStorage.setItem('tcd_filter', JSON.stringify(tf));
                    // Restaurer cellules rouges TCD
                    if (s.tcdRedCells && typeof s.tcdRedCells === 'object') {
                        if (!window.appState) window.appState = {};
                        window.appState.tcdRedCells = s.tcdRedCells;
                        setTimeout(function() { if(window.applyTcdRedTags) window.applyTcdRedTags(); }, 300);
                    }
                }
                if(s.budgetFilter) {
                    let bf = s.budgetFilter;
                    budgetFilter.cat1 = new Set(bf.cat1 || []);
                    budgetFilter.cat2 = new Set(bf.cat2 || []);
                    localStorage.setItem('budget_filter_' + currentAccountId, JSON.stringify(bf));
                }
            }
        }
        if (p.activeTab) {
            localStorage.setItem('f_active_tab_' + currentAccountId, p.activeTab);
            if (typeof activateTab === 'function') activateTab(p.activeTab, true);
        }
        mergeRules(); return true;
    } catch(e) { return false; }
}

function initDrive() {
    let gapiReady = false, gisReady = false;
    const checkReady = () => {
        if (gapiReady && gisReady) {
            driveTokenClient = google.accounts.oauth2.initTokenClient({
                client_id: DRIVE_CLIENT_ID, scope: DRIVE_SCOPE,
                callback: async (resp) => {
                    if (resp.error) { driveShowLogin(); return; }
                    driveAccessToken = resp.access_token;
                    gapi.client.setToken({ access_token: driveAccessToken });
                    localStorage.setItem(DRIVE_LS+'token', driveAccessToken);
                    localStorage.setItem(DRIVE_LS+'token_exp', (Date.now()+((resp.expires_in||3599)*1000)).toString());
                    localStorage.setItem(DRIVE_LS+'scope', DRIVE_SCOPE);
                    localStorage.setItem(DRIVE_LS+'granted_scope', resp.scope || '');
                    $('driveLoginOverlay').classList.remove('open');
                    $('logoutBtn').style.display = 'inline-flex';
                    // Google OK → demander MDP
                    driveHideLoading();
                    $('authOverlay').classList.add('open');
                    $('appPassword').focus();
                }
            });
            const token = localStorage.getItem(DRIVE_LS+'token'), tokenExp = localStorage.getItem(DRIVE_LS+'token_exp');
            const grantedScopeStr = localStorage.getItem(DRIVE_LS+'granted_scope') || '';
            const requiredScopes = DRIVE_SCOPE.split(' ');
            const hasAllScopes = requiredScopes.every(s => grantedScopeStr.indexOf(s) !== -1);
            if (token && tokenExp && Date.now() < parseInt(tokenExp,10) && hasAllScopes) {
                driveAccessToken = token; gapi.client.setToken({ access_token: driveAccessToken });
                $('logoutBtn').style.display = 'inline-flex';
                // Token valide → demander MDP
                driveHideLoading();
                $('authOverlay').classList.add('open');
                $('appPassword').focus();
            } else {
                // Scope insuffisant (ex: ancien token sans accès Drive complet) → forcer une nouvelle autorisation
                localStorage.removeItem(DRIVE_LS+'token');
                localStorage.removeItem(DRIVE_LS+'token_exp');
                localStorage.removeItem(DRIVE_LS+'scope');
                localStorage.removeItem(DRIVE_LS+'granted_scope');
                driveShowLogin();
            }
        }
    };
    gapi.load('client', async () => { await gapi.client.init({}); gapiReady = true; checkReady(); }); gisReady = true; checkReady();
}

$('googleLoginBtnReal').addEventListener('click', () => { driveShowLoading("Authentification..."); driveTokenClient.requestAccessToken({ prompt: 'consent' }); });
$('logoutBtn').addEventListener('click', () => { if(driveAccessToken)google.accounts.oauth2.revoke(driveAccessToken); localStorage.removeItem(DRIVE_LS+'token'); localStorage.removeItem(DRIVE_LS+'token_exp'); localStorage.removeItem(DRIVE_LS+'scope'); localStorage.removeItem(DRIVE_LS+'granted_scope'); location.reload(); });
const updateSyncBadge=(st,txt)=>{
    let b=$('syncBadge');
    b.textContent=txt;
    b.className=`badge badge-sync ${st==='ok'?'synced':st==='syncing'?'syncing':st==='error'?'error':''}`;
    b.onclick = st==='error' ? ()=>{ triggerSave(false); } : null;
    b.title   = st==='error' ? 'Cliquez pour réessayer la sauvegarde' : '';
};

// v3.4.5 : scanne une seule fois par session les anciens fichiers "appsysdata-<index>.dat"
// (nommage instable basé sur la position dans le tableau `accounts`, abandonné) pour les
// renommer vers le nom stable basé sur l'accountId réel contenu dans leur contenu déchiffré.
// Renommer (et non recopier) préserve le même fichier Drive : aucune perte de données.
let driveLegacyScanPromise = null;
function driveMigrateLegacyAccountFiles() {
    if (driveLegacyScanPromise) return driveLegacyScanPromise;
    driveLegacyScanPromise = (async () => {
        if (!appSecretKey || !driveAccessToken) return;
        try {
            let r = await fetch("https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name+contains+'appsysdata-'&fields=files(id,name)&pageSize=100", { headers: { Authorization: 'Bearer ' + driveAccessToken } });
            let d = await r.json();
            let legacyFiles = (d.files || []).filter(f => /^appsysdata-\d+\.dat$/.test(f.name));
            for (let f of legacyFiles) {
                try {
                    let resp = await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`, { headers: { Authorization: 'Bearer ' + driveAccessToken } });
                    let text = await resp.text();
                    if (!text || !text.trim().startsWith('{')) continue;
                    let remoteData = JSON.parse(text);
                    if (!remoteData.vault) continue;
                    let decrypted = JSON.parse(CryptoJS.AES.decrypt(remoteData.vault, appSecretKey).toString(CryptoJS.enc.Utf8));
                    if (!decrypted || !decrypted.accountId) continue;
                    let newName = getAccountDriveFilename(decrypted.accountId);
                    if (newName !== f.name) {
                        await fetch(`https://www.googleapis.com/drive/v3/files/${f.id}`, {
                            method: 'PATCH',
                            headers: { Authorization: 'Bearer ' + driveAccessToken, 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name: newName })
                        });
                    }
                    driveFileIdMap[decrypted.accountId] = f.id;
                } catch (e) { console.warn('Migration ignorée pour', f.name, e); }
            }
        } catch (e) { console.warn('Scan de migration des anciens fichiers de compte échoué:', e); }
    })();
    return driveLegacyScanPromise;
}

// v3.4.6 : registre central des comptes — source de vérité unique sur Drive.
// Avant cette version, la liste `accounts` n'existait qu'en copies : une par navigateur
// (localStorage) et une embarquée dans CHAQUE fichier de compte, fusionnées de façon purement
// additive au chargement (jamais de suppression). Deux conséquences : un compte restauré via
// "Importer depuis .dat" (qui génère toujours un nouvel id, jamais l'id source) créait un
// doublon jamais nettoyé, et supprimer un compte ne mettait à jour QUE le fichier du compte
// actif au moment du clic — les autres fichiers gardaient l'ancienne liste et la faisaient
// ressurgir au chargement. Le registre ci-dessous devient la référence unique : chargé en
// priorité à la connexion, et réécrit à chaque ajout/renommage/suppression de compte.
const ACCOUNTS_REGISTRY_FILENAME = 'appsysdata-accounts.dat';
let driveAccountsRegistryFileId = null;

async function driveGetAccountsRegistryFileId() {
    if (driveAccountsRegistryFileId) return driveAccountsRegistryFileId;
    let r = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${ACCOUNTS_REGISTRY_FILENAME}'&fields=files(id)`, { headers: { Authorization: 'Bearer ' + driveAccessToken } });
    let d = await r.json();
    let fid = (d.files && d.files.length > 0) ? d.files[0].id : null;
    if (fid) driveAccountsRegistryFileId = fid;
    return fid;
}

async function loadAccountsRegistry() {
    if (!driveAccessToken || !appSecretKey) return false;
    try {
        let fileId = await driveGetAccountsRegistryFileId();
        if (!fileId) return false;
        let resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: 'Bearer ' + driveAccessToken } });
        let text = await resp.text();
        if (!text || !text.trim().startsWith('{')) return false;
        let remoteData = JSON.parse(text);
        if (!remoteData.vault) return false;
        let list = JSON.parse(CryptoJS.AES.decrypt(remoteData.vault, appSecretKey).toString(CryptoJS.enc.Utf8));
        if (!Array.isArray(list) || !list.length) return false;
        accounts = list;
        saveAccountsList();
        return true;
    } catch (e) { console.warn('Lecture du registre des comptes échouée:', e); return false; }
}

async function saveAccountsRegistry() {
    if (!driveAccessToken || !appSecretKey) return;
    try {
        let payload = JSON.stringify({ vault: CryptoJS.AES.encrypt(JSON.stringify(accounts), appSecretKey).toString() });
        let fileId = await driveGetAccountsRegistryFileId();
        let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', method = 'POST';
        let form = new FormData();
        if (fileId) { url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`; method = 'PATCH'; }
        else { form.append('metadata', new Blob([JSON.stringify({ name: ACCOUNTS_REGISTRY_FILENAME, parents: ['appDataFolder'] })], { type: 'application/json' })); }
        form.append('file', new Blob([payload], { type: 'application/json' }));
        let r = await fetch(url, { method, headers: { Authorization: 'Bearer ' + driveAccessToken }, body: fileId ? payload : form });
        if (!fileId && r.ok) { let d = await r.json(); if (d.id) driveAccountsRegistryFileId = d.id; }
    } catch (e) { console.warn('Écriture du registre des comptes échouée:', e); }
}

async function driveGetFileId(accountId) {
    let id = accountId || currentAccountId;
    let fname = getAccountDriveFilename(id);
    if(driveFileIdMap[id]) return driveFileIdMap[id];
    let r = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${fname}'&fields=files(id)`,{headers:{Authorization:'Bearer '+driveAccessToken}});
    let d = await r.json();
    let fid = (d.files&&d.files.length>0) ? d.files[0].id : null;
    if (!fid && id !== 'default') {
        await driveMigrateLegacyAccountFiles();
        fid = driveFileIdMap[id] || null;
    }
    if(fid) driveFileIdMap[id] = fid;
    return fid;
}

async function fetchDriveData() {
    try {
        // Charge le registre central des comptes AVANT de résoudre le fichier du compte courant :
        // c'est désormais la référence, prioritaire sur la copie locale (localStorage) et sur
        // les copies embarquées dans les fichiers de comptes (fusionnées, elles, en aval).
        await loadAccountsRegistry();
        const fileId = await driveGetFileId();
        if (fileId) {
            const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${driveAccessToken}` } });
            let text = await resp.text(), remoteData={}; if(text && text.trim().startsWith('{')) remoteData = JSON.parse(text);
            const decryptResult = decryptPayload(remoteData);
            if(decryptResult === true) {
                driveDataLoaded=true;
                window._suppressSave = true;
                localStorage.setItem(DRIVE_LS+'token', driveAccessToken);
                tcdLoadCollapsed(); loadTcdFilter();
                window.renderAccountUI(); window.renderViewsSafe();
                window._suppressSave = false;
                // Remonte au registre toute entrée que la fusion locale aurait ajoutée
                // (migration en douceur des anciennes copies embarquées, compte par compte).
                saveAccountsRegistry();
                updateSyncBadge('ok', '✓ Connecté'); driveHideLoading();
            } else if(decryptResult === 'redirect') {
                // Mauvais fichier de compte → rechargement en cours, patienter
                updateSyncBadge('syncing', 'Chargement du compte...');
            } else {
                // false = MDP incorrect
                appSecretKey = null;
                updateSyncBadge('error', 'Clé erronée');
                driveHideLoading();
                $('authOverlay').classList.add('open');
                $('appPassword').value = '';
                $('appPassword').focus();
                alert('❌ Mot de passe incorrect. Veuillez réessayer.');
            }
        } else { updateSyncBadge('ok', '✓ Nouveau'); tcdLoadCollapsed(); window.renderViewsSafe();  driveHideLoading(); }
    } catch (e) { updateSyncBadge('error', 'Erreur Sync'); driveHideLoading(); $('authOverlay').classList.add('open'); }
}

async function performSave(reRenderDbView) {
    let quiet = pendingSaveQuiet;
    pendingSaveQuiet = true; // repart silencieux pour le prochain lot de modifications
    clearTimeout(saveTimer); saveTimer = null;
    clearTimeout(saveMaxWaitTimer); saveMaxWaitTimer = null;
    if (!driveAccessToken || !appSecretKey) return;
    try {
        const payload = buildEncryptedPayload(); const fileId = await driveGetFileId();
        let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', method = 'POST'; const form = new FormData();
        if (fileId) { url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`; method = 'PATCH'; }
        else { const meta = { name: getAccountDriveFilename(), parents: ['appDataFolder'] }; form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' })); }
        form.append('file', new Blob([payload], { type: 'application/json' }));
        const _sr=await fetch(url,{method,headers:{Authorization:`Bearer ${driveAccessToken}`},body:fileId?payload:form});
        if(!_sr.ok) {
            // Token expiré → on le renouvelle et on réessaie une fois
            if(_sr.status===401) {
                driveAccessToken = null;
                try {
                    await new Promise((res,rej)=>{ driveTokenClient.requestAccessToken({prompt:''}); setTimeout(res,3000); });
                    const _sr2=await fetch(url,{method,headers:{Authorization:`Bearer ${driveAccessToken}`},body:fileId?payload:form});
                    if(!_sr2.ok) throw new Error('HTTP '+_sr2.status);
                } catch(e2) { throw new Error('401 retry failed'); }
            } else {
                throw new Error('HTTP '+_sr.status);
            }
        }
        if(!fileId){try{const _d=await _sr.clone().json();if(_d.id)driveFileIdMap[currentAccountId]=_d.id;}catch(e){}}
        if (!quiet) updateSyncBadge('ok', '✓ Sauvegardé');
        if(reRenderDbView) window.renderDataTable();
    } catch (e) {
        updateSyncBadge('error', '⚠ Échec sauvegarde — cliquez'); // toujours visible, même pour un lot silencieux
        showSaveError(e);
    }
}

// v3.4.10 : lot de sauvegarde "silencieux" — reste true tant qu'aucun appel non silencieux n'a
// rejoint le lot en cours ; performSave() le consulte au moment de s'exécuter puis le remet à
// true. Sert à éviter le badge "Sauvegarde en cours..." pour des actions mineures (changer
// d'onglet) sans renoncer à synchroniser sur Drive.
let pendingSaveQuiet = true;
function triggerSave(reRenderDbView = false, quiet = false) {
    if(window._suppressSave) return; // bloqué pendant chargement initial
    pendingSaveQuiet = pendingSaveQuiet && quiet;
    if (!pendingSaveQuiet) updateSyncBadge('syncing', 'Sauvegarde en cours...');
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => performSave(reRenderDbView), 1000);
    // Filet de sécurité : lors d'une rafale de modifications rapprochées (ex. catégorisation
    // en série), chaque appel repousse saveTimer et la sauvegarde réelle n'arrive jamais tant
    // que l'utilisateur ne s'arrête pas — le badge reste bloqué sur "Sauvegarde en cours..."
    // et les données restent non sauvegardées plus longtemps que nécessaire. Ce timer plafond
    // force une sauvegarde périodique même en cas d'activité continue.
    if (!saveMaxWaitTimer) {
        saveMaxWaitTimer = setTimeout(() => performSave(reRenderDbView), 5000);
    }
}

// ==== VUES ET TABLEAU CROISE DYNAMIQUE ====
window.renderViewsSafe = function() {
    try { window.renderSummary(); window.renderUncategorized(); window.renderDataTable(); window.renderRules(); window.renderCategories(); $('bulkCat1').innerHTML=getC1Opts(); window.renderCharts(); applyChartsOptionState(); applyQuittancesOptionState(); if (typeof window.renderQuittancesView === 'function') window.renderQuittancesView(); applyBudgetOptionState();
    regulEnabled = localStorage.getItem('f_regul_enabled_' + currentAccountId) === '1';
    applyRegulOptionState(); if (budgetEnabled && typeof window.renderBudget === 'function') window.renderBudget(); if (regulEnabled && typeof window.renderRegul === 'function') window.renderRegul(); } catch(err) { console.error('Erreur affichage:', err); alert("Erreur d'affichage: " + err.message); }
};

window.toggleGroup = function(r1) { tcdSaveScroll(); if(collapsedGroups.has(r1)) collapsedGroups.delete(r1); else collapsedGroups.add(r1); tcdSaveCollapsed(); window.renderSummary(); };
window.toggleAllGroups = function(expand) {
        if(expand) { collapsedGroups.clear(); }
    else { (_lastR1Keys.length ? _lastR1Keys : Object.keys(categories)).forEach(k => collapsedGroups.add(k)); collapsedGroups.add('_SANS_CATEGORIE'); } tcdSaveCollapsed(); tcdSaveCollapsed(); window.renderSummary();
};

window.toggleYear = function(y) { tcdSaveScroll(); if(collapsedYears.has(y)) collapsedYears.delete(y); else collapsedYears.add(y); tcdSaveCollapsed(); window.renderSummary(); };
window.toggleAllYears = function(expand) {
        if(expand) collapsedYears.clear();
    else {
        let tAxe = $('timeAxe').value;
        transactions.forEach(t => {
            let dStr = String(t[tAxe] || t.dateOp || '');
            let y = dStr.length >= 4 ? dStr.substring(0,4) : '(vide)';
            collapsedYears.add(y);
        });
    }
    tcdSaveCollapsed(); window.renderSummary();
};

function enrichTxTimeFields(t) {
    let dop = String(t.dateOp || ''); t.yearOp = dop.length >= 4 ? dop.substring(0,4) : ''; t.monthOp = dop.length >= 7 ? dop.substring(0,7) : ''; 
    let dexp = t.dateExpense || t.dateOp; t.yearExpense = dexp.length >= 4 ? dexp.substring(0,4) : ''; t.monthExpense = dexp.length >= 7 ? dexp.substring(0,7) : ''; 
}

// ── v3.0.8 : Utilitaires exercice fiscal ────────────────────────────────────
function getFiscalYearLabel(y, m, startMonth) {
    // y: année civile (string 4 chiffres), m: mois "01".."12", startMonth: 1-12
    if (!y || y === 'vide' || !m || m === 'vide') return 'vide';
    let yi = parseInt(y, 10), mi = parseInt(m, 10);
    if (startMonth === 1) return String(yi);
    // Exercice décalé: si le mois est avant le mois de début, il appartient à l'exercice qui a commencé l'année précédente
    let fiscalStartYear = (mi >= startMonth) ? yi : (yi - 1);
    return `${fiscalStartYear}-${fiscalStartYear + 1}`;
}
function getFiscalMonthOrder(m, startMonth) {
    // Renvoie un rang 0-11 pour trier les mois dans l'ordre de l'exercice fiscal
    let mi = parseInt(m, 10);
    if (isNaN(mi)) return 99;
    return (mi - startMonth + 12) % 12;
}
function loadFiscalStartMonth() {
    let v = localStorage.getItem('f_fiscal_start_' + currentAccountId);
    fiscalStartMonth = v ? parseInt(v, 10) : 1;
    if (isNaN(fiscalStartMonth) || fiscalStartMonth < 1 || fiscalStartMonth > 12) fiscalStartMonth = 1;
}
window.setFiscalStartMonth = function(v) {
    fiscalStartMonth = parseInt(v, 10) || 1;
    localStorage.setItem('f_fiscal_start_' + currentAccountId, String(fiscalStartMonth));
    window.renderSummary();
    showToast('Exercice fiscal mis à jour ✓');
};

// ── v3.0.8 : Budget / Projection — logique ──────────────────────────────────
window.populateBudgetExerciceSelect = function() {
    let sel = $('budgetExerciceSelect');
    if (!sel) return;
    let exercices = new Set();
    transactions.forEach(t => {
        let dStr = String(t.dateExpense || t.dateOp || '');
        if (dStr.length < 7) return;
        let y = dStr.substring(0,4), m = dStr.substring(5,7);
        exercices.add(getFiscalYearLabel(y, m, fiscalStartMonth));
    });
    Object.keys(budgetData).forEach(ex => exercices.add(ex));
    let sorted = [...exercices].sort();
    if (sorted.length === 0) {
        let now = new Date();
        let y = String(now.getFullYear()), m = String(now.getMonth()+1).padStart(2,'0');
        sorted = [getFiscalYearLabel(y, m, fiscalStartMonth)];
    }
    let prevVal = sel.value;
    sel.innerHTML = sorted.map(ex => `<option value="${ex}">${ex}</option>`).join('');
    if (sorted.includes(prevVal)) sel.value = prevVal;
    else sel.value = sorted[sorted.length-1];
    window.renderBudget();
};

window.setBudgetCell = function(ex, c1, c2, month, val) {
    if (budgetData[ex] && budgetData[ex].__closed) { window.renderBudget(); return; }
    // Nettoyer le texte (peut contenir le symbole monétaire, espaces insécables, etc.)
    let cleaned = String(val||'').replace(/[\s\u00A0\u202F€a-zA-Z]/g,'').replace(',', '.').trim();
    let n = parseFloat(cleaned);
    if (isNaN(n)) n = 0;
    // v3.3.11 : ne sauvegarder que si la valeur a réellement changé (simple focus/clic sans édition ne doit rien déclencher)
    let existing = (budgetData[ex] && budgetData[ex][c1] && budgetData[ex][c1][c2] && budgetData[ex][c1][c2][month]) || 0;
    if (n === existing) return;
    if (!budgetData[ex]) budgetData[ex] = {};
    if (!budgetData[ex][c1]) budgetData[ex][c1] = {};
    if (!budgetData[ex][c1][c2]) budgetData[ex][c1][c2] = {};
    if (n === 0) delete budgetData[ex][c1][c2][month];
    else budgetData[ex][c1][c2][month] = n;
    triggerSave(true);
    window.renderBudget();
};

window.onIndicatorTripleClick = function(event, el) {
    if (event.detail < 3) return;
    event.preventDefault();
    event.stopPropagation();
    let ex = el.getAttribute('data-ex');
    if (budgetData[ex] && budgetData[ex].__closed) return;

    if (event.shiftKey) {
        let indicators = document.querySelectorAll('.budget-indicator[data-real]');
        let updated = false;
        indicators.forEach(ind => {
            let tex = ind.getAttribute('data-ex');
            if (tex !== ex) return;
            let tc1 = ind.getAttribute('data-c1');
            let tc2 = ind.getAttribute('data-c2');
            let tm = ind.getAttribute('data-m');
            let trv = ind.getAttribute('data-real');
            let cleaned = String(trv||'').replace(/[\s  €a-zA-Z]/g,'').replace(',', '.').trim();
            let n = parseFloat(cleaned);
            if (isNaN(n)) n = 0;
            if (!budgetData[tex]) budgetData[tex] = {};
            if (!budgetData[tex][tc1]) budgetData[tex][tc1] = {};
            if (!budgetData[tex][tc1][tc2]) budgetData[tex][tc1][tc2] = {};
            if (n === 0) delete budgetData[tex][tc1][tc2][tm];
            else budgetData[tex][tc1][tc2][tm] = n;
            updated = true;
        });
        if (updated) {
            triggerSave(true);
            window.renderBudget();
            showToast("Toutes les valeurs réelles ont été copiées ✓");
        }
    } else {
        let c1 = el.getAttribute('data-c1');
        let c2 = el.getAttribute('data-c2');
        let m = el.getAttribute('data-m');
        let realVal = el.getAttribute('data-real');
        window.setBudgetCell(ex, c1, c2, m, realVal);
    }
};


window.renderBudget = function() {
    let sel = $('budgetExerciceSelect');
    let container = $('budgetGrid');
    if (!sel || !container) return;
    let ex = sel.value;
    if (!ex) return;

    let dateAxe = 'dateOp';

    let months = [];
    for (let i = 0; i < 12; i++) {
        let mi = ((fiscalStartMonth - 1 + i) % 12) + 1;
        months.push(String(mi).padStart(2,'0'));
    }
    const monthNames = ['','Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    const monthLabel = (m, extraMap) => {
        if (extraMap && extraMap[m]) {
            let ex2 = extraMap[m];
            return `${monthNames[parseInt(ex2.m)]} ${ex2.y}`;
        }
        return monthNames[parseInt(m)];
    };

    let realByC1C2Month = {}, realByC1Month = {};
    let extraMonthsMap = {}; // key "MM_YYYY" -> {m, y} pour les mois d'écriture hors intervalle standard
    budgetTxMap = {}; budgetTxMap['GRAND_TOTAL'] = [];
    const pushBudgetTx = (key, t) => { if (!budgetTxMap[key]) budgetTxMap[key] = []; budgetTxMap[key].push(t); };
    transactions.forEach(t => {
        if (t.amount === 0) return;
        // Sélection: la date réelle (dateExpense) doit appartenir à l'intervalle de l'exercice
        let dRealStr = String(t.dateExpense || t.dateOp || '');
        if (dRealStr.length < 7) return;
        let yReal = dRealStr.substring(0,4), mReal = dRealStr.substring(5,7);
        if (getFiscalYearLabel(yReal, mReal, fiscalStartMonth) !== ex) return;
        // Affichage: regroupé par date d'écriture (dateOp)
        let dOpStr = String(t.dateOp || t.dateExpense || '');
        if (dOpStr.length < 7) return;
        let yOp = dOpStr.substring(0,4), mOp = dOpStr.substring(5,7);
        let c1 = t.cat1 || '_SANS_CATEGORIE', c2 = t.cat2 || '_SANS_CATEGORIE';
        if (budgetFilter.cat1.has(c1) || budgetFilter.cat2.has(c2)) return;
        let amt = Number(t.amount) || 0;
        // Si le mois d'écriture est hors de l'intervalle standard de l'exercice, on crée une colonne additionnelle
        let isStandard = getFiscalYearLabel(yOp, mOp, fiscalStartMonth) === ex;
        let m = isStandard ? mOp : `X${yOp}${mOp}`;
        if (!isStandard) extraMonthsMap[m] = { m: mOp, y: yOp };
        let k = `${c1}::${c2}::${m}`;
        realByC1C2Month[k] = (realByC1C2Month[k]||0) + amt;
        let k1 = `${c1}::${m}`;
        realByC1Month[k1] = (realByC1Month[k1]||0) + amt;

        // Alimentation de la map pour le détail des opérations (drilldown "Réel")
        pushBudgetTx(`${c1}::${c2}::${m}`, t);
        pushBudgetTx(`${c1}::${c2}::ALL`, t);
        pushBudgetTx(`${c1}::ALL::${m}`, t);
        pushBudgetTx(`${c1}::ALL::ALL`, t);
        pushBudgetTx(`MONTH_TOTAL::${m}`, t);
        pushBudgetTx('GRAND_TOTAL', t);
    });

    Object.keys(realByC1C2Month).forEach(k => realByC1C2Month[k] = Number(realByC1C2Month[k].toFixed(2)));
    Object.keys(realByC1Month).forEach(k => realByC1Month[k] = Number(realByC1Month[k].toFixed(2)));

    let yFiscalStartForSort = parseInt(ex.split('-')[0], 10);
    months = months.concat(Object.keys(extraMonthsMap)).sort((a, b) => {
        let getAbs = (k) => {
            if (extraMonthsMap[k]) return extraMonthsMap[k].y + extraMonthsMap[k].m;
            let mi = parseInt(k, 10);
            return String((mi >= fiscalStartMonth) ? yFiscalStartForSort : yFiscalStartForSort + 1) + String(mi).padStart(2, '0');
        };
        return getAbs(a).localeCompare(getAbs(b));
    });

    let allCats = {};
    Object.keys(categories).forEach(c1 => {
        if (budgetFilter.cat1.has(c1)) return;
        let c2set = new Set((categories[c1]||[]).filter(c2 => !budgetFilter.cat2.has(c2)));
        allCats[c1] = c2set;
    });
    // Persistance: une catégorie supprimée de la base reste visible tant qu'un montant planifié (non nul) subsiste
    const hasNonZeroBudget = (c1, c2) => {
        let node = budgetData[ex] && budgetData[ex][c1] && budgetData[ex][c1][c2];
        if (!node) return false;
        return Object.values(node).some(v => (Number(v) || 0) !== 0);
    };
    if (budgetData[ex]) {
        Object.keys(budgetData[ex]).forEach(c1 => {
            if (c1 === '__validated' || budgetFilter.cat1.has(c1)) return;
            Object.keys(budgetData[ex][c1]).forEach(c2 => {
                if (budgetFilter.cat2.has(c2)) return;
                let existsInDb = categories[c1] && categories[c1].includes(c2);
                if (existsInDb) return; // déjà inclus via `categories`
                if (hasNonZeroBudget(c1, c2)) {
                    if (!allCats[c1]) allCats[c1] = new Set();
                    allCats[c1].add(c2);
                }
            });
        });
    }
    let c1Sorted = Object.keys(allCats).sort(customSortCmp);

    const getBudget = (c1, c2, m) => (budgetData[ex] && budgetData[ex][c1] && budgetData[ex][c1][c2] && budgetData[ex][c1][c2][m]) || 0;
    const getValidatedBudget = (c1, c2, m) => {
        let v = budgetData[ex] && budgetData[ex].__validated;
        return (v && v[c1] && v[c1][c2] && v[c1][c2][m]) || 0;
    };
    let hasValidated = !!(budgetData[ex] && budgetData[ex].__validated);

    const deltaHtml = (current, validated) => {
        if (!hasValidated) return '';
        let d = current - validated;
        if (d === 0) return '';
        let cls = d < 0 ? 'delta-neg' : 'delta-pos';
        return ` <span class="budget-delta ${cls}">(${d>0?'+':''}${formatCurrency(d)})</span>`;
    };

    // ─── Cellules du tableau BUDGET (haut) ───
    let nowY = new Date().getFullYear(), nowM = new Date().getMonth() + 1;
    const isFutureMonth = (m) => {
        if (extraMonthsMap[m]) return false; // colonnes additionnelles: non concernées (déjà non-éditables)
        let mi = parseInt(m, 10);
        let yFiscalStart = parseInt(ex.split('-')[0], 10);
        let yReal = (mi >= fiscalStartMonth) ? yFiscalStart : yFiscalStart + 1;
        return (yReal > nowY) || (yReal === nowY && mi > nowM);
    };
    // v3.4.9 : montants du tableau Budget/Projection en bleu pour les mois passés/en cours,
    // en noir (couleur par défaut) pour les mois futurs — même logique que isFutureMonth().
    const monthColorClass = (m) => isFutureMonth(m) ? '' : 'budget-col-past';
    const indicatorHtml = (bVal, rVal, c1, c2, m) => {
        if (isFutureMonth(m)) return '';
        let bEmpty = !bVal, rEmpty = !rVal;
        if (bEmpty && rEmpty) return '';
        let dataAttrs = `data-ex="${escapeHtml(ex)}" data-c1="${escapeHtml(c1)}" data-c2="${escapeHtml(c2)}" data-m="${m}" data-real="${rVal}"`;
        if (!bEmpty && bVal !== rVal) return `<span class="budget-indicator ind-warn" ${dataAttrs} onclick="window.onIndicatorTripleClick(event, this)">⚠️</span>`;
        if (bEmpty && !rEmpty) return `<span class="budget-indicator ind-dot-red" ${dataAttrs} onclick="window.onIndicatorTripleClick(event, this)"></span>`;
        return '<span class="budget-indicator ind-check">✔︎</span>';
    };
    let budgetLocked = !!(budgetData[ex] && budgetData[ex].__closed);
    const budgetEditableCell = (c1, c2, m) => {
        let bVal = getBudget(c1, c2, m);
        let rVal = realByC1C2Month[`${c1}::${c2}::${m}`] || 0;
        let colClass = monthColorClass(m);
        if (budgetLocked) {
            return `<td class="tcd-cell budget-editable-cell ${colClass}"><span class="budget-val">${bVal ? formatCurrency(bVal) : ''}</span>${indicatorHtml(bVal, rVal, c1, c2, m)}</td>`;
        }
        return `<td class="tcd-cell budget-editable-cell ${colClass}">
            <span class="budget-val" contenteditable="true" data-ex="${escapeHtml(ex)}" data-c1="${escapeHtml(c1)}" data-c2="${escapeHtml(c2)}" data-m="${m}"
                onfocus="window.onBudgetCellFocus(this)"
                onblur="window.setBudgetCell('${escapeHtml(ex)}','${escapeHtml(c1)}','${escapeHtml(c2)}','${m}',this.textContent)"
                onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">${bVal ? formatCurrency(bVal) : ''}</span>${indicatorHtml(bVal, rVal, c1, c2, m)}
        </td>`;
    };
    const budgetAggCell = (bVal, extraClass, forceShowBudget, validatedVal, isRowTotal) => {
        let txt = formatCurrency(bVal || 0);
        let delta = (isRowTotal && validatedVal !== undefined) ? deltaHtml(bVal, validatedVal) : '';
        return `<td class="tcd-cell budget-agg-cell${extraClass?(' '+extraClass):''}"><span class="budget-val-ro">${txt}</span>${delta}</td>`;
    };
    // ─── Cellules du tableau RÉEL (bas) ───
    const realCell = (rVal, extraClass, forceShow, key) => {
        let txt = (rVal || forceShow) ? formatCurrency(rVal || 0) : '';
        let hasTxs = key && budgetTxMap[key] && budgetTxMap[key].length > 0;
        let content = (txt && hasTxs) ? `<span class="tcd-clickable" data-k="${escapeHtml(key)}">${txt}</span>` : txt;
        return `<td class="tcd-cell real-cell${extraClass?(' '+extraClass):''}">${content}</td>`;
    };

    let colGroupHtml = '<colgroup><col style="width:240px;">' + months.map(()=>'<col>').join('') + '<col style="width:110px;">' + (hasValidated ? '<col style="width:110px;">' : '') + '</colgroup>';
    let totalHeaderLabel = hasValidated ? 'TOTAL PROJETÉ' : 'TOTAL BUDGET';
    let validatedHeaderHtml = hasValidated ? '<th class="tcd-th-grand">BUDGET VALIDÉ</th>' : '';

    let htmlBudget = '<table class="tcd-native budget-table" cellspacing="0" cellpadding="0">';
    htmlBudget += colGroupHtml;
    htmlBudget += '<thead><tr><th class="tcd-col-axis" style="text-align:center;"><span id="budgetFilterBtn" class="' + (hasBudgetFilter() ? 'active' : '') + '" title="Filtrer" onclick="window.openBudgetFilter(event)" style="cursor:pointer;">⚙️</span> Catégorie</th>';
    months.forEach(m => { htmlBudget += `<th class="tcd-th-month${extraMonthsMap[m]?' tcd-th-extra':''}">${monthLabel(m, extraMonthsMap)}</th>`; });
    htmlBudget += `<th class="tcd-th-grand">${totalHeaderLabel}</th>${validatedHeaderHtml}</tr></thead><tbody>`;

    let htmlReal = '<table class="tcd-native budget-table real-table" cellspacing="0" cellpadding="0">';
    htmlReal += colGroupHtml;
    htmlReal += '<thead><tr><th class="tcd-col-axis" style="text-align:center;">Catégorie</th>';
    months.forEach(m => { htmlReal += `<th class="tcd-th-month${extraMonthsMap[m]?' tcd-th-extra':''}">${monthLabel(m, extraMonthsMap)}</th>`; });
    htmlReal += `<th class="tcd-th-grand">TOTAL RÉEL</th>${validatedHeaderHtml}</tr></thead><tbody>`;

    let grandBudgetByMonth = {}, grandRealByMonth = {}, grandBudgetTotal = 0, grandRealTotal = 0;
    let grandValidatedByMonth = {}, grandValidatedTotal = 0;

    c1Sorted.forEach(c1 => {
        let c1BudgetByMonth = {}, c1RealByMonth = {}, c1ValidatedByMonth = {};
        let c2List = [...allCats[c1]].sort(customSortCmp);

        htmlBudget += `<tr class="tcd-row-main-tr"><td class="tcd-col-axis"><div class="tcd-row-main">${escapeHtml(c1)}</div></td>`;
        htmlReal += `<tr class="tcd-row-main-tr"><td class="tcd-col-axis"><div class="tcd-row-main">${escapeHtml(c1)}</div></td>`;
        months.forEach(m => {
            let bSum = 0, vSum = 0;
            c2List.forEach(c2 => { bSum += getBudget(c1, c2, m); vSum += getValidatedBudget(c1, c2, m); });
            let rSum = realByC1Month[`${c1}::${m}`] || 0;
            c1BudgetByMonth[m] = bSum; c1RealByMonth[m] = rSum; c1ValidatedByMonth[m] = vSum;
            grandBudgetByMonth[m] = (grandBudgetByMonth[m]||0) + bSum;
            grandRealByMonth[m] = (grandRealByMonth[m]||0) + rSum;
            grandValidatedByMonth[m] = (grandValidatedByMonth[m]||0) + vSum;
            htmlBudget += budgetAggCell(bSum, 'tcd-row-main-cell ' + monthColorClass(m), c2List.length > 0, vSum, false);
            htmlReal += realCell(rSum, 'tcd-row-main-cell', false, `${c1}::ALL::${m}`);
        });
        let c1BudgetTotal = Object.values(c1BudgetByMonth).reduce((a,b)=>a+b,0);
        let c1RealTotal = Object.values(c1RealByMonth).reduce((a,b)=>a+b,0);
        let c1ValidatedTotal = Object.values(c1ValidatedByMonth).reduce((a,b)=>a+b,0);
        grandBudgetTotal += c1BudgetTotal; grandRealTotal += c1RealTotal; grandValidatedTotal += c1ValidatedTotal;
        htmlBudget += budgetAggCell(c1BudgetTotal, 'tcd-total-col tcd-grand tcd-row-main-cell', c2List.length > 0, c1ValidatedTotal, true);
        if (hasValidated) htmlBudget += `<td class="tcd-cell tcd-total-col tcd-grand tcd-row-main-cell"><span class="budget-val-ro">${formatCurrency(c1ValidatedTotal)}</span></td>`;
        htmlReal += realCell(c1RealTotal, 'tcd-total-col tcd-grand tcd-row-main-cell', true, `${c1}::ALL::ALL`);
        if (hasValidated) htmlReal += `<td class="tcd-cell tcd-total-col tcd-grand tcd-row-main-cell"><span class="budget-val-ro">${formatCurrency(c1ValidatedTotal)}</span></td>`;
        htmlBudget += '</tr>';
        htmlReal += '</tr>';

        c2List.forEach(c2 => {
            htmlBudget += `<tr class="tcd-row-sub-tr"><td class="tcd-col-axis"><div class="tcd-row-sub">↳ ${escapeHtml(c2)}</div></td>`;
            htmlReal += `<tr class="tcd-row-sub-tr"><td class="tcd-col-axis"><div class="tcd-row-sub">↳ ${escapeHtml(c2)}</div></td>`;
            let c2BudgetTotal = 0, c2RealTotal = 0, c2ValidatedTotal = 0;
            months.forEach(m => {
                let bVal = getBudget(c1, c2, m);
                let rVal = realByC1C2Month[`${c1}::${c2}::${m}`] || 0;
                let vVal = getValidatedBudget(c1, c2, m);
                c2BudgetTotal += bVal; c2RealTotal += rVal; c2ValidatedTotal += vVal;
                htmlBudget += budgetEditableCell(c1, c2, m);
                htmlReal += realCell(rVal, '', false, `${c1}::${c2}::${m}`);
            });
            htmlBudget += budgetAggCell(c2BudgetTotal, 'tcd-total-col tcd-grand', false, c2ValidatedTotal, true);
            if (hasValidated) htmlBudget += `<td class="tcd-cell tcd-total-col tcd-grand"><span class="budget-val-ro">${formatCurrency(c2ValidatedTotal)}</span></td>`;
            htmlReal += realCell(c2RealTotal, 'tcd-total-col tcd-grand', true, `${c1}::${c2}::ALL`);
            if (hasValidated) htmlReal += `<td class="tcd-cell tcd-total-col tcd-grand"><span class="budget-val-ro">${formatCurrency(c2ValidatedTotal)}</span></td>`;
            htmlBudget += '</tr>';
            htmlReal += '</tr>';
        });
    });

    htmlBudget += '<tr class="tcd-total-row"><td class="tcd-col-axis"><div class="tcd-row-main">TOTAL GLOBAL</div></td>';
    htmlReal += '<tr class="tcd-total-row"><td class="tcd-col-axis"><div class="tcd-row-main">TOTAL GLOBAL</div></td>';
    months.forEach(m => {
        htmlBudget += budgetAggCell(grandBudgetByMonth[m]||0, 'tcd-total-row-cell ' + monthColorClass(m), true, grandValidatedByMonth[m]||0, false);
        htmlReal += realCell(grandRealByMonth[m]||0, 'tcd-total-row-cell', false, `MONTH_TOTAL::${m}`);
    });
    htmlBudget += budgetAggCell(grandBudgetTotal, 'tcd-total-col tcd-grand tcd-total-row-cell', true, grandValidatedTotal, true);
    if (hasValidated) htmlBudget += `<td class="tcd-cell tcd-total-col tcd-grand tcd-total-row-cell"><span class="budget-val-ro">${formatCurrency(grandValidatedTotal)}</span></td>`;
    htmlReal += realCell(grandRealTotal, 'tcd-total-col tcd-grand tcd-total-row-cell', true, 'GRAND_TOTAL');
    if (hasValidated) htmlReal += `<td class="tcd-cell tcd-total-col tcd-grand tcd-total-row-cell"><span class="budget-val-ro">${formatCurrency(grandValidatedTotal)}</span></td>`;
    htmlBudget += '</tr>';
    htmlReal += '</tr>';

    htmlBudget += '</tbody></table>';
    htmlReal += '</tbody></table>';

    let banner = $('budgetValidatedBanner');
    if (hasValidated) {
        let validatedRevenueTotal = 0, validatedCostTotal = 0;
        let vRoot = budgetData[ex].__validated || {};
        Object.keys(vRoot).forEach(c1k => {
            if (c1k === '__validated') return;
            let isRev = /^5/.test(c1k) || c1k.toUpperCase().includes('RECETTE');
            let isCost = /^[1234]/.test(c1k) || c1k.toUpperCase().includes('CHARGE');
            Object.keys(vRoot[c1k] || {}).forEach(c2k => {
                let c2Total = 0;
                Object.keys(vRoot[c1k][c2k] || {}).forEach(mk => {
                    c2Total += Number(vRoot[c1k][c2k][mk]) || 0;
                });
                if (isRev) validatedRevenueTotal += c2Total;
                else if (isCost) validatedCostTotal += c2Total;
                else {
                    if (c2Total < 0) validatedCostTotal += c2Total;
                    else validatedRevenueTotal += c2Total;
                }
            });
        });
        banner.style.display = 'block';
        banner.innerHTML = `✅ Budget validé pour l'exercice ${ex} — Recettes : ${formatCurrency(validatedRevenueTotal)} · Charges : ${formatCurrency(validatedCostTotal)}<br>📊 Balance planifiée en fin d'exercice : ${formatCurrency(grandValidatedTotal)}`;
    } else {
        banner.style.display = 'none';
    }

    let isClosed = !!(budgetData[ex] && budgetData[ex].__closed);
    let closeBanner = $('budgetCloseBanner');
    let notesWrap = $('budgetCloseNotesWrap');
    let notesTa = $('budgetCloseNotes');
    let closeBtn = $('btnCloturerExercice');
    if (isClosed) {
        let cl = budgetData[ex].__closed;
        let bal = cl.balance !== undefined ? cl.balance : ((cl.revenue||0) + (cl.cost||0));
        let delta = cl.planned !== undefined ? (bal - cl.planned) : 0;
        let deltaStr = cl.planned !== undefined ? ` (Écart avec planifié = <span class="${delta>=0?'budget-delta delta-pos':'budget-delta delta-neg'}" style="font-size:1em;">${delta>0?'+':''}${formatCurrency(delta)}</span>)` : '';
        closeBanner.style.display = 'block';
        closeBanner.innerHTML = `🔒 Bilan de l'exercice clos : Recettes: ${formatCurrency(cl.revenue||0)} &middot; Charges: ${formatCurrency(cl.cost||0)} &middot; Balance: <strong>${formatCurrency(bal)}</strong>${deltaStr}`;
        notesWrap.style.display = 'block';
        if (notesTa) notesTa.value = cl.notes || '';
        if (closeBtn) closeBtn.textContent = '🔓 Rouvrir Exercice';
    } else {
        closeBanner.style.display = 'none';
        notesWrap.style.display = 'none';
        if (closeBtn) closeBtn.textContent = '🔒 Clôturer exercice';
    }

    container.innerHTML = `
        <div class="budget-block-title">💰 Budget / Projection <span class="budget-badge badge-budget">Éditable</span></div>
        <div class="budget-mirror-wrap">${htmlBudget}</div>
        <div class="budget-block-title" style="margin-top:20px;">📈 Réel <span class="budget-badge badge-real">Sélection par date réelle, affiché par date écriture</span></div>
        <div class="budget-mirror-wrap">${htmlReal}</div>
    `;

    let fs = parseInt(localStorage.getItem('f_budget_fontsize') || '13', 10);
    document.querySelectorAll('#budgetGrid .tcd-native th, #budgetGrid .tcd-native td').forEach(el => {
        el.style.fontSize = fs + 'px';
    });

    window.bindBudgetDrillDown();
};

let _budgetClickHandler = null;
window.bindBudgetDrillDown = function() {
    let grid = $('budgetGrid');
    if (!grid) return;
    // Supprimer l'ancien listener pour éviter les doublons
    if (_budgetClickHandler) { grid.removeEventListener('click', _budgetClickHandler); _budgetClickHandler = null; }
    _budgetClickHandler = function(e) {
        let el = e.target.closest('.tcd-clickable');
        if (!el) return;
        let key = el.dataset.k;
        if (!key) return;
        let txs = budgetTxMap[key] || [];
        if (txs.length === 0) return;
        window.openTcdDetails(txs);
    };
    grid.addEventListener('click', _budgetClickHandler);
};


window.onBudgetCellFocus = function(el) {
    let range = document.createRange();
    range.selectNodeContents(el);
    let sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
};

// ═══ Filtre Budget ═══
window.openBudgetFilter = function(e) {
    e.stopPropagation();
    let allCat1 = new Set(), allCat2 = new Set();
    Object.keys(categories).forEach(c1 => {
        allCat1.add(c1);
        (categories[c1]||[]).forEach(c2 => allCat2.add(c2));
    });
    function buildTags(containerId, allValues, filterSet) {
        let el = document.getElementById(containerId);
        if (!el) return;
        let vals = [...allValues].sort(customSortCmp);
        el.innerHTML = vals.map(v => {
            let excluded = filterSet.has(v);
            return `<span class="ftag${excluded?' excluded':''}" data-val="${escapeHtml(v)}" data-set="${containerId}">${escapeHtml(v)}</span>`;
        }).join('');
        el.querySelectorAll('.ftag').forEach(tag => {
            tag.onclick = function() {
                let val = this.dataset.val;
                if (filterSet.has(val)) filterSet.delete(val); else filterSet.add(val);
                this.classList.toggle('excluded');
                saveBudgetFilter();
                window.renderBudget();
            };
        });
    }
    buildTags('budgetFilterCat1Tags', allCat1, budgetFilter.cat1);
    buildTags('budgetFilterCat2Tags', allCat2, budgetFilter.cat2);
    let popup = document.getElementById('budgetFilterPopup');
    let overlay = document.getElementById('budgetFilterOverlay');
    let btn = document.getElementById('budgetFilterBtn');
    if (btn) {
        let r = btn.getBoundingClientRect();
        popup.style.top  = (r.bottom + 8) + 'px';
        popup.style.left = Math.min(r.left, window.innerWidth - 440) + 'px';
    }
    popup.classList.add('open');
    overlay.classList.add('open');
};
window.closeBudgetFilter = function() {
    document.getElementById('budgetFilterOverlay').classList.remove('open');
    document.getElementById('budgetFilterPopup').classList.remove('open');
};
window.resetBudgetFilter = function() {
    budgetFilter.cat1.clear(); budgetFilter.cat2.clear();
    saveBudgetFilter();
    window.renderBudget();
    window.openBudgetFilter({stopPropagation:()=>{}});
};
function saveBudgetFilter() {
    localStorage.setItem('budget_filter_' + currentAccountId, JSON.stringify({ cat1: [...budgetFilter.cat1], cat2: [...budgetFilter.cat2] }));
    triggerSave(false); // budgetFilter fait partie du vault (settings.budgetFilter), synchronisé comme le reste
}
function loadBudgetFilter() {
    try {
        let raw = localStorage.getItem('budget_filter_' + currentAccountId);
        if (!raw) return;
        let obj = JSON.parse(raw);
        budgetFilter.cat1 = new Set(obj.cat1||[]);
        budgetFilter.cat2 = new Set(obj.cat2||[]);
    } catch(e) {}
}
function hasBudgetFilter() {
    return budgetFilter.cat1.size > 0 || budgetFilter.cat2.size > 0;
}
loadBudgetFilter();

// ═══ Validation du budget ═══
window.validateBudget = function() {
    let sel = $('budgetExerciceSelect');
    if (!sel) return;
    let ex = sel.value;
    if (!ex) return;
    if (!budgetData[ex]) budgetData[ex] = {};
    if (budgetData[ex].__closed) { alert(`L'exercice ${ex} est clos. Rouvrez-le (Maj+clic sur le bouton Clôturer) pour modifier le budget.`); return; }
    let alreadyValidated = !!budgetData[ex].__validated;
    const doValidate = () => {
        budgetData[ex].__validated = JSON.parse(JSON.stringify(
            Object.fromEntries(Object.entries(budgetData[ex]).filter(([k]) => k !== '__validated'))
        ));
        triggerSave(true);
        window.renderBudget();
    };
    if (alreadyValidated) {
        if (confirm(`Le budget de l'exercice ${ex} a déjà été validé. Voulez-vous le valider à nouveau et remplacer l'instantané précédent ?`)) {
            doValidate();
        }
    } else {
        doValidate();
    }
};
window.cancelBudgetValidation = function() {
    let sel = $('budgetExerciceSelect');
    if (!sel) return;
    let ex = sel.value;
    if (!ex || !budgetData[ex] || !budgetData[ex].__validated) return;
    if (budgetData[ex].__closed) { alert(`L'exercice ${ex} est clos. Rouvrez-le (Maj+clic sur le bouton Clôturer) pour modifier le budget.`); return; }
    if (confirm(`Voulez-vous vraiment annuler la validation du budget pour l'exercice ${ex} ? Cette action est irréversible.`)) {
        delete budgetData[ex].__validated;
        triggerSave(true);
        window.renderBudget();
    }
};
window.onCloturerBtnClick = function(event) {
    let sel = $('budgetExerciceSelect');
    if (!sel) return;
    let ex = sel.value;
    if (!ex) return;
    if (!budgetData[ex]) budgetData[ex] = {};
    let isClosed = !!budgetData[ex].__closed;
    if (event && event.shiftKey && isClosed) {
        if (confirm(`Voulez-vous rouvrir l'exercice ${ex} ? Le bilan de clôture sera supprimé.`)) {
            delete budgetData[ex].__closed;
            triggerSave(true);
            window.renderBudget();
        }
        return;
    }
    if (isClosed) return; // déjà clos, il faut Maj+clic pour rouvrir
    if (confirm(`Voulez-vous clôturer l'exercice ${ex} ? Les tableaux Budget et Réel ne seront plus modifiables.`)) {
        // Recalcul du bilan réel (par catégorie 2, totaux de ligne, regroupés recettes/charges)
        let c2Totals = {};
        transactions.forEach(t => {
            if (t.amount === 0) return;
            let dRealStr = String(t.dateExpense || t.dateOp || '');
            if (dRealStr.length < 7) return;
            let yReal = dRealStr.substring(0,4), mReal = dRealStr.substring(5,7);
            if (getFiscalYearLabel(yReal, mReal, fiscalStartMonth) !== ex) return;
            let c1 = t.cat1 || '_SANS_CATEGORIE', c2 = t.cat2 || '_SANS_CATEGORIE';
            if (budgetFilter.cat1.has(c1) || budgetFilter.cat2.has(c2)) return;
            let k = `${c1}::${c2}`;
            c2Totals[k] = (c2Totals[k] || 0) + (Number(t.amount) || 0);
        });
        let realRevenueTotal = 0, realCostTotal = 0;
        Object.keys(c2Totals).forEach(k => {
            let c1 = k.split('::')[0];
            let tot = c2Totals[k];
            let isRev = /^5/.test(c1) || c1.toUpperCase().includes('RECETTE');
            let isCost = /^[1234]/.test(c1) || c1.toUpperCase().includes('CHARGE');
            if (isRev) realRevenueTotal += tot;
            else if (isCost) realCostTotal += tot;
            else {
                if (tot < 0) realCostTotal += tot;
                else realRevenueTotal += tot;
            }
        });
        let plannedTotal = 0;
        let vRoot = budgetData[ex].__validated || {};
        Object.keys(vRoot).forEach(c1k => {
            if (c1k === '__validated') return;
            Object.keys(vRoot[c1k] || {}).forEach(c2k => {
                Object.keys(vRoot[c1k][c2k] || {}).forEach(mk => {
                    plannedTotal += Number(vRoot[c1k][c2k][mk]) || 0;
                });
            });
        });
        budgetData[ex].__closed = { 
            revenue: realRevenueTotal, 
            cost: realCostTotal, 
            balance: realRevenueTotal + realCostTotal,
            planned: plannedTotal,
            notes: (budgetData[ex].__closed && budgetData[ex].__closed.notes) || '' 
        };
        triggerSave(true);
        window.renderBudget();
    }
};
window.onBudgetCloseNotesBlur = function() {
    let sel = $('budgetExerciceSelect');
    if (!sel) return;
    let ex = sel.value;
    if (!ex || !budgetData[ex] || !budgetData[ex].__closed) return;
    let ta = $('budgetCloseNotes');
    if (!ta) return;
    budgetData[ex].__closed.notes = ta.value;
    triggerSave(true);
};




window.renderSummary = function(force=false) {
    const r1F = $('pivotRows').value, r2F = $('pivotRows2').value, tAxe = $('timeAxe').value;
    localStorage.setItem('f_pivot_v2', JSON.stringify({r1:r1F, r2:r2F, axe:tAxe}));

    let validTx = transactions.filter(t => {
        if (t.amount === 0) return false;
        let cat1 = t.cat1 || '_SANS_CATEGORIE';
        let cat2 = t.cat2 || '_SANS_CATEGORIE';
        if (tcdFilter.cat1.has(cat1)) return false;
        if (tcdFilter.cat2.has(cat2)) return false;
        let dOpStr = String(t.dateOp || '');
        let yOp = dOpStr.length >= 4 ? dOpStr.substring(0,4) : 'vide';
        if (tcdFilter.yearsOp.has(yOp)) return false;
        let dExpStr = String(t.dateExpense || t.dateOp || '');
        let yExp = dExpStr.length >= 4 ? dExpStr.substring(0,4) : 'vide';
        if (tcdFilter.yearsExpense.has(yExp)) return false;
        let mOpForFy = dOpStr.length >= 7 ? dOpStr.substring(5,7) : null;
        let fyOp = mOpForFy ? getFiscalYearLabel(yOp, mOpForFy, fiscalStartMonth) : 'vide';
        if (tcdFilter.fiscalYearsOp.has(fyOp)) return false;
        let mExpForFy = dExpStr.length >= 7 ? dExpStr.substring(5,7) : null;
        let fyExp = mExpForFy ? getFiscalYearLabel(yExp, mExpForFy, fiscalStartMonth) : 'vide';
        if (tcdFilter.fiscalYearsExpense.has(fyExp)) return false;
        let dStr = String(t[($('timeAxe')||{value:'dateOp'}).value] || t.dateOp || '');
        let m = dStr.length >= 7 ? dStr.substring(5,7) : 'vide';
        if (tcdFilter.months.has(m)) return false;
        return true;
    });
    let yearsMap = {}, tree = {}, colTotals = {}, totalGrand = 0;
    const sortedMonthsOf = (y) => Array.from(yearsMap[y]).sort((a,b)=>getFiscalMonthOrder(a,fiscalStartMonth)-getFiscalMonthOrder(b,fiscalStartMonth));
    tcdMap = {}; tcdMap['GRAND_TOTAL'] = validTx;

    validTx.forEach(t => {
        let dStr = String(t[tAxe] || t.dateOp || '');
        let yRaw = dStr.length >= 4 ? dStr.substring(0,4) : 'vide';
        let m = dStr.length >= 7 ? dStr.substring(5,7) : 'vide';
        let y = getFiscalYearLabel(yRaw, m, fiscalStartMonth);
        let cat1 = t.cat1 || '_SANS_CATEGORIE', cat2 = t.cat2 || '_SANS_CATEGORIE';
        let map = {cat1, cat2, paymentMethod: t.paymentMethod, label: t.label};
        let r1 = String(map[r1F] || 'vide');
        let r2 = r2F ? String(map[r2F] || 'vide') : '';
        let amt = Number(t.amount) || 0;

        if (!yearsMap[y]) yearsMap[y] = new Set();
        yearsMap[y].add(m);
        if (!tree[r1]) tree[r1] = {total:0, cells:{}, yearTotals:{}, sub:{}};
        tree[r1].total += amt;
        tree[r1].yearTotals[y] = (tree[r1].yearTotals[y]||0) + amt;
        let k1 = `${r1}::*::${y}::${m}`; tree[r1].cells[k1] = (tree[r1].cells[k1]||0) + amt;
        if (!tcdMap[k1]) tcdMap[k1] = []; tcdMap[k1].push(t);
        let kY1 = `${r1}::*::${y}::ALL`; if (!tcdMap[kY1]) tcdMap[kY1] = []; tcdMap[kY1].push(t);
        let kAll1 = `${r1}::*::ALL::ALL`; if (!tcdMap[kAll1]) tcdMap[kAll1] = []; tcdMap[kAll1].push(t);

        if (r2F) {
            if (!tree[r1].sub[r2]) tree[r1].sub[r2] = {total:0, cells:{}, yearTotals:{}};
            tree[r1].sub[r2].total += amt;
            tree[r1].sub[r2].yearTotals[y] = (tree[r1].sub[r2].yearTotals[y]||0) + amt;
            let k2 = `${r1}::${r2}::${y}::${m}`; tree[r1].sub[r2].cells[k2] = (tree[r1].sub[r2].cells[k2]||0) + amt;
            if (!tcdMap[k2]) tcdMap[k2] = []; tcdMap[k2].push(t);
            let kY2 = `${r1}::${r2}::${y}::ALL`; if (!tcdMap[kY2]) tcdMap[kY2] = []; tcdMap[kY2].push(t);
            let kAll2 = `${r1}::${r2}::ALL::ALL`; if (!tcdMap[kAll2]) tcdMap[kAll2] = []; tcdMap[kAll2].push(t);
        }
        colTotals[`${y}::${m}`] = (colTotals[`${y}::${m}`]||0) + amt;
        colTotals[`${y}::ALL`]  = (colTotals[`${y}::ALL`]||0) + amt;
        totalGrand += amt;

        // MONTH_TOTAL keys
        let mkey = `MONTH_TOTAL::${y}::${m}`;
        if (!tcdMap[mkey]) tcdMap[mkey] = []; tcdMap[mkey].push(t);
        // YEAR_TOTAL keys
        let ykey = `YEAR_TOTAL::${y}`;
        if (!tcdMap[ykey]) tcdMap[ykey] = []; tcdMap[ykey].push(t);
    });

    let yearsSorted = Object.keys(yearsMap).sort();
    let r1Sorted = Object.keys(tree).sort(customSortCmp);
    _lastR1Keys = r1Sorted.slice();
    // Première ouverture : tout réduire par défaut
    if (window._tcdCollapseAllOnFirstRender) {
        window._tcdCollapseAllOnFirstRender = false;
        _lastR1Keys.forEach(k => collapsedGroups.add(k));
        collapsedGroups.add('_SANS_CATEGORIE');
        tcdSaveCollapsed();
    }

    // 1. Colonnes Tabulator - double entête (année / mois)
    let columns = [{
        title: "", field: "axis", frozen: true, width: 280, formatter: "html", headerSort: false, cssClass: "tabulator-frozen-col"
    }];
    yearsSorted.forEach(y => {
        let isCol = collapsedYears.has(y);
        let yearToggleLabel = '<span class="tcd-toggle-year" data-y="' + y + '" style="cursor:pointer;display:block;text-align:center;font-weight:700;letter-spacing:1px;" title="Cliquer pour réduire/développer">' + y + '</span>';
        let subCols = [];
        if (!isCol) {
            sortedMonthsOf(y).forEach(m => {
                let padM = m.toString().padStart(2,'0');
                let monthNames = ['','Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
                subCols.push({ title: monthNames[parseInt(m)] || padM, field: y+'_'+padM, width:80, hozAlign:"right", formatter:"html", headerSort:false });
            });
        }
        // Colonne TOTAL : visible seulement quand l'année est réduite
        if (isCol) {
            subCols.push({ title: '<b>TOTAL</b>', field: 'total_'+y, width:110, hozAlign:"right", formatter:"html", headerSort:false, titleFormatter:"html" });
        }
        columns.push({
            title: yearToggleLabel,
            titleFormatter: "html",
            headerSort: false,
            columns: subCols
        });
    });
    columns.push({ title: "TOTAL GLOBAL", field: "grand_total", width: 130, hozAlign:"right", formatter:"html", headerSort:false });

    // 2. Données
    let tableData = [];
    const cellFmt = (val, key, isSub=false) => val === 0 ? '' : `<span class="tcd-clickable${isSub?' tcd-sub-amount':''}" data-k="${escapeHtml(key)}">${formatCurrency(val)}</span>`;

    r1Sorted.forEach(r1 => {
        let collapsed = collapsedGroups.has(r1);
        let rowObj = {
            id: r1, isMain: true,
            axis: `<div class="tcd-row-main" style="cursor:pointer;" data-toggle-r1="${btoa(unescape(encodeURIComponent(r1)))}">${escapeHtml(r1)}</div>`
        };
        yearsSorted.forEach(y => {
            let isCol = collapsedYears.has(y);
            if (!isCol) {
                sortedMonthsOf(y).forEach(m => {
                    let padM = m.toString().padStart(2,'0');
                    rowObj[`${y}_${padM}`] = `<b>${cellFmt(tree[r1].cells[`${r1}::*::${y}::${m}`]||0, `${r1}::*::${y}::${m}`)}</b>`;
                });
            }
            rowObj[`total_${y}`] = `<b>${cellFmt(tree[r1].yearTotals[y]||0, `${r1}::*::${y}::ALL`)}</b>`;
        });
        rowObj.grand_total = `<b>${cellFmt(tree[r1].total, `${r1}::*::ALL::ALL`)}</b>`;
        tableData.push(rowObj);

        if (r2F && !collapsed) {
            Object.keys(tree[r1].sub).sort(customSortCmp).forEach(r2 => {
                let subObj = {
                    id: `${r1}_${r2}`, isSub: true,
                    axis: `<div class="tcd-row-sub">↳ ${escapeHtml(r2)}</div>`
                };
                yearsSorted.forEach(y => {
                    let isCol = collapsedYears.has(y);
                    if (!isCol) {
                        sortedMonthsOf(y).forEach(m => {
                            let padM = m.toString().padStart(2,'0');
                            subObj[`${y}_${padM}`] = cellFmt(tree[r1].sub[r2].cells[`${r1}::${r2}::${y}::${m}`]||0, `${r1}::${r2}::${y}::${m}`, true);
                        });
                    }
                    subObj[`total_${y}`] = cellFmt(tree[r1].sub[r2].yearTotals[y]||0, `${r1}::${r2}::${y}::ALL`, true);
                });
                subObj.grand_total = cellFmt(tree[r1].sub[r2].total, `${r1}::${r2}::ALL::ALL`, true);
                tableData.push(subObj);
            });
        }
    });

    // Ligne TOTAL GLOBAL
    let totalObj = { id:'GRAND_TOTAL', isTotal:true, axis:'<div class="tcd-row-main">TOTAL GLOBAL</div>' };
    yearsSorted.forEach(y => {
        let isCol = collapsedYears.has(y);
        let yTotal = colTotals[`${y}::ALL`]||0;
        if (!isCol) {
            sortedMonthsOf(y).forEach(m => {
                let padM = m.toString().padStart(2,'0');
                totalObj[`${y}_${padM}`] = cellFmt(colTotals[`${y}::${m}`]||0, `MONTH_TOTAL::${y}::${padM}`);
            });
        }
        totalObj[`total_${y}`] = `<b>${cellFmt(yTotal, `YEAR_TOTAL::${y}`)}</b>`;
    });
    totalObj.grand_total = `<b>${cellFmt(totalGrand, 'GRAND_TOTAL')}</b>`;
    tableData.push(totalObj);

    // 3. Rendu HTML natif (sans Tabulator)
    function applyTcdStyles() {
        window.bindTcdDrillDown();
        let _fs = localStorage.getItem('f_tcd_fontsize');
        if (_fs) {
            let _fspx = _fs + 'px';
            document.querySelectorAll('#summaryGrid .tcd-native th, #summaryGrid .tcd-native td').forEach(el => {
                el.style.fontSize = _fspx;
            });
        }
        const _savedColor = localStorage.getItem('f_tcd_header_color');
        if (_savedColor) {
            document.documentElement.style.setProperty('--tcd-header-color', _savedColor);
            let p = document.getElementById('tcdHeaderColorPicker'); if(p) p.value = _savedColor;
        }
    }

    // Build native table HTML
    let html = '<table class="tcd-native" cellspacing="0" cellpadding="0"><thead>';

    // Row 1: year headers
    html += '<tr><th class="tcd-col-axis" rowspan="2" style="text-align:center;"><span id="tcdFilterBtn" class="' + (hasTcdFilter() ? 'active' : '') + '" title="Filtrer" onclick="window.openTcdFilter(event)">⚙️</span></th>';
    yearsSorted.forEach(y => {
        let isCol = collapsedYears.has(y);
        let monthCount = isCol ? 1 : Array.from(yearsMap[y]).length;
        // when collapsed: 1 col (TOTAL); when expanded: monthCount cols only (TOTAL hidden)
        let span = isCol ? 1 : monthCount;
        html += '<th class="tcd-th-year" colspan="' + span + '" data-y="' + y + '">';
        html += '<span class="tcd-toggle-year" data-y="' + y + '" style="cursor:pointer">' + y + '</span></th>';
    });
    html += '<th class="tcd-th-grand" rowspan="2">TOTAL<br>GLOBAL</th></tr>';

    // Row 2: month headers
    html += '<tr>';
    yearsSorted.forEach(y => {
        let isCol = collapsedYears.has(y);
        if (isCol) {
            html += '<th class="tcd-th-month tcd-total-col' + (isCol ? '' : ' tcd-year-total-hidden') + '"><b>TOTAL</b></th>';
        } else {
            let monthNames = ['','Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
            sortedMonthsOf(y).forEach(m => {
                html += '<th class="tcd-th-month">' + (monthNames[parseInt(m)] || m) + '</th>';
            });
            // TOTAL colonne cachée quand développé
            html += '<th class="tcd-th-month tcd-total-col' + (isCol ? '' : ' tcd-year-total-hidden') + '"><b>TOTAL</b></th>';
        }
    });
    html += '</tr></thead><tbody>';

    // Rows
    const cellFmt2 = (val, key, isSub=false) => val === 0 ? '<td class="tcd-cell tcd-zero"></td>' :
        '<td class="tcd-cell' + (isSub?' tcd-sub-amount':'') + '"><span class="tcd-clickable" data-k="' + escapeHtml(key) + '">' + formatCurrency(val) + '</span></td>';

    r1Sorted.forEach(r1 => {
        let collapsed = collapsedGroups.has(r1);
        html += '<tr class="tcd-row-main-tr">';
        html += '<td class="tcd-col-axis"><div class="tcd-row-main" style="cursor:pointer" data-toggle-r1="' + btoa(unescape(encodeURIComponent(r1))) + '">' + escapeHtml(r1) + '</div></td>';
        yearsSorted.forEach(y => {
            let isCol = collapsedYears.has(y);
            if (!isCol) {
                sortedMonthsOf(y).forEach(m => {
                    let padM = m.toString().padStart(2,'0');
                    html += cellFmt2(tree[r1].cells[`${r1}::*::${y}::${m}`]||0, `${r1}::*::${y}::${m}`);
                });
            }
            let _ytClass = collapsedYears.has(y) ? 'tcd-cell tcd-total-col' : 'tcd-cell tcd-total-col tcd-year-total-hidden';
            html += '<td class="' + _ytClass + '"><b>' + (tree[r1].yearTotals[y] ?
                '<span class="tcd-clickable" data-k="' + escapeHtml(`${r1}::*::${y}::ALL`) + '">' + formatCurrency(tree[r1].yearTotals[y]) + '</span>' : '') + '</b></td>';
        });
        html += '<td class="tcd-cell tcd-total-col tcd-grand"><b><span class="tcd-clickable" data-k="' + escapeHtml(`${r1}::*::ALL::ALL`) + '">' + formatCurrency(tree[r1].total) + '</span></b></td>';
        html += '</tr>';

        if (r2F && !collapsed) {
            Object.keys(tree[r1].sub).sort(customSortCmp).forEach(r2 => {
                html += '<tr class="tcd-row-sub-tr">';
                html += '<td class="tcd-col-axis"><div class="tcd-row-sub">↳ ' + escapeHtml(r2) + '</div></td>';
                yearsSorted.forEach(y => {
                    let isCol = collapsedYears.has(y);
                    if (!isCol) {
                        sortedMonthsOf(y).forEach(m => {
                            let padM = m.toString().padStart(2,'0');
                            html += cellFmt2(tree[r1].sub[r2].cells[`${r1}::${r2}::${y}::${m}`]||0, `${r1}::${r2}::${y}::${m}`, true);
                        });
                    }
                    let ytVal = tree[r1].sub[r2].yearTotals[y]||0;
                    let _ytSubClass = collapsedYears.has(y) ? 'tcd-cell tcd-sub-amount tcd-total-col' : 'tcd-cell tcd-sub-amount tcd-total-col tcd-year-total-hidden';
                    html += '<td class="' + _ytSubClass + '">' + (ytVal ?
                        '<span class="tcd-clickable" data-k="' + escapeHtml(`${r1}::${r2}::${y}::ALL`) + '">' + formatCurrency(ytVal) + '</span>' : '') + '</td>';
                });
                let gtVal = tree[r1].sub[r2].total;
                html += '<td class="tcd-cell tcd-sub-amount tcd-total-col tcd-grand">' + (gtVal ?
                    '<span class="tcd-clickable" data-k="' + escapeHtml(`${r1}::${r2}::ALL::ALL`) + '">' + formatCurrency(gtVal) + '</span>' : '') + '</td>';
                html += '</tr>';
            });
        }
    });

    // Ligne TOTAL GLOBAL
    html += '<tr class="tcd-total-row">';
    html += '<td class="tcd-col-axis"><div class="tcd-row-main">TOTAL GLOBAL</div></td>';
    yearsSorted.forEach(y => {
        let isCol = collapsedYears.has(y);
        if (!isCol) {
            sortedMonthsOf(y).forEach(m => {
                let padM = m.toString().padStart(2,'0');
                let v = colTotals[`${y}::${m}`]||0;
                html += '<td class="tcd-cell">' + (v ? '<span class="tcd-clickable" data-k="MONTH_TOTAL::' + y + '::' + padM + '">' + formatCurrency(v) + '</span>' : '') + '</td>';
            });
        }
        let yTotal = colTotals[`${y}::ALL`]||0;
        let _ytTotClass = collapsedYears.has(y) ? 'tcd-cell tcd-total-col' : 'tcd-cell tcd-total-col tcd-year-total-hidden';
        html += '<td class="' + _ytTotClass + '"><b>' + (yTotal ?
            '<span class="tcd-clickable" data-k="YEAR_TOTAL::' + y + '">' + formatCurrency(yTotal) + '</span>' : '') + '</b></td>';
    });
    html += '<td class="tcd-cell tcd-total-col tcd-grand"><b><span class="tcd-clickable" data-k="GRAND_TOTAL">' + formatCurrency(totalGrand) + '</span></b></td>';
    html += '</tr></tbody></table>';

    if (tcdTabulator) { try { tcdTabulator.destroy(); } catch(e){} tcdTabulator = null; }
    document.getElementById('summaryGrid').innerHTML = html;
    applyTcdStyles();
    tcdRestoreScroll();
};

let _tcdClickHandler = null;
window.bindTcdDrillDown = function() {
    let grid = $('summaryGrid');
    // Supprimer l'ancien listener pour éviter les doublons
    if (_tcdClickHandler) { grid.removeEventListener('click', _tcdClickHandler); _tcdClickHandler = null; }
    _tcdClickHandler = function(e) {
        // Toggle group via data-toggle-r1
        let toggleEl = e.target.closest('[data-toggle-r1]');
        if (toggleEl) {
            try { let r1 = decodeURIComponent(escape(atob(toggleEl.dataset.toggleR1))); window.toggleGroup(r1); } catch(ex){}
            return;
        }
        // Toggle year via tcd-toggle-year
        let yearEl = e.target.closest('.tcd-toggle-year');
        if (yearEl) { e.stopPropagation(); window.toggleYear(yearEl.dataset.y); return; }
        // Drilldown via tcd-clickable
        let el = e.target.closest('.tcd-clickable');
        if (!el) return;
        let key = el.dataset.k;
        if (!key) return;
        let txs = tcdMap[key] || [];
        if (txs.length === 0) return;
        window.openTcdDetails(txs, key);
    };
    grid.addEventListener('click', _tcdClickHandler);
};

window.sortTcdDetail = function(col) {
    if (tcdDetailSortCol === col) tcdDetailSortDir *= -1; else { tcdDetailSortCol = col; tcdDetailSortDir = -1; }
    localStorage.setItem('tcdDetailSortCol', tcdDetailSortCol);
    localStorage.setItem('tcdDetailSortDir', tcdDetailSortDir);
    window.openTcdDetails(window._lastTcdDetailTxs || []);
};
window.openTcdDetails = function(txs, key) {
    window._lastTcdDetailTxs = txs;
    if (key !== undefined) window._lastTcdDetailKey = key;
    txs = txs.slice().sort((a,b) => {
        let va = a[tcdDetailSortCol]||'', vb = b[tcdDetailSortCol]||'';
        return (va < vb ? -1 : va > vb ? 1 : 0) * tcdDetailSortDir;
    });
    ['dateOp','dateExpense','amount'].forEach(c => {
        let el = $('tcdSort'+{dateOp:'DateOp',dateExpense:'DateExp',amount:'Amount'}[c]);
        if(el) el.textContent = {dateOp:'Date Écr.',dateExpense:'Date réelle',amount:'Montant'}[c]
            + (tcdDetailSortCol===c ? (tcdDetailSortDir===-1?' ▼':' ▲') : ' ⇅');
    });
    $('tcdDetailsOverlay').classList.add('open');
    $('tcdDetailsTbody').innerHTML = txs.map(tx => `
        <tr data-id="${tx.id}">
            <td><input type="date" class="inline-edit tcd-inline" data-id="${tx.id}" data-field="dateOp" value="${tx.dateOp||''}"></td>
            <td><input type="date" class="inline-edit tcd-inline" data-id="${tx.id}" data-field="dateExpense" value="${tx.dateExpense||tx.dateOp||''}"></td>
            <td style="white-space:normal;word-break:break-word;overflow:visible;min-width:200px;">
                <input type="text" class="inline-edit tcd-inline" data-id="${tx.id}" data-field="details" value="${escapeHtml(tx.details||'')}" style="background:var(--bg);border:1px solid var(--ink-faint);height:auto;min-height:32px;">
            </td>
            <td style="text-align:right;font-weight:600;color:${tx.amount>=0?'var(--done)':'var(--ink)'}">
                <input type="text" class="inline-edit tcd-inline" data-id="${tx.id}" data-field="amount" value="${tx.amount}" style="width:90px;text-align:right;">
            </td>
            <td>
                <input type="text" class="inline-edit tcd-inline" data-id="${tx.id}" data-field="note" value="${escapeHtml(tx.note||'')}" placeholder="Note..." style="font-size:0.9em;color:var(--ink-soft);background:var(--bg);border:1px solid var(--ink-faint);height:auto;min-height:32px;">
            </td>
            <td style="text-align:center;">
                ${(tx.cat1 && tx.cat1 !== '_SANS_CATEGORIE')
                    ? `<button class="btn btn-outline tcd-cat-edit" data-id="${tx.id}" style="padding:2px 8px;font-size:1.1em;" title="Modifier catégorie">✏️</button>`
                    : `<button class="btn btn-outline tcd-cat-edit" data-id="${tx.id}" style="padding:2px 8px;font-size:1.1em;border-color:var(--warn);color:var(--warn);" title="Affecter catégorie">🔍</button>`}
            </td>
        </tr>`).join('');
    $('tcdDetailsOverlay').classList.add('open');

    $('tcdDetailsTbody').querySelectorAll('.tcd-inline').forEach(inp => {
        inp.addEventListener('change', ev => {
            let tx = transactions.find(x => String(x.id) === String(ev.target.dataset.id));
            if (!tx) return;
            let f = ev.target.dataset.field, v = ev.target.value;
            if (f === 'amount') { let n = parseFloat(v.replace(/,/g,'.').replace(/[^0-9.-]/g,'')); if (!isNaN(n)) tx.amount = n; }
            else tx[f] = v;
            triggerSave(false);
            window.renderSummary(); window.renderUncategorized(); window.renderDataTable();
            showToast('Modification enregistrée ✓');
        });
    });

    $('tcdDetailsTbody').querySelectorAll('.tcd-cat-edit').forEach(btn => {
        btn.addEventListener('click', ev => {
            ev.stopPropagation();
            let tx = transactions.find(x => String(x.id) === String(btn.dataset.id));
            if (!tx) return;
            window.openCatModal(tx.id, tx.cat1||'', tx.cat2||'', !!(tx.cat1 && tx.cat1 !== '_SANS_CATEGORIE'), 'tcdDetails');
        });
    });
};

// v3.4.11 : détermine la catégorie (cat1/cat2) représentée par la cellule du TCD à l'origine
// du popup "Détail des opérations", à partir de sa clé (ex: "Loyers::Appt A::2025::03") et du
// regroupement L1/L2 choisi. Retourne null si la cellule ne représente pas une catégorie précise
// (totaux, regroupement par libellé...) — dans ce cas, aucune ligne n'est jamais retirée.
function deriveTcdCatFilterFromKey(key) {
    if (!key || key === 'GRAND_TOTAL' || key.indexOf('MONTH_TOTAL::') === 0 || key.indexOf('YEAR_TOTAL::') === 0) return null;
    let parts = key.split('::');
    if (parts.length < 2) return null;
    let r1F = ($('pivotRows')||{value:'cat1'}).value;
    let r2F = ($('pivotRows2')||{value:''}).value;
    let filter = {};
    if (r1F === 'cat1') filter.cat1 = parts[0];
    else if (r1F === 'cat2') filter.cat2 = parts[0];
    if (parts[1] && parts[1] !== '*' && r2F) {
        if (r2F === 'cat1') filter.cat1 = parts[1];
        else if (r2F === 'cat2') filter.cat2 = parts[1];
    }
    return (filter.cat1 !== undefined || filter.cat2 !== undefined) ? filter : null;
}

// Retire une transaction du popup "Détail des opérations" déjà ouvert si sa catégorie vient de
// changer pour une valeur qui ne correspond plus à la cellule du TCD depuis laquelle il a été ouvert.
window.removeFromTcdDetailsIfMismatch = function(t) {
    let filter = deriveTcdCatFilterFromKey(window._lastTcdDetailKey);
    if (!filter) return;
    let c1 = t.cat1 || '_SANS_CATEGORIE', c2 = t.cat2 || '_SANS_CATEGORIE';
    let stillMatches = (filter.cat1 === undefined || filter.cat1 === c1) && (filter.cat2 === undefined || filter.cat2 === c2);
    if (stillMatches) return;
    window._lastTcdDetailTxs = (window._lastTcdDetailTxs || []).filter(x => String(x.id) !== String(t.id));
    let row = document.querySelector('#tcdDetailsTbody tr[data-id="' + t.id + '"]');
    if (row) row.remove();
};

function computeEclairCategories() { return []; }
// ════════════════════════════════════════════════════
// QUICK CAT SEARCH — v3.0.8
// ════════════════════════════════════════════════════
var _qcResults = [], _qcIdx = -1;
var _lastChosenCat = { c1: null, c2: null }; // derniere cat choisie par clic utilisateur

window.onQuickCatInput = function() {
    var q = ($('quickCatInput').value || '').trim().toLowerCase();
    var dd = $('quickCatDropdown');
    if (!q) { dd.style.display = 'none'; _qcResults = []; return; }
    var pairs = [];
    Object.keys(categories).sort().forEach(function(c1) {
        (categories[c1] || []).sort().forEach(function(c2) {
            pairs.push({ c1: c1, c2: c2, label: (c1 + ' > ' + c2).toLowerCase() });
        });
    });
    _qcResults = pairs.filter(function(p) {
        return p.label.includes(q) || p.c1.toLowerCase().includes(q) || p.c2.toLowerCase().includes(q);
    }).slice(0, 12);
    _qcIdx = _qcResults.length ? 0 : -1;
    if (!_qcResults.length) { dd.style.display = 'none'; return; }
    dd.style.display = 'block';
    dd.innerHTML = _qcResults.map(function(p, i) {
        var active = i === 0 ? ' qc-active' : '';
        return '<div class="qc-item' + active + '" data-idx="' + i + '"'
             + ' onmousedown="event.preventDefault();window.qcApply(' + i + ')"'
             + ' onmouseenter="window.qcHover(' + i + ')"'
             + ' style="padding:8px 14px;cursor:pointer;font-size:0.92em;border-bottom:1px solid var(--ink-faint);color:var(--ink);">'
             + '<span style="font-weight:600;color:var(--accent,#e07b54);">' + escapeHtml(p.c1) + '</span>'
             + '<span style="color:var(--ink-muted);"> › </span>'
             + '<span>' + escapeHtml(p.c2) + '</span>'
             + '</div>';
    }).join('');
};

window.qcHover = function(i) {
    _qcIdx = i;
    var items = $$('.qc-item');
    items.forEach(function(el, j) { el.classList.toggle('qc-active', j === i); });
};

window.onQuickCatKey = function(e) {
    var dd = $('quickCatDropdown');
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        _qcIdx = Math.min(_qcIdx + 1, _qcResults.length - 1);
        $$('.qc-item').forEach(function(el, j) { el.classList.toggle('qc-active', j === _qcIdx); });
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _qcIdx = Math.max(_qcIdx - 1, 0);
        $$('.qc-item').forEach(function(el, j) { el.classList.toggle('qc-active', j === _qcIdx); });
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (_qcIdx >= 0) window.qcApply(_qcIdx);
    } else if (e.key === 'Escape') {
        dd.style.display = 'none';
        $('quickCatInput').value = '';
    let wrap = $('quickCatSearchWrap'); if(wrap) wrap.style.display = 'none';
        _qcResults = [];
    }
};

window.qcApply = function(i) {
    var p = _qcResults[i]; if (!p) return;
    var ids = selectedUncatIds.size > 0
        ? Array.from(selectedUncatIds)
        : (selectedUncatTxId ? [selectedUncatTxId] : []);
    if (!ids.length) { showToast('⚠️ Sélectionnez d\'abord une ou plusieurs lignes'); return; }
    ids.forEach(function(id) {
        var tx = transactions.find(function(t) { return String(t.id) === String(id); });
        if (tx) { tx.cat1 = p.c1; tx.cat2 = p.c2; }
    });
    _lastChosenCat = { c1: p.c1, c2: p.c2 };
    selectedUncatIds.clear();
    $('quickCatDropdown').style.display = 'none';
    $('quickCatInput').value = '';
    let wrap = $('quickCatSearchWrap'); if(wrap) wrap.style.display = 'none';
    _qcResults = [];
    triggerSave(false); window.renderSummary(); window.renderUncategorized();
    showToast('✅ ' + p.c1 + ' › ' + p.c2 + ' appliqué à ' + ids.length + ' ligne(s)');
};

window.onBulkQuickCatInput = function() {
    var q = ($('bulkQuickCatInput').value || '').trim().toLowerCase();
    var dd = $('bulkQuickCatDropdown');
    if (!q) { dd.style.display = 'none'; _qcResults = []; return; }
    var pairs = [];
    Object.keys(categories).sort().forEach(function(c1) {
        (categories[c1] || []).sort().forEach(function(c2) {
            pairs.push({ c1: c1, c2: c2, label: (c1 + ' > ' + c2).toLowerCase() });
        });
    });
    _qcResults = pairs.filter(function(p) {
        return p.label.includes(q) || p.c1.toLowerCase().includes(q) || p.c2.toLowerCase().includes(q);
    }).slice(0, 12);
    _qcIdx = _qcResults.length ? 0 : -1;
    if (!_qcResults.length) { dd.style.display = 'none'; return; }
    dd.style.display = 'block';
    dd.innerHTML = _qcResults.map(function(p, i) {
        var active = i === 0 ? ' qc-active' : '';
        return '<div class="qc-item' + active + '" data-idx="' + i + '"'
             + ' onmousedown="event.preventDefault();window.bulkQcApply(' + i + ')"'
             + ' onmouseenter="window.qcHover(' + i + ')"'
             + ' style="padding:8px 14px;cursor:pointer;font-size:0.92em;border-bottom:1px solid var(--ink-faint);color:var(--ink);">'
             + '<span style="font-weight:600;color:var(--accent,#e07b54);">' + escapeHtml(p.c1) + '</span>'
             + '<span style="color:var(--ink-muted);"> › </span>'
             + '<span>' + escapeHtml(p.c2) + '</span>'
             + '</div>';
    }).join('');
};

window.onBulkQuickCatKey = function(e) {
    var dd = $('bulkQuickCatDropdown');
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        _qcIdx = Math.min(_qcIdx + 1, _qcResults.length - 1);
        $$('#bulkQuickCatDropdown .qc-item').forEach(function(el, j) { el.classList.toggle('qc-active', j === _qcIdx); });
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _qcIdx = Math.max(_qcIdx - 1, 0);
        $$('#bulkQuickCatDropdown .qc-item').forEach(function(el, j) { el.classList.toggle('qc-active', j === _qcIdx); });
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (_qcIdx >= 0) window.bulkQcApply(_qcIdx);
    } else if (e.key === 'Escape') {
        dd.style.display = 'none';
        $('bulkQuickCatInput').value = '';
        _qcResults = [];
    }
};

window.bulkQcApply = function(i) {
    var p = _qcResults[i]; if (!p) return;
    var ids = Array.from($$('.row-cb:checked')).map(c=>c.value);
    if (!ids.length) { showToast('⚠️ Sélectionnez d\'abord une ou plusieurs lignes'); return; }
    transactions.forEach(t=>{if(ids.includes(String(t.id))){t.cat1=p.c1;t.cat2=p.c2;}});
    _lastChosenCat = { c1: p.c1, c2: p.c2 };
    $('selectAllCb').checked=false;
    $('bulkQuickCatDropdown').style.display = 'none';
    $('bulkQuickCatInput').value = '';
    _qcResults = [];
    triggerSave(true); window.renderViewsSafe(); window.updateBulkActions();
    showToast('✅ ' + p.c1 + ' › ' + p.c2 + ' appliqué à ' + ids.length + ' ligne(s)');
};


// Auto-focus saisie rapide catégorie
document.addEventListener('keydown', function(e) {
    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.length === 1) {
        var act = document.activeElement;
        var isTypingField = (act.tagName === 'INPUT' && ['text', 'number', 'date', 'email', 'password', 'search', 'month'].includes(act.type))
                         || act.tagName === 'TEXTAREA'
                         || act.tagName === 'SELECT'
                         || act.isContentEditable;
        if (!isTypingField) {
            var v1 = $('view-categorize');
            if (v1 && v1.classList.contains('active') && selectedUncatIds.size > 0) {
                var inp = $('quickCatInput');
                if (inp) { inp.focus(); }
            }
            var v2 = $('view-data');
            if (v2 && v2.classList.contains('active') && $$('.row-cb:checked').length > 0) {
                var inp2 = $('bulkQuickCatInput');
                if (inp2) { inp2.focus(); }
            }
        }
    }
});


// ════════════════════════════════════════════════════
// SUGGESTION PILLS v1.7.8

function stripCardPrefix(s) {
    var v = (s || '').trim();
    v = v.replace(/^CARTE\s+\d{2}\/\d{2}(?:\/\d{2,4})?\s+/i, '');
    v = v.replace(/^VIR\s+INST\s+/i, '');
    v = v.replace(/^VIR\s+/i, '');
    return v.trim();
}

function getSuggestions(tx) {
    var rawDetail = tx.details || tx.label || '';
    var words = stripCardPrefix(rawDetail).split(/\s+/).filter(function(w){ return w.length >= 4; });

    // Cherche règle correspondante
    var matchedRule = rules.find(function(r) {
        return r.pattern.split(';').map(function(p){ return p.trim(); }).filter(Boolean).some(function(p) {
            return rawDetail.toUpperCase().includes(p.toUpperCase()) || (tx.label && tx.label.toUpperCase().includes(p.toUpperCase()));
        });
    });

    // Cherche meilleure catégorie historique
    var histCat = null;
    if (words.length > 0) {
        var cleanUp = stripCardPrefix(rawDetail).toUpperCase();
        var freq = {};
        transactions.forEach(function(t) {
            if (!t.cat1 || !t.cat2 || t.cat1 === '_SANS_CATEGORIE' || t.cat2 === '_SANS_CATEGORIE') return;
            var tClean = stripCardPrefix(t.details || t.label || '').toUpperCase();
            var score = 0;
            if (cleanUp.length >= 4 && tClean.includes(cleanUp)) score += words.length + 2;
            else words.forEach(function(w) { if (tClean.includes(w.toUpperCase())) score++; });
            if (score > 0) { var k = t.cat1+'|||'+t.cat2; freq[k]=(freq[k]||0)+score; }
        });
        var best = Object.keys(freq).sort(function(a,b){ return freq[b]-freq[a]; })[0];
        if (best) { var bp = best.split('|||'); histCat = { c1: bp[0], c2: bp[1] }; }
    }

    var sugg = [];

    if (matchedRule && matchedRule.cat1 && matchedRule.cat2) {
        // Règle dispo : afficher règle + dernier clic
        sugg.push({ c1: matchedRule.cat1, c2: matchedRule.cat2, type: 'rule' });
    } else if (histCat) {
        // Pas de règle : afficher historique + dernier clic
        sugg.push({ c1: histCat.c1, c2: histCat.c2, type: 'history' });
    }

    // Dernier clic (si différent du premier slot)
    if (_lastChosenCat.c1 && _lastChosenCat.c2) {
        if (!sugg.find(function(s){ return s.c1===_lastChosenCat.c1&&s.c2===_lastChosenCat.c2; }))
            sugg.push({ c1: _lastChosenCat.c1, c2: _lastChosenCat.c2, type: 'global' });
    }

    return sugg.slice(0, 2);
}

function renderPills(tx) {
    var suggs = getSuggestions(tx);
    if (!suggs.length) return '';
    var html = '';
    suggs.forEach(function(s) {
        var icon  = s.type==='rule' ? '🎯' : s.type==='history' ? '📊' : '⟲';
        var color = s.type==='rule' ? '#2e7d32' : s.type==='history' ? '#1565c0' : '#757575';
        var bg    = s.type==='rule' ? 'rgba(46,125,50,.10)' : s.type==='history' ? 'rgba(21,101,192,.10)' : 'rgba(0,0,0,.05)';
        var c2e   = escapeHtml(s.c2);
        var c1e   = escapeHtml(s.c1);
        html += '<button class="sugg-pill"'
              + ' data-txid="' + escapeHtml(String(tx.id)) + '"'
              + ' data-c1="'  + c1e + '"'
              + ' data-c2="'  + c2e + '"'
              + ' title="'    + c1e + ' > ' + c2e + '"'
              + ' style="display:inline-flex;align-items:center;gap:3px;padding:2px 8px;margin:1px;border-radius:12px;'
              + 'border:1px solid ' + color + ';background:' + bg + ';color:' + color + ';'
              + 'font-size:0.70em;cursor:pointer;white-space:nowrap;max-width:150px;overflow:hidden;text-overflow:ellipsis;vertical-align:middle;">'
              + icon + ' ' + c2e
              + '</button>';
    });
    return html;
}

// Delegated click handler for suggestion pills
document.addEventListener('click', function(e) {
    var hit = e.target.closest('.cat-search-hit');
    if (hit) { window.catModalSearchApply(hit.getAttribute('data-c1'), hit.getAttribute('data-c2')); return; }
    var btn = e.target.closest('.sugg-pill');
    if (!btn) return;
    e.stopPropagation();
    var id = btn.getAttribute('data-txid');
    var c1 = btn.getAttribute('data-c1');
    var c2 = btn.getAttribute('data-c2');
    window.applySuggPill(id, c1, c2);
});

window.applySuggPill = function(id, c1, c2) {
    var tx = transactions.find(function(t){ return String(t.id)===String(id); });
    if (!tx) return;
    tx.cat1 = c1; tx.cat2 = c2;
    _lastChosenCat = { c1: c1, c2: c2 };
    triggerSave(false); window.renderSummary(); window.renderUncategorized();
    showToast('OK ' + c1 + ' > ' + c2);
};


// ════════════════════════════════════════════════════
// CAT MODAL SEARCH — v3.0.8
// ════════════════════════════════════════════════════
window.onCatModalSearch = function() {
    var q = ($('catModalSearchInput').value || '').trim().toLowerCase();
    var out = $('catModalSearchResults');
    if (!out) return;
    if (!q) { out.innerHTML = '<div style="color:var(--ink-muted);padding:8px 0;">Saisissez un mot-clé…</div>'; return; }
    var hits = transactions.filter(function(t) {
        if (!t.cat1 || t.cat1 === '_SANS_CATEGORIE') return false;
        var label = (t.label || '').toLowerCase();
        var details = (t.details || '').toLowerCase();
        var amount = String(t.amount || '');
        return label.includes(q) || details.includes(q) || amount.includes(q);
    }).slice(0, 40);
    if (!hits.length) {
        out.innerHTML = '<div style="color:var(--ink-muted);padding:8px 0;">Aucun résultat.</div>';
        return;
    }
    // Group by cat1>cat2 and show count
    var freq = {};
    hits.forEach(function(t) {
        var k = t.cat1 + '|||' + t.cat2;
        if (!freq[k]) freq[k] = { c1: t.cat1, c2: t.cat2, count: 0, examples: [] };
        freq[k].count++;
        if (freq[k].examples.length < 2) freq[k].examples.push(t.details || t.label || '');
    });
    var sorted = Object.values(freq).sort(function(a,b){ return b.count - a.count; });
    out.innerHTML = '<div style="margin-bottom:6px;color:var(--ink-muted);">' + hits.length + ' transaction(s) trouvée(s)</div>'
        + sorted.map(function(g) {
            var c1e = escapeHtml(g.c1), c2e = escapeHtml(g.c2);
            return '<div style="border:1px solid var(--ink-faint);border-radius:6px;padding:7px 10px;margin-bottom:5px;cursor:pointer;background:var(--surface);"'
                 + ' data-c1="' + c1e + '" data-c2="' + c2e + '" class="cat-search-hit"'
                 + ' title="Appliquer ' + c1e + ' > ' + c2e + '">'
                 + '<div style="font-weight:600;font-size:0.9em;">' + c1e + ' <span style="color:var(--ink-muted);">›</span> ' + c2e + '</div>'
                 + '<div style="font-size:0.78em;color:var(--ink-muted);margin-top:2px;">' + escapeHtml(g.examples[0] || '') + ' <span style="color:#c0392b;font-weight:600;">(' + g.count + ')</span>' + '</div>'
                 + '</div>';
        }).join('');
};

window.catModalSearchApply = function(c1, c2) {
    catModalSelectedCat1 = c1;
    catModalSelectedCat2 = c2;
    $('catModalFinalCat').textContent = c1 + ' > ' + c2;
    // Affiche step3 pour confirmation + option règle
    $('catModalStep1').style.display = 'none';
    $('catModalStep2').style.display = 'none';
    $('catModalStep3').style.display = 'block';
    // Scroll step3 into view
    var s3 = $('catModalStep3'); if(s3) s3.scrollIntoView({behavior:'smooth',block:'nearest'});
};


// ════════════════════════════════════════════════════
// GRAPHIQUES ENGINE  — v3.0.8
// ════════════════════════════════════════════════════
var savedCharts = [];            // [{id, config, comment}]
var _cbEditId   = null;          // id du graphique en cours d'édition
var _cbPreviewChart = null;      // instance Chart.js de l'aperçu
var _chartInstances = {};        // {id: Chart instance}

// ── Palette de couleurs pour les séries
var CHART_COLORS = [
    '#01696f','#da7101','#006494','#7a39bb','#437a22',
    '#a12c7b','#d19900','#a13544','#4f98a3','#bb653b'
];

// ── Utility: construire les données du graphique à partir de la config
function buildChartData(cfg) {
    var dateField = cfg.dateSource || 'dateOp';
    var isStacked    = cfg.type === 'bar-stacked' || cfg.type === 'bar-stacked100';
    var seriesField  = cfg.series || 'cat1';

    var txs = transactions.filter(function(t) {
        if (!t.cat1 || t.cat1 === '_SANS_CATEGORIE') return false;
        if (cfg.filterSign === 'debit'  && t.amount >= 0) return false;
        if (cfg.filterSign === 'credit' && t.amount <  0) return false;
        if (cfg.filterYears && cfg.filterYears.length > 0) {
            var txDate = t[dateField] || t.dateOp || '';
            var yr = txDate.length >= 4 ? txDate.substring(0,4) : '';
            if (cfg.filterYears.indexOf(yr) === -1) return false;
        }
        if (cfg.filterCat1 && cfg.filterCat1.length > 0)
            if (cfg.filterCat1.indexOf(t.cat1) === -1) return false;
        if (cfg.filterCat2 && cfg.filterCat2.length > 0)
            if (cfg.filterCat2.indexOf(t.cat2) === -1) return false;
        return true;
    });

    // ── Non-stacked: simple grouping (single or multi-dataset)
    if (!isStacked) {
        var dsDefs = (cfg.datasets && cfg.datasets.length > 0) ? cfg.datasets : [{ label: cfg.title||'', filterCat1:[], filterCat2:[], color: CHART_COLORS[0] }];
        // Collect all labels across all datasets
        var allLabelSet = {};
        dsDefs.forEach(function(dsDef) {
            txs.filter(function(t){
                if (dsDef.filterCat1 && dsDef.filterCat1.length > 0 && dsDef.filterCat1.indexOf(t.cat1) === -1) return false;
                if (dsDef.filterCat2 && dsDef.filterCat2.length > 0 && dsDef.filterCat2.indexOf(t.cat2) === -1) return false;
                return true;
            }).forEach(function(t) {
                var txDateStr = t[dateField] || t.dateOp || '';
                var key;
                if (cfg.axisX === 'month')      key = txDateStr.length >= 7 ? txDateStr.substring(0,7) : txDateStr.substring(0,4)||'?';
                else if (cfg.axisX === 'year')  key = txDateStr.length >= 4 ? txDateStr.substring(0,4) : '?';
                else if (cfg.axisX === 'cat1')  key = t.cat1 || '?';
                else if (cfg.axisX === 'cat2')  key = t.cat2 || '?';
                allLabelSet[key] = true;
            });
        });
        var labels = Object.keys(allLabelSet).sort();
        var multiDatasets = dsDefs.map(function(dsDef, di) {
            var color = dsDef.color || CHART_COLORS[di % CHART_COLORS.length];
            var filtered = txs.filter(function(t){
                if (dsDef.filterCat1 && dsDef.filterCat1.length > 0 && dsDef.filterCat1.indexOf(t.cat1) === -1) return false;
                if (dsDef.filterCat2 && dsDef.filterCat2.length > 0 && dsDef.filterCat2.indexOf(t.cat2) === -1) return false;
                return true;
            });
            var groups = {}; labels.forEach(function(l){ groups[l]=[]; });
            filtered.forEach(function(t) {
                var txDateStr = t[dateField] || t.dateOp || '';
                var key;
                if (cfg.axisX === 'month')      key = txDateStr.length >= 7 ? txDateStr.substring(0,7) : txDateStr.substring(0,4)||'?';
                else if (cfg.axisX === 'year')  key = txDateStr.length >= 4 ? txDateStr.substring(0,4) : '?';
                else if (cfg.axisX === 'cat1')  key = t.cat1 || '?';
                else if (cfg.axisX === 'cat2')  key = t.cat2 || '?';
                if (groups[key] !== undefined) groups[key].push(t.amount);
            });
            var data = labels.map(function(k) {
                var vals = groups[k];
                if (!vals.length) return 0;
                if (cfg.axisY === 'count') return vals.length;
                if (cfg.axisY === 'avg')   return Math.round((vals.reduce(function(a,b){return a+b;},0)/vals.length)*100)/100;
                return vals.reduce(function(a,b){return a+b;},0);
            });
            var isLine = cfg.type === 'line';
            return {
                label: dsDef.label || ('Série '+(di+1)),
                data: data,
                backgroundColor: isLine ? color+'33' : color+'cc',
                borderColor: color,
                borderWidth: isLine ? 2 : 1,
                tension: 0.35, fill: false, pointRadius: isLine ? 3 : 0
            };
        });
        return { labels: labels, datasets: multiDatasets };
    }

    // ── Stacked: group by axisX (labels) × series
    var labelSet = {}, seriesSet = {};
    txs.forEach(function(t) {
        var txDateStr = t[dateField] || t.dateOp || '';
        var xKey;
        if (cfg.axisX === 'month')      xKey = txDateStr.length >= 7 ? txDateStr.substring(0,7) : txDateStr.substring(0,4)||'?';
        else if (cfg.axisX === 'year')  xKey = txDateStr.length >= 4 ? txDateStr.substring(0,4) : '?';
        else if (cfg.axisX === 'cat1')  xKey = t.cat1 || '?';
        else if (cfg.axisX === 'cat2')  xKey = t.cat2 || '?';
        var sKey = t[seriesField] || '?';
        labelSet[xKey]  = true;
        seriesSet[sKey] = true;
    });
    var labels  = Object.keys(labelSet).sort();
    var seriesKeys = Object.keys(seriesSet).sort();

    // Build matrix
    var matrix = {}; // matrix[sKey][xKey] = sum/count/avg
    seriesKeys.forEach(function(s) { matrix[s] = {}; labels.forEach(function(l) { matrix[s][l] = []; }); });
    txs.forEach(function(t) {
        var txDateStr = t[dateField] || t.dateOp || '';
        var xKey;
        if (cfg.axisX === 'month')      xKey = txDateStr.length >= 7 ? txDateStr.substring(0,7) : txDateStr.substring(0,4)||'?';
        else if (cfg.axisX === 'year')  xKey = txDateStr.length >= 4 ? txDateStr.substring(0,4) : '?';
        else if (cfg.axisX === 'cat1')  xKey = t.cat1 || '?';
        else if (cfg.axisX === 'cat2')  xKey = t.cat2 || '?';
        var sKey = t[seriesField] || '?';
        if (matrix[sKey] && matrix[sKey][xKey] !== undefined) matrix[sKey][xKey].push(t.amount);
    });

    // First pass: compute raw values per series per label
    var rawMatrix = {};
    seriesKeys.forEach(function(s) {
        rawMatrix[s] = labels.map(function(l) {
            var vals = matrix[s][l] || [];
            if (!vals.length) return 0;
            if (cfg.axisY === 'count') return vals.length;
            if (cfg.axisY === 'avg')   return Math.round((vals.reduce(function(a,b){return a+b;},0)/vals.length)*100)/100;
            return Math.abs(vals.reduce(function(a,b){return a+b;},0));
        });
    });

    // Compute column totals for 100% normalization
    var colTotals = labels.map(function(_, li) {
        return seriesKeys.reduce(function(sum, s) { return sum + (rawMatrix[s][li] || 0); }, 0);
    });

    var datasets = seriesKeys.map(function(s, si) {
        var color = CHART_COLORS[si % CHART_COLORS.length];
        var data  = labels.map(function(_, li) {
            var raw = rawMatrix[s][li] || 0;
            if (cfg.type === 'bar-stacked100') {
                var total = colTotals[li];
                return total > 0 ? Math.round((raw / total) * 10000) / 100 : 0;
            }
            return raw;
        });
        return { label: s, data: data, backgroundColor: color + 'cc', borderColor: color, borderWidth: 1 };
    });

    return { labels: labels, datasets: datasets };
}

// ── Rendre un graphique dans un canvas existant
function renderChartOnCanvas(canvas, cfg) {
    var data     = buildChartData(cfg);
    var ctx      = canvas.getContext('2d');
    var isDark   = document.documentElement.getAttribute('data-theme') === 'dark';
    var gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    var tickColor = isDark ? '#797876' : '#7a7974';
    var isStacked    = cfg.type === 'bar-stacked' || cfg.type === 'bar-stacked100';
    var is100        = cfg.type === 'bar-stacked100';
    var isLine       = cfg.type === 'line';

    // For non-stacked: colors already set by buildChartData (multi-dataset aware)
    // For single-dataset bar only: apply per-bar multi-color if no custom color defined
    var datasets = data.datasets;
    if (!isStacked && datasets.length === 1 && !isLine) {
        // Only override if backgroundColor is not already an array
        if (!Array.isArray(datasets[0].backgroundColor)) {
            datasets[0].backgroundColor = data.labels.map(function(_,i){ return CHART_COLORS[i % CHART_COLORS.length] + 'cc'; });
            datasets[0].borderColor      = data.labels.map(function(_,i){ return CHART_COLORS[i % CHART_COLORS.length]; });
        }
    }

    var fmtVal = function(v) {
        if (cfg.axisY === 'count') return v + ' transactions';
        return v.toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' €';
    };

    return new Chart(ctx, {
        type: isLine ? 'line' : 'bar',
        data: { labels: data.labels, datasets: datasets },
        options: {
            responsive: true,
            onClick: isStacked ? function(evt, elements) {
                if (!elements || !elements.length) return;
                var el       = elements[0];
                var label    = this.data.labels[el.index];
                var series   = this.data.datasets[el.datasetIndex].label;
                window.openDrillDown(cfg, label, series);
            } : undefined,
            plugins: {
                legend: { display: isStacked || data.datasets.length > 1, position: 'bottom',
                    labels: { color: tickColor, font: { size: 11 }, boxWidth: 14 } },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            if (is100) {
                                var total = ctx.chart.data.datasets.reduce(function(s,ds){ return s+(ds.data[ctx.dataIndex]||0); },0);
                                var pct   = total ? ((ctx.parsed.y / total)*100).toFixed(1) : '0.0';
                                return ' ' + ctx.dataset.label + ': ' + fmtVal(ctx.parsed.y) + ' (' + pct + '%)';
                            }
                            return ' ' + ctx.dataset.label + ': ' + fmtVal(ctx.parsed.y);
                        }
                    }
                }
            },
            scales: {
                x: {
                    stacked: isStacked,
                    ticks: { color: tickColor, font: { size: 11 }, maxRotation: 45 },
                    grid:  { color: gridColor }
                },
                y: {
                    stacked: isStacked,
                    reverse: cfg.invertY === true,
                    max:     is100 ? 100 : undefined,
                    min:     is100 ? 0   : undefined,
                    ticks: {
                        color: tickColor, font: { size: 11 },
                        callback: function(v) {
                            if (is100) return v + '%';
                            if (cfg.axisY === 'count') return v;
                            return v.toLocaleString('fr-FR',{minimumFractionDigits:0,maximumFractionDigits:0}) + '€';
                        }
                    },
                    grid: { color: gridColor }
                }
            }
        }
    });
}

// ── Afficher tous les graphiques sauvegardés
window.renderCharts = function() {
    var container = $('chartsList');
    var empty     = $('chartsEmpty');
    if (!container) return;

    Object.keys(_chartInstances).forEach(function(id) {
        try { _chartInstances[id].destroy(); } catch(e) {}
    });
    _chartInstances = {};
    container.innerHTML = '';

    if (!savedCharts.length) {
        empty.style.display = 'block'; container.style.display = 'none'; return;
    }
    empty.style.display = 'none';
    container.style.cssText = 'display:flex;flex-wrap:wrap;gap:24px;align-items:flex-start;';

    savedCharts.forEach(function(sc, idx) {
        var isHalf = sc.config.width === 'half';
        var wrap = document.createElement('div');
        wrap.setAttribute('data-chart-id', sc.id);
        wrap.setAttribute('draggable', 'true');
        wrap.style.cssText = 'background:var(--surface);border:1px solid var(--ink-faint);border-radius:10px;padding:20px;box-sizing:border-box;'
            + (isHalf ? 'width:calc(50% - 12px);min-width:280px;flex-shrink:0;' : 'width:100%;');

        wrap.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">'
          + '<span class="chart-drag-handle" title="Glisser pour réordonner" style="cursor:grab;font-size:1.2em;color:var(--ink-muted);user-select:none;">⠿</span>'
          + '<span class="chart-title-inline" data-chart-id="' + sc.id + '"'
          +   ' contenteditable="true" spellcheck="false"'
          +   ' style="font-weight:700;font-size:1.05em;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;outline:none;border-bottom:1px dashed transparent;cursor:text;padding:2px 4px;border-radius:4px;"'
          +   ' title="Cliquer pour renommer">' + escapeHtml(sc.config.title || 'Graphique') + '</span>'
          + '<div style="display:flex;gap:6px;align-items:center;flex-shrink:0;">'
          + (sc.config.blur ? '<button class="btn btn-outline chart-eye-btn" id="eye-' + sc.id + '" style="padding:3px 8px;font-size:0.82em;" title="Afficher/masquer">🙈</button>' : '')
          + '<button class="btn btn-outline" style="padding:3px 10px;font-size:0.82em;" data-edit-id="' + sc.id + '">✏️</button>'
          + '<button class="btn btn-outline" style="padding:3px 10px;font-size:0.82em;color:var(--urgent);" data-del-id="' + sc.id + '">🗑</button>'
          + '</div></div>'
          + '<div class="chart-blur-wrapper" style="position:relative;">'
          + '<canvas id="chart-' + sc.id + '" style="width:100%;max-height:300px;"></canvas>'
          + (sc.config.blur ? '<div class="chart-blur-overlay" id="blur-' + sc.id + '"></div>' : '')
          + '</div>'
          + '<div style="margin-top:12px;">'
          + '<textarea class="input-text chart-comment-area" data-chart-id="' + sc.id + '" rows="2"'
          +   ' style="width:100%;margin-top:2px;font-size:0.88em;resize:vertical;"'
          +   ' placeholder="Commentaire…">' + escapeHtml(sc.comment || '') + '</textarea>'
          + '</div>';

        container.appendChild(wrap);

        setTimeout(function() {
            var canvas = document.getElementById('chart-' + sc.id);
            if (canvas) _chartInstances[sc.id] = renderChartOnCanvas(canvas, sc.config);
        }, 30);
    });

    // ── Eye buttons (blur toggle)
    savedCharts.forEach(function(sc) {
        if (!sc.config.blur) return;
        var eyeBtn   = document.getElementById('eye-' + sc.id);
        var blurDiv  = document.getElementById('blur-' + sc.id);
        var _blurTimer = null;
        if (!eyeBtn || !blurDiv) return;
        eyeBtn.addEventListener('click', function() {
            var isHidden = blurDiv.classList.contains('hidden');
            if (isHidden) {
                // already unblurred — re-blur now
                blurDiv.classList.remove('hidden');
                eyeBtn.textContent = '🙈';
                clearTimeout(_blurTimer);
            } else {
                // unblur for 60s
                blurDiv.classList.add('hidden');
                eyeBtn.textContent = '👁️';
                clearTimeout(_blurTimer);
                _blurTimer = setTimeout(function() {
                    blurDiv.classList.remove('hidden');
                    eyeBtn.textContent = '🙈';
                }, 60000);
            }
        });
    });

    // ── Délégation : commentaire
    container.querySelectorAll('.chart-comment-area').forEach(function(ta) {
        ta.addEventListener('input', function() {
            var sc = savedCharts.find(function(c){ return c.id === ta.getAttribute('data-chart-id'); });
            if (sc) { sc.comment = ta.value; triggerSave(false); }
        });
    });

    // ── Délégation : modifier / supprimer
    container.addEventListener('click', function(e) {
        var editBtn = e.target.closest('[data-edit-id]');
        var delBtn  = e.target.closest('[data-del-id]');
        if (editBtn) window.editChart(editBtn.getAttribute('data-edit-id'));
        if (delBtn)  window.deleteChart(delBtn.getAttribute('data-del-id'));
    });

    // ── Titre inline éditable
    container.querySelectorAll('.chart-title-inline').forEach(function(el) {
        el.addEventListener('focus', function() { el.style.borderBottomColor = 'var(--pro)'; el.style.background = 'var(--bg)'; });
        el.addEventListener('blur', function() {
            el.style.borderBottomColor = 'transparent'; el.style.background = '';
            var sc = savedCharts.find(function(c){ return c.id === el.getAttribute('data-chart-id'); });
            if (sc) { sc.config.title = el.textContent.trim() || 'Graphique'; triggerSave(false); }
        });
        el.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
    });

    // ── Drag & drop pour réordonner
    var dragSrc = null;
    container.querySelectorAll('[draggable]').forEach(function(item) {
        item.addEventListener('dragstart', function(e) {
            dragSrc = item;
            e.dataTransfer.effectAllowed = 'move';
            item.style.opacity = '0.5';
        });
        item.addEventListener('dragend', function() { item.style.opacity = ''; });
        item.addEventListener('dragover', function(e) {
            e.preventDefault(); e.dataTransfer.dropEffect = 'move';
            item.style.outline = '2px dashed var(--pro)';
        });
        item.addEventListener('dragleave', function() { item.style.outline = ''; });
        item.addEventListener('drop', function(e) {
            e.preventDefault(); item.style.outline = '';
            if (dragSrc && dragSrc !== item) {
                var srcId  = dragSrc.getAttribute('data-chart-id');
                var dstId  = item.getAttribute('data-chart-id');
                var srcIdx = savedCharts.findIndex(function(c){ return c.id === srcId; });
                var dstIdx = savedCharts.findIndex(function(c){ return c.id === dstId; });
                var moved  = savedCharts.splice(srcIdx, 1)[0];
                savedCharts.splice(dstIdx, 0, moved);
                triggerSave(false);
                window.renderCharts();
            }
        });
    });
};;

// ── Ouvrir le builder (nouveau ou édition)
window.openChartBuilder = function(editId) {
    _cbEditId = editId || null;
    var existing = editId ? savedCharts.find(function(c){ return c.id === editId; }) : null;
    var cfg = existing ? existing.config : {};

    $('chartBuilderTitle').textContent = editId ? 'Modifier le graphique' : 'Nouveau graphique';
    $('cbTitle').value          = cfg.title      || '';
    $('cbType').value           = cfg.type       || 'bar';
    $('cbAxisX').value          = cfg.axisX      || 'month';
    $('cbAxisY').value          = cfg.axisY      || 'sum';
    $('cbDateSource').value     = cfg.dateSource || 'dateOp';
    $('cbWidth').value           = cfg.width      || 'full';
    if($('cbInvertY')) $('cbInvertY').checked = cfg.invertY || false;
    if($('cbBlur'))    $('cbBlur').checked    = cfg.blur    || false;
    if($('cbSeries'))  $('cbSeries').value  = cfg.series  || 'cat1';
    window.onCbTypeChange();
    setCbDatasets(cfg.datasets || []);
    $('cbFilterSign').value     = cfg.filterSign || 'all';

    // Peupler les listes d'années et catégories
    window.populateCbFilters(cfg);

    $('chartBuilderOverlay').classList.add('open');
    window.updateCbPreview();
};

window.closeChartBuilder = function() {
    $('chartBuilderOverlay').classList.remove('open');
    if (_cbPreviewChart) { try { _cbPreviewChart.destroy(); } catch(e) {} _cbPreviewChart = null; }
};

// Live preview on any builder field change
document.addEventListener('change', function(e) {
    var ids = ['cbType','cbAxisX','cbAxisY','cbFilterYear','cbFilterSign','cbFilterCat1','cbFilterCat2','cbDateSource','cbWidth','cbInvertY','cbSeries'];
    if (e.target.id === 'cbDateSource') { window.populateCbFilters(readCbConfig()); }
    if (ids.indexOf(e.target.id) !== -1) window.updateCbPreview();
});
document.addEventListener('input', function(e) {
    if (e.target.id === 'cbTitle') window.updateCbPreview();
});


// ── Peupler les filtres du builder
window.populateCbFilters = function(cfg) {
    // Années disponibles
    var years = [];
    var _ds = ($('cbDateSource') && $('cbDateSource').value) || 'dateOp';
    transactions.forEach(function(t) {
        var raw = t[_ds] || t.dateOp || '';
        var y = raw.length >= 4 ? raw.substring(0,4) : '';
        if (y && years.indexOf(y) === -1) years.push(y);
    });
    years.sort().reverse();
    var yearSel = $('cbFilterYear');
    yearSel.innerHTML = years.map(function(y) {
        var sel = cfg.filterYears && cfg.filterYears.indexOf(y) !== -1;
        return '<option value="' + y + '"' + (sel?' selected':'') + '>' + y + '</option>';
    }).join('');

    // Cat1
    var cat1s = Object.keys(categories).sort(customSortCmp);
    var c1Sel = $('cbFilterCat1');
    c1Sel.innerHTML = '<option value="">Toutes</option>' + cat1s.map(function(c) {
        var sel = cfg.filterCat1 && cfg.filterCat1.indexOf(c) !== -1;
        return '<option value="' + escapeHtml(c) + '"' + (sel?' selected':'') + '>' + escapeHtml(c) + '</option>';
    }).join('');

    window.updateCbCat2Filter(cfg);
};

window.onCbCat1Change = function() { window.updateCbCat2Filter({}); window.updateCbPreview(); };
window.onCbAxisChange = function() { window.updateCbPreview(); };
window.onCbTypeChange = function() {
    var t = $('cbType').value;
    var isStacked = t === 'bar-stacked' || t === 'bar-stacked100';
    if($('cbSeriesGroup')) $('cbSeriesGroup').style.display = isStacked ? 'block' : 'none';
    window.updateCbPreview();
};


window.updateCbCat2Filter = function(cfg) {
    var sel1 = Array.from($('cbFilterCat1').selectedOptions).map(function(o){ return o.value; }).filter(Boolean);
    var cat2s = [];
    (sel1.length ? sel1 : Object.keys(categories)).forEach(function(c1) {
        var subs = categories[c1] || [];
        subs.forEach(function(c2) { if (cat2s.indexOf(c2) === -1) cat2s.push(c2); });
    });
    cat2s.sort();
    var c2Sel = $('cbFilterCat2');
    c2Sel.innerHTML = '<option value="">Toutes</option>' + cat2s.map(function(c) {
        var sel = cfg.filterCat2 && cfg.filterCat2.indexOf(c) !== -1;
        return '<option value="' + escapeHtml(c) + '"' + (sel?' selected':'') + '>' + escapeHtml(c) + '</option>';
    }).join('');
};

// ── Lire la config du builder
function readCbConfig() {
    return {
        title:      $('cbTitle').value.trim() || 'Graphique',
        type:       $('cbType').value,
        axisX:      $('cbAxisX').value,
        axisY:      $('cbAxisY').value,
        dateSource: $('cbDateSource').value,
        width:      $('cbWidth').value || 'full',
        filterSign: $('cbFilterSign').value,
        invertY:    $('cbInvertY') ? $('cbInvertY').checked : false,
        blur:       $('cbBlur')    ? $('cbBlur').checked    : false,
        series:     $('cbSeries') ? $('cbSeries').value : 'cat1',
        datasets:   getCbDatasets(),
        filterYears: Array.from($('cbFilterYear').selectedOptions).map(function(o){ return o.value; }),
        filterCat1:  Array.from($('cbFilterCat1').selectedOptions).map(function(o){ return o.value; }).filter(Boolean),
        filterCat2:  Array.from($('cbFilterCat2').selectedOptions).map(function(o){ return o.value; }).filter(Boolean),
    };
}

// ── Mettre à jour l'aperçu
window.updateCbPreview = function() {
    var canvas = $('cbPreviewCanvas');
    if (!canvas) return;
    if (_cbPreviewChart) { try { _cbPreviewChart.destroy(); } catch(e) {} _cbPreviewChart = null; }
    var cfg = readCbConfig();
    _cbPreviewChart = renderChartOnCanvas(canvas, cfg);
};

// Déclencher l'aperçu sur changement de n'importe quel champ du builder
['cbTitle','cbType','cbAxisX','cbAxisY','cbFilterYear','cbFilterSign','cbFilterCat1','cbFilterCat2'].forEach(function(id) {
    // On attache après chargement du DOM
    document.addEventListener('DOMContentLoaded', function() {
        var el = $(id); if(el) el.addEventListener('change', window.updateCbPreview);
    });
});

// ── Sauvegarder le graphique
window.saveChart = function() {
    var cfg = readCbConfig();
    if (_cbEditId) {
        var sc = savedCharts.find(function(c){ return c.id === _cbEditId; });
        if (sc) sc.config = cfg;
    } else {
        savedCharts.push({ id: 'chart_' + Date.now(), config: cfg, comment: '' });
    }
    triggerSave(false);
    window.closeChartBuilder();
    window.renderCharts();
};

// ── Modifier un graphique
window.editChart = function(id) { window.openChartBuilder(id); };

// ── Supprimer un graphique
window.deleteChart = function(id) {
    if (!confirm('Supprimer ce graphique ?')) return;
    savedCharts = savedCharts.filter(function(c){ return c.id !== id; });
    if (_chartInstances[id]) { try { _chartInstances[id].destroy(); } catch(e) {} delete _chartInstances[id]; }
    triggerSave(false);
    window.renderCharts();
};


// ════════════════════════════════════════════════════
// DRILL-DOWN — clic sur portion d'histogramme empilé
// ════════════════════════════════════════════════════
var _drillChart = null;

window.closeDrillDown = function() {
    $('drillDownOverlay').classList.remove('open');
    if (_drillChart) { try { _drillChart.destroy(); } catch(e) {} _drillChart = null; }
};

window.openDrillDown = function(parentCfg, clickedLabel, clickedSeries) {
    // Build a 100% stacked chart of cat2 breakdown for the clicked (label × series)
    var dateField   = parentCfg.dateSource || 'dateOp';
    var seriesField = parentCfg.series || 'cat1';

    // Filter transactions matching the clicked bar segment
    var txs = transactions.filter(function(t) {
        if (!t.cat1 || t.cat1 === '_SANS_CATEGORIE') return false;
        if (parentCfg.filterSign === 'debit'  && t.amount >= 0) return false;
        if (parentCfg.filterSign === 'credit' && t.amount <  0) return false;
        // Match axisX label
        var txDateStr = t[dateField] || t.dateOp || '';
        var xKey;
        if (parentCfg.axisX === 'month')     xKey = txDateStr.length >= 7 ? txDateStr.substring(0,7) : txDateStr.substring(0,4)||'?';
        else if (parentCfg.axisX === 'year') xKey = txDateStr.length >= 4 ? txDateStr.substring(0,4) : '?';
        else if (parentCfg.axisX === 'cat1') xKey = t.cat1 || '?';
        else if (parentCfg.axisX === 'cat2') xKey = t.cat2 || '?';
        if (xKey !== clickedLabel) return false;
        // Match series
        if ((t[seriesField] || '?') !== clickedSeries) return false;
        return true;
    });

    if (!txs.length) { showToast('Aucune transaction pour cette sélection.'); return; }

    // Group by cat2 (or cat1 if series is already cat2)
    var subField = seriesField === 'cat2' ? 'cat1' : 'cat2';
    var subGroups = {};
    txs.forEach(function(t) {
        var k = t[subField] || '?';
        subGroups[k] = (subGroups[k] || 0) + Math.abs(t.amount);
    });
    var total = Object.values(subGroups).reduce(function(a,b){return a+b;},0);
    var subKeys = Object.keys(subGroups).sort(function(a,b){ return subGroups[b]-subGroups[a]; });
    var pctData = subKeys.map(function(k){ return total > 0 ? Math.round(subGroups[k]/total*10000)/100 : 0; });

    // Build title
    $('drillDownTitle').textContent = '📊 ' + clickedSeries + '  ›  ' + clickedLabel + ' — répartition ' + subField.replace('cat','Cat ');

    // Render
    $('drillDownOverlay').classList.add('open');
    if (_drillChart) { try { _drillChart.destroy(); } catch(e) {} _drillChart = null; }

    var isDark    = document.documentElement.getAttribute('data-theme') === 'dark';
    var tickColor = isDark ? '#797876' : '#7a7974';
    var gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    var canvas    = $('drillDownCanvas');
    var ctx       = canvas.getContext('2d');

    _drillChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: subKeys,
            datasets: [{
                label: 'Part (%)',
                data:  pctData,
                backgroundColor: subKeys.map(function(_,i){ return CHART_COLORS[i % CHART_COLORS.length] + 'cc'; }),
                borderColor:     subKeys.map(function(_,i){ return CHART_COLORS[i % CHART_COLORS.length]; }),
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            var k   = subKeys[ctx.dataIndex];
                            var raw = subGroups[k];
                            return ' ' + ctx.parsed.x.toFixed(1) + '%  —  ' + raw.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' €';
                        }
                    }
                }
            },
            scales: {
                x: { min:0, max:100,
                     ticks: { color: tickColor, font:{size:11}, callback: function(v){ return v+'%'; } },
                     grid:  { color: gridColor } },
                y: { ticks: { color: tickColor, font:{size:11} }, grid: { color: gridColor } }
            }
        }
    });
};


// ════════════════════════════════════════════════════
// IDÉES AMÉLIORATION — v3.0.8
// ════════════════════════════════════════════════════
var _ideasFileId = null;
var _ideasFileName = 'appsysdata_ideas_' + (currentAccountId || 'default') + '.dat';

window.openIdeasPopup = function() {
    $('ideasOverlay').classList.add('open');
    $('ideasSaveStatus').textContent = '';
    window.loadIdeasText();
};

window.closeIdeasPopup = function() {
    $('ideasOverlay').classList.remove('open');
};

window.loadIdeasText = async function() {
    if (!driveAccessToken) {
        $('ideasTextarea').value = '';
        $('ideasTextarea').placeholder = 'Connectez-vous à Drive pour sauvegarder vos idées.';
        return;
    }
    $('ideasSaveStatus').textContent = '⏳ Chargement...';
    try {
        var fname = 'appsysdata_ideas_' + (currentAccountId || 'default') + '.dat';
        var r = await fetch("https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D'" + encodeURIComponent(fname) + "'&fields=files(id,name)&pageSize=1", {
            headers: { Authorization: 'Bearer ' + driveAccessToken }
        });
        var d = await r.json();
        if (d.files && d.files.length > 0) {
            _ideasFileId = d.files[0].id;
            var rc = await fetch('https://www.googleapis.com/drive/v3/files/' + _ideasFileId + '?alt=media', {
                headers: { Authorization: 'Bearer ' + driveAccessToken }
            });
            $('ideasTextarea').value = await rc.text();
            $('ideasSaveStatus').textContent = '✅ Chargé';
        } else {
            _ideasFileId = null;
            $('ideasTextarea').value = '';
            $('ideasSaveStatus').textContent = 'Nouveau fichier';
        }
    } catch(e) {
        $('ideasSaveStatus').textContent = '❌ Erreur chargement';
    }
};

window.saveIdeasText = async function() {
    if (!driveAccessToken) return;
    var text = $('ideasTextarea').value;
    $('ideasSaveStatus').textContent = '💾 Sauvegarde...';
    try {
        var fname = 'appsysdata_ideas_' + (currentAccountId || 'default') + '.dat';
        var blob = new Blob([text], { type: 'text/plain' });
        var url, method;
        if (_ideasFileId) {
            url    = 'https://www.googleapis.com/upload/drive/v3/files/' + _ideasFileId + '?uploadType=media';
            method = 'PATCH';
        } else {
            var meta = JSON.stringify({ name: fname, parents: ['appDataFolder'] });
            var form = new FormData();
            form.append('metadata', new Blob([meta], { type: 'application/json' }));
            form.append('file', blob);
            var r2 = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + driveAccessToken },
                body: form
            });
            var res = await r2.json();
            _ideasFileId = res.id;
            $('ideasSaveStatus').textContent = '✅ Sauvegardé';
            return;
        }
        await fetch(url, {
            method: method,
            headers: { Authorization: 'Bearer ' + driveAccessToken, 'Content-Type': 'text/plain' },
            body: text
        });
        $('ideasSaveStatus').textContent = '✅ Sauvegardé — ' + new Date().toLocaleTimeString('fr-FR');
    } catch(e) {
        $('ideasSaveStatus').textContent = '❌ Erreur sauvegarde';
    }
};

// ════════════════════════
// TCD cross-highlight
// ════════════════════════
(function() {
    function getTcdTable() {
        return document.querySelector('#summaryGrid .tcd-native');
    }
    function clearHighlights(tbl) {
        tbl.querySelectorAll('.tcd-row-hover').forEach(function(r){ r.classList.remove('tcd-row-hover'); });
        tbl.querySelectorAll('.tcd-col-hover').forEach(function(c){ c.classList.remove('tcd-col-hover'); });
    }

    // Use event delegation on document — always works after re-render
    document.addEventListener('mouseover', function(e) {
        var td = e.target.closest('#summaryGrid td, #summaryGrid th');
        if (!td) return;
        var tbl = getTcdTable();
        if (!tbl) return;
        clearHighlights(tbl);
        var row    = td.closest('tr');
        var colIdx = td.cellIndex;
        var inHeader = !!td.closest('thead');
        if (inHeader) return; // no highlight on headers
        if (row) row.classList.add('tcd-row-hover');
        tbl.querySelectorAll('tbody tr').forEach(function(r) {
            var cell = r.cells[colIdx];
            if (cell) cell.classList.add('tcd-col-hover');
        });
    });

    document.addEventListener('mouseleave', function(e) {
        if (!e.target.closest('#summaryGrid')) return;
        var tbl = getTcdTable();
        if (tbl) clearHighlights(tbl);
    }, true);
})();

// ════════════════════════════════════════════════════
// MULTI-DATASET builder
// ════════════════════════════════════════════════════
var DATASET_COLORS = ['#4e8bcd','#e07b54','#5bab6e','#c45fa0','#e6b93a','#7c6fcd','#3bbfb5','#d95555'];

function getCbDatasets() {
    var rows = document.querySelectorAll('#cbDatasetsContainer .cb-dataset-row');
    var result = [];
    rows.forEach(function(row) {
        var label = row.querySelector('.cb-ds-label').value.trim();
        var cat1s = Array.from(row.querySelectorAll('.cb-ds-cat1 option:checked')).map(function(o){return o.value;});
        var cat2s = Array.from(row.querySelectorAll('.cb-ds-cat2 option:checked')).map(function(o){return o.value;});
        var color = row.querySelector('.cb-ds-color').value;
        result.push({ label: label, filterCat1: cat1s, filterCat2: cat2s, color: color });
    });
    return result;
}

function setCbDatasets(datasets) {
    var container = document.getElementById('cbDatasetsContainer');
    container.innerHTML = '';
    (datasets && datasets.length ? datasets : [{}]).forEach(function(ds) {
        window.addCbDataset(ds);
    });
}

function buildDatasetRow(ds, idx) {
    var colors = DATASET_COLORS;
    var color  = (ds && ds.color) ? ds.color : colors[idx % colors.length];
    var label  = (ds && ds.label) ? ds.label : ('Série ' + (idx+1));

    // Build cat1 options
    var cat1Array = Array.isArray(categories) ? categories : Object.keys(categories).map(function(k){ return {name:k}; });
    var cat1Opts = cat1Array.map(function(c){
        var sel = (ds && ds.filterCat1 && ds.filterCat1.indexOf(c.name) !== -1) ? ' selected' : '';
        return '<option value="' + escapeHtml(c.name) + '"' + sel + '>' + escapeHtml(c.name) + '</option>';
    }).join('');

    var row = document.createElement('div');
    row.className = 'cb-dataset-row';
    row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr 36px;gap:6px;align-items:start;margin-bottom:8px;padding:8px;background:var(--bg);border-radius:6px;border:1px solid var(--ink-faint);';
    row.innerHTML =
        '<div>'
      + '<label style="font-size:0.75em;color:var(--ink-soft);display:block;margin-bottom:2px;">Libellé</label>'
      + '<div style="display:flex;gap:4px;">'
      + '<input type="color" class="cb-ds-color" value="' + color + '" style="width:28px;height:28px;padding:0;border:none;cursor:pointer;border-radius:4px;" oninput="window.updateCbPreview()">'
      + '<input type="text" class="cb-ds-label input-text" value="' + escapeHtml(label) + '" style="flex:1;font-size:0.85em;" oninput="window.updateCbPreview()">'
      + '</div></div>'
      + '<div>'
      + '<label style="font-size:0.75em;color:var(--ink-soft);display:block;margin-bottom:2px;">Cat 1 (multi)</label>'
      + '<select class="cb-ds-cat1 input-text" multiple style="width:100%;height:60px;font-size:0.82em;" onchange="window.updateCbCat2ForRow(this);window.updateCbPreview();">' + cat1Opts + '</select>'
      + '</div>'
      + '<div>'
      + '<label style="font-size:0.75em;color:var(--ink-soft);display:block;margin-bottom:2px;">Cat 2 (multi)</label>'
      + '<select class="cb-ds-cat2 input-text" multiple style="width:100%;height:60px;font-size:0.82em;" onchange="window.updateCbPreview();"></select>'
      + '</div>'
      + '<div style="padding-top:18px;">'
      + '<button class="btn btn-outline" style="padding:3px 6px;font-size:0.85em;color:var(--urgent);" onclick="window.removeCbDataset(this);">✕</button>'
      + '</div>';
    return row;
}


window.removeCbDataset = function(btn) {
    btn.closest('.cb-dataset-row').remove();
    window.updateCbPreview();
};

window.addCbDataset = function(ds) {
    var container = document.getElementById('cbDatasetsContainer');
    if (!container) return;
    var idx = container.querySelectorAll('.cb-dataset-row').length;
    if (idx >= 6) { showToast('Maximum 6 jeux de données'); return; }
    var row = buildDatasetRow(ds || {}, idx);
    container.appendChild(row);
    // Populate cat2 based on selected cat1
    var cat1Sel = row.querySelector('.cb-ds-cat1');
    window.updateCbCat2ForRow(cat1Sel, ds ? ds.filterCat2 : []);
    window.updateCbPreview();
};

window.updateCbCat2ForRow = function(cat1Sel, preselect) {
    var row     = cat1Sel.closest('.cb-dataset-row');
    var cat2Sel = row.querySelector('.cb-ds-cat2');
    var sel1    = Array.from(cat1Sel.selectedOptions).map(function(o){return o.value;});
    var cat2Set = {};
    var txList = Array.isArray(transactions) ? transactions : [];
    txList.forEach(function(t) {
        if (!t.cat2) return;
        if (sel1.length === 0 || sel1.indexOf(t.cat1) !== -1) cat2Set[t.cat2] = true;
    });
    var cat2Keys = Object.keys(cat2Set).sort();
    cat2Sel.innerHTML = cat2Keys.map(function(c){
        var sel = (preselect && preselect.indexOf(c) !== -1) ? ' selected' : '';
        return '<option value="' + escapeHtml(c) + '"' + sel + '>' + escapeHtml(c) + '</option>';
    }).join('');
};


window.sortUncat = function(col) {
    if (uncatSortCol === col) uncatSortDir *= -1; else { uncatSortCol = col; uncatSortDir = -1; }
    localStorage.setItem('uncatSortCol', uncatSortCol);
    localStorage.setItem('uncatSortDir', uncatSortDir);
    window.renderUncategorized();
};
window.renderUncategorized = function() {
    let _wrap = $('view-categorize').querySelector('.table-wrap');
    let _savedScroll = _wrap ? _wrap.scrollTop : 0;
    let uncat = transactions.filter(t => {
        if (!(!t.cat1 || !t.cat2 || t.cat1==="_SANS_CATEGORIE" || t.cat2==="_SANS_CATEGORIE")) return false;
        let f = uncatColFilters;
        let cat1 = t.cat1||'', cat2 = t.cat2||'';
        let c1 = (cat1 && cat1!=='_SANS_CATEGORIE') ? cat1 : '';
        let c2 = (cat2 && cat2!=='_SANS_CATEGORIE') ? cat2 : '';
        // Inclure aussi le match règle dans displayCat pour le filtre
        let m = rules.find(r => r.pattern.split(';').map(p=>p.trim()).filter(p=>p).some(p => (t.label && t.label.toUpperCase().includes(p.toUpperCase())) || (t.details && t.details.toUpperCase().includes(p.toUpperCase()))));
        let rc1 = m ? m.cat1 : '', rc2 = m ? m.cat2 : '';
        let eff1 = c1 || rc1, eff2 = c2 || rc2;
        let displayCat = (eff1 && eff2) ? eff1+' > '+eff2 : (eff1 || eff2);
        const chk = (fv, raw) => {
            if (!fv) return true;
            let vs = String(raw||'').toLowerCase();
            if (fv.startsWith(' ')) return vs.trim() === '';
            return vs.includes(fv);
        };
        if (!chk(f.dateOp,      String(t.dateOp||'').split('-').reverse().join('/'))) return false;
        if (!chk(f.dateExpense, String(t.dateExpense||t.dateOp||'').split('-').reverse().join('/'))) return false;
        if (!chk(f.details, t.details)) return false;
        if (!chk(f.cat,     displayCat)) return false;
        if (!chk(f.note,    t.note)) return false;
        if (!chk(f.amount, String(t.amount||''))) return false;
        if (f.catNotEmpty  && !displayCat) return false;
        if (f.noteNotEmpty && !String(t.note||'').trim()) return false;
        return true;
    }).sort((a,b) => {
        let va = a[uncatSortCol]||'', vb = b[uncatSortCol]||'';
        return (va < vb ? -1 : va > vb ? 1 : 0) * uncatSortDir;
    });
    $('uncatCount').textContent = uncat.length;
    // Update sort arrows
    [{col:'dateOp',id:'uncatSortDateOp',lbl:'Date Écriture'},{col:'dateExpense',id:'uncatSortDateExp',lbl:'Date réelle'},{col:'amount',id:'uncatSortAmount',lbl:'Montant'}].forEach(s => {
        let el=$(s.id); if(el) el.textContent = s.lbl + (uncatSortCol===s.col ? (uncatSortDir===-1?' ▼':' ▲') : ' ⇅');
    });
    

    let tb = $('uncatTable').querySelector('tbody');
    if(!uncat.length) return tb.innerHTML='<tr><td colspan="8" style="text-align:center; padding:32px; color:var(--ink-soft);">Toutes les écritures sont affectées ! 🎉</td></tr>';

    tb.innerHTML = uncat.map(t => {
        let m = rules.find(r => r.pattern.split(';').map(p=>p.trim()).filter(p=>p).some(p => (t.label && t.label.toUpperCase().includes(p.toUpperCase())) || (t.details && t.details.toUpperCase().includes(p.toUpperCase()))));
        let sc1=m?m.cat1:'', sc2=m?m.cat2:'', isM=!!m, isPrefilled = (t.cat1 && t.cat1 !== "_SANS_CATEGORIE" && t.cat2 && t.cat2 !== "_SANS_CATEGORIE");
        let displayCat = isPrefilled ? `${t.cat1} > ${t.cat2}` : (isM ? `${sc1} > ${sc2}` : "-");
        
        let act = `<button class="action-cell-btn ${isM||isPrefilled?'action-btn-prefilled':'action-btn-empty'} btn-cat-action" data-id="${t.id}" data-c1="${escapeHtml(sc1||t.cat1)}" data-c2="${escapeHtml(sc2||t.cat2)}" data-match="${isM||isPrefilled}">${isM||isPrefilled?'✏️':'🔍'}</button>`;

        return `<tr data-id="${t.id}" class="${selectedUncatIds.has(String(t.id))?'selected-row':''}">
            <td style="text-align:center;"><input type="checkbox" class="uncat-row-cb" value="${t.id}" ${selectedUncatIds.has(String(t.id))?'checked':''} onclick="window.toggleUncatCb(this, event)"></td>
            <td>${String(t.dateOp||'').split('-').reverse().join('/')}</td>
            <td><input type="date" class="inline-edit" data-id="${t.id}" data-field="dateExpense" value="${t.dateExpense || t.dateOp}" onclick="event.stopPropagation()"></td>
            <td class="wrap-text" style="font-size:0.9em; color:var(--ink-soft);">${escapeHtml(t.details)}</td>
            <td style="vertical-align:middle;padding:2px 4px;"><div style="display:flex;flex-wrap:wrap;gap:2px;align-items:center;">${renderPills(t)}</div></td>
            <td><input type="text" class="inline-edit" data-id="${t.id}" data-field="note" value="${escapeHtml(t.note||'')}" placeholder="Notes..." onclick="event.stopPropagation()"></td>
            <td style="font-weight:600; text-align:right; color:${t.amount>0?'var(--done)':'var(--ink)'}">${t.amount} €</td>
            <td style="text-align:right; white-space:nowrap;">${act}</td>
        </tr>`;
    }).join('');
    
    tb.querySelectorAll('.btn-cat-action').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); let el=e.currentTarget; window.openCatModal(el.dataset.id, el.dataset.c1, el.dataset.c2, el.dataset.match==='true'); }));
    tb.querySelectorAll('.btn-quick-val').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); let el=e.currentTarget; let tx=transactions.find(x=>String(x.id)===String(el.dataset.id)); if(tx){ tx.cat1=el.dataset.c1; tx.cat2=el.dataset.c2; _lastChosenCat={c1:el.dataset.c1,c2:el.dataset.c2}; triggerSave(false); window.renderUncategorized(); showToast("Attribution mémorisée ✓"); } }));
    tb.querySelectorAll('.inline-edit').forEach(inp => inp.addEventListener('change', window.handleInlineChange));
    let allCb = $('selectAllUncatCb');
    if (allCb) allCb.checked = uncat.length > 0 && uncat.every(t => selectedUncatIds.has(String(t.id)));
    let wrap = $('quickCatSearchWrap'); if(wrap) wrap.style.display = selectedUncatIds.size > 0 ? 'flex' : 'none';
    if (_wrap) _wrap.scrollTop = _savedScroll;
};

window.toggleUncatCb = function(cb, event) {
    event.stopPropagation();
    let sid = String(cb.value);
    if (cb.checked) {
        selectedUncatIds.add(sid);
        let tr = cb.closest('tr');
        if(tr) tr.classList.add('selected-row');
    } else {
        selectedUncatIds.delete(sid);
        let tr = cb.closest('tr');
        if(tr) tr.classList.remove('selected-row');
        let allCb = $('selectAllUncatCb');
        if (allCb) allCb.checked = false;
    }
    selectedUncatTxId = selectedUncatIds.size > 0 ? Array.from(selectedUncatIds)[0] : null;
    let wrap = $('quickCatSearchWrap'); if(wrap) wrap.style.display = selectedUncatIds.size > 0 ? 'flex' : 'none';
    if (_wrap) _wrap.scrollTop = _savedScroll;
};
window.toggleSelectAllUncat = function() {
    let v = $('selectAllUncatCb').checked;
    $$('.uncat-row-cb').forEach(c => {
        c.checked = v;
        if (v) {
            selectedUncatIds.add(c.value);
            let tr = c.closest('tr');
            if(tr) tr.classList.add('selected-row');
        } else {
            selectedUncatIds.delete(c.value);
            let tr = c.closest('tr');
            if(tr) tr.classList.remove('selected-row');
        }
    });
    selectedUncatTxId = selectedUncatIds.size > 0 ? Array.from(selectedUncatIds)[0] : null;
    let wrap = $('quickCatSearchWrap'); if(wrap) wrap.style.display = selectedUncatIds.size > 0 ? 'flex' : 'none';
    if (_wrap) _wrap.scrollTop = _savedScroll;
};
window.applyQuickPredictiveCat = function(c1, c2) {};;
// Stub pour compatibilité (le reste de l'ancienne applyQuickPredictiveCat est remplacé)

// ==== BASE DE DONNEES ET EDITION LIGNE ====

window.toggleDuplicateFilter = function() {
    if (duplicateFilterActive) {
        duplicateFilterActive = false;
        duplicateIds.clear();
        let btn = $('dupBtn');
        if(btn){ btn.style.background=''; btn.style.color=''; btn.style.borderColor=''; btn.textContent='🔍 Doublons'; }
        window.renderDataTable();
        return;
    }
    // Compute duplicates: group by dateOp+details+amount
    let groups = {};
    transactions.forEach(t => {
        let key = (t.dateOp||'') + '|' + (String(t.details||'').trim().toLowerCase()) + '|' + (t.amount||0);
        if(!groups[key]) groups[key] = [];
        groups[key].push(t.id);
    });
    duplicateIds.clear();
    Object.values(groups).forEach(ids => { if(ids.length > 1) ids.forEach(id => duplicateIds.add(String(id))); });
    let count = duplicateIds.size;
    if(count === 0) { showToast('✅ Aucun doublon trouvé'); return; }
    duplicateFilterActive = true;
    let btn = $('dupBtn');
    if(btn){ btn.style.background='#dc2626'; btn.style.color='#fff'; btn.style.borderColor='#dc2626'; btn.textContent=`⚠ ${count} doublons — Echap pour retirer`; }
    window.renderDataTable();
};

window.toggleFltNoteNotEmpty = function() {
    fltNoteNotEmpty = !fltNoteNotEmpty;
    let btn = $('fltNoteNotEmptyBtn');
    if (btn) {
        btn.style.background   = fltNoteNotEmpty ? 'var(--accent,#e07b54)' : 'var(--surface)';
        btn.style.color        = fltNoteNotEmpty ? '#fff' : 'var(--ink-muted)';
        btn.style.borderColor  = fltNoteNotEmpty ? 'var(--accent,#e07b54)' : 'var(--ink-faint)';
    }
    if (fltNoteNotEmpty) { let i=$('fltNote'); if(i) i.value=''; }
    window.renderDataTable();
};

window.renderDataTable = function() {
    let _wrap = $('view-data').querySelector('.table-wrap');
    let _savedScroll = _wrap ? _wrap.scrollTop : 0;
    let tb=$('dataTable').querySelector('tbody'), flts={dateOp:$('fltDate').value.toLowerCase(),dateExpense:$('fltDateExpense').value.toLowerCase(),label:$('fltLabel').value.toLowerCase(),details:$('fltDetails').value.toLowerCase(),note:$('fltNote').value.toLowerCase(),amount:$('fltAmount').value.toLowerCase(),cat1:$('fltCat1').value.toLowerCase(),cat2:$('fltCat2').value.toLowerCase()};
    let flt = transactions.filter(t => {
        for(let k in flts) {
            if(flts[k]) {
                let vs = (k==='dateOp'||k==='dateExpense') ? String(t[k]||'').split('-').reverse().join('/') : String(t[k]||'').toLowerCase();
                if(flts[k].startsWith(' ')) { if(vs.trim()!=='') return false; }
                else if(!vs.includes(flts[k])) return false;
            }
        }
        return true;
    });
    if(duplicateFilterActive) flt = flt.filter(t => duplicateIds.has(String(t.id)));
    if(fltNoteNotEmpty) flt = flt.filter(t => String(t.note||'').trim() !== '');
    flt.sort((a,b) => { let va=a[dbSortCol]||'', vb=b[dbSortCol]||''; if(typeof va==='string')va=va.toLowerCase(); if(typeof vb==='string')vb=vb.toLowerCase(); return (va<vb?-1:va>vb?1:0)*dbSortDir; });
    let dbPageSize = 300, dbPageCount = Math.max(1, Math.ceil(flt.length / dbPageSize));
    if (dbPage >= dbPageCount) dbPage = Math.max(0, dbPageCount - 1);
    let fltPage = flt.slice(dbPage * dbPageSize, (dbPage + 1) * dbPageSize);
    let nav = dbPageCount > 1
        ? '<div style="display:flex;align-items:center;gap:8px;padding:4px 0;">'
          + (dbPage > 0 ? '<button class="btn btn-outline" style="padding:3px 10px;font-size:0.85em;" onclick="dbPage--;window.renderDataTable()">◀ Précédentes</button>' : '<button class="btn btn-outline" style="padding:3px 10px;font-size:0.85em;opacity:.4;" disabled>◀ Précédentes</button>')
          + '<span style="font-size:0.85em;color:var(--ink-soft);">Page '+(dbPage+1)+' / '+dbPageCount+'</span>'
          + (dbPage < dbPageCount-1 ? '<button class="btn btn-outline" style="padding:3px 10px;font-size:0.85em;" onclick="dbPage++;window.renderDataTable()">Suivantes ▶</button>' : '<button class="btn btn-outline" style="padding:3px 10px;font-size:0.85em;opacity:.4;" disabled>Suivantes ▶</button>')
          + '</div>' : '';
    let _pnav=$('dbPaginationNav'); if(_pnav) _pnav.innerHTML = nav;
    $('dataCountLabel').textContent = flt.length + (dbPageCount > 1 ? ' · p.'+(dbPage+1)+'/'+dbPageCount : '');
    tb.innerHTML = fltPage.map(t => `<tr data-id="${t.id}">
        <td style="text-align:center;"><input type="checkbox" class="row-cb" value="${t.id}" onclick="window.updateBulkActions()"></td>
        <td><input type="date" class="inline-edit" data-id="${t.id}" data-field="dateOp" value="${t.dateOp}"></td>
        <td><input type="date" class="inline-edit" data-id="${t.id}" data-field="dateExpense" value="${t.dateExpense || t.dateOp}"></td>
        <td><input type="text" class="inline-edit" data-id="${t.id}" data-field="label" value="${escapeHtml(t.label)}"></td>
        <td class="wrap-text" style="font-size:0.9em; color:var(--ink-soft);"><input type="text" class="inline-edit" data-id="${t.id}" data-field="details" value="${escapeHtml(t.details)}"></td>
        <td class="wrap-text" style="font-size:0.9em; color:var(--ink-soft);"><input type="text" class="inline-edit" data-id="${t.id}" data-field="note" value="${escapeHtml(t.note||'')}"></td>
        <td><input type="text" class="inline-edit amount-input ${t.amount>0?'amount-pos':'amount-neg'}" data-id="${t.id}" data-field="amount" value="${t.amount} €"></td>
        <td><select class="inline-edit" data-id="${t.id}" data-field="cat1">${getC1Opts(t.cat1)}</select></td>
        <td><select class="inline-edit" data-id="${t.id}" data-field="cat2">${getC2Opts(t.cat1,t.cat2)}</select></td>
    </tr>`).join('');
    tb.querySelectorAll('.inline-edit').forEach(inp => inp.addEventListener('change', window.handleInlineChange));
    window.updateBulkActions();
    if (_wrap) _wrap.scrollTop = _savedScroll;
};

$$('.col-filter').forEach(inp=>inp.addEventListener('input', ()=>{ dbPage=0; window.renderDataTable(); }));
$$('.uf-filter').forEach(inp=>inp.addEventListener('input', window.applyUncatFilters));
$$('.sort-btn').forEach(btn=>btn.addEventListener('click',e=>{let c=e.target.dataset.col;if(dbSortCol===c)dbSortDir*=-1;else{dbSortCol=c;dbSortDir=-1;}window.renderDataTable();}));

window.handleInlineChange = function(e) {
    let id=e.target.dataset.id, f=e.target.dataset.field, v=e.target.value, tx=transactions.find(x=>String(x.id)===String(id)); if(!tx)return;
    if(f==='amount') { let n=parseFloat(v.replace(/,/g,'.').replace(/[^0-9.-]/g,'')); if(!isNaN(n))tx.amount=n; } else tx[f]=v;
    if(f==='cat1') {
        tx.cat2 = '';
        // Mettre à jour la liste déroulante cat2 du même row sans re-render complet
        let row = e.target.closest('tr');
        if (row) {
            let cat2Sel = row.querySelector('select[data-field="cat2"]');
            if (cat2Sel) {
                cat2Sel.innerHTML = getC2Opts(v, '');
                // Ré-injecter l'option ➕
                cat2Sel.removeAttribute('data-new-cat2-injected');
                if (window._injectNewCat2Option) window._injectNewCat2Option();
            }
        }
    }
    triggerSave(false); window.renderSummary(); window.renderUncategorized();
    if($('view-data').classList.contains('active')) { showToast("Modification enregistrée ✓"); }
};

window.updateBulkActions = function() { 
    let c=$$('.row-cb:checked').length; $('selCount').textContent=c; 
    $('bulkActions').style.display=c>0?'flex':'none'; $('dbHeaderNormal').style.display=c>0?'none':'flex';
};
window.toggleSelectAll = function() { let v=$('selectAllCb').checked; $$('.row-cb').forEach(c=>c.checked=v); window.updateBulkActions(); };
window.bulkDelete = function() { if(confirm("Supprimer la sélection ?")){ let ids=Array.from($$('.row-cb:checked')).map(c=>c.value); transactions=transactions.filter(t=>!ids.includes(String(t.id))); $('selectAllCb').checked=false; triggerSave(true); window.updateBulkActions(); showToast("Supprimées"); } };
window.bulkDuplicate = function() {
    let ids = Array.from($$('.row-cb:checked')).map(c => c.value);
    if (!ids.length) return;
    let copies = [];
    ids.forEach(function(id) {
        let tx = transactions.find(t => String(t.id) === String(id));
        if (!tx) return;
        copies.push(Object.assign({}, tx, { id: Date.now() + Math.random() }));
    });
    // Insérer les copies juste après la dernière sélectionnée
    let lastIdx = -1;
    ids.forEach(function(id) {
        let i = transactions.findIndex(t => String(t.id) === String(id));
        if (i > lastIdx) lastIdx = i;
    });
    transactions.splice(lastIdx + 1, 0, ...copies);
    $('selectAllCb').checked = false;
    triggerSave(false);
    window.renderDataTable();
    window.updateBulkActions();
    showToast('📋 ' + copies.length + ' ligne(s) dupliquée(s) ✓');
};
window.updateBulkCat2 = function() { $('bulkCat2').innerHTML = getC2Opts($('bulkCat1').value); };
window.bulkCategorize = function() { let c1=$('bulkCat1').value, c2=$('bulkCat2').value; if(!c1||!c2)return alert("Sélectionnez les 2 catégories."); let ids=Array.from($$('.row-cb:checked')).map(c=>c.value); transactions.forEach(t=>{if(ids.includes(String(t.id))){t.cat1=c1;t.cat2=c2;}}); $('selectAllCb').checked=false; triggerSave(true); window.renderViewsSafe(); window.updateBulkActions(); showToast("Affectées ✓"); };

// ==== GESTION DES REGLES ====
window.addOrMergeRule = function(pStr, c1, c2) { let ex=rules.find(r=>r.cat1===c1&&r.cat2===c2), np=pStr.split(';').map(x=>x.trim()).filter(x=>x); if(ex){let s=new Set(ex.pattern.split(';').map(x=>x.trim()));np.forEach(x=>s.add(x));ex.pattern=Array.from(s).join(' ; ');} else rules.push({pattern:np.join(' ; '),cat1:c1,cat2:c2}); };
window.updateNewRuleCat2=()=>{$('newRuleCat2').innerHTML=getC2Opts($('newRuleCat1').value);};
window.addManualRule=()=>{ let p=$('newRulePattern').value, c1=$('newRuleCat1').value, c2=$('newRuleCat2').value; if(!p||!c1||!c2)return alert("Formulaire incomplet."); window.addOrMergeRule(p,c1,c2); $('newRulePattern').value=''; $('newRuleCat2').innerHTML='<option value="">-- Cat 2 --</option>'; triggerSave(); window.renderRules(); showToast("Règle ajoutée"); };

window.renderRules = function() {
    $('newRuleCat1').innerHTML=getC1Opts(); let tb=$('rulesTable').querySelector('tbody'); rules.sort((a,b)=>customSortCmp(a.cat1,b.cat1));
    if(!rules.length)return tb.innerHTML='<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--ink-soft);">Aucune règle automatique configurée.</td></tr>';
    tb.innerHTML=rules.map((r,i)=>`<tr data-idx="${i}"><td><input type="text" class="inline-edit" value="${escapeHtml(r.pattern)}" onchange="rules[${i}].pattern=this.value;triggerSave()"></td><td><select class="inline-edit" onchange="rules[${i}].cat1=this.value;triggerSave();window.renderRules()">${getC1Opts(r.cat1)}</select></td><td><select class="inline-edit" onchange="rules[${i}].cat2=this.value;triggerSave()">${getC2Opts(r.cat1,r.cat2)}</select></td><td><button class="btn btn-outline" style="color:var(--urgent); padding:4px 8px;" onclick="rules.splice(${i},1);triggerSave();window.renderRules()">Suppr.</button></td></tr>`).join('');
};

$('exportRuleBtn').addEventListener('click', () => {
    try {
        // Header dynamique : A=Cat1, B=Cat2, C/D/...=mots-clés individuels
        const dataRows = rules.map(r => {
            const kws = r.pattern ? r.pattern.split(';').map(k => k.trim()).filter(k => k) : [];
            return [r.cat1, r.cat2, ...kws];
        });
        const maxCols = dataRows.reduce((m, r) => Math.max(m, r.length), 2);
        const kwHeaders = Array.from({length: Math.max(0, maxCols - 2)}, (_, i) => `Mot-clé ${i+1}`);
        const header = ['Catégorie 1', 'Catégorie 2', ...kwHeaders];
        const aoa = [header, ...dataRows];
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Regles');
        // Export via blob pour compatibilité maximale
        const wbout = XLSX.write(wb, {bookType: 'xlsx', type: 'array'});
        const blob = new Blob([wbout], {type: 'application/octet-stream'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'regles_finances.xlsx';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('✅ ' + rules.length + ' règle(s) exportée(s)');
    } catch(err) { alert('Erreur export : ' + err.message); }
});
$('importRuleBtn').addEventListener('click', () => $('ruleFileInput').click());
$('ruleFileInput').addEventListener('change', e => {
    let f = e.target.files[0]; if(!f) return;
    let r = new FileReader();
    r.onerror = () => { alert('Impossible de lire le fichier.'); e.target.value = ''; };
    r.onload = ev => {
        try {
            let wb;
            // Support CSV (text) et XLSX/XLS (binary)
            if (f.name.toLowerCase().endsWith('.csv')) {
                wb = XLSX.read(ev.target.result, {type: 'string'});
            } else {
                wb = XLSX.read(new Uint8Array(ev.target.result), {type: 'array'});
            }
            let rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, defval: ''});
            if (!rows || rows.length === 0) { alert('Fichier vide ou non reconnu.'); e.target.value = ''; return; }
            // Détecter si la 1ère ligne est un header (contient 'cat')
            let startIdx = (rows[0] && rows[0][0] && String(rows[0][0]).toLowerCase().includes('cat')) ? 1 : 0;
            let added = 0;
            for (let i = startIdx; i < rows.length; i++) {
                let row = rows[i];
                if (!row || row.length < 2) continue;
                // Colonne A = cat1, Colonne B = cat2, Colonnes C+ = mots-clés
                let c1 = String(row[0] || '').trim();
                let c2 = String(row[1] || '').trim();
                if (!c1) continue; // cat1 obligatoire, cat2 peut être vide
                let kws = [];
                for (let j = 2; j < row.length; j++) {
                    if (row[j] !== '' && row[j] !== null && row[j] !== undefined) {
                        let kw = String(row[j]).replace(/[*]/g, '').trim();
                        if (kw) kws.push(kw);
                    }
                }
                if (kws.length > 0) { window.addOrMergeRule(kws.join(' ; '), c1, c2); added++; }
            }
            if (added > 0) {
                triggerSave(true); window.renderViewsSafe();
                showToast('✅ ' + added + ' règle(s) importée(s)');
            } else {
                showToast('⚠️ Aucune règle valide trouvée (vérifiez le format : A=Cat1, B=Cat2, C+=mots-clés)');
            }
        } catch(err) {
            alert('Erreur de lecture du fichier : ' + err.message);
        }
        e.target.value = '';
    };
    // CSV en texte, autres en binaire
    if (f.name.toLowerCase().endsWith('.csv')) {
        r.readAsText(f, 'UTF-8');
    } else {
        r.readAsArrayBuffer(f);
    }
});

window.renderCategories = function() {
    let c=$('categoriesContainer'); c.innerHTML=Object.keys(categories).sort(customSortCmp).map(c1=>`<div class="summary-card cat1-dropzone" data-c1="${escapeHtml(c1)}" ondragover="window.onCat1DragOver(event,this)" ondragleave="window.onCat1DragLeave(event,this)" ondrop="window.onCat1Drop(event,'${escapeHtml(c1)}')"><div style="display:flex;justify-content:space-between;font-weight:600;align-items:center;"><span class="cat1-editable" data-c1="${escapeHtml(c1)}" title="Cliquer pour renommer" style="cursor:pointer;border-bottom:1px dashed transparent;" onmouseover="this.style.borderBottomColor='var(--ink-faint)'" onmouseout="this.style.borderBottomColor='transparent'" onclick="window.startRenameCat1(this,'${escapeHtml(c1)}')">${escapeHtml(c1)}</span> <button class="btn btn-outline" style="padding:2px 6px;color:var(--urgent)" onclick="window.deleteCategory1('${escapeHtml(c1)}')">X</button></div><div style="display:flex;flex-wrap:wrap;gap:4px;margin:8px 0;">${categories[c1].sort(customSortCmp).map(c2=>`<div class="cat2-chip" draggable="true" data-c1="${escapeHtml(c1)}" data-c2="${escapeHtml(c2)}" ondragstart="window.onCat2DragStart(event,'${escapeHtml(c1)}','${escapeHtml(c2)}')" ondragend="window.onCat2DragEnd(event)" style="background:var(--bg);border:1px solid var(--ink-faint);padding:2px 6px 2px 2px;border-radius:12px;font-size:0.85em;display:flex;gap:4px;align-items:center;"><span class="cat2-drag-handle" title="Glisser pour déplacer" style="cursor:grab;color:var(--ink-faint);font-size:1em;line-height:1;padding:0 2px;user-select:none;">⠿</span><span class="cat2-editable" data-c1="${escapeHtml(c1)}" data-c2="${escapeHtml(c2)}" title="Cliquer pour renommer" style="cursor:pointer;border-bottom:1px dashed transparent;" onmouseover="this.style.borderBottomColor='var(--ink-faint)'" onmouseout="this.style.borderBottomColor='transparent'" onclick="window.startRenameCat2(this,'${escapeHtml(c1)}','${escapeHtml(c2)}')">${escapeHtml(c2)}</span> <button style="background:none;border:none;color:var(--urgent);cursor:pointer;font-size:1.1em;" onclick="window.deleteCategory2('${escapeHtml(c1)}','${escapeHtml(c2)}')">×</button></div>`).join('')}</div><div style="display:flex;gap:4px;"><input type="text" class="input-text" placeholder="Ajouter sous-cat..." onkeypress="if(event.key==='Enter'){if(this.value.trim()){categories['${escapeHtml(c1)}'].push(this.value.trim());categories['${escapeHtml(c1)}'].sort(customSortCmp);triggerSave();window.renderCategories();}}"></div></div>`).join('');
};

// ── v3.0.8 : Drag & drop des catégories 2 vers une autre catégorie 1 ───────
window._draggedCat2 = null;
window.onCat2DragStart = function(ev, c1, c2) {
    window._draggedCat2 = { c1, c2 };
    ev.dataTransfer.effectAllowed = 'move';
    try { ev.dataTransfer.setData('text/plain', c1 + '::' + c2); } catch(e) {}
    ev.currentTarget.style.opacity = '0.4';
};
window.onCat2DragEnd = function(ev) {
    ev.currentTarget.style.opacity = '1';
    window._draggedCat2 = null;
    document.querySelectorAll('.cat1-dropzone').forEach(el => el.classList.remove('cat1-drop-hover'));
};
window.onCat1DragOver = function(ev, el) {
    if (!window._draggedCat2) return;
    ev.preventDefault();
    ev.dataTransfer.dropEffect = 'move';
    el.classList.add('cat1-drop-hover');
};
window.onCat1DragLeave = function(ev, el) {
    el.classList.remove('cat1-drop-hover');
};
window.onCat1Drop = function(ev, targetC1) {
    ev.preventDefault();
    document.querySelectorAll('.cat1-dropzone').forEach(el => el.classList.remove('cat1-drop-hover'));
    let d = window._draggedCat2;
    window._draggedCat2 = null;
    if (!d) return;
    window.moveCategory2(d.c1, d.c2, targetC1);
};
window.moveCategory2 = function(sourceC1, c2, targetC1) {
    if (sourceC1 === targetC1) return;
    if (!categories[sourceC1] || !categories[targetC1]) { window.renderCategories(); return; }
    if (categories[targetC1].includes(c2)) { showToast('⚠️ Cette sous-catégorie existe déjà dans "' + targetC1 + '".'); window.renderCategories(); return; }
    categories[sourceC1] = categories[sourceC1].filter(x => x !== c2);
    categories[targetC1].push(c2);
    categories[targetC1].sort(customSortCmp);
    let count = 0;
    transactions.forEach(t => { if (t.cat1 === sourceC1 && t.cat2 === c2) { t.cat1 = targetC1; count++; } });
    rules.forEach(r => { if (r.cat1 === sourceC1 && r.cat2 === c2) { r.cat1 = targetC1; } });
    triggerSave(true); window.renderViewsSafe();
    showToast(`✅ Sous-catégorie déplacée vers "${targetC1}"${count ? ' — ' + count + ' transaction(s) mise(s) à jour' : ''}`);
};


// ── v3.0.8 : Renommage inline des catégories ────────────────────────────────
window.startRenameCat1 = function(el, oldName) {
    let input = document.createElement('input');
    input.type = 'text'; input.value = oldName; input.className = 'input-text';
    input.style.cssText = 'width:auto;min-width:80px;font-weight:600;padding:2px 6px;';
    el.replaceWith(input);
    input.focus(); input.select();
    let commit = () => {
        let newName = input.value.trim();
        window.renameCategory1(oldName, newName);
    };
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { input.blur(); }
        if (e.key === 'Escape') { input.value = oldName; input.blur(); }
    });
    input.addEventListener('blur', commit, { once: true });
};

window.renameCategory1 = function(oldName, newName) {
    if (!newName || newName === oldName) { window.renderCategories(); return; }
    if (categories[newName]) { showToast('⚠️ Cette catégorie existe déjà.'); window.renderCategories(); return; }
    categories[newName] = categories[oldName];
    delete categories[oldName];
    transactions.forEach(t => { if (t.cat1 === oldName) t.cat1 = newName; });
    rules.forEach(r => { if (r.cat1 === oldName) r.cat1 = newName; });
    triggerSave(true); window.renderViewsSafe();
    showToast('✅ Catégorie renommée');
};

window.startRenameCat2 = function(el, c1, oldName) {
    let input = document.createElement('input');
    input.type = 'text'; input.value = oldName; input.className = 'input-text';
    input.style.cssText = 'width:auto;min-width:60px;font-size:0.85em;padding:1px 4px;';
    el.replaceWith(input);
    input.focus(); input.select();
    let commit = () => {
        let newName = input.value.trim();
        window.renameCategory2(c1, oldName, newName);
    };
    input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { input.blur(); }
        if (e.key === 'Escape') { input.value = oldName; input.blur(); }
    });
    input.addEventListener('blur', commit, { once: true });
};

window.renameCategory2 = function(c1, oldName, newName) {
    if (!newName || newName === oldName) { window.renderCategories(); return; }
    if (!categories[c1]) { window.renderCategories(); return; }
    if (categories[c1].includes(newName)) { showToast('⚠️ Cette sous-catégorie existe déjà.'); window.renderCategories(); return; }
    let idx = categories[c1].indexOf(oldName);
    if (idx === -1) { window.renderCategories(); return; }
    categories[c1][idx] = newName;
    categories[c1].sort(customSortCmp);
    transactions.forEach(t => { if (t.cat1 === c1 && t.cat2 === oldName) t.cat2 = newName; });
    rules.forEach(r => { if (r.cat1 === c1 && r.cat2 === oldName) r.cat2 = newName; });
    triggerSave(true); window.renderViewsSafe();
    showToast('✅ Sous-catégorie renommée');
};

// ── v3.0.8 : Suppression de catégories avec impact base de données ─────────
window.deleteCategory1 = function(c1) {
    if (!confirm(`⚠️ Supprimer la catégorie "${c1}" et toutes ses sous-catégories ?\n\nLes transactions et règles utilisant cette catégorie perdront leur catégorisation (à redéfinir plus tard).`)) return;
    delete categories[c1];
    let count = 0;
    transactions.forEach(t => { if (t.cat1 === c1) { t.cat1 = ''; t.cat2 = ''; count++; } });
    rules = rules.filter(r => r.cat1 !== c1);
    triggerSave(true); window.renderViewsSafe();
    showToast(`✅ Catégorie supprimée${count ? ' — ' + count + ' transaction(s) à recatégoriser' : ''}`);
};

window.deleteCategory2 = function(c1, c2) {
    if (!confirm(`⚠️ Supprimer la sous-catégorie "${c2}" ?\n\nLes transactions et règles utilisant cette sous-catégorie perdront leur catégorisation (à redéfinir plus tard).`)) return;
    if (!categories[c1]) { window.renderCategories(); return; }
    categories[c1] = categories[c1].filter(x => x !== c2);
    let count = 0;
    transactions.forEach(t => { if (t.cat1 === c1 && t.cat2 === c2) { t.cat2 = ''; count++; } });
    rules = rules.filter(r => !(r.cat1 === c1 && r.cat2 === c2));
    triggerSave(true); window.renderViewsSafe();
    showToast(`✅ Sous-catégorie supprimée${count ? ' — ' + count + ' transaction(s) à recatégoriser' : ''}`);
};
$('addCat1Btn').addEventListener('click',()=>{let v=$('newCat1Input').value.trim();if(v&&!categories[v]){categories[v]=[];$('newCat1Input').value='';triggerSave();window.renderCategories();}});
$('exportCatBtn').addEventListener('click', () => {
    try {
        // Export catégories : col A = Cat1, col B = Cat2
        const rows = [['Catégorie 1', 'Catégorie 2']];
        Object.keys(categories).sort(customSortCmp).forEach(c1 => {
            const subs = categories[c1] || [];
            if (subs.length === 0) { rows.push([c1, '']); }
            else { subs.sort(customSortCmp).forEach(c2 => rows.push([c1, c2])); }
        });
        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Categories');
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'categories.xlsx';
        document.body.appendChild(a); a.click(); document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('✅ Catégories exportées en Excel');
    } catch(err) { alert('Erreur export catégories : ' + err.message); }
});
$('importCatBtn').addEventListener('click',()=>$('catFileInput').click());
$('catFileInput').addEventListener('change', e => {
    const f = e.target.files[0]; if (!f) return;
    if (!confirm('⚠️ Cet import va ÉCRASER toutes les catégories existantes de ce compte.\n\nContinuer ?')) {
        e.target.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onerror = () => { alert('Impossible de lire le fichier.'); e.target.value = ''; };
    reader.onload = ev => {
        try {
            const name = f.name.toLowerCase();
            if (name.endsWith('.json')) {
                // Format JSON legacy — écrase entièrement les catégories du compte actif
                categories = JSON.parse(ev.target.result);
                triggerSave(); window.renderViewsSafe(); showToast('✅ Catégories remplacées (JSON)');
            } else {
                // Format Excel/CSV : col A = Cat1, col B = Cat2
                let wb;
                if (name.endsWith('.csv')) { wb = XLSX.read(ev.target.result, { type: 'string' }); }
                else { wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array', raw: true }); }
                const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
                const startIdx = (rows[0] && String(rows[0][0]).toLowerCase().includes('cat')) ? 1 : 0;
                const newCats = {};
                for (let i = startIdx; i < rows.length; i++) {
                    const c1 = String(rows[i][0] || '').trim();
                    const c2 = String(rows[i][1] || '').trim();
                    if (!c1) continue;
                    if (!newCats[c1]) newCats[c1] = [];
                    if (c2 && !newCats[c1].includes(c2)) newCats[c1].push(c2);
                }
                if (Object.keys(newCats).length === 0) { showToast('⚠️ Aucune catégorie valide trouvée.'); e.target.value=''; return; }
                // Écrase entièrement les catégories existantes du compte actif
                categories = newCats;
                triggerSave(); window.renderViewsSafe();
                showToast('✅ ' + Object.keys(newCats).length + ' catégorie(s) — remplacement complet effectué');
            }
        } catch(err) { alert('Erreur import catégories : ' + err.message); }
        e.target.value = '';
    };
    if (f.name.toLowerCase().endsWith('.json') || f.name.toLowerCase().endsWith('.csv')) {
        reader.readAsText(f, 'UTF-8');
    } else {
        reader.readAsArrayBuffer(f);
    }
});
$('backupBtn').addEventListener('click',()=>{let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({transactions,rules,categories,version:APP_VERSION},null,2)],{type:'application/json'}));a.download=`finances_secours_${new Date().toISOString().slice(0,10)}.json`;a.click();});
$('deleteAllBtn').addEventListener('click', async () => {
    let _acName=accounts.find(a=>a.id===currentAccountId)?.name||currentAccountId;
    if (!confirm(`⚠️ EFFACEMENT du compte "${_acName}" — données, catégories, règles et fichier Drive. Confirmer ?`)) return;
    transactions = []; rules = []; categories = {};
    driveFileId = null;
    delete driveFileIdMap[currentAccountId];
    if (driveAccessToken) {
        try {
            const fileId = await driveGetFileId();
            if (fileId) {
                await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
                    method: 'DELETE',
                    headers: { Authorization: `Bearer ${driveAccessToken}` }
                });
                driveFileId = null;
            }
        } catch(err) { console.warn('Erreur suppression Drive:', err.message); }
    }
    // Reset clé de chiffrement et proposer nouvelle clé
    appSecretKey = null;
    driveFileId = null;
    window.renderViewsSafe();
    showToast('✅ Réinitialisation complète — définissez une nouvelle clé');
    setTimeout(() => {
        $('appPassword').value = '';
        $('authOverlay').classList.add('open');
    }, 600);
});

$('importBtnUI').addEventListener('click',()=>$('importOverlay').classList.add('open'));
$('triggerFileBtn').addEventListener('click',()=>{
    selectedBankForImport = $('bankSelectImport').value;
    let isCsvOnly = (selectedBankForImport==='SOGE'||selectedBankForImport==='FORTUNEO'||selectedBankForImport==='CE');
    $('bankFileInput').accept = isCsvOnly ? '.csv' : '.csv,.xls,.xlsx';
    $('bankFileInput').click();
});
const isStrictAmount = s => /^-?\d+(\.\d+)?$/.test((s||'').toString().replace(/[\s\u00A0\u202F€a-zA-Z]/g,'').replace(',','.'));
const parseAmount = s => parseFloat((s||'').toString().replace(/[\s\u00A0\u202F€a-zA-Z]/g,'').replace(',','.'));

$('bankFileInput').addEventListener('change',e=>{
    let f=e.target.files[0]; if(!f)return;
    if(!driveDataLoaded){ alert('⚠️ Les données ne sont pas encore chargées depuis Drive.\nVeuillez patienter que la synchronisation soit terminée avant d\'importer.'); e.target.value=''; return; }
    $('importOverlay').classList.remove('open'); let r=new FileReader(); r.onload=ev=>{
        try {
            let rows, bankType = selectedBankForImport==='SOGE'?'SOGE':selectedBankForImport==='FORTUNEO'?'FORT':selectedBankForImport==='CE'?'CE':'GEN';
            let rawRows;
            if (f.name.match(/\.xlsx?$/i)) {
                let wb = XLSX.read(new Uint8Array(ev.target.result), {type:'array', raw:true});
                let ws = wb.Sheets[wb.SheetNames[0]];
                rawRows = XLSX.utils.sheet_to_json(ws, {header:1, defval:'', raw:true});
                rows = bankType==='SOGE' ? rawRows.slice(3) : (bankType==='CE' ? rawRows.slice(1) : rawRows);
            } else {
                rawRows = ev.target.result.split(/\r?\n/).map(l=>l.split(';').map(x=>x.replace(/(^"|"$)/g,'').trim()));
                rows = rawRows;
                // Pour SOGE CSV: ligne 1-2 métadonnées, ligne 3 entête, données ligne 4+
                if (bankType==='SOGE') rows = rawRows.slice(3);
                // Pour FORTUNEO CSV: première ligne = entête
                if (bankType==='FORT') rows = rawRows.slice(1);
                // Pour Caisse d'Épargne CSV: première ligne = entête
                if (bankType==='CE') rows = rawRows.slice(1);
            }
            let res = parseBankData(rows, bankType, selectedBankForImport);
            if(res.add>0){
                triggerSave(true); window.renderViewsSafe(); showToast(res.add+' importés');
                // Export CSV coloré
                exportImportResult(rawRows, res.importedIdx, res.skippedIdx, bankType);
            } else { alert('Aucune donnée nouvelle détectée.'); }
        } catch(err) { alert('Erreur import: '+err.message); }
    }; f.name.match(/\.xlsx?$/i)?r.readAsArrayBuffer(f):r.readAsText(f); e.target.value='';
});

function excelDateToISO(v) {
    if (!v && v !== 0) return null;
    if (v instanceof Date) {
        let y=v.getFullYear(), m=String(v.getMonth()+1).padStart(2,'0'), d=String(v.getDate()).padStart(2,'0');
        return `${y}-${m}-${d}`;
    }
    let s = String(v).trim();
    // Strip Excel ="..." formula wrapper (SOGE exports dates as ="DD/MM/YYYY")
    let fm = s.match(/^="(.+)"$/);
    if (fm) s = fm[1].trim();
    // DD/MM/YYYY
    let m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (m1) return `${m1[3]}-${m1[2]}-${m1[1]}`;
    // YYYY-MM-DD
    if (s.match(/^\d{4}-\d{2}-\d{2}/)) return s.substring(0,10);
    // Excel serial number
    if (!isNaN(Number(s)) && Number(s) > 40000) {
        let d = new Date(Math.round((Number(s) - 25569) * 86400 * 1000));
        let y=d.getUTCFullYear(), mo=String(d.getUTCMonth()+1).padStart(2,'0'), dy=String(d.getUTCDate()).padStart(2,'0');
        return `${y}-${mo}-${dy}`;
    }
    return null;
}

function parseBankData(rows, type, bName) {
    let add=0, importedIdx=[], skippedIdx=[];
    // Multiset of existing transactions — each can absorb only one incoming match
    // Key: dateOp|amount|details|label — value: count remaining
    const existingPool = new Map();
    transactions.forEach(t => {
        const k = (t.dateOp||'')+'|'+(t.amount||'')+'|'+(t.details||'')+'|'+(t.label||'');
        existingPool.set(k, (existingPool.get(k)||0) + 1);
    });
    const isDuplicate = (dop, a, det, lbl) => {
        const k = (dop||'')+'|'+(a||'')+'|'+(det||'')+'|'+(lbl||'');
        const cnt = existingPool.get(k)||0;
        if (cnt > 0) { existingPool.set(k, cnt-1); return true; }
        return false;
    };
    rows.forEach((r, rowIdx) => {
        if(!r||r.length<2) return;
        // Skip header rows
        let c0raw = r[0];
        let dop = null, det='', a=NaN;
        if(type==='SOGE'){
            // Rows déjà filtrées (slice(3)) — on arrive directement aux données
            // Col 0=Date op, Col 1=Libellé (skip), Col 2=Détail, Col 3=Montant, Col 4=Devise (skip)
            // Valeurs potentiellement en format ="DD/MM/YYYY" ou DD/MM/YYYY ou serial Excel
            const sv = v => { let s=String(v===null||v===undefined?'':v).trim(); let m=s.match(/^=?"?([^"]+)"?$/); return m?m[1].trim():s; };
            dop = excelDateToISO(r[0]);
            if (!dop) return;
            det = sv(r[2]);
            if (!det || det==='-') det = sv(r[1]);
            if (!det || det==='-') det = '';
            let amStr = sv(r[3]).replace(/[\s\u00a0]/g,'').replace(',','.').replace(/[−–]/g,'-');
            a = parseFloat(amStr);
            if (isNaN(a) || a===0) return;
            if (!isDuplicate(dop, a, det, 'SOGE')){
                transactions.push({id:String(Date.now()+add)+String(Math.random()).slice(2),dateOp:dop,dateExpense:dop,label:'SOGE',details:det,note:'',amount:a,paymentMethod:'',cat1:'',cat2:''});
                add++; importedIdx.push(rowIdx);
            } else { skippedIdx.push(rowIdx); }
            return;
        }
        if(type==='CE'){
            // Col 0=Date comptable, Col 1=Libellé simplifié, Col 2=Référence, Col 3=Informations complémentaires,
            // Col 4=Type opération (skip), Col 5=Débit, Col 6=Crédit, Col 7=Date opération (skip), Col 8=Date de valeur (skip), Col 9=Pointage (skip)
            dop = excelDateToISO(r[0]);
            if (!dop) return;
            let libSimp = String(r[1]||'').trim();
            let refer = String(r[2]||'').trim();
            det = [libSimp, refer].filter(Boolean).join(' ');
            let note = String(r[3]||'').trim();
            let debitStr = String(r[5]||'').trim();
            let creditStr = String(r[6]||'').trim();
            let debit = debitStr ? parseAmount(debitStr) : NaN;
            let credit = creditStr ? parseAmount(creditStr) : NaN;
            a = !isNaN(credit) && credit!==0 ? Math.abs(credit) : (!isNaN(debit) && debit!==0 ? -Math.abs(debit) : NaN);
            if (isNaN(a) || a===0) return;
            if (!isDuplicate(dop, a, det, 'CE')){
                transactions.push({id:String(Date.now()+add)+String(Math.random()).slice(2),dateOp:dop,dateExpense:dop,label:'CE',details:det,note:note,amount:a,paymentMethod:'',cat1:'',cat2:''});
                add++; importedIdx.push(rowIdx);
            } else { skippedIdx.push(rowIdx); }
            return;
        }
        // For other types: use old date detection
        let c0=String(c0raw).trim();
        if(c0.match(/^\d{2}\/\d{2}\/\d{4}$/)){
            let dp=c0.split('/'); dop=`${dp[2]}-${dp[1]}-${dp[0]}`;
            if(type==='FORT'){
                // FORTUNEO: col0=dateOp, col1=dateVal(skip), col2=Libellé→details, col3=Débit, col4=Crédit
                det = String(r[2]||'').trim();
                let debit=parseAmount(String(r[3]||'')), credit=parseAmount(String(r[4]||''));
                a = !isNaN(credit)&&credit!==0 ? credit : (!isNaN(debit)&&debit!==0 ? debit : NaN);
                if(isNaN(a)) return;
                let dexp=dop;
                if(det.toUpperCase().startsWith("CARTE ")) { let m=det.match(/CARTE\s+(\d{2})\/(\d{2})/i); if(m){ let cJ=m[1], cM=m[2], wM=parseInt(dp[1],10), eY=parseInt(dp[2],10); if(parseInt(cM,10)>wM) eY--; dexp=`${eY}-${cM}-${cJ}`; } }
                if(!isDuplicate(dop, a, det, bName)){
                    transactions.push({id:String(Date.now()+add),dateOp:dop,dateExpense:dexp,label:bName,details:det,note:'',amount:a,paymentMethod:'',cat1:'',cat2:''}); add++; importedIdx.push(rowIdx);
                } else { skippedIdx.push(rowIdx); }
            } else {
                // Générique: col0=dateOp, col1=Libellé→label, col2=détail→details, dernière col=montant
                let l=String(r[1]||'Inconnu').trim();
                det = r[2]&&!isStrictAmount(String(r[2]))?String(r[2]).trim():'';
                for(let j=r.length-1;j>=1;j--){if(isStrictAmount(String(r[j]))){a=parseAmount(String(r[j]));break;}}
                if(isNaN(a)) return;
                if(!isDuplicate(dop, a, det, l)){
                    transactions.push({id:String(Date.now()+add),dateOp:dop,dateExpense:dop,label:l,details:det,note:'',amount:a,paymentMethod:'',cat1:'',cat2:''}); add++; importedIdx.push(rowIdx);
                } else { skippedIdx.push(rowIdx); }
            }
        }
    }); return {add, importedIdx, skippedIdx};
}

// ==== FENETRES MODALES AFFECTATIONS ====
window.openCatModal = function(tid, p1, p2, isRule, source) {
    catModalTxId=String(tid); catModalSource=source||null; let t=transactions.find(x=>String(x.id)===catModalTxId); if(!t)return;
    $('catModalTxLabel').textContent=t.label||'Opération'; $('catModalTxDetails').textContent=t.details||''; $('catModalTxAmount').textContent=t.amount+" €"; $('catModalTxAmount').style.color=t.amount>0?'var(--done)':'var(--urgent)';
    catModalSelectedCat1 = t.cat1 || p1 || ''; catModalSelectedCat2 = t.cat2 || p2 || '';
    $('catModalCat1List').innerHTML=Object.keys(categories).sort(customSortCmp).map(c1=>`<button class="cat-step-btn cat1-btn ${c1===catModalSelectedCat1?'selected':''}" data-c1="${escapeHtml(c1)}">${escapeHtml(c1)}</button>`).join('');
    $$('.cat1-btn').forEach(b=>b.addEventListener('click', e=>window.selectCat1(e.currentTarget.dataset.c1)));
    if(isRule && catModalSelectedCat1 && catModalSelectedCat2) window.showStep3(catModalSelectedCat1,catModalSelectedCat2,true); else { $('catModalStep1').style.display='block';$('catModalStep2').style.display='none';$('catModalStep3').style.display='none'; }
    $('catSelectionOverlay').classList.add('open');
    if($('catModalSearchInput')) {
        var _rawD = t && (t.details || t.label || '') || '';
        var _cleanD = _rawD.replace(/^CARTE\s+\d{2}\/\d{2}(?:\/\d{2,4})?\s+/i,'').replace(/^VIR\s+INST\s+/i,'').replace(/^VIR\s+/i,'').trim();
        $('catModalSearchInput').value = _cleanD;
    }
    if($('catModalSearchResults')) {
        $('catModalSearchResults').innerHTML='<div style="color:var(--ink-muted);padding:8px 0;">Saisissez un mot-clé…</div>';
    }
    if($('catModalSearchInput') && $('catModalSearchInput').value) window.onCatModalSearch();
};
window.selectCat1 = function(c1) { 
    catModalSelectedCat1=c1; $('catModalStep1').style.display='none'; $('catModalStep2').style.display='block'; $('catModalStep3').style.display='none'; $('catModalStep2Label').textContent=c1; 
    $('catModalCat2List').innerHTML=(categories[c1]||[]).sort(customSortCmp).map(c2=>`<button class="cat-step-btn cat2-btn ${c2===catModalSelectedCat2?'selected':''}" data-c2="${escapeHtml(c2)}">${escapeHtml(c2)}</button>`).join(''); 
    $$('.cat2-btn').forEach(b=>b.addEventListener('click', e=>window.showStep3(c1,e.currentTarget.dataset.c2,false)));
};
window.showStep3 = function(c1,c2,isRule) {
    catModalSelectedCat1=c1; catModalSelectedCat2=c2; $('catModalStep1').style.display='none';$('catModalStep2').style.display='none';$('catModalStep3').style.display='block';
    $('catModalFinalCat').textContent=`${c1} > ${c2}`; let cb=$('catModalCreateRule'), grp=$('catModalRuleGroup'), inp=$('catModalRulePattern'); cb.checked=false; grp.style.display='none'; 
    if(!isRule){let t=transactions.find(x=>String(x.id)===catModalTxId), dp=t?t.details.split(' ')[0].replace(/[^a-zA-Z0-9]/g,''):''; if(dp.length<3&&t)dp=t.details.substring(0,8).trim(); inp.value=dp;}
};
window.validateCategorization = function() {
    let t=transactions.find(x=>String(x.id)===catModalTxId); if(!t)return; t.cat1=catModalSelectedCat1; t.cat2=catModalSelectedCat2; _lastChosenCat={c1:catModalSelectedCat1,c2:catModalSelectedCat2};
    if($('catModalCreateRule').checked){let p=$('catModalRulePattern').value.trim();if(p)window.addOrMergeRule(p,t.cat1,t.cat2);} triggerSave(true); window.closeCatModal();
    if (catModalSource === 'tcdDetails') window.removeFromTcdDetailsIfMismatch(t);
    window.renderViewsSafe(); showToast("Enregistré ✓");
};
window.closeCatModal = function() { $('catSelectionOverlay').classList.remove('open'); };
$('catModalBackBtn').addEventListener('click', () => { $('catModalCat1List').innerHTML=Object.keys(categories).sort(customSortCmp).map(c1=>`<button class="cat-step-btn cat1-btn ${c1===catModalSelectedCat1?'selected':''}" data-c1="${escapeHtml(c1)}">${escapeHtml(c1)}</button>`).join(''); $$('.cat1-btn').forEach(b=>b.addEventListener('click', e=>window.selectCat1(e.currentTarget.dataset.c1))); $('catModalStep1').style.display='block'; $('catModalStep2').style.display='none'; });
$('catModalEditCatBtn').addEventListener('click', () => { $('catModalCat1List').innerHTML=Object.keys(categories).sort(customSortCmp).map(c1=>`<button class="cat-step-btn cat1-btn ${c1===catModalSelectedCat1?'selected':''}" data-c1="${escapeHtml(c1)}">${escapeHtml(c1)}</button>`).join(''); $$('.cat1-btn').forEach(b=>b.addEventListener('click', e=>window.selectCat1(e.currentTarget.dataset.c1))); $('catModalStep1').style.display='block'; $('catModalStep2').style.display='none'; $('catModalStep3').style.display='none'; });

// ═══════════════════════════════════════════════════════════════
// EXPORT / IMPORT BASE DE DONNÉES v3.0.8
// Colonnes : Date de l'opération | Date OP | Banque | Libellé
//            | Détail de l'écriture | Montant de l'opération | CAT1 | CAT2
// Export : XLSX chiffré AES (feuille DATA lisible + feuille ENCRYPTED)
// Import : XLSX chiffré (feuille ENCRYPTED) ou non chiffré (DATA ou CSV)
// ═══════════════════════════════════════════════════════════════

const DB_EXPORT_HEADERS = [
  "Date de l'opération", "Date OP", "Libellé",
  "Détail de l'écriture", "Montant de l'opération", "Notes", "CAT1", "CAT2"
];

function txToExportRow(t) {
  // Wrap dates as explicit string cells to prevent SheetJS auto-conversion to date type
  const ds = v => v ? {t:'s', v: String(v)} : {t:'s', v:''};
  return [
    ds(t.dateOp),
    ds(t.dateExpense || t.dateOp),
    t.label || '',
    t.details || '',
    (t.amount != null ? t.amount : ''),
    t.note || '',
    t.cat1 || '',
    t.cat2 || ''
  ];
}

function xlsxDateToStr(val) {
  if (!val && val !== 0) return '';
  // SheetJS cell object {t, v} — extract the value
  if (val && typeof val === 'object' && 't' in val) val = val.v;
  if (!val && val !== 0) return '';
  // Number: Excel serial → extract date ignoring timezone
  if (typeof val === 'number') {
    // Excel serial: days since 1899-12-30
    // Avoid any timezone: compute year/month/day directly from integer math
    let serial = Math.floor(val);
    // Excel bug: serial 60 = 1900-02-29 (doesn't exist), skip it
    if (serial <= 0) return '';
    if (serial >= 60) serial--; // correct Excel leap year bug
    // Days since 1900-01-01 (serial 1 = 1900-01-01)
    let d = new Date(Date.UTC(1900, 0, 1) + (serial - 1) * 86400000);
    return d.getUTCFullYear() + '-' +
           String(d.getUTCMonth()+1).padStart(2,'0') + '-' +
           String(d.getUTCDate()).padStart(2,'0');
  }
  // Date object: use ISO string to avoid any local timezone interpretation
  if (val instanceof Date) {
    // toISOString always returns UTC — take first 10 chars
    const iso = val.toISOString(); // "2026-05-29T..."
    return iso.slice(0, 10);
  }
  // String: normalize
  const s = String(val).trim();
  // Strip formula wrapper ="..."
  const fw = s.match(/^="(.+)"$/);
  const clean = fw ? fw[1].trim() : s;
  // DD/MM/YYYY
  const dmy = clean.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) return dmy[3] + '-' + dmy[2].padStart(2,'0') + '-' + dmy[1].padStart(2,'0');
  // YYYY-MM-DD already
  if (clean.match(/^\d{4}-\d{2}-\d{2}/)) return clean.slice(0, 10);
  return clean;
}

function importRowToTx(row) {
  const dateOp  = xlsxDateToStr(row[0]);
  const dateExp = xlsxDateToStr(row[1]);
  const label   = String(row[2] || '').trim();
  const details = String(row[3] || '').trim();
  const amtRaw  = row[4];
  const note    = String(row[5] || '').trim();
  const cat1    = String(row[6] || '').trim();
  const cat2    = String(row[7] || '').trim();
  if (!dateOp && !label && !details) return null;
  let amount = 0;
  if (amtRaw !== '' && amtRaw !== null && amtRaw !== undefined) {
    const s = String(amtRaw).replace(/\s/g,'').replace(',','.');
    amount = parseFloat(s) || 0;
  }
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+'_'+Math.random().toString(36).slice(2,9)),
    dateOp, dateExpense: dateExp || dateOp,
    paymentMethod: '', label, details,
    amount, cat1, cat2, note: note || ''
  };
}

$('exportDbBtn').addEventListener('click', () => {
  if (!appSecretKey) { alert("Déverrouillez l'application avant d'exporter."); return; }
  let shiftMode = document.getElementById('exportDbBtn').dataset.shiftMode === '1';
  try {
    const plain = JSON.stringify({ version: APP_VERSION, cols: DB_EXPORT_HEADERS, rows: transactions.map(txToExportRow) });
    const encrypted = CryptoJS.AES.encrypt(plain, appSecretKey).toString();
    // Export chiffré → fichier JSON (pas de limite de taille)
    const jsonPayload = JSON.stringify({ type: 'FINANCES_ENCRYPTED', v: APP_VERSION, payload: encrypted });
    const jsonBlob = new Blob([jsonPayload], { type: 'application/json' });
    const jsonUrl = URL.createObjectURL(jsonBlob);
    const a1 = document.createElement('a');
    a1.href = jsonUrl;
    a1.download = 'finances_backup_' + new Date().toISOString().slice(0,10) + '.json';
    document.body.appendChild(a1); a1.click(); document.body.removeChild(a1);
    setTimeout(() => URL.revokeObjectURL(jsonUrl), 1000);
    // Si SHIFT : export clair supplémentaire en Excel
    if (shiftMode) {
        const dataRows = [DB_EXPORT_HEADERS].concat(transactions.map(txToExportRow));
        const wsData = XLSX.utils.aoa_to_sheet(dataRows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, wsData, 'DATA');
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const xlsxBlob = new Blob([wbout], { type: 'application/octet-stream' });
        const xlsxUrl = URL.createObjectURL(xlsxBlob);
        const a2 = document.createElement('a');
        a2.href = xlsxUrl;
        a2.download = 'finances_clair_' + new Date().toISOString().slice(0,10) + '.xlsx';
        document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);
        setTimeout(() => URL.revokeObjectURL(xlsxUrl), 1000);
    }
    showToast('✅ ' + transactions.length + ' transaction(s) exportée(s)' + (shiftMode ? ' — .json chiffré + .xlsx clair' : ' → .json chiffré'));
  } catch(err) { alert('Erreur export : ' + err.message); }
});

$('importDbBtn').addEventListener('click', () => $('dbFileInput').click());

$('dbFileInput').addEventListener('change', e => {
  const f = e.target.files[0]; if (!f) return;
  const reader = new FileReader();
  reader.onerror = () => { alert('Impossible de lire le fichier.'); e.target.value = ''; };
  reader.onload = ev => {
    try {
      const isJson = f.name.toLowerCase().endsWith('.json');
      const isCsv  = f.name.toLowerCase().endsWith('.csv');

      // ── Fichier JSON chiffré (nouveau format v3.0.8+) ─────────────────────
      if (isJson) {
        const txt = typeof ev.target.result === 'string' ? ev.target.result : new TextDecoder().decode(ev.target.result);
        const obj = JSON.parse(txt);
        if (!obj || obj.type !== 'FINANCES_ENCRYPTED' || !obj.payload) throw new Error('Format JSON non reconnu.');
        const tryDecrypt = (key) => {
          try { const b = CryptoJS.AES.decrypt(obj.payload, key); const s = b.toString(CryptoJS.enc.Utf8); return s ? JSON.parse(s) : null; } catch(ex) { return null; }
        };
        let parsed = appSecretKey ? tryDecrypt(appSecretKey) : null;
        if (!parsed) {
          const altKey = prompt('🔐 Ce fichier est chiffré.\nSaisissez le mot de passe de déchiffrement :');
          if (!altKey) { e.target.value = ''; return; }
          parsed = tryDecrypt(altKey);
          if (!parsed) { alert('❌ Déchiffrement échoué. Mot de passe incorrect.'); e.target.value = ''; return; }
        }
        const importedTxs = (parsed.rows || []).map(importRowToTx).filter(Boolean);
        if (!importedTxs.length) { showToast('⚠️ Aucune transaction trouvée dans le fichier.'); e.target.value=''; return; }
        transactions = importedTxs;
        triggerSave(true); window.renderViewsSafe();
        showToast('✅ Base restaurée — ' + importedTxs.length + ' transaction(s)');
        e.target.value = ''; return;
      }

      let wb;
      if (isCsv) {
        wb = XLSX.read(ev.target.result, { type: 'string' });
      } else {
        wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array', raw: true });
      }

      let importedTxs = [];

      // ── Fichier chiffré XLSX (ancien format) ──────────────────────────────
      if (wb.SheetNames.includes('ENCRYPTED')) {
        const rowsEnc = XLSX.utils.sheet_to_json(wb.Sheets['ENCRYPTED'], { header: 1, defval: '' });
        // Réassembler les chunks si nécessaire (compat. anciens exports)
        const payload = rowsEnc.slice(1).map(r => r[0] ? String(r[0]) : '').join('');
        if (!payload) throw new Error('Payload chiffré introuvable dans le fichier.');
        // Tenter avec la clé courante d'abord
        const tryDecrypt = (key) => {
          try {
            const b = CryptoJS.AES.decrypt(payload, key);
            const s = b.toString(CryptoJS.enc.Utf8);
            return s ? JSON.parse(s) : null;
          } catch(ex) { return null; }
        };
        let parsed = appSecretKey ? tryDecrypt(appSecretKey) : null;
        if (!parsed) {
          // Clé différente ou absente : demander mot de passe alternatif
          const altKey = prompt('🔐 Ce fichier est chiffré.\nSaisissez le mot de passe de déchiffrement (peut être différent de la session actuelle) :');
          if (!altKey) { e.target.value = ''; return; }
          parsed = tryDecrypt(altKey);
          if (!parsed) { alert('❌ Déchiffrement échoué. Mot de passe incorrect.'); e.target.value = ''; return; }
        }
        importedTxs = (parsed.rows || []).map(importRowToTx).filter(Boolean);
      }
      // ── Fichier non chiffré (CSV ou XLSX sans feuille ENCRYPTED) ─────────
      else {
        const sheetName = wb.SheetNames.includes('DATA') ? 'DATA' : wb.SheetNames[0];
        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
        if (!rows || rows.length < 2) {
          showToast('⚠️ Fichier vide ou format non reconnu.'); e.target.value = ''; return;
        }
        // Ignorer la ligne header si elle commence par "Date"
        const startIdx = (rows[0] && String(rows[0][0]).toLowerCase().includes('date')) ? 1 : 0;
        for (let i = startIdx; i < rows.length; i++) {
          const tx = importRowToTx(rows[i]);
          if (tx) importedTxs.push(tx);
        }
      }

      if (importedTxs.length === 0) {
        showToast('⚠️ Aucune transaction valide trouvée.'); e.target.value = ''; return;
      }
      // Import DB = remplacement complet de la base existante
      const confirm = window.confirm(
        '⚠️ ATTENTION\n\n' +
        'Cet import va remplacer intégralement les ' + transactions.length + ' transaction(s) existante(s)' +
        ' par les ' + importedTxs.length + ' transaction(s) du fichier importé.\n\n' +
        'Cette action est irréversible.\n\nConfirmer le remplacement ?'
      );
      if (!confirm) { e.target.value = ''; return; }
      transactions = importedTxs;
      triggerSave(true); window.renderViewsSafe();
      showToast('✅ Base remplacée : ' + importedTxs.length + ' transaction(s) importée(s).');
    } catch(err) {
      alert('Erreur import BDD : ' + err.message);
    }
    e.target.value = '';
  };
  if (f.name.toLowerCase().endsWith('.csv')) {
    reader.readAsText(f, 'UTF-8');
  } else if (f.name.toLowerCase().endsWith('.json')) {
    reader.readAsText(f, 'UTF-8');
  } else {
    reader.readAsArrayBuffer(f);
  }
});


window.setTcdHeaderColor = function(color) {
    if (!color) return;
    // Appliquer via variable CSS root — fonctionne même après re-render du tableau
    document.documentElement.style.setProperty('--tcd-header-color', color);
    localStorage.setItem('f_tcd_header_color', color); triggerSave(false);
    const picker = document.getElementById('tcdHeaderColorPicker');
    if (picker) picker.value = color;
};
// Couleur entête TCD : appliquée directement dans renderSummary

        window.setTcdHeaderColor = function(color) {
    if (!color) return;
    // Appliquer via variable CSS root — fonctionne même après re-render du tableau
    document.documentElement.style.setProperty('--tcd-header-color', color);
    localStorage.setItem('f_tcd_header_color', color); triggerSave(false);
    const picker = document.getElementById('tcdHeaderColorPicker');
    if (picker) picker.value = color;
};
// Couleur entête TCD : appliquée directement dans renderSummary

window.adjustTcdFont = function(dir) {
    let cur = parseInt(localStorage.getItem('f_tcd_fontsize') || '13', 10);
    cur = Math.min(24, Math.max(8, cur + dir));
    let px = cur + 'px';
    localStorage.setItem('f_tcd_fontsize', String(cur)); triggerSave(false);
    // Appliquer sur la table native
    document.querySelectorAll('#summaryGrid .tcd-native th, #summaryGrid .tcd-native td').forEach(el => {
        el.style.fontSize = px;
    });
    // Fallback Tabulator si encore présent
    document.querySelectorAll('#summaryGrid .tabulator-cell, #summaryGrid .tabulator-col-title').forEach(el => {
        el.style.fontSize = px;
    });
};
window.adjustBudgetFont = function(dir) {
    let cur = parseInt(localStorage.getItem('f_budget_fontsize') || '13', 10);
    cur = Math.min(24, Math.max(8, cur + dir));
    let px = cur + 'px';
    localStorage.setItem('f_budget_fontsize', String(cur)); triggerSave(false);
    document.querySelectorAll('#budgetGrid .tcd-native th, #budgetGrid .tcd-native td').forEach(el => {
        el.style.fontSize = px;
    });
};
(function(){
    let s = parseInt(localStorage.getItem('f_budget_fontsize') || '13', 10);
    document.documentElement.style.setProperty('--budget-font-size', s + 'px');
})();
// Restaurer taille tableau au chargement
(function(){
    let s = parseInt(localStorage.getItem('f_tcd_fontsize') || '13', 10);
    document.documentElement.style.setProperty('--tcd-font-size', s + 'px');
})();

// ══════════════════════════════════════════════════════
// MULTI-COMPTE
// ══════════════════════════════════════════════════════
window.renderAccountUI = function() {
    let lbl = document.getElementById('accountSelectorLabel');
    if (!lbl) return;
    let current = accounts.find(a => a.id === currentAccountId);
    lbl.textContent = current ? current.name : '—';
    let dd = document.getElementById('accountDropdownList');
    if (dd && dd.style.display === 'block') window.renderAccountDropdownList();
};

// v3.4.8 : le sélecteur de compte est un menu personnalisé (plus un <select> natif) pour
// pouvoir rafraîchir la liste depuis le registre central Drive à CHAQUE ouverture — un
// <select> natif ne permet pas d'intercepter l'ouverture pour la mettre à jour avant affichage.
window.renderAccountDropdownList = function() {
    let dd = $('accountDropdownList');
    if (!dd) return;
    dd.innerHTML = accounts.map(function(a) {
        let isCurrent = a.id === currentAccountId;
        return '<div onclick="window.selectAccountFromDropdown(\'' + a.id.replace(/'/g, "\\'") + '\')" '
            + 'style="padding:6px 10px;border-radius:6px;cursor:pointer;font-size:0.9em;white-space:nowrap;'
            + 'font-weight:' + (isCurrent ? '700' : '400') + ';background:' + (isCurrent ? 'var(--pro-soft)' : 'transparent') + ';" '
            + 'onmouseover="this.style.background=\'var(--bg)\'" '
            + 'onmouseout="this.style.background=\'' + (isCurrent ? 'var(--pro-soft)' : 'transparent') + '\'">'
            + (isCurrent ? '✓ ' : '') + escapeHtml(a.name) + '</div>';
    }).join('');
};

window.toggleAccountDropdown = function(e) {
    if (e) e.stopPropagation();
    let dd = $('accountDropdownList');
    if (!dd) return;
    if (dd.style.display === 'block') { dd.style.display = 'none'; return; }
    window.renderAccountDropdownList(); // affichage immédiat avec ce qu'on a déjà en mémoire
    dd.style.display = 'block';
    // Rafraîchit depuis le registre central Drive pendant que le menu est ouvert
    loadAccountsRegistry().then(function() {
        window.renderAccountUI();
        window.renderAccountDropdownList();
    });
};

window.selectAccountFromDropdown = function(id) {
    let dd = $('accountDropdownList'); if (dd) dd.style.display = 'none';
    window.switchAccount(id);
};

document.addEventListener('click', function(e) {
    let dd = $('accountDropdownList');
    if (dd && dd.style.display === 'block' && !dd.contains(e.target) && !(e.target.closest && e.target.closest('#accountSelectorBtn'))) {
        dd.style.display = 'none';
    }
});

window.switchAccount = async function(newId) {
    if (newId === currentAccountId) return;
    // Ne pas sauver immédiatement le compte courant au moment du switch: éviter tout écrasement croisé
    currentAccountId = newId;
    localStorage.setItem('f_current_account', newId);
    window._isFirstTcdScrollRestored = false;
    transactions = []; rules = []; categories = {}; savedCharts = [];
    quittancesBiens = []; currentQuittanceBienId = null;
    budgetData = {};
    budgetFilter.cat1.clear(); budgetFilter.cat2.clear(); loadBudgetFilter();
    loadFiscalStartMonth();
    loadFiscalStartMonthSyndic(); applyFiscalStartMonthState();
    budgetEnabled = localStorage.getItem('f_budget_enabled_' + currentAccountId) === '1';
    applyBudgetOptionState();
    regulEnabled = localStorage.getItem('f_regul_enabled_' + currentAccountId) === '1';
    applyRegulOptionState();
    chartsEnabled = localStorage.getItem('f_charts_enabled_' + currentAccountId) !== '0'; // activé par défaut
    applyChartsOptionState();
    if (window.appState) window.appState.tcdRedCells = window.appState.tcdRedCells || {};
    // Restauration immédiate (cache local) de l'onglet actif de ce compte, en attendant la
    // confirmation depuis Drive dans decryptPayload().
    let cachedTab = localStorage.getItem('f_active_tab_' + currentAccountId);
    if (cachedTab) activateTab(cachedTab, true);
    driveFileId = null;
    window.renderAccountUI();
    driveShowLoading('Chargement du compte...');
    driveDataLoaded=false;
    try { await fetchDriveData(); } catch(e) { driveHideLoading(); window.renderViewsSafe(); }
};

window.openAccountManager = function() {
    window.renderAccountManagerList();
    document.getElementById('accountManagerModal').classList.add('open');
    // Rafraîchit depuis le registre central Drive pendant que la modale est ouverte
    loadAccountsRegistry().then(function() {
        window.renderAccountManagerList();
        window.renderAccountUI();
    });
};

window.renderAccountManagerList = function() {
    let list = document.getElementById('accountManagerList');
    if (!list) return;
    let html = '';
    accounts.forEach(function(a) {
        let isCurrent = (a.id === currentAccountId);
        let bg = isCurrent ? 'var(--pro-soft)' : 'var(--surface)';
        let fw = isCurrent ? '700' : '400';
        let safeName = a.name.replace(/"/g, '&quot;');
        let safeId = a.id.replace(/'/g, "\'");
        html += '<div style="display:flex;align-items:center;gap:8px;padding:10px 12px;border:1px solid var(--ink-faint);border-radius:8px;background:' + bg + ';">';
        html += '<span style="font-size:1em;">' + (isCurrent ? '▸' : ' ') + '</span>';
        html += '<input type="text" value="' + safeName + '" onchange="window.renameAccount(\'' + safeId + '\',this.value)" style="flex:1;border:1px solid var(--ink-faint);border-radius:4px;padding:4px 8px;font-size:0.95em;font-weight:' + fw + ';font-family:inherit;background:var(--bg);">';
        if (isCurrent) {
            html += '<span style="font-size:0.8em;color:var(--pro);font-weight:600;padding:0 8px;">Actif</span>';
        } else {
            html += '<button class="btn btn-primary" style="padding:4px 10px;font-size:0.85em;" onclick="window.switchAccount(\'' + safeId + '\');document.getElementById(\'accountManagerModal\').classList.remove(\'open\')">Activer</button>';
        }
        if (accounts.length > 1 && !isCurrent) {
            html += '<button class="btn btn-danger" style="padding:4px 8px;font-size:0.85em;" onclick="window.deleteAccount(\'' + safeId + '\')">🗑️</button>';
        }
        html += '</div>';
    });
    list.innerHTML = html;
};

window.addAccount = async function() {
    let nameEl = document.getElementById('newAccountName');
    let name = nameEl.value.trim();
    if (!name) return;
    let id = 'acc_' + Date.now();
    accounts.push({id, name});
    saveAccountsList();
    saveAccountsRegistry();
    nameEl.value = '';
    window.renderAccountManagerList();
    window.renderAccountUI();
    // Créer un fichier vide totalement isolé pour ce nouveau compte
    if (driveAccessToken) {
        let fname = getAccountDriveFilename(id);
        try {
            let emptyState = {
                transactions: [],
                rules: [],
                categories: {},
                savedCharts: [],
                version: APP_VERSION,
                accounts: accounts,
                settings: {
                    tcdHeaderColor: localStorage.getItem('f_tcd_header_color') || '',
                    fontSize: localStorage.getItem('f_fontSize') || '14',
                    tcdFontSize: localStorage.getItem('f_tcd_fontsize') || '13',
                    budgetFontSize: localStorage.getItem('f_budget_fontsize') || '13',
                    regulFontSize: localStorage.getItem('f_regul_fontsize') || '13',
                    pivot: localStorage.getItem('f_pivot_v2') || '',
                    collapsedGroups: [],
                    collapsedYears: [],
                    tcdFilter: { cat1:[], cat2:[], years:[], months:[] },
                    budgetFilter: { cat1:[], cat2:[] },
                    tcdRedCells: {},
                    settingsTs: Date.now()
                },
                accountId: id,
                quittancesBiens: [],
                quittancesEnabled: false,
                budgetData: {},
                budgetEnabled: false,
                regulEnabled: false,
                fiscalStartMonthSyndic: 10,
                fiscalStartMonth: 1,
                activeTab: 'view-summary',
                chartsEnabled: true
            };
            let emptyPayload = JSON.stringify({vault: CryptoJS.AES.encrypt(JSON.stringify(emptyState), appSecretKey || '').toString()});
            let blob = new Blob([emptyPayload], {type:'application/json'});
            let form = new FormData();
            form.append('metadata', new Blob([JSON.stringify({ name: fname, parents: ['appDataFolder'] })], {type:'application/json'}));
            form.append('file', blob);
            let resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
                method: 'POST',
                headers: { Authorization: 'Bearer ' + driveAccessToken },
                body: form
            });
            let fileData = await resp.json();
            if (fileData.id) driveFileIdMap[id] = fileData.id;
        } catch(e) { console.warn('Erreur création fichier Drive:', e); }
        if (typeof window.renderDriveAdmin === 'function') window.renderDriveAdmin();
    }
    showToast('Compte "' + name + '" créé ✓');
};


// ══════════════════════════════════════════════════════════════════════════
// QUITTANCES — v3.0.8
// ══════════════════════════════════════════════════════════════════════════
window.toggleQuittancesOption = function(checked) {
    quittancesEnabled = checked;
    localStorage.setItem('f_quittances_enabled_' + currentAccountId, checked ? '1' : '0');
    $('tabQuittances').style.display = checked ? '' : 'none';
    if (!checked) {
        let activeTab = document.querySelector('.tab-btn.active');
        if (activeTab && activeTab.dataset.target === 'view-quittances') {
            document.querySelector('.tab-btn[data-target="view-summary"]').click();
        }
    }
    triggerSave(false);
};

function applyQuittancesOptionState() {
    let enabled = quittancesEnabled;
    $('tabQuittances').style.display = enabled ? '' : 'none';
    let cb = $('optQuittancesCb');
    if (cb) cb.checked = enabled;
}

// ── v3.4.10 : Graphiques (activé par défaut) ────────────────────────────────
window.toggleChartsOption = function(checked) {
    chartsEnabled = checked;
    localStorage.setItem('f_charts_enabled_' + currentAccountId, checked ? '1' : '0');
    $('tabCharts').style.display = checked ? '' : 'none';
    if (!checked) {
        let activeTab = document.querySelector('.tab-btn.active');
        if (activeTab && activeTab.dataset.target === 'view-charts') {
            document.querySelector('.tab-btn[data-target="view-summary"]').click();
        }
    }
    triggerSave(false);
};

function applyChartsOptionState() {
    let enabled = chartsEnabled;
    $('tabCharts').style.display = enabled ? '' : 'none';
    let cb = $('optChartsCb');
    if (cb) cb.checked = enabled;
    if (enabled && typeof window.renderCharts === 'function') window.renderCharts();
}

// ── v3.0.8 : Budget / Projection ────────────────────────────────────────────
window.toggleBudgetOption = function(checked) {
    budgetEnabled = checked;
    localStorage.setItem('f_budget_enabled_' + currentAccountId, checked ? '1' : '0');
    $('tabBudget').style.display = checked ? '' : 'none';
    if (!checked) {
        let activeTab = document.querySelector('.tab-btn.active');
        if (activeTab && activeTab.dataset.target === 'view-budget') {
            document.querySelector('.tab-btn[data-target="view-summary"]').click();
        }
    }
    triggerSave(false);
};

function applyBudgetOptionState() {
    let enabled = budgetEnabled;
    $('tabBudget').style.display = enabled ? '' : 'none';
    let cb = $('optBudgetCb');
    if (cb) cb.checked = enabled;
    if (enabled) window.populateBudgetExerciceSelect();
}

// ── v3.3.6 : Diagnostic intégré (réglage global, sans distinction de compte) ──
window.toggleDiagOption = function(checked) {
    diagEnabled = checked;
    localStorage.setItem('f_diag_enabled', checked ? '1' : '0');
    applyDiagOptionState();
    if (!checked) {
        let activeTab = document.querySelector('.tab-btn.active');
        if (activeTab && activeTab.dataset.target === 'view-diagnostic') {
            document.querySelector('.tab-btn[data-target="view-summary"]').click();
        }
    }
};

function applyDiagOptionState() {
    let show = diagEnabled || window._diagForceOpen === true;
    let tab = $('tabDiagnostic');
    if (tab) tab.style.display = show ? '' : 'none';
    let cb = $('optDiagCb');
    if (cb) cb.checked = diagEnabled;
}

window.hideDiagnosticTab = function() {
    diagEnabled = false;
    window._diagForceOpen = false;
    localStorage.setItem('f_diag_enabled', '0');
    applyDiagOptionState();
    let sumTab = document.querySelector('.tab-btn[data-target="view-summary"]');
    if (sumTab) sumTab.click();
};

// ── v3.3.6 : Batterie de tests automatisés ──────────────────────────────────
window.runDiagnostics = function() {
    let results = [];
    const t = (name, fn) => {
        try {
            let r = fn();
            if (r === false) results.push({ name, ok: false, msg: '' });
            else results.push({ name, ok: true, msg: (typeof r === 'string') ? r : '' });
        } catch (e) {
            results.push({ name, ok: false, msg: e.message || String(e) });
        }
    };

    // --- Bibliothèques externes (regression guard : CDN / SRI / disponibilité) ---
    t('Bibliothèque CryptoJS', () => typeof CryptoJS !== 'undefined' && typeof CryptoJS.AES !== 'undefined');
    t('Bibliothèque XLSX (SheetJS)', () => typeof XLSX !== 'undefined' && typeof XLSX.utils !== 'undefined');
    t('Bibliothèque jsPDF', () => typeof window.jspdf !== 'undefined' && typeof window.jspdf.jsPDF === 'function');
    t('Bibliothèque jsPDF-AutoTable', () => typeof window.jspdf !== 'undefined' && typeof window.jspdf.jsPDF.API.autoTable === 'function');
    t('Bibliothèque html2canvas', () => typeof html2canvas === 'function');
    t('Bibliothèque Tabulator', () => typeof Tabulator !== 'undefined');
    t('Bibliothèque Chart.js', () => typeof Chart !== 'undefined');

    // --- Chiffrement (round-trip complet) ---
    t('Chiffrement AES : cycle complet', () => {
        let sample = { hello: 'world', n: 42 };
        let enc = CryptoJS.AES.encrypt(JSON.stringify(sample), 'test-diag-key').toString();
        let dec = JSON.parse(CryptoJS.AES.decrypt(enc, 'test-diag-key').toString(CryptoJS.enc.Utf8));
        return dec.hello === 'world' && dec.n === 42;
    });

    // --- Fonctions de calcul pures ---
    t('Calcul exercice fiscal (getFiscalYearLabel)', () => {
        let ok1 = getFiscalYearLabel('2024', '03', 1) === '2024';
        let ok2 = getFiscalYearLabel('2024', '03', 10) === '2023-2024';
        let ok3 = getFiscalYearLabel('2024', '11', 10) === '2024-2025';
        let ok4 = getFiscalYearLabel('', '', 1) === 'vide';
        if (!(ok1 && ok2 && ok3 && ok4)) throw new Error('Résultat inattendu sur un des cas de test');
        return true;
    });
    t('Tri des mois d\'exercice (getFiscalMonthOrder)', () => {
        let ok1 = getFiscalMonthOrder('01', 1) === 0;
        let ok2 = getFiscalMonthOrder('10', 10) === 0;
        let ok3 = getFiscalMonthOrder('09', 10) === 11;
        if (!(ok1 && ok2 && ok3)) throw new Error('Résultat inattendu sur un des cas de test');
        return true;
    });
    t('Formatage monétaire (formatCurrency)', () => {
        let s = formatCurrency(1234.5);
        if (!s.includes('234') || !s.includes('€')) throw new Error('Format obtenu : "' + s + '"');
        return true;
    });
    t('Échappement HTML (escapeHtml)', () => {
        let s = escapeHtml('<script>"x"&\'y\'</script>');
        if (s.includes('<') || s.includes('>')) throw new Error('Échappement incomplet : "' + s + '"');
        return true;
    });

    // --- Cohérence du DOM (regression guard : doublon d'ID déjà rencontré) ---
    t('Aucun identifiant HTML dupliqué', () => {
        let seen = {}, dups = [];
        document.querySelectorAll('[id]').forEach(el => {
            seen[el.id] = (seen[el.id] || 0) + 1;
        });
        Object.keys(seen).forEach(id => { if (seen[id] > 1) dups.push(id); });
        if (dups.length) throw new Error('ID dupliqué(s) : ' + dups.join(', '));
        return true;
    });
    t('Version affichée cohérente', () => {
        let lbl = $('versionLabel') ? $('versionLabel').textContent : '';
        if (!lbl.includes(APP_VERSION)) throw new Error('Étiquette de version : "' + lbl + '"');
        return true;
    });

    // --- Rendu des écrans principaux (smoke test sur les données réelles) ---
    const renderChecks = [
        ['Rendu Tableau de bord', window.renderSummary],
        ['Rendu Base de données', window.renderDataTable],
        ['Rendu Non catégorisées', window.renderUncategorized],
        ['Rendu Règles', window.renderRules],
        ['Rendu Catégories', window.renderCategories],
        ['Rendu Graphiques', window.renderCharts],
    ];
    if (budgetEnabled && typeof window.renderBudget === 'function') renderChecks.push(['Rendu Budget/Projection', window.renderBudget]);
    if (regulEnabled && typeof window.renderRegul === 'function') renderChecks.push(['Rendu Suivi & Régule', window.renderRegul]);
    if (quittancesEnabled && typeof window.renderQuittancesView === 'function') renderChecks.push(['Rendu Quittances', window.renderQuittancesView]);
    renderChecks.forEach(([name, fn]) => t(name, () => { fn(); return true; }));

    // --- Rendu du rapport ---
    let okCount = results.filter(r => r.ok).length;
    let errCount = results.length - okCount;
    $('diagSummary').innerHTML = `<span style="color:${errCount ? 'var(--urgent)' : 'var(--done)'}">${errCount ? '❌' : '✅'} ${okCount} / ${results.length} tests réussis</span>`
        + ` <span style="color:var(--ink-soft);font-weight:400;font-size:0.85em;">— dernière exécution : ${new Date().toLocaleString('fr-FR')}</span>`;
    $('diagResults').innerHTML = results.map(r => `
        <div class="diag-row ${r.ok ? 'diag-ok' : 'diag-err'}">
            <span class="diag-badge ${r.ok ? 'diag-ok' : 'diag-err'}">${r.ok ? 'OK' : 'ERR'}</span>
            <span class="diag-row-label">${escapeHtml(r.name)}</span>
            <span class="diag-row-msg">${escapeHtml(r.msg || '')}</span>
        </div>`).join('');
};

function applyFiscalStartMonthState() {
    let sel = $('fiscalStartMonthSelect');
    if (sel) sel.value = String(fiscalStartMonth);
}

function saveQuittancesBiens() {
    triggerSave(false);
}

function newQuittanceBien(nom) {
    return {
        id: 'bien_' + Date.now() + '_' + Math.floor(Math.random()*1000),
        nom: nom || 'Nouveau bien',
        bailleur: { nom:'', adresse:'', email:'', tel:'' },
        locataires: [{ nom:'', email:'', tel:'' }],
        designation: { texte:'', adresse:'' },
        dateAnniversaire: '',
        echeancier: [],
        lignesQuittance: [],
        commentaires: '',
        faitA: '',
        signatureTexte: '',
        logoDataUrl: ''
    };
}

window.addQuittanceBien = function() {
    let nom = prompt('Nom du bien (ex: Appartement 1) :', 'Appartement ' + (quittancesBiens.length + 1));
    if (!nom || !nom.trim()) return;
    let bien = newQuittanceBien(nom.trim());
    quittancesBiens.push(bien);
    currentQuittanceBienId = bien.id;
    saveQuittancesBiens();
    window.renderQuittancesView();
};

window.deleteQuittanceBien = function() {
    if (!currentQuittanceBienId) return;
    let bien = quittancesBiens.find(b => b.id === currentQuittanceBienId);
    if (!bien) return;
    if (!confirm('Supprimer définitivement le bien "' + bien.nom + '" et toutes ses données de quittance ?')) return;
    quittancesBiens = quittancesBiens.filter(b => b.id !== currentQuittanceBienId);
    currentQuittanceBienId = quittancesBiens.length ? quittancesBiens[0].id : null;
    saveQuittancesBiens();
    window.renderQuittancesView();
};

window.selectQuittanceBien = function(id) {
    currentQuittanceBienId = id;
    window.renderQuittancesView();
};

function getCurrentBien() {
    return quittancesBiens.find(b => b.id === currentQuittanceBienId) || null;
}

window.saveQuittanceField = function() {
    let bien = getCurrentBien();
    if (!bien) return;
    bien.bailleur.nom = $('qBailleurNom').value;
    bien.bailleur.adresse = $('qBailleurAdresse').value;
    bien.bailleur.email = $('qBailleurEmail').value;
    bien.bailleur.tel = $('qBailleurTel').value;
    bien.faitA = $('qFaitA').value;
    bien.signatureTexte = $('qSignatureTexte').value;
    bien.signatureDate = $('qSignatureDate').value || new Date().toISOString().slice(0,10);
    bien.commentaires = $('qCommentaires').value;
    let oldFolderId = bien.driveFolderId;
    bien.driveFolderId = ($('qDriveFolderId').value || '').trim();
    saveQuittancesBiens();
    if (bien.driveFolderId && bien.driveFolderId !== oldFolderId) { window.loadQuittanceDriveFiles(); }
    else if (!bien.driveFolderId) { $('qDriveFilesList').innerHTML = ''; }
};

window.uploadQuittanceLogo = function(input) {
    let file = input.files[0]; if (!file) return;
    let bien = getCurrentBien(); if (!bien) return;
    let reader = new FileReader();
    reader.onload = function(e) {
        bien.logoDataUrl = e.target.result;
        $('qLogoPreview').src = e.target.result;
        $('qLogoPreview').style.display = 'inline-block';
        saveQuittancesBiens();
        showToast('✅ Logo enregistré');
    };
    reader.readAsDataURL(file);
};

window.copyBailleurFromBien = function(sourceId) {
    if (!sourceId) return;
    let bien = getCurrentBien(); if (!bien) return;
    let source = quittancesBiens.find(b => b.id === sourceId);
    if (!source) return;
    bien.bailleur = { nom: source.bailleur.nom, adresse: source.bailleur.adresse, email: source.bailleur.email, tel: source.bailleur.tel };
    saveQuittancesBiens();
    window.renderQuittancesView();
    showToast('✅ Bailleur copié depuis "' + source.nom + '"');
};

window.copySignatureFromBien = function(sourceId) {
    if (!sourceId) return;
    let bien = getCurrentBien(); if (!bien) return;
    let source = quittancesBiens.find(b => b.id === sourceId);
    if (!source) return;
    bien.faitA = source.faitA;
    bien.signatureTexte = source.signatureTexte;
    bien.logoDataUrl = source.logoDataUrl;
    saveQuittancesBiens();
    window.renderQuittancesView();
    showToast('✅ Signature copiée depuis "' + source.nom + '"');
};

window.exportQuittanceBien = function() {
    let bien = getCurrentBien(); if (!bien) return;
    let dataStr = JSON.stringify(bien, null, 2);
    let blob = new Blob([dataStr], { type: 'application/json' });
    let url = URL.createObjectURL(blob);
    let a = document.createElement('a');
    a.href = url;
    a.download = 'Quittance_' + bien.nom.replace(/\s+/g,'_') + '.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('✅ Bien exporté');
};

window.importQuittanceBien = function(input) {
    let file = input.files[0]; if (!file) return;
    let reader = new FileReader();
    reader.onload = function(e) {
        try {
            let imported = JSON.parse(e.target.result);
            imported.id = 'bien_' + Date.now() + '_' + Math.floor(Math.random()*1000);
            if (!imported.nom) imported.nom = 'Bien importé';
            else imported.nom = imported.nom + ' (importé)';
            if (!imported.locataires) imported.locataires = [{ nom:'', email:'', tel:'' }];
            if (!imported.designation) imported.designation = { texte:'', adresse:'' };
            if (!imported.lignesQuittance) imported.lignesQuittance = [];
            if (!imported.echeancier) imported.echeancier = [];
            imported.signatureDate = new Date().toISOString().slice(0,10);
            quittancesBiens.push(imported);
            currentQuittanceBienId = imported.id;
            saveQuittancesBiens();
            window.renderQuittancesView();
            showToast('✅ Bien importé : ' + imported.nom);
        } catch (err) {
            alert('Fichier invalide ou corrompu.');
        }
        input.value = '';
    };
    reader.readAsText(file);
};

function populateCopySelectors() {
    let others = quittancesBiens.filter(b => b.id !== currentQuittanceBienId);
    let opts = '<option value="">↩️ Récupérer depuis...</option>' + others.map(b => `<option value="${b.id}">${b.nom}</option>`).join('');
    let selB = $('qCopyBailleurFrom'); if (selB) selB.innerHTML = opts;
    let selS = $('qCopySignatureFrom'); if (selS) selS.innerHTML = opts;
}

// ── Locataires ──
window.addQuittanceLocataire = function() {
    let bien = getCurrentBien(); if (!bien) return;
    bien.locataires.push({ nom:'', email:'', tel:'' });
    saveQuittancesBiens();
    window.renderQuittanceLocataires();
};
window.removeQuittanceLocataire = function(idx) {
    let bien = getCurrentBien(); if (!bien) return;
    if (bien.locataires.length <= 1) { showToast('⚠️ Au moins un locataire requis'); return; }
    bien.locataires.splice(idx, 1);
    saveQuittancesBiens();
    window.renderQuittanceLocataires();
};
window.updateQuittanceLocataire = function(idx, field, value) {
    let bien = getCurrentBien(); if (!bien) return;
    bien.locataires[idx][field] = value;
    saveQuittancesBiens();
};
window.renderQuittanceLocataires = function() {
    let bien = getCurrentBien(); if (!bien) return;
    let el = $('qLocatairesList');
    el.innerHTML = bien.locataires.map((l, idx) => `
        <div style="display:flex;gap:6px;align-items:center;">
            <input type="text" class="input-text" placeholder="Nom locataire ${idx+1}" value="${(l.nom||'').replace(/"/g,'&quot;')}" style="flex:1;" onchange="window.updateQuittanceLocataire(${idx},'nom',this.value)">
            <input type="email" class="input-text" placeholder="Email" value="${(l.email||'').replace(/"/g,'&quot;')}" style="flex:1;" onchange="window.updateQuittanceLocataire(${idx},'email',this.value)">
            <input type="text" class="input-text" placeholder="Téléphone" value="${(l.tel||'').replace(/"/g,'&quot;')}" style="flex:1;" onchange="window.updateQuittanceLocataire(${idx},'tel',this.value)">
            <button class="btn btn-outline" style="padding:4px 8px;" onclick="window.removeQuittanceLocataire(${idx})">🗑️</button>
        </div>
    `).join('');
};

// ── Désignation des locaux (unique) ──
window.updateQuittanceDesignationUnique = function(texte, adresse) {
    let bien = getCurrentBien(); if (!bien) return;
    if (!bien.designation) bien.designation = { texte:'', adresse:'' };
    if (texte !== null && texte !== undefined) bien.designation.texte = texte;
    if (adresse !== null && adresse !== undefined) bien.designation.adresse = adresse;
    saveQuittancesBiens();
};
window.renderQuittanceDesignations = function() {
    let bien = getCurrentBien(); if (!bien) return;
    if (!bien.designation) bien.designation = { texte:'', adresse:'' };
    $('qDesignationTexte').value = bien.designation.texte || '';
    $('qDesignationAdresse').value = bien.designation.adresse || '';
};

// ── Échéancier (basé sur date anniversaire, 12 mois répartis en 2 blocs) ──
function fmtIsoLocal(y, m, d) {
    return y + '-' + String(m+1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
}

window.setQuittanceAnniversaire = function(dateStr) {
    let bien = getCurrentBien(); if (!bien || !dateStr) return;
    bien.dateAnniversaire = dateStr;
    saveQuittancesBiens();
    window.renderQuittanceEcheancier();
};

window.resetQuittanceEcheancier = function() {
    let bien = getCurrentBien(); if (!bien) return;
    if (!confirm('Réinitialiser complètement l\'échéancier de ce bien ? (L\'historique sera effacé)')) return;
    bien.dateAnniversaire = '';
    bien.echeancier = [];
    saveQuittancesBiens();
    window.renderQuittanceEcheancier();
    showToast('♻️ Échéancier réinitialisé');
};

window.updateQuittanceEcheance = function(dateIso, field, value) {
    let bien = getCurrentBien(); if (!bien) return;
    let target = bien.echeancier.find(e => e.date === dateIso);
    if (!target) return;
    if (field === 'montant') {
        target.montant = parseFloat(value) || 0;
    } else if (field === 'detail') {
        target.detail = value;
        let parts = String(value).split('+').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
        if (parts.length > 0) {
            target.montant = parts.reduce((a,b) => a+b, 0);
        }
    } else {
        target[field] = value;
    }
    saveQuittancesBiens();
    window.renderQuittanceEcheancier();
};

window.duplicateEcheanceToAll = function() {
    let bien = getCurrentBien(); if (!bien) return;
    let sel = $('qEcheancierYearSelect');
    if(!sel || !sel.value || !bien.dateAnniversaire) return;
    let currentSelYear = parseInt(sel.value);
    let [y, m] = bien.dateAnniversaire.split('-').map(Number);
    let yearDates = [];
    for (let i = 0; i < 12; i++) {
        let totalMonthOffset = (currentSelYear - 1) * 12 + i;
        let targetY = y + Math.floor((m - 1 + totalMonthOffset) / 12);
        let targetM = (m - 1 + totalMonthOffset) % 12;
        yearDates.push(fmtIsoLocal(targetY, targetM, 1));
    }
    let sourceDate = yearDates[0];
    let source = bien.echeancier.find(e => e.date === sourceDate);
    if(!source) return;
    yearDates.slice(1).forEach(dateIso => {
        let target = bien.echeancier.find(e => e.date === dateIso);
        if (target) { target.detail = source.detail; target.montant = source.montant; }
    });
    saveQuittancesBiens();
    window.renderQuittanceEcheancier();
    showToast('✅ Ligne dupliquée sur l\'année en cours');
};

window.duplicateEcheanceToSelection = function() {
    let bien = getCurrentBien(); if (!bien || !bien.echeancier.length) return;
    let source = bien.echeancier[0];
    let selectedCount = 0;
    bien.echeancier.forEach((e, i) => {
        if (i === 0 || !e.selected) return;
        e.detail = source.detail;
        e.montant = source.montant;
        selectedCount++;
    });
    if (selectedCount === 0) { showToast('⚠️ Aucun mois sélectionné'); return; }
    saveQuittancesBiens();
    window.renderQuittanceEcheancier();
    showToast('✅ Ligne dupliquée sur ' + selectedCount + ' mois sélectionné(s)');
};

function computeEcheanceMontantAffiche(e, fmtEur) {
    let detail = (e.detail||'').trim();
    if (!detail) return fmtEur(e.montant);
    let cleaned = detail.replace(/€/g, '').replace(/\s+/g, '');
    if (/^[0-9,.+\-]+$/.test(cleaned)) {
        let normalized = cleaned.replace(/,/g, '.');
        let parts = normalized.split(/(?=[+\-])/).filter(Boolean);
        let sum = 0;
        let valid = true;
        parts.forEach(p => {
            let v = parseFloat(p);
            if (isNaN(v)) { valid = false; return; }
            sum += v;
        });
        if (valid && parts.length) return fmtEur(sum);
    }
    return 'A confirmer';
}

function renderEcheanceRow(e, dateIso, showCheckbox) {
    let fmtEur = n => (parseFloat(n)||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' €';
    let isPaid = e.statut === 'Payé';
    let rowStyle = isPaid ? 'background:#8BC34A;color:#111;' : '';
    return `<tr style="${rowStyle}">
        <td style="color:#111;">${e.date ? new Date(e.date+'T00:00:00').toLocaleDateString('fr-FR') : ''}</td>
        <td><input type="text" class="input-text" placeholder="ex: 760+50" value="${(e.detail||'').replace(/"/g,'&quot;')}" style="color:#111;${isPaid?'background:transparent;border-color:rgba(0,0,0,0.3);':''}" onchange="window.updateQuittanceEcheance('${dateIso}','detail',this.value)"></td>
        <td style="text-align:right;white-space:nowrap;color:#111;">${computeEcheanceMontantAffiche(e, fmtEur)}</td>
        <td>
            <select class="input-text" style="color:#111;${isPaid?'background:transparent;border-color:rgba(0,0,0,0.3);':''}" onchange="window.updateQuittanceEcheance('${dateIso}','statut',this.value)">
                <option value="Payé" ${e.statut==='Payé'?'selected':''}>Payé</option>
                <option value="À venir" ${e.statut==='À venir'?'selected':''}>À venir</option>
            </select>
        </td>
    </tr>`;
}

window.renderQuittanceEcheancier = function() {
    let bien = getCurrentBien(); if (!bien) return;
    $('qDateAnniversaire').value = bien.dateAnniversaire || '';
    let bodyA = $('qEcheancierBodyA'), bodyB = $('qEcheancierBodyB');
    let yearSelWrap = $('qEcheancierYearWrap');

    if (!bien.dateAnniversaire) {
        bodyA.innerHTML = ''; bodyB.innerHTML = '';
        if(yearSelWrap) yearSelWrap.style.display = 'none';
        return;
    }
    if(yearSelWrap) yearSelWrap.style.display = 'inline-block';
    
    let [y, m, d] = bien.dateAnniversaire.split('-').map(Number);
    let now = new Date();
    let currentMonthsDiff = (now.getFullYear() - y) * 12 + (now.getMonth() - (m - 1));
    let totalYears = Math.max(1, Math.ceil((currentMonthsDiff + 1) / 12)) + 1; 

    let sel = $('qEcheancierYearSelect');
    let currentSelYear = sel.value ? parseInt(sel.value) : Math.max(1, totalYears - 1);
    if (currentSelYear > totalYears) currentSelYear = totalYears;
    
    let opts = '';
    for (let i = 1; i <= totalYears; i++) {
        let yStart = y + i - 1;
        let yearLabel = (m === 1) ? yStart : `${yStart}-${yStart+1}`;
        opts += `<option value="${i}" ${i === currentSelYear ? 'selected' : ''}>Année ${i} (${yearLabel})</option>`;
    }
    sel.innerHTML = opts;
    
    let yearDates = [];
    for (let i = 0; i < 12; i++) {
        let totalMonthOffset = (currentSelYear - 1) * 12 + i;
        let targetY = y + Math.floor((m - 1 + totalMonthOffset) / 12);
        let targetM = (m - 1 + totalMonthOffset) % 12;
        yearDates.push(fmtIsoLocal(targetY, targetM, 1));
    }
    
    if (!bien.echeancier) bien.echeancier = [];
    let displayList = [];
    yearDates.forEach(isoDate => {
        let existing = bien.echeancier.find(e => e.date === isoDate);
        if (!existing) {
            let prevIso = null;
            if (bien.echeancier.length > 0) {
                let pastDates = bien.echeancier.filter(e => e.date < isoDate).sort((a,b) => b.date.localeCompare(a.date));
                if (pastDates.length > 0) {
                    existing = { date: isoDate, detail: pastDates[0].detail, montant: pastDates[0].montant, statut: 'À venir', selected: false };
                }
            }
            if (!existing) existing = { date: isoDate, detail: '', montant: 0, statut: 'À venir', selected: false };
            bien.echeancier.push(existing);
        }
        displayList.push(existing);
    });
    bien.echeancier.sort((a,b) => a.date.localeCompare(b.date));
    
    bodyA.innerHTML = displayList.slice(0,6).map((e, i) => renderEcheanceRow(e, e.date, i===0)).join('');
    bodyB.innerHTML = displayList.slice(6,12).map((e, i) => renderEcheanceRow(e, e.date, false)).join('');
};

// ── Tableau de lignes Débit/Crédit de la quittance ──
function newQuittanceLigne(libelle) {
    return { libelle: libelle, detail: '', debit: 0, credit: 0 };
}

window.updateQuittancePeriodeFromMonth = function() {
    let val = $('qGenPeriodeMois').value;
    if (!val) return;
    let [y, m] = val.split('-').map(Number);
    let debut = y + '-' + String(m).padStart(2,'0') + '-01';
    let lastDay = new Date(y, m, 0).getDate();
    let fin = y + '-' + String(m).padStart(2,'0') + '-' + String(lastDay).padStart(2,'0');
    $('qGenPeriodeDebut').value = debut;
    $('qGenPeriodeFin').value = fin;
    let fmt = d => { let [yy,mm,dd] = d.split('-'); return dd+'/'+mm+'/'+yy; };
    $('qGenPeriodeAffichee').textContent = 'Du ' + fmt(debut) + ' au ' + fmt(fin);
    window.renderQuittanceTableLignes();
};

window.applyRevenuToQuittanceLignes = function(dateIso, montant, dateExpenseIso) {
    let bien = getCurrentBien(); if (!bien) return;
    if (!dateIso) { showToast('⚠️ Date manquante sur cette écriture'); return; }
    let amt = parseFloat(montant) || 0;
    let moisRef = (dateExpenseIso || dateIso || '').slice(0,7);
    if (moisRef && $('qGenPeriodeMois')) {
        $('qGenPeriodeMois').value = moisRef;
        window.updateQuittancePeriodeFromMonth();
    }
    let absAmt = Math.abs(amt);
    let updatedCount = 0;

    function isDateLine(l) {
        return l.libelle === 'Payé par virement bancaire, le' || l.dateDetail === true || /^\d{4}-\d{2}-\d{2}$/.test(l.detail || '');
    }

    [bien.lignesQuittance, bien.lignesCaution].forEach(list => {
        if (!Array.isArray(list)) return;
        list.forEach(l => {
            if (isDateLine(l)) {
                l.detail = dateIso;
                if (amt >= 0) { l.credit = absAmt; l.debit = 0; }
                else { l.debit = absAmt; l.credit = 0; }
                updatedCount++;
            }
        });
    });

    if (!updatedCount) { showToast('⚠️ Aucune ligne datée trouvée dans les tableaux'); return; }

    saveQuittancesBiens();
    window.renderQuittanceLignesBody();
    window.renderQuittanceCautionLignesBody();
    showToast('✅ Écriture reportée dans ' + updatedCount + ' ligne(s) datée(s)');
};

window.renderQuittanceRevenusTable = function() {
    let body = $('qRevenusBody');
    if (!body) return;
    let today = new Date();
    let cutoff = new Date(today.getFullYear(), today.getMonth() - 6, today.getDate());
    let norm = s => (s||'').toString().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
    let revenus = (transactions || []).filter(t => {
        let c = norm(t.cat1);
        if (!(c.startsWith('1') && c.includes('revenu'))) return false;
        let d = t.dateOp ? new Date(t.dateOp) : null;
        return d && d >= cutoff;
    });
    revenus.sort((a,b) => new Date(b.dateOp) - new Date(a.dateOp));
    let fmtDate = s => { if (!s) return ''; let [y,m,d] = s.split('-'); return d+'/'+m+'/'+y; };
    let fmtEur = n => (parseFloat(n)||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' €';
    body.innerHTML = revenus.map(t => {
        let detailTxt = (t.details||t.label||'').toString();
        let escaped = detailTxt.replace(/"/g,'&quot;');
        let dateIso = t.dateOp || '';
        let dateExpenseIso = t.dateExpense || '';
        let amount = parseFloat(t.amount) || 0;
        return `<tr style="cursor:pointer;" title="Cliquer pour reporter cette écriture dans les lignes datées des tableaux de quittance" onclick="window.applyRevenuToQuittanceLignes('${dateIso}', ${amount}, '${dateExpenseIso}')">
        <td>${fmtDate(t.dateOp)}</td>
        <td>${fmtDate(t.dateExpense)}</td>
        <td colspan="2" title="${escaped}" style="max-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${detailTxt}</td>
        <td style="text-align:right;white-space:nowrap;">${fmtEur(t.amount)}</td>
    </tr>`;
    }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--ink-soft);padding:16px;">Aucun revenu trouvé sur les 6 derniers mois</td></tr>';
};

window.renderQuittanceTableLignes = function() {
    let bien = getCurrentBien(); if (!bien) return;
    if (!bien.lignesQuittance || !Array.isArray(bien.lignesQuittance) || bien.lignesQuittance.length === 0) {
        bien.lignesQuittance = [
            newQuittanceLigne('Loyer'),
            newQuittanceLigne('Provision sur charges'),
            newQuittanceLigne('Autre'),
            newQuittanceLigne('Payé par virement bancaire, le')
        ];
    }
    if (!bien.lignesCaution || !Array.isArray(bien.lignesCaution) || bien.lignesCaution.length === 0) {
        bien.lignesCaution = [
            newQuittanceLigne('Dépôt de garantie'),
            newQuittanceLigne('Payé par virement bancaire, le')
        ];
    }
    window.renderQuittanceLignesBody();
    window.renderQuittanceCautionLignesBody();
};

window.updateQuittanceLigne = function(idx, field, value) {
    let bien = getCurrentBien(); if (!bien) return;
    if (field === 'debit' || field === 'credit') {
        bien.lignesQuittance[idx][field] = parseFloat(value) || 0;
    } else {
        bien.lignesQuittance[idx][field] = value;
    }
    saveQuittancesBiens();
    window.renderQuittanceLignesBody();
};

window.renderQuittanceLignesBody = function() {
    let bien = getCurrentBien(); if (!bien) return;
    let body = $('qLignesBody');
    let fmtEur = n => (parseFloat(n)||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
    body.innerHTML = bien.lignesQuittance.map((l, idx) => {
        let isDatedLine = l.libelle === 'Payé par virement bancaire, le' || l.dateDetail === true;
        let detailInput = isDatedLine
            ? `<input type="date" class="input-text" value="${l.detail||''}" onchange="window.updateQuittanceLigne(${idx},'detail',this.value)">`
            : `<input type="text" class="input-text" placeholder="détail optionnel" value="${(l.detail||'').replace(/"/g,'&quot;')}" onchange="window.updateQuittanceLigne(${idx},'detail',this.value)">`;
        let isHidden = !!l.hidden;
        return `<tr style="${isHidden?'opacity:0.45;':''}">
            <td><input type="text" class="input-text" value="${(l.libelle||'').replace(/"/g,'&quot;')}" onchange="window.updateQuittanceLigne(${idx},'libelle',this.value)"></td>
            <td>${detailInput}</td>
            <td><input type="number" step="0.01" class="input-text" value="${l.debit||0}" onchange="window.updateQuittanceLigne(${idx},'debit',this.value)"></td>
            <td><input type="number" step="0.01" class="input-text" value="${l.credit||0}" onchange="window.updateQuittanceLigne(${idx},'credit',this.value)"></td>
            <td style="white-space:nowrap;text-align:center;padding:4px 2px;">
                <button class="btn btn-outline" style="padding:1px 4px;font-size:0.85em;" title="Monter" onclick="window.moveQuittanceLigne(${idx},-1)" ${idx===0?'disabled':''}>↑</button>
                <button class="btn btn-outline" style="padding:1px 4px;font-size:0.85em;" title="Descendre" onclick="window.moveQuittanceLigne(${idx},1)" ${idx===bien.lignesQuittance.length-1?'disabled':''}>↓</button>
                <button class="btn btn-outline" style="padding:1px 4px;font-size:0.85em;" title="Insérer une ligne ici" onclick="window.insertQuittanceLigne(${idx})">➕</button>
                <button class="btn btn-outline" style="padding:1px 4px;font-size:0.85em;" title="${isHidden?'Afficher dans le PDF':'Masquer du PDF'}" onclick="window.toggleQuittanceLigneVisible(${idx})">${isHidden?'🙈':'👁️'}</button>
                <button class="btn btn-outline" style="padding:1px 4px;font-size:0.85em;" title="Supprimer" onclick="window.removeQuittanceLigne(${idx})">🗑️</button>
            </td>
        </tr>`;
    }).join('');
    let totalDebit = bien.lignesQuittance.reduce((s,l) => s + (parseFloat(l.debit)||0), 0);
    let totalCredit = bien.lignesQuittance.reduce((s,l) => s + (parseFloat(l.credit)||0), 0);
    $('qTotalDebit').textContent = fmtEur(totalDebit) + ' €';
    $('qTotalCredit').textContent = fmtEur(totalCredit) + ' €';
};

window.renderQuittanceCautionLignesBody = function() {
    let bien = getCurrentBien(); if (!bien) return;
    let body = $('qCautionLignesBody');
    if (!body) return;
    let fmtEur = n => (parseFloat(n)||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2});
    body.innerHTML = bien.lignesCaution.map((l, idx) => {
        let isDatedLine = l.libelle === 'Payé par virement bancaire, le' || l.dateDetail === true;
        let detailInput = isDatedLine
            ? `<input type="date" class="input-text" value="${l.detail||''}" onchange="window.updateQuittanceCautionLigne(${idx},'detail',this.value)">`
            : `<input type="text" class="input-text" placeholder="détail optionnel" value="${(l.detail||'').replace(/"/g,'&quot;')}" onchange="window.updateQuittanceCautionLigne(${idx},'detail',this.value)">`;
        let isHidden = !!l.hidden;
        return `<tr style="${isHidden?'opacity:0.45;':''}">
            <td><input type="text" class="input-text" value="${(l.libelle||'').replace(/"/g,'&quot;')}" onchange="window.updateQuittanceCautionLigne(${idx},'libelle',this.value)"></td>
            <td>${detailInput}</td>
            <td><input type="number" step="0.01" class="input-text" value="${l.debit||0}" onchange="window.updateQuittanceCautionLigne(${idx},'debit',this.value)"></td>
            <td><input type="number" step="0.01" class="input-text" value="${l.credit||0}" onchange="window.updateQuittanceCautionLigne(${idx},'credit',this.value)"></td>
            <td style="white-space:nowrap;text-align:center;padding:4px 2px;">
                <button class="btn btn-outline" style="padding:1px 4px;font-size:0.85em;" title="Monter" onclick="window.moveQuittanceCautionLigne(${idx},-1)" ${idx===0?'disabled':''}>↑</button>
                <button class="btn btn-outline" style="padding:1px 4px;font-size:0.85em;" title="Descendre" onclick="window.moveQuittanceCautionLigne(${idx},1)" ${idx===bien.lignesCaution.length-1?'disabled':''}>↓</button>
                <button class="btn btn-outline" style="padding:1px 4px;font-size:0.85em;" title="Insérer une ligne ici" onclick="window.insertQuittanceCautionLigne(${idx})">➕</button>
                <button class="btn btn-outline" style="padding:1px 4px;font-size:0.85em;" title="${isHidden?'Afficher dans le PDF':'Masquer du PDF'}" onclick="window.toggleQuittanceCautionLigneVisible(${idx})">${isHidden?'🙈':'👁️'}</button>
                <button class="btn btn-outline" style="padding:1px 4px;font-size:0.85em;" title="Supprimer" onclick="window.removeQuittanceCautionLigne(${idx})">🗑️</button>
            </td>
        </tr>`;
    }).join('');
    let totalDebit = bien.lignesCaution.reduce((s,l) => s + (parseFloat(l.debit)||0), 0);
    let totalCredit = bien.lignesCaution.reduce((s,l) => s + (parseFloat(l.credit)||0), 0);
    $('qCautionTotalDebit').textContent = fmtEur(totalDebit) + ' €';
    $('qCautionTotalCredit').textContent = fmtEur(totalCredit) + ' €';
};

window.toggleQuittanceCautionLigneVisible = function(idx) {
    let bien = getCurrentBien(); if (!bien) return;
    bien.lignesCaution[idx].hidden = !bien.lignesCaution[idx].hidden;
    saveQuittancesBiens();
    window.renderQuittanceCautionLignesBody();
};

window.updateQuittanceCautionLigne = function(idx, field, value) {
    let bien = getCurrentBien(); if (!bien) return;
    if (field === 'debit' || field === 'credit') {
        bien.lignesCaution[idx][field] = parseFloat(value) || 0;
    } else {
        bien.lignesCaution[idx][field] = value;
    }
    saveQuittancesBiens();
    window.renderQuittanceCautionLignesBody();
};

function qBienCautionLignesLength() {
    let bien = getCurrentBien();
    return bien ? bien.lignesCaution.length : 0;
}

window.insertQuittanceCautionLigne = async function(afterIdx) {
    let bien = getCurrentBien(); if (!bien) return;
    let dateDetail = await window.askQuittanceLigneType();
    if (dateDetail === null) return;
    bien.lignesCaution.splice(afterIdx + 1, 0, { libelle: '', detail: '', debit: 0, credit: 0, dateDetail });
    saveQuittancesBiens();
    window.renderQuittanceCautionLignesBody();
};

window.removeQuittanceCautionLigne = function(idx) {
    let bien = getCurrentBien(); if (!bien) return;
    if (bien.lignesCaution.length <= 1) { showToast('⚠️ Au moins une ligne requise'); return; }
    bien.lignesCaution.splice(idx, 1);
    saveQuittancesBiens();
    window.renderQuittanceCautionLignesBody();
};

window.moveQuittanceCautionLigne = function(idx, direction) {
    let bien = getCurrentBien(); if (!bien) return;
    let newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= bien.lignesCaution.length) return;
    let arr = bien.lignesCaution;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    saveQuittancesBiens();
    window.renderQuittanceCautionLignesBody();
};

window.toggleQuittanceLigneVisible = function(idx) {
    let bien = getCurrentBien(); if (!bien) return;
    bien.lignesQuittance[idx].hidden = !bien.lignesQuittance[idx].hidden;
    saveQuittancesBiens();
    window.renderQuittanceLignesBody();
};

function qBienLignesLength() {
    let bien = getCurrentBien();
    return bien ? bien.lignesQuittance.length : 0;
}

window.askQuittanceLigneType = function() {
    return new Promise(resolve => {
        window._resolveQuittanceLigneType = function(value) {
            $('quittanceLigneTypeModal').style.display = 'none';
            resolve(value);
        };
        $('quittanceLigneTypeModal').style.display = 'flex';
    });
};

window.insertQuittanceLigne = async function(afterIdx) {
    let bien = getCurrentBien(); if (!bien) return;
    let dateDetail = await window.askQuittanceLigneType();
    if (dateDetail === null) return;
    bien.lignesQuittance.splice(afterIdx + 1, 0, { libelle: '', detail: '', debit: 0, credit: 0, dateDetail });
    saveQuittancesBiens();
    window.renderQuittanceLignesBody();
};

window.removeQuittanceLigne = function(idx) {
    let bien = getCurrentBien(); if (!bien) return;
    if (bien.lignesQuittance.length <= 1) { showToast('⚠️ Au moins une ligne requise'); return; }
    bien.lignesQuittance.splice(idx, 1);
    saveQuittancesBiens();
    window.renderQuittanceLignesBody();
};

window.moveQuittanceLigne = function(idx, direction) {
    let bien = getCurrentBien(); if (!bien) return;
    let newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= bien.lignesQuittance.length) return;
    let arr = bien.lignesQuittance;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    saveQuittancesBiens();
    window.renderQuittanceLignesBody();
};

// ── Rendu global de la vue ──
window.renderQuittancesView = function() {
    let sel = $('quittanceBienSelector');
    sel.innerHTML = quittancesBiens.map(b => `<option value="${b.id}" ${b.id===currentQuittanceBienId?'selected':''}>${b.nom}</option>`).join('');

    let empty = $('quittanceEmptyState'), form = $('quittanceFormWrapper');
    let bien = getCurrentBien();
    if (!bien) {
        empty.style.display = 'block';
        form.style.display = 'none';
        return;
    }
    empty.style.display = 'none';
    form.style.display = 'block';

    $('qBailleurNom').value = bien.bailleur.nom || '';
    $('qBailleurAdresse').value = bien.bailleur.adresse || '';
    $('qBailleurEmail').value = bien.bailleur.email || '';
    $('qBailleurTel').value = bien.bailleur.tel || '';
    $('qFaitA').value = bien.faitA || '';
    $('qSignatureTexte').value = bien.signatureTexte || '';
    $('qSignatureDate').value = bien.signatureDate || new Date().toISOString().slice(0,10);
    $('qCommentaires').value = bien.commentaires || '';
    $('qDriveFolderId').value = bien.driveFolderId || '';
    window.updateQuittanceDriveLink();
    if (bien.logoDataUrl) { $('qLogoPreview').src = bien.logoDataUrl; $('qLogoPreview').style.display = 'inline-block'; }
    else { $('qLogoPreview').style.display = 'none'; }
    if (bien.driveFolderId) { window.loadQuittanceDriveFiles(); } else { $('qDriveFilesList').innerHTML = ''; }

    populateCopySelectors();
    window.renderQuittanceLocataires();
    window.renderQuittanceDesignations();
    window.renderQuittanceEcheancier();
    window.renderQuittanceTableLignes();
    window.renderQuittanceRevenusTable();
    $('quittancePreviewContainer').style.display = 'none';
};

// ── Génération de la quittance (affichage) + téléchargement PDF séparé ──
window.generateQuittanceAffichage = function() { window._generateQuittanceCore('loyer'); };

window.generateAppelLoyerAffichage = function() { window._generateQuittanceCore('appel'); };

window.generateCautionAffichage = function() { window._generateQuittanceCore('caution'); };

window._generateQuittanceCore = function(type) {
    let bien = getCurrentBien();
    if (!bien) { alert('Sélectionnez ou créez un bien.'); return; }
    let debut = '', fin = '';
    if (type !== 'caution') {
        debut = $('qGenPeriodeDebut').value; fin = $('qGenPeriodeFin').value;
        if (!debut || !fin) { alert('Veuillez renseigner la période couverte.'); return; }
    }
    window.renderQuittanceTableLignes();

    let fmtDate = s => { if(!s) return ''; let [y,m,d]=s.split('-'); return d+'/'+m+'/'+y; };
    let fmtEur = n => (parseFloat(n)||0).toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' €';

    let periodeStart = debut ? new Date(debut) : null, periodeEnd = fin ? new Date(fin) : null;

    let lignesSource = ((type === 'caution') ? bien.lignesCaution : bien.lignesQuittance).filter(l => !l.hidden);

    let totalDebit = lignesSource.reduce((s,l) => s + (parseFloat(l.debit)||0), 0);
    let totalCredit = lignesSource.reduce((s,l) => s + (parseFloat(l.credit)||0), 0);

    let lignesHtml = lignesSource.map(l => {
        let isDatedLine = l.libelle === 'Payé par virement bancaire, le' || l.dateDetail === true;
        let libelleAffiche = isDatedLine ? (escapeHtml(l.libelle) + (l.detail ? ' ' + escapeHtml(fmtDate(l.detail)) : '')) : (escapeHtml(l.libelle) + (l.detail ? ' : ' + escapeHtml(l.detail) : ''));
        return `<tr>
            <td style="padding:6px 10px;border-bottom:1px solid #eee;">${libelleAffiche}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${(l.debit||0) > 0 ? fmtEur(l.debit) : ''}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right;">${(l.credit||0) > 0 ? fmtEur(l.credit) : ''}</td>
        </tr>`;
    }).join('');

    function echRow(e) {
        let d = e.date ? new Date(e.date + 'T00:00:00') : null;
        let inPeriode = d && periodeStart && periodeEnd && d >= periodeStart && d <= periodeEnd;
        let isPaid = e.statut === 'Payé';
        let bg = isPaid ? 'background:#8BC34A;color:#111;' : (inPeriode ? 'background:#FFF3CD;color:#111;' : 'color:#111;');
        return `<tr style="${bg}"><td style="padding:4px 8px;border:1px solid #ccc;">${d ? fmtDate(e.date) : ''}</td><td style="padding:4px 8px;border:1px solid #ccc;">${escapeHtml(e.detail||'')}${e.detail?' = ':''}${fmtEur(e.montant)}</td></tr>`;
    }
    let echList = [];
    if (type === 'loyer' && bien.dateAnniversaire) {
        let sel = $('qEcheancierYearSelect');
        let currentSelYear = sel && sel.value ? parseInt(sel.value) : 1;
        let [y, m] = bien.dateAnniversaire.split('-').map(Number);
        let yearDates = [];
        for (let i = 0; i < 12; i++) {
            let totalMonthOffset = (currentSelYear - 1) * 12 + i;
            let targetY = y + Math.floor((m - 1 + totalMonthOffset) / 12);
            let targetM = (m - 1 + totalMonthOffset) % 12;
            yearDates.push(fmtIsoLocal(targetY, targetM, 1));
        }
        echList = yearDates.map(iso => bien.echeancier.find(e => e.date === iso) || {date:iso, detail:'', montant:0, statut:'À venir'});
    }
    let echeancierRowsA = echList.slice(0,6).map(echRow).join('');
    let echeancierRowsB = echList.slice(6,12).map(echRow).join('');
    let echYears = echList.map(e => e.date ? parseInt(e.date.slice(0,4),10) : null).filter(y => y);
    let echTitre = 'Echéancier';
    if (echYears.length) {
        let yMin = Math.min(...echYears), yMax = Math.max(...echYears);
        echTitre = 'Echéancier sur la période ' + yMin + (yMax !== yMin ? ('/' + yMax) : '');
    }

    let designation = bien.designation || { texte:'', adresse:'' };
    let nomsLocatairesHtml = bien.locataires.map(l => escapeHtml(l.nom || '')).filter(Boolean).join('<br>');
    let adresseLocativeHtml = designation.adresse ? `<span style="font-size:0.85em;color:#555;">${escapeHtml(designation.adresse)}</span><br>` : '';
    let contactsLocatairesHtml = bien.locataires.map(l => {
        let lignes = [l.email, l.tel].filter(Boolean).map(escapeHtml);
        return lignes.length ? `<span style="font-size:0.85em;color:#555;">${lignes.join('<br>')}</span>` : '';
    }).filter(Boolean).join('<br>');
    let locatairesHtml = `${nomsLocatairesHtml}<br>${adresseLocativeHtml}${contactsLocatairesHtml}`;
    let logoHtml = bien.logoDataUrl ? `<img src="${bien.logoDataUrl}" style="max-height:40px;margin-top:6px;">` : '';

    let titreMap = { loyer: 'QUITTANCE DE LOYER', appel: 'APPEL DE LOYER', caution: 'QUITTANCE DE DÉPÔT DE GARANTIE' };
    let titreAffiche = titreMap[type] || 'QUITTANCE DE LOYER';
    let periodeHtml = (type !== 'caution') ? `<p style="text-align:left;margin-bottom:10px;font-size:0.92em;font-weight:bold;">Periode couverte par le loyer: ${fmtDate(debut)} au ${fmtDate(fin)}</p>` : '';
    let echeancierHtml = (type === 'loyer') ? `<div style="margin-top:14px;font-size:0.85em;"><strong>${echTitre}:</strong>
        <div style="display:flex;gap:6px;margin-top:6px;">
            <table style="border-collapse:collapse;font-size:0.78em;width:50%;">${echeancierRowsA}</table>
            <table style="border-collapse:collapse;font-size:0.78em;width:50%;">${echeancierRowsB}</table>
        </div>
    </div>
    <p style="margin-top:12px;font-size:0.75em;">Cette quittance atteste également du paiement des termes antérieurs selon le tableau ci-dessus.</p>` : '';

    let html = `
    <div style="display:flex;justify-content:space-between;margin-bottom:14px;font-size:0.92em;">
        <div style="width:48%;"><strong>Le bailleur:</strong><div style="margin-top:4px;">${escapeHtml(bien.bailleur.nom)}<br>${escapeHtml(bien.bailleur.adresse)}<br>${escapeHtml(bien.bailleur.email)}<br>${escapeHtml(bien.bailleur.tel)}</div></div>
        <div style="width:48%;"><strong>Le(s) locataire(s):</strong><div style="margin-top:4px;">${locatairesHtml}</div></div>
    </div>
    <p style="margin-bottom:12px;font-size:0.92em;">Désignation des locaux : ${escapeHtml(designation.texte || '')}</p>
    <div style="border:0.6px solid #111;text-align:center;padding:8px;font-size:1.1em;font-weight:bold;margin-bottom:12px;">${titreAffiche}</div>
    ${periodeHtml}
    <table style="width:100%;border-collapse:collapse;margin-bottom:0;font-size:0.85em;">
        <thead><tr style="background:#333;color:white;"><th style="padding:5px 8px;text-align:left;font-weight:bold;">Libellé</th><th style="padding:5px 8px;text-align:right;font-weight:bold;">Débit</th><th style="padding:5px 8px;text-align:right;font-weight:bold;">Crédit</th></tr></thead>
        <tbody>${lignesHtml}</tbody>
        <tfoot><tr style="font-weight:bold;border-top:0.6px solid #333;"><td style="padding:6px 8px;">TOTAL</td><td style="padding:6px 8px;text-align:right;">${fmtEur(totalDebit)}</td><td style="padding:6px 8px;text-align:right;">${fmtEur(totalCredit)}</td></tr></tfoot>
    </table>
    <p style="text-align:right;margin:16px 0 3px;font-size:0.85em;">Fait à ${escapeHtml(bien.faitA || '')}, le ${fmtDate(bien.signatureDate) || new Date().toLocaleDateString('fr-FR')}</p>
    <p style="text-align:right;font-size:0.85em;">${escapeHtml(bien.signatureTexte || '')}</p>
    <div style="text-align:right;">${logoHtml}</div>
    ${(bien.commentaires||'').trim() ? `<div style="margin-top:14px;font-size:0.8em;"><strong>Commentaires:</strong><br>${escapeHtml(bien.commentaires||'').replace(/\n/g,'<br>')}</div>` : ''}
    ${echeancierHtml}
    `;

    $('quittancePreview').innerHTML = html;
    $('quittancePreviewContainer').style.display = 'block';
    $('quittancePreviewContainer').scrollIntoView({ behavior: 'smooth', block: 'start' });

    window._lastQuittanceData = {
        type, bien, debut, fin, fmtDate, fmtEur,
        totalDebit, totalCredit,
        lignes: lignesSource.map(l => ({
            libelle: l.libelle === 'Payé par virement bancaire, le' ? (l.libelle + (l.detail ? ' ' + fmtDate(l.detail) : '')) : (l.libelle + (l.detail ? ' : ' + l.detail : '')),
            debit: (l.debit||0) > 0 ? fmtEur(l.debit) : '',
            credit: (l.credit||0) > 0 ? fmtEur(l.credit) : ''
        })),
        echeancierA: echList.slice(0,6).map(e => ({
            date: e.date ? fmtDate(e.date) : '',
            detail: (e.detail||'') + (e.detail?' = ':'') + fmtEur(e.montant),
            paid: e.statut === 'Payé',
            inPeriode: (() => { let d = e.date ? new Date(e.date+'T00:00:00') : null; return d && periodeStart && periodeEnd && d >= periodeStart && d <= periodeEnd; })()
        })),
        echeancierB: echList.slice(6,12).map(e => ({
            date: e.date ? fmtDate(e.date) : '',
            detail: (e.detail||'') + (e.detail?' = ':'') + fmtEur(e.montant),
            paid: e.statut === 'Payé',
            inPeriode: (() => { let d = e.date ? new Date(e.date+'T00:00:00') : null; return d && periodeStart && periodeEnd && d >= periodeStart && d <= periodeEnd; })()
        })),
        echTitre, designation, nomsLocataires: bien.locataires.map(l => l.nom || '').filter(Boolean),
        locatairesContacts: bien.locataires.map(l => [l.email, l.tel].filter(Boolean).join(' / ')).filter(Boolean)
    };

    showToast('✅ Document généré');
};

window.getQuittanceFileName = function() {
    let d = window._lastQuittanceData;
    let type = d ? d.type : 'loyer';
    let mois = $('qGenPeriodeMois') ? $('qGenPeriodeMois').value : '';
    if (!mois) { let debut = $('qGenPeriodeDebut').value || ''; mois = debut.slice(0,7); }
    mois = mois || 'sans-date';
    if (type === 'appel') return 'Appel_loyer_' + mois + '.pdf';
    if (type === 'caution') return 'Quittance_Dépot_Garanties_' + mois + '.pdf';
    return 'Quittance_loyer_' + mois + '.pdf';
};

window.buildQuittancePdfBlob = async function() {
    let d = window._lastQuittanceData;
    if (!d) { alert("Générez d'abord la quittance."); return null; }
    let bien = d.bien;
    let pdf = new jspdf.jsPDF('p', 'mm', 'a4', { compress: true });
    let pageW = 210, marginX = 14, y = 16;
    const lh = (n) => n * 5;

    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10);
    pdf.text('Le bailleur:', marginX, y);
    pdf.text('Le(s) locataire(s):', pageW/2 + 4, y);
    y += 5;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9);
    let bLines = [bien.bailleur.nom, bien.bailleur.adresse, bien.bailleur.email, bien.bailleur.tel].filter(Boolean);
    let lLines = [...d.nomsLocataires, (d.designation.adresse||''), ...d.locatairesContacts].filter(Boolean);
    let maxLines = Math.max(bLines.length, lLines.length);
    for (let i = 0; i < maxLines; i++) {
        if (bLines[i]) pdf.text(String(bLines[i]), marginX, y);
        if (lLines[i]) pdf.text(String(lLines[i]), pageW/2 + 4, y);
        y += 4.5;
    }
    y += 4;

    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
    pdf.text('Désignation des locaux : ' + (d.designation.texte || ''), marginX, y, { maxWidth: pageW - marginX*2 });
    y += 10;

    let titreMap = { loyer: 'QUITTANCE DE LOYER', appel: 'APPEL DE LOYER', caution: 'QUITTANCE DE DÉPÔT DE GARANTIE' };
    let titre = titreMap[d.type] || 'QUITTANCE DE LOYER';
    pdf.setDrawColor(17,17,17); pdf.setLineWidth(0.6);
    pdf.rect(marginX, y, pageW - marginX*2, 10);
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13);
    pdf.text(titre, pageW/2, y + 6.8, { align: 'center' });
    y += 16;

    if (d.type !== 'caution') {
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(10);
        pdf.setFont('helvetica', 'bold');
        pdf.text('Periode couverte par le loyer: ' + d.fmtDate(d.debut) + ' au ' + d.fmtDate(d.fin), marginX, y);
        pdf.setFont('helvetica', 'normal');
        y += 6;
    }

    let rows = d.lignes.map(l => [l.libelle, l.debit, l.credit]);
    pdf.autoTable({
        startY: y,
        margin: { left: marginX, right: marginX },
        head: [['Libellé', 'Débit', 'Crédit']],
        body: rows,
        foot: [['TOTAL', d.fmtEur(d.totalDebit), d.fmtEur(d.totalCredit)]],
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 2 },
        headStyles: { fillColor: [51,51,51], textColor: 255, fontStyle: 'bold' },
        footStyles: { fontStyle: 'bold', lineWidth: { top: 0.4 }, lineColor: [51,51,51] },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
        bodyStyles: { lineColor: [230,230,230], lineWidth: 0.2 },
        didParseCell: function(hookData) {
            if (hookData.section === 'foot' && (hookData.column.index === 1 || hookData.column.index === 2)) {
                hookData.cell.styles.halign = 'right';
            }
        }
    });
    y = pdf.lastAutoTable.finalY + 10;

    pdf.setFontSize(9);
    pdf.text('Fait à ' + (bien.faitA || '') + ', le ' + (bien.signatureDate ? d.fmtDate(bien.signatureDate) : new Date().toLocaleDateString('fr-FR')), pageW - marginX, y, { align: 'right' });
    y += 5;
    if (bien.signatureTexte) { pdf.text(bien.signatureTexte, pageW - marginX, y, { align: 'right' }); y += 5; }
    if (bien.logoDataUrl) {
        try {
            let imgProps = pdf.getImageProperties(bien.logoDataUrl);
            let logoH = 12, logoW = imgProps.width * logoH / imgProps.height;
            pdf.addImage(bien.logoDataUrl, pageW - marginX - logoW, y, logoW, logoH);
            y += logoH + 4;
        } catch(e) {}
    }
    y += 4;

    if ((bien.commentaires || '').trim()) {
        pdf.setFont('helvetica', 'bold'); pdf.text('Commentaires:', marginX, y); y += 5;
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5);
        let commLines = pdf.splitTextToSize(bien.commentaires, pageW - marginX*2);
        pdf.text(commLines, marginX, y);
        y += commLines.length * 4 + 6;
        pdf.setFontSize(9);
    }

    if (d.type === 'loyer' && (d.echeancierA.length || d.echeancierB.length)) {
        pdf.setFont('helvetica', 'bold'); pdf.setFontSize(10);
        pdf.text(d.echTitre + ':', marginX, y);
        y += 4;
        function echBody(list) { return list.map(e => [e.date, e.detail]); }
        function rowColor(list) {
            return function(hookData) {
                if (hookData.section !== 'body') return;
                let e = list[hookData.row.index];
                if (!e) return;
                if (e.paid) { hookData.cell.styles.fillColor = [139,195,74]; hookData.cell.styles.textColor = [17,17,17]; }
                else if (e.inPeriode) { hookData.cell.styles.fillColor = [255,243,205]; hookData.cell.styles.textColor = [17,17,17]; }
            };
        }
        function echColumnStyles() { return { fillColor: [255,255,255] }; }
        let colWidth = (pageW - marginX*2 - 6) / 2;
        pdf.autoTable({
            startY: y, margin: { left: marginX }, tableWidth: colWidth,
            body: echBody(d.echeancierA), theme: 'grid',
            styles: { fontSize: 8, cellPadding: 1.5, lineColor: [204,204,204], lineWidth: 0.2 },
            didParseCell: rowColor(d.echeancierA)
        });
        let yA = pdf.lastAutoTable.finalY;
        pdf.autoTable({
            startY: y, margin: { left: marginX + colWidth + 6 }, tableWidth: colWidth,
            body: echBody(d.echeancierB), theme: 'grid',
            styles: { fontSize: 8, cellPadding: 1.5, lineColor: [204,204,204], lineWidth: 0.2 },
            didParseCell: rowColor(d.echeancierB)
        });
        let yB = pdf.lastAutoTable.finalY;
        y = Math.max(yA, yB) + 8;
    }

    if (d.type === 'loyer') {
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5);
        pdf.text('Cette quittance atteste également du paiement des termes antérieurs selon le tableau ci-dessus.', marginX, y, { maxWidth: pageW - marginX*2 });
    }

    return pdf;
};

window.downloadQuittancePdf = async function() {
    let bien = getCurrentBien();
    if (!bien) return;
    let pdf = await window.buildQuittancePdfBlob();
    if (!pdf) return;
    pdf.save(window.getQuittanceFileName());
    showToast('✅ PDF téléchargé');
};

window.uploadQuittancePdfToDriveFolder = async function(folderId, fileName, pdf) {
    if (!driveAccessToken) throw new Error('Connectez-vous à Drive d\'abord.');
    let blob = pdf.output('blob');
    let metadata = { name: fileName, parents: [folderId] };
    let form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', blob);
    let r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + driveAccessToken },
        body: form
    });
    if (r.status === 403) throw new Error('Accès refusé (403). Reconnectez-vous à Google Drive (bouton de déconnexion puis reconnexion) pour autoriser l\'accès complet à Drive, requis pour déposer des fichiers dans un dossier partagé.');
    if (!r.ok) throw new Error('Erreur HTTP ' + r.status);
    let data = await r.json();
    let link = data.webViewLink || ('https://drive.google.com/file/d/' + data.id + '/view');
    return { id: data.id, name: data.name, link };
};

window.uploadQuittanceToDrive = async function() {
    let bien = getCurrentBien();
    if (!bien) return;
    if (!bien.driveFolderId) { alert('Renseignez d\'abord un Partage ID Google Drive pour ce bien.'); return; }
    if (!driveAccessToken) { alert('Connectez-vous à Drive d\'abord.'); return; }
    let pdf = await window.buildQuittancePdfBlob();
    if (!pdf) return;
    let fileName = window.getQuittanceFileName();
    showToast('⬆️ Envoi vers Drive...');
    try {
        await window.uploadQuittancePdfToDriveFolder(bien.driveFolderId, fileName, pdf);
        showToast('✅ Quittance envoyée sur Google Drive');
        window.loadQuittanceDriveFiles();
    } catch(e) {
        alert('Erreur lors de l\'envoi vers Drive : ' + e.message);
    }
};

window.openQuittanceEmailModal = function(fileIdx) {
    let bien = getCurrentBien();
    if (!bien) return;
    let files = window._quittanceDriveFiles || [];
    let file = (typeof fileIdx === 'number') ? files[fileIdx] : null;
    if (!file) { alert('Fichier introuvable. Actualisez la liste des fichiers Drive puis réessayez.'); return; }
    let link = file.webViewLink || ('https://drive.google.com/file/d/' + file.id + '/view');
    let emails = [];
    if (bien.bailleur.email) emails.push(bien.bailleur.email);
    (bien.locataires || []).forEach(l => { if (l.email) emails.push(l.email); });
    let moisMatch = (file.name || '').match(/(\d{4}-\d{2})/);
    let moisLabel = moisMatch ? moisMatch[1] : '';
    $('qEmailDestinataires').value = emails.join(', ');
    $('qEmailObjet').value = 'Quittance de loyer' + (moisLabel ? (' ' + moisLabel) : '');
    $('qEmailCorps').value = 'Bonjour,\nVeuillez trouver ci-dessous le lien vers votre quittance de loyer.\nCordialement,\n' + (bien.bailleur.nom || '');
    window._quittanceEmailFileLink = link;
    $('quittanceEmailModal').style.display = 'flex';
};

window.closeQuittanceEmailModal = function() {
    $('quittanceEmailModal').style.display = 'none';
};

window.sendQuittanceEmail = async function() {
    const stripCrlf = s => String(s || '').replace(/[\r\n]+/g, ' ').trim();
    let to = ($('qEmailDestinataires').value || '').split(',').map(s => stripCrlf(s)).filter(Boolean);
    if (!to.length) { alert('Veuillez renseigner au moins un destinataire.'); return; }
    let subject = stripCrlf($('qEmailObjet').value || '');
    let body = $('qEmailCorps').value || '';
    let link = window._quittanceEmailFileLink;
    if (!link) { alert('Lien du document introuvable. Réessayez depuis la liste des fichiers Drive.'); return; }
    if (!driveAccessToken) { alert('Connectez-vous à Google d\'abord.'); return; }

    try {
        let fullBody = body + '\n\nTéléchargez votre quittance ici : ' + link;
        let rawLines = [
            'To: ' + to.join(', '),
            'Subject: ' + subject,
            'Content-Type: text/plain; charset=UTF-8',
            '',
            fullBody
        ];
        let raw = rawLines.join('\r\n');
        let encodedRaw = btoa(unescape(encodeURIComponent(raw))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');

        showToast('✉️ Envoi de l\'email...');
        let r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + driveAccessToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ raw: encodedRaw })
        });
        if (r.status === 403) {
            let errData = await r.json().catch(() => null);
            let apiMsg = errData && errData.error && errData.error.message ? errData.error.message : '';
            if (apiMsg.indexOf('has not been used') !== -1 || apiMsg.indexOf('disabled') !== -1) {
                throw new Error("L'API Gmail n'est pas activée sur le projet Google Cloud de l'application. Un administrateur doit l'activer ici : https://console.developers.google.com/apis/api/gmail.googleapis.com/overview?project=68487410553 puis patienter quelques minutes avant de réessayer.");
            }
            throw new Error('Accès refusé (403). ' + (apiMsg ? ('Détail : ' + apiMsg + '. ') : '') + 'Reconnectez-vous à Google (déconnexion puis reconnexion) pour ré-autoriser l\'envoi d\'emails.');
        }
        if (!r.ok) throw new Error('Erreur HTTP ' + r.status);

        showToast('✅ Email envoyé avec succès');
        window.closeQuittanceEmailModal();
    } catch(e) {
        alert('Erreur lors de l\'envoi de l\'email : ' + e.message);
    }
};

window.updateQuittanceDriveLink = function() {
    let container = $('qDriveFolderLink');
    if (!container) return;
    let id = ($('qDriveFolderId').value || '').trim();
    if (!id) { container.innerHTML = ''; return; }
    container.innerHTML = '<a href="https://drive.google.com/drive/folders/' + encodeURIComponent(id) + '" target="_blank" rel="noopener">🔗 Ouvrir le dossier Google Drive</a>';
};

window.loadQuittanceDriveFiles = async function() {
    let bien = getCurrentBien();
    let container = $('qDriveFilesList');
    if (!bien || !container) return;
    if (!bien.driveFolderId) { container.innerHTML = ''; return; }
    if (!driveAccessToken) { container.innerHTML = '<p style="color:var(--urgent);">Non connecté à Drive.</p>'; return; }
    container.innerHTML = '<p style="color:var(--ink-soft);">Chargement...</p>';
    try {
        let q = encodeURIComponent("'" + bien.driveFolderId + "' in parents and trashed=false");
        let r = await fetch('https://www.googleapis.com/drive/v3/files?q=' + q + '&fields=files(id,name,size,modifiedTime,webViewLink)&orderBy=modifiedTime desc&pageSize=100', {
            headers: { Authorization: 'Bearer ' + driveAccessToken }
        });
        let d = await r.json();
        if (d.error) {
            let msg = d.error.message || 'Erreur API Drive';
            if (r.status === 403) msg = 'Accès refusé (403). Reconnectez-vous à Google Drive (déconnexion puis reconnexion) pour autoriser l\'accès complet à Drive.';
            throw new Error(msg);
        }
        let files = d.files || [];
        if (!files.length) { container.innerHTML = '<p style="color:var(--ink-soft);">Aucun fichier trouvé dans ce dossier Drive.</p>'; return; }
        window._quittanceDriveFiles = files;
        let html = '<table id="qDriveFilesTable" style="width:auto;min-width:0;table-layout:auto;margin-top:8px;font-size:0.85em;border-collapse:collapse;"><thead><tr><th style="white-space:nowrap;width:1%;overflow:visible;text-overflow:unset;background:var(--bg);position:sticky;top:0;z-index:1;padding:8px 12px;border:1px solid var(--ink-faint);text-align:left;">Nom</th><th style="white-space:nowrap;width:1%;overflow:visible;text-overflow:unset;background:var(--bg);position:sticky;top:0;z-index:1;padding:8px 12px;border:1px solid var(--ink-faint);text-align:right;">Taille</th><th style="white-space:nowrap;width:1%;overflow:visible;text-overflow:unset;background:var(--bg);position:sticky;top:0;z-index:1;padding:8px 12px;border:1px solid var(--ink-faint);text-align:left;">Modifié le</th><th style="white-space:nowrap;width:1%;overflow:visible;text-overflow:unset;background:var(--bg);position:sticky;top:0;z-index:1;padding:8px 12px;border:1px solid var(--ink-faint);text-align:left;">Actions</th></tr></thead><tbody>';
        files.forEach(function(f, idx) {
            let size = f.size ? Math.round(f.size/1024) + ' Ko' : '—';
            let date = f.modifiedTime ? new Date(f.modifiedTime).toLocaleString('fr-FR') : '—';
            let safeName = (f.name||'').replace(/</g,'&lt;');
            let openBtn = f.webViewLink ? '<a href="' + f.webViewLink + '" target="_blank" rel="noopener" class="btn btn-outline" style="padding:0;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;" title="Ouvrir le PDF">'
                + '<img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQlI7shKwcGllXkOK3vefOrvR5L7y3skacOXnecHa--bA&s=10" alt="PDF" style="height:16px;width:16px;object-fit:contain;" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{textContent:\'📄\',style:\'font-size:1em;\'}))">'
                + '</a>' : '';
            let mailBtn = '<button class="btn btn-outline" style="padding:0;width:30px;height:30px;display:inline-flex;align-items:center;justify-content:center;vertical-align:middle;margin-left:6px;" title="Envoyer par email" onclick="window.openQuittanceEmailModal(' + idx + ')">'
                + '<img src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTEmLD1UEsMo-UCASpAhIfkkW4HZ5omPNlZlla3NML8_g&s=10" alt="Email" style="height:16px;width:16px;object-fit:contain;" onerror="this.replaceWith(Object.assign(document.createElement(\'span\'),{textContent:\'✉️\',style:\'font-size:1em;\'}))">'
                + '</button>';
            html += '<tr><td style="white-space:nowrap;padding:8px 12px;border:1px solid var(--ink-faint);">' + safeName + '</td><td style="text-align:right;white-space:nowrap;padding:8px 12px;border:1px solid var(--ink-faint);">' + size + '</td><td style="white-space:nowrap;padding:8px 12px;border:1px solid var(--ink-faint);">' + date + '</td><td style="white-space:nowrap;vertical-align:middle;padding:8px 12px;border:1px solid var(--ink-faint);">' + openBtn + mailBtn + '</td></tr>';
        });
        html += '</tbody></table>';
        container.innerHTML = html;
    } catch(e) {
        container.innerHTML = '<p style="color:var(--urgent);">Erreur : ' + e.message + '</p>';
    }
};


// ── Régularisation de charges ──
function loadFiscalStartMonthSyndic() {
    let v = localStorage.getItem('f_fiscal_syndic_' + currentAccountId);
    fiscalStartMonthSyndic = v ? parseInt(v, 10) : 10;
    if (isNaN(fiscalStartMonthSyndic) || fiscalStartMonthSyndic < 1 || fiscalStartMonthSyndic > 12) fiscalStartMonthSyndic = 10;
}
window.setFiscalStartMonthSyndic = function(v) {
    fiscalStartMonthSyndic = parseInt(v, 10) || 10;
    localStorage.setItem('f_fiscal_syndic_' + currentAccountId, String(fiscalStartMonthSyndic));
    triggerSave(true);
    if (typeof window.populateRegulExerciceSelect === 'function') window.populateRegulExerciceSelect();
    showToast('Exercice syndic mis à jour ✓');
};
window.toggleRegulOption = function(checked) {
    regulEnabled = checked;
    localStorage.setItem('f_regul_enabled_' + currentAccountId, checked ? '1' : '0');
    let tab = $('tabRegul'); if(tab) tab.style.display = checked ? '' : 'none';
    let grp = $('regulSettingsGroup'); if(grp) grp.style.display = checked ? 'block' : 'none';
    if (!checked) {
        let activeTab = document.querySelector('.tab-btn.active');
        if (activeTab && activeTab.dataset.target === 'view-regul') {
            let sumTab = document.querySelector('.tab-btn[data-target="view-summary"]');
            if (sumTab) sumTab.click();
        }
    }
    triggerSave(false);
};
function applyRegulOptionState() {
    let enabled = regulEnabled;
    let tab = $('tabRegul'); if (tab) tab.style.display = enabled ? '' : 'none';
    let cb = $('optRegulCb'); if (cb) cb.checked = enabled;
    let grp = $('regulSettingsGroup'); if (grp) grp.style.display = enabled ? 'block' : 'none';
    let sel = $('fiscalStartMonthSyndicSelect'); if (sel) sel.value = String(fiscalStartMonthSyndic);
    if (enabled) {
        window.renderRegulBiens();
        window.populateRegulExerciceSelect();
    }
}
function getRegulBien(id) {
    if (!id) return null;
    let b = quittancesBiens.find(b => b.id === id);
    if (b && !b.regulCols) {
        b.regulCols = [
            {id: 'c1', name: 'Provisions reçues'},
            {id: 'c2', name: 'Charges communes'},
            {id: 'c3', name: 'Charges individuelles (eau)'},
            {id: 'c4', name: 'Charges exceptionnelles'},
            {id: 'c5', name: 'Taxe d\'ordure ménagère'}
        ];
        b.regulData = {}; b.regulValidated = {}; b.regulClosed = {};
        b.dateLocation = '';
    }
    return b;
}
window.selectRegulBien = function(id) {
    currentRegulBienId = id;
    window.populateRegulExerciceSelect();
};
window.renderRegulBiens = function() {
    let sel = $('regulBienSelect');
    if (!sel) return;
    if (quittancesBiens.length > 0 && (!currentRegulBienId || !quittancesBiens.find(b => b.id === currentRegulBienId))) {
        currentRegulBienId = quittancesBiens[0].id;
    }
    sel.innerHTML = quittancesBiens.map(b => `<option value="${b.id}" ${b.id===currentRegulBienId?'selected':''}>${escapeHtml(b.nom)}</option>`).join('');
};
window.populateRegulExerciceSelect = function() {
    let sel = $('regulExerciceSelect');
    let bien = getRegulBien(currentRegulBienId);
    if (!sel) return;
    if (!bien) {
        $('regulGrid').innerHTML = '';
        $('regulEmptyState').style.display = 'block';
        return;
    }
    $('regulEmptyState').style.display = 'none';
    
    let startY = new Date().getFullYear();
    let moveInDate = bien.dateAnniversaire || '';
    if (moveInDate) {
        let [y,m] = moveInDate.split('-');
        let mi = parseInt(m, 10);
        startY = parseInt(y, 10);
        if (mi < fiscalStartMonthSyndic && fiscalStartMonthSyndic !== 1) startY--;
    }
    
    let currentY = new Date().getFullYear();
    let currentM = new Date().getMonth() + 1;
    let currentExY = currentY;
    if (currentM < fiscalStartMonthSyndic && fiscalStartMonthSyndic !== 1) currentExY--;
    
    let minExY = startY;
    let maxExY = Math.max(startY, currentExY);
    
    let dataExs = Object.keys(bien.regulData || {});
    dataExs.forEach(ex => {
        let exY = parseInt(ex.split('-')[0], 10);
        if (exY < minExY) minExY = exY;
        if (exY > maxExY) maxExY = exY;
    });

    let opts = '';
    let prevVal = sel.value;
    let sortedExs = [];
    for (let y = minExY; y <= maxExY; y++) {
        let label = fiscalStartMonthSyndic === 1 ? String(y) : `${y}-${y+1}`;
        sortedExs.push(label);
        opts += `<option value="${label}">${label}</option>`;
    }
    
    sel.innerHTML = opts;
    if (sortedExs.includes(prevVal)) sel.value = prevVal;
    else sel.value = sortedExs[sortedExs.length - 1];
    
    window.renderRegul();
};
function getRegulMonthsForExercice(ex) {
    let parts = ex.split('-');
    let startY = parseInt(parts[0], 10);
    let months = [];
    for (let i = 0; i < 12; i++) {
        let mi = ((fiscalStartMonthSyndic - 1 + i) % 12) + 1;
        let yy = (mi >= fiscalStartMonthSyndic) ? startY : (parts.length > 1 ? parseInt(parts[1], 10) : startY + 1);
        if (fiscalStartMonthSyndic === 1) yy = startY;
        months.push({ m: String(mi).padStart(2,'0'), y: yy });
    }
    return months;
}

function getProvisionFromEcheancier(bien, yyyy_mm) {
    if(!bien || !bien.echeancier) return null;
    let match = bien.echeancier.find(e => e.date && e.date.startsWith(yyyy_mm) && e.statut === 'Payé');
    if(match) {
        let parts = String(match.detail||'').split('+').map(s => parseFloat(s.trim().replace(',', '.'))).filter(n => !isNaN(n));
        if(parts.length > 1) return parts.slice(1).reduce((a,b)=>a+b, 0);
        return parseFloat(match.montant) || 0;
    }
    return null;
}

const regulIndicatorHtml = (val, provVal, mKey, cId) => {
    if (provVal === null) return '';
    let bEmpty = (val === null || val === undefined || val === '');
    let dataAttrs = `data-mkey="${mKey}" data-cid="${cId}" data-real="${provVal}"`;
    if (!bEmpty && val !== provVal) return `<span class="budget-indicator ind-warn" ${dataAttrs} onclick="window.onRegulIndicatorTripleClick(event, this)">⚠️</span>`;
    if (bEmpty) return `<span class="budget-indicator ind-dot-red" ${dataAttrs} onclick="window.onRegulIndicatorTripleClick(event, this)"></span>`;
    return '<span class="budget-indicator ind-check">✔︎</span>';
};

window.renderRegul = function() {
    let container = $('regulGrid');
    let bien = getRegulBien(currentRegulBienId);
    if (!bien || !container) { if(container) container.innerHTML = ''; return; }
    
    let ex = $('regulExerciceSelect').value;
    if (!ex) return;
    
    if (!bien.regulData) bien.regulData = {};
    if (!bien.regulData[ex]) bien.regulData[ex] = {};
    if (!bien.regulClosed) bien.regulClosed = {};
    if (!bien.regulValidated) bien.regulValidated = {};
    
    let isClosed = bien.regulClosed[ex];
    let isValidated = bien.regulValidated[ex];
    
    let months = getRegulMonthsForExercice(ex);
    let cols = bien.regulCols || [];
    
    let html = '<div style="text-align:center;"><table class="tcd-native regul-table" cellspacing="0" cellpadding="0">';
    html += '<thead><tr><th class="tcd-col-axis" style="text-align:left;">Dates</th>';
    cols.forEach(c => { 
        let isProv = c.name.toLowerCase().includes('provision');
        let isExcept = c.name.toLowerCase().includes('exceptionnelle');
        let isWater = c.name.toLowerCase().includes('eau') || c.name.toLowerCase().includes('individuelle');
        let calcIcon = '';
        if (!isProv && !isExcept) {
            if (isWater) {
                calcIcon = ` <span style="cursor:pointer;font-size:1.1em;" onclick="window.openWaterModal('${c.id}')" title="Distribution coûts (Eau)">🪄</span>`;
            } else {
                calcIcon = ` <span style="cursor:pointer;font-size:1.1em;" onclick="window.openDistributeCostsModal('${c.id}')" title="Distribution coûts">🪄</span>`;
            }
        }
        html += `<th class="tcd-th-month">${escapeHtml(c.name)}${calcIcon}</th>`; 
    });
    html += '</tr></thead><tbody>';
    
    let colTotals = {};
    cols.forEach(c => colTotals[c.id] = 0);
    
    const monthNames = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    
    months.forEach(mo => {
        let mKey = `${mo.y}-${mo.m}`;
        let rowLabel = `${monthNames[parseInt(mo.m, 10)]} ${mo.y}`;
        
        let moveInDate = bien.dateAnniversaire || '';
        let isGreyed = false;
        let my=0, mm=0, md=0;
        if (moveInDate) {
            let parts = moveInDate.split('-');
            my = parseInt(parts[0], 10); mm = parseInt(parts[1], 10); md = parseInt(parts[2], 10);
            let moY = parseInt(mo.y, 10), moM = parseInt(mo.m, 10);
            if (moY < my || (moY === my && moM < mm)) isGreyed = true;
        }
        
        html += `<tr class="tcd-row-main-tr ${isGreyed ? 'regul-row-disabled' : ''}"><td class="tcd-col-axis">${rowLabel}</td>`;
        if(!bien.regulData[ex][mKey]) bien.regulData[ex][mKey] = {};
        
        cols.forEach(c => {
            let val = bien.regulData[ex][mKey][c.id];
            let isEmpty = (val === undefined || val === null || val === '');
            let actualVal = isEmpty ? 0 : parseFloat(val);
            if (!isGreyed) colTotals[c.id] += actualVal;
            
            let isProv = c.name.toLowerCase().includes('provision');
            let provVal = null;
            if (isProv) {
                provVal = getProvisionFromEcheancier(bien, mKey);
            }
            let indHtml = (!isGreyed && isProv && provVal !== null) ? regulIndicatorHtml(isEmpty ? null : actualVal, provVal, mKey, c.id) : '';

            // Handle Flags — v3.3.13 : badge/bouton bascule Estimation ⇄ Réel, fusionné avec la déclaration du montant
            let flag = bien.regulFlags && bien.regulFlags[ex] && bien.regulFlags[ex][mKey] && bien.regulFlags[ex][mKey][c.id];
            let flagHtml = '';
            if (!isEmpty && !isProv) {
                let isReal = flag === 'real';
                if (isClosed || isGreyed) {
                    flagHtml = ` <span class="regul-flag-badge ${isReal ? 'is-real' : 'is-est'}">${isReal ? '✔︎ Réel' : '~ Estim.'}</span>`;
                } else {
                    flagHtml = ` <button type="button" class="regul-flag-toggle ${isReal ? 'is-real' : 'is-est'}" onclick="window.toggleRegulFlag('${mKey}','${c.id}')" title="Cliquer pour basculer Estimation ⇄ Réel">${isReal ? '✔︎ Réel' : '~ Estim.'}</button>`;
                }
            }

            if (isClosed || isGreyed) {
                html += `<td class="tcd-cell"><span class="budget-val-ro">${!isEmpty ? formatCurrency(actualVal) : ''}</span>${flagHtml}${indHtml}</td>`;
            } else {
                html += `<td class="tcd-cell"><span class="budget-val" contenteditable="true" 
                    onfocus="window.onBudgetCellFocus(this)"
                    onblur="window.setRegulCell('${mKey}', '${c.id}', this.textContent)"
                    onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">${!isEmpty ? formatCurrency(actualVal) : ''}</span>${flagHtml}${indHtml}</td>`;
            }
        });
        html += '</tr>';
    });
    
    html += '<tr class="tcd-total-row" style="pointer-events: none;"><td class="tcd-col-axis">TOTAL</td>';
    cols.forEach(c => {
        html += `<td class="tcd-cell"><span class="budget-val-ro">${formatCurrency(colTotals[c.id])}</span></td>`;
    });
    html += '</tr>';
    
    // Calculate total prov vs total charges
    let sumProv = 0;
    let sumCharges = 0;
    let chargeCols = 0;
    cols.forEach(c => {
        let isProv = c.name.toLowerCase().includes('provision');
        if (isProv) {
            sumProv += colTotals[c.id];
        } else {
            sumCharges += colTotals[c.id];
            chargeCols++;
        }
    });
    
    html += '<tr class="tcd-total-row" style="background-color: #374151 !important; color: #fff !important; pointer-events: none;">';
    html += '<td class="tcd-col-axis" style="background-color: #374151 !important; color: #fff !important; font-weight:700;">TOTAL (regroupé)</td>';
    let chargeColspanOutputted = false;
    cols.forEach(c => {
        let isProv = c.name.toLowerCase().includes('provision');
        if (isProv) {
            html += `<td class="tcd-cell" style="background-color: #374151 !important; color: #fff !important; font-weight:700;"><span class="budget-val-ro" style="color:#fff !important;">${formatCurrency(colTotals[c.id])}</span></td>`;
        } else {
            if (!chargeColspanOutputted) {
                html += `<td class="tcd-cell" colspan="${chargeCols}" style="background-color: #374151 !important; color: #fff !important; font-weight:700; text-align:center;"><span class="budget-val-ro" style="color:#fff !important;">${formatCurrency(sumCharges)}</span></td>`;
                chargeColspanOutputted = true;
            }
        }
    });
    html += '</tr>';
    
    let diff = sumProv - sumCharges;
    let diffStr = formatCurrency(Math.abs(diff));
    let diffText = diff >= 0 ? `Trop perçu par le bailleur : ${diffStr} à rembourser au locataire` : `Déficit de paiement : ${diffStr} à réclamer au locataire`;
    if (sumProv === 0 && sumCharges === 0) diffText = "-";
    
    html += '<tr class="tcd-total-row" style="background-color: #f3f4f6 !important; color: #111 !important; pointer-events: none;">';
    html += `<td class="tcd-col-axis" style="background-color: #f3f4f6 !important; color: #111 !important; font-weight:700;">Différence Provisions / Réel</td>`;
    html += `<td class="tcd-cell" colspan="${cols.length}" style="background-color: #f3f4f6 !important; color: #111 !important; font-weight:700; text-align:center;">${diffText}</td>`;
    html += '</tr>';
    
    html += '</tbody></table></div>';
    
    if (!bien.regulExplications) bien.regulExplications = {};
    let explication = bien.regulExplications[ex] || '';
    
    html += `<div style="margin-top:20px; max-width: 800px; margin-left: auto; margin-right: auto; text-align: left;">
        <label style="font-weight:700;font-size:0.85em;display:block;margin-bottom:4px;">Explications :</label>
        <div class="input-text" style="width:100%; min-height:100px; font-size:0.85em; overflow-y:auto; background:var(--surface); white-space: pre-wrap; outline: none;" contenteditable="true" 
            onblur="window.saveRegulExplication('${ex}', this.innerHTML)">${explication}</div>
    </div>`;
    
    container.innerHTML = html;
    
    let bannerV = $('regulValidatedBanner');
    if (isValidated) { bannerV.style.display='block'; bannerV.innerHTML=`✅ Validé`; }
    else { bannerV.style.display='none'; }
    
    let bannerC = $('regulCloseBanner');
    let btnC = $('btnCloturerRegul');
    if (isClosed) {
        bannerC.style.display='block'; bannerC.innerHTML=`🔒 Exercice clôturé`;
        if (btnC) btnC.textContent = '🔓 Rouvrir Exercice';
    } else {
        bannerC.style.display='none';
        if (btnC) btnC.textContent = '🔒 Clôturer';
    }
    
    let fs = parseInt(localStorage.getItem('f_regul_fontsize') || '13', 10);
    document.querySelectorAll('#regulGrid .tcd-native th, #regulGrid .tcd-native td').forEach(el => {
        el.style.fontSize = fs + 'px';
    });
};

window.setRegulCellSilent = function(mKey, colId, text) {
    let bien = getRegulBien(currentRegulBienId);
    let ex = $('regulExerciceSelect').value;
    if (!bien.regulData[ex]) bien.regulData[ex] = {};
    if (!bien.regulData[ex][mKey]) bien.regulData[ex][mKey] = {};
    let cleaned = String(text||'').replace(/[\s\u00A0\u202F€a-zA-Z~✔︎]/g,'').replace(',', '.').trim();
    // v3.3.12 : ne modifier (et signaler un changement) que si la valeur ou le flag diffère réellement
    let existing = bien.regulData[ex][mKey][colId];
    let hadFlag = !!(bien.regulFlags && bien.regulFlags[ex] && bien.regulFlags[ex][mKey] && (colId in bien.regulFlags[ex][mKey]));
    let changed = false;
    if (cleaned === '') {
        if (existing !== undefined) { delete bien.regulData[ex][mKey][colId]; changed = true; }
        if (hadFlag) { delete bien.regulFlags[ex][mKey][colId]; changed = true; }
    } else {
        let n = parseFloat(cleaned);
        if (!isNaN(n)) {
            if (existing !== n) { bien.regulData[ex][mKey][colId] = n; changed = true; }
            // v3.3.13 : toute déclaration manuelle démarre en "Estimation" ; à confirmer via le bouton bascule dans la cellule
            let col = (bien.regulCols || []).find(c => c.id === colId);
            let isProv = col && col.name.toLowerCase().includes('provision');
            if (!hadFlag && !isProv) {
                if (!bien.regulFlags) bien.regulFlags = {};
                if (!bien.regulFlags[ex]) bien.regulFlags[ex] = {};
                if (!bien.regulFlags[ex][mKey]) bien.regulFlags[ex][mKey] = {};
                bien.regulFlags[ex][mKey][colId] = 'est';
                changed = true;
            }
        }
    }
    return changed;
};

window.toggleRegulFlag = function(mKey, colId) {
    let bien = getRegulBien(currentRegulBienId);
    if (!bien) return;
    let ex = $('regulExerciceSelect').value;
    if (bien.regulClosed && bien.regulClosed[ex]) return;
    if (!bien.regulFlags) bien.regulFlags = {};
    if (!bien.regulFlags[ex]) bien.regulFlags[ex] = {};
    if (!bien.regulFlags[ex][mKey]) bien.regulFlags[ex][mKey] = {};
    let cur = bien.regulFlags[ex][mKey][colId] || 'est';
    bien.regulFlags[ex][mKey][colId] = (cur === 'est') ? 'real' : 'est';
    triggerSave(true);
    window.renderRegul();
};

window.saveRegulExplication = function(ex, text) {
    let bien = getRegulBien(currentRegulBienId);
    if (!bien) return;
    if (!bien.regulExplications) bien.regulExplications = {};
    bien.regulExplications[ex] = text;
    triggerSave(true);
};

window._dcState = { colId: null, isTOM: false, spansYears: false, y1: null, y2: null, prevSum: 0, annualizedPrevSum: 0, wasIncomplete: false, prevDaysPresent: 0, prevDaysTotal: 0 };

window.openDistributeCostsModal = function(colId) {
    let bien = getRegulBien(currentRegulBienId);
    if (!bien) return;
    let ex = $('regulExerciceSelect').value;
    if (bien.regulClosed && bien.regulClosed[ex]) return alert('Exercice clos.');
    
    let moveInDate = bien.dateAnniversaire;
    if (!moveInDate) return alert("La date d'emménagement n'est pas renseignée dans les quittances pour ce bien.");
    
    let col = bien.regulCols.find(c => c.id === colId);
    if (!col) return;
    
    $('dcColName').textContent = col.name;
    
    window._dcState.colId = colId;
    window._dcState.isTOM = col.name.toLowerCase().includes('taxe') || col.name.toLowerCase().includes('ordure');
    
    let months = getRegulMonthsForExercice(ex);
    window._dcState.y1 = months[0].y;
    window._dcState.y2 = months[11].y;
    window._dcState.spansYears = (window._dcState.y1 !== window._dcState.y2);
    
    let exParts = ex.split('-');
    let prevEx = '';
    if (exParts.length === 1) {
        prevEx = String(parseInt(exParts[0]) - 1);
    } else {
        prevEx = String(parseInt(exParts[0]) - 1) + '-' + String(parseInt(exParts[1]) - 1);
    }
    
    let prevSum = 0;
    if (bien.regulData && bien.regulData[prevEx]) {
        Object.keys(bien.regulData[prevEx]).forEach(mK => {
            let v = bien.regulData[prevEx][mK][colId];
            if (v && !isNaN(v)) prevSum += parseFloat(v);
        });
    }
    
    let prevExMonths = getRegulMonthsForExercice(prevEx);
    let parts = moveInDate.split('-');
    let my = parseInt(parts[0], 10), mm = parseInt(parts[1], 10), md = parseInt(parts[2], 10);
    
    let prevDaysTotal = 0;
    let prevDaysPresent = 0;
    
    prevExMonths.forEach(mo => {
        let moY = parseInt(mo.y, 10), moM = parseInt(mo.m, 10);
        let daysInMonth = new Date(moY, moM, 0).getDate();
        prevDaysTotal += daysInMonth;
        
        if (moY > my || (moY === my && moM > mm)) {
            prevDaysPresent += daysInMonth;
        } else if (moY === my && moM === mm) {
            prevDaysPresent += (daysInMonth - md + 1);
        }
    });
    
    let annualizedPrevSum = prevSum;
    let wasIncomplete = false;
    if (prevDaysPresent > 0 && prevDaysPresent < prevDaysTotal) {
        wasIncomplete = true;
        annualizedPrevSum = prevSum * (prevDaysTotal / prevDaysPresent);
    }
    
    window._dcState.prevSum = prevSum;
    window._dcState.annualizedPrevSum = annualizedPrevSum;
    window._dcState.wasIncomplete = wasIncomplete;
    window._dcState.prevDaysPresent = prevDaysPresent;
    window._dcState.prevDaysTotal = prevDaysTotal;
    
    // v3.3.13 : griser "Reprise exercice précédent" si aucun exercice précédent n'existe
    let hasPrevEx = !!(bien.regulData && bien.regulData[prevEx] && Object.keys(bien.regulData[prevEx]).length > 0);
    window._dcState.hasPrevEx = hasPrevEx;
    let prevRadio = $('dcTypePrev');
    if (prevRadio) prevRadio.disabled = !hasPrevEx;
    
    document.querySelector('input[name="dcType"][value="amount"]').checked = true;
    
    window.dcUpdateUI();
    $('distributeCostsModal').classList.add('open');
};

window.closeDistributeCostsModal = function() {
    $('distributeCostsModal').classList.remove('open');
};

window.dcUpdateUI = function() {
    let type = document.querySelector('input[name="dcType"]:checked').value;
    let prevGrp = $('dcPrevGroup');
    let inpGrp = $('dcInputGroup');
    let s = window._dcState;
    let fmtEur = n => n.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' €';
    
    if (type === 'prev') {
        prevGrp.style.display = 'block';
        inpGrp.style.display = 'none';
        
        let html = '';
        if (s.wasIncomplete) {
            html += `<div style="font-size:0.95em; margin-bottom:8px;">Total réel exercice précédent : <strong>${fmtEur(s.prevSum)}</strong> (incomplet, ${s.prevDaysPresent}/${s.prevDaysTotal} jours)</div>`;
            html += `<div style="font-size:0.95em; margin-bottom:8px;">Base annualisée estimée : <strong id="dcPrevTotal">${fmtEur(s.annualizedPrevSum)}</strong></div>`;
        } else {
            html += `<div style="font-size:0.95em; margin-bottom:8px;">Total de la colonne pour l'exercice précédent : <strong id="dcPrevTotal">${fmtEur(s.prevSum)}</strong></div>`;
        }
        html += `<div style="display:flex;align-items:center;gap:8px; font-size:0.95em;">
            Augmentation (%) : <input type="number" id="dcPrevPct" class="input-text" style="width:80px;" value="0">
        </div>`;
        prevGrp.innerHTML = html;
        
    } else {
        prevGrp.style.display = 'none';
        inpGrp.style.display = 'block';
        
        let html = '';
        if (window._dcState.isTOM && window._dcState.spansYears) {
            html += `<div style="font-size:0.95em; margin-bottom:12px; color:var(--ink-soft);">Cette taxe étant souvent annuelle, veuillez renseigner le coût pour chaque année civile couverte par l'exercice :</div>`;
            html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
                        <label style="width:100px;font-weight:600;">Année ${window._dcState.y1} :</label>
                        <input type="number" id="dcInputY1" class="input-text" style="width:120px;" placeholder="Ex: 250"> €
                     </div>`;
            html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
                        <label style="width:100px;font-weight:600;">Année ${window._dcState.y2} :</label>
                        <input type="number" id="dcInputY2" class="input-text" style="width:120px;" placeholder="Ex: 260"> €
                     </div>`;
        } else {
            html += `<div style="display:flex;align-items:center;gap:8px;font-size:0.95em;font-weight:600;margin-bottom:12px;">
                        <label>Montant total :</label>
                        <input type="number" id="dcInputTotal" class="input-text" style="width:120px;" placeholder="Ex: 500"> €
                     </div>`;
        }
        // v3.3.14 : bascule Estimation / Réel fusionnée avec la déclaration du montant (charges communes et TOM)
        html += `<div style="display:flex;gap:16px;">
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.9em;">
                        <input type="radio" name="dcAmountFlag" value="est" checked style="accent-color:var(--warn);"> ~ Estimation
                    </label>
                    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:0.9em;">
                        <input type="radio" name="dcAmountFlag" value="real" style="accent-color:var(--done);"> ✔︎ Réel
                    </label>
                 </div>`;
        inpGrp.innerHTML = html;
    }
};

window.applyDistributeCosts = function() {
    let type = document.querySelector('input[name="dcType"]:checked').value;
    let s = window._dcState;
    
    let totalY1 = 0, totalY2 = 0, totalGlob = 0;
    // v3.3.14 : le statut Estimation/Réel vient désormais du bouton bascule fusionné avec la déclaration du montant
    let flag = 'est';
    let pct = 0;
    
    if (type === 'prev') {
        let pctInput = $('dcPrevPct');
        pct = pctInput ? (parseFloat(pctInput.value) || 0) : 0;
        totalGlob = s.annualizedPrevSum * (1 + pct / 100);
        totalY1 = totalGlob;
        totalY2 = totalGlob;
    } else {
        let flagInput = document.querySelector('input[name="dcAmountFlag"]:checked');
        flag = flagInput ? flagInput.value : 'est';
        if (s.isTOM && s.spansYears) {
            let el1 = $('dcInputY1'), el2 = $('dcInputY2');
            totalY1 = el1 ? parseFloat(el1.value.replace(',','.')) || 0 : 0;
            totalY2 = el2 ? parseFloat(el2.value.replace(',','.')) || 0 : 0;
        } else {
            let el = $('dcInputTotal');
            totalGlob = el ? parseFloat(el.value.replace(',','.')) || 0 : 0;
            totalY1 = totalGlob;
            totalY2 = totalGlob;
        }
    }
    
    let bien = getRegulBien(currentRegulBienId);
    let ex = $('regulExerciceSelect').value;
    let col = bien.regulCols.find(c => c.id === s.colId);
    let moveInDate = bien.dateAnniversaire;
    let parts = moveInDate.split('-');
    let my = parseInt(parts[0], 10), mm = parseInt(parts[1], 10), md = parseInt(parts[2], 10);
    
    let months = getRegulMonthsForExercice(ex);
    
    if (!bien.regulData) bien.regulData = {};
    if (!bien.regulData[ex]) bien.regulData[ex] = {};
    if (!bien.regulFlags) bien.regulFlags = {};
    if (!bien.regulFlags[ex]) bien.regulFlags[ex] = {};
    
    let isFirstEverMonth = false; 
    let activeMonthsCount = 0;
    let startLabel = '';
    let endLabel = '';
    const monthNames = ['','Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

    let firstMonthProrata = 0, firstMonthDaysPresent = 0, firstMonthDaysTotal = 0;
    let monthlyRoundedY1 = Math.round((totalY1 / 12) * 100) / 100;
    let monthlyRoundedY2 = Math.round((totalY2 / 12) * 100) / 100;

    months.forEach((mo) => {
        let moY = parseInt(mo.y, 10), moM = parseInt(mo.m, 10);
        let mKey = `${mo.y}-${mo.m}`;
        
        let isGreyed = false;
        if (moY < my || (moY === my && moM < mm)) isGreyed = true;
        
        if (!isGreyed) {
            if (activeMonthsCount === 0) startLabel = `${monthNames[moM].toLowerCase().substring(0,3)} ${String(moY).substring(2)}`;
            endLabel = `${monthNames[moM].toLowerCase().substring(0,3)} ${String(moY).substring(2)}`;
            activeMonthsCount++;
            
            if (!bien.regulData[ex][mKey]) bien.regulData[ex][mKey] = {};
            if (!bien.regulFlags[ex][mKey]) bien.regulFlags[ex][mKey] = {};
            
            let monthlyBase = (mo.y === s.y1) ? (totalY1 / 12) : (totalY2 / 12);
            let monthlyRounded = (mo.y === s.y1) ? monthlyRoundedY1 : monthlyRoundedY2;
            
            if (moY === my && moM === mm) {
                isFirstEverMonth = true;
                firstMonthDaysTotal = new Date(moY, moM, 0).getDate();
                firstMonthDaysPresent = firstMonthDaysTotal - md + 1; 
                firstMonthProrata = Math.round(monthlyBase * firstMonthDaysPresent / firstMonthDaysTotal * 100) / 100;
                bien.regulData[ex][mKey][s.colId] = firstMonthProrata;
                bien.regulFlags[ex][mKey][s.colId] = flag;
            } else {
                bien.regulData[ex][mKey][s.colId] = monthlyRounded;
                bien.regulFlags[ex][mKey][s.colId] = flag;
            }
        } else {
            if (bien.regulData[ex] && bien.regulData[ex][mKey]) delete bien.regulData[ex][mKey][s.colId];
            if (bien.regulFlags[ex] && bien.regulFlags[ex][mKey]) delete bien.regulFlags[ex][mKey][s.colId];
        }
    });
    
    let fmtEur = n => n.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' €';
    
    let text = `<br><br><b>${escapeHtml(col.name)}</b><br>`;
    text += `Locataires présents entre ${startLabel} et ${endLabel}.<br>`;
    
    if (type === 'prev') {
        text += `Reprise de l'exercice précédent (${pct}% d'augmentation).<br>`;
        if (s.wasIncomplete) {
            text += `L'exercice précédent était incomplet (${s.prevDaysPresent} jours sur ${s.prevDaysTotal}). Le montant réel de ${fmtEur(s.prevSum)} a été annualisé à ${fmtEur(s.annualizedPrevSum)}.<br>`;
        }
    }
    
    if (s.isTOM && s.spansYears && type !== 'prev') {
        text += `Montant global ${s.y1} = ${fmtEur(totalY1)}, Montant global ${s.y2} = ${fmtEur(totalY2)}<br>`;
        text += `1/12ème ${s.y1} = ${fmtEur(monthlyRoundedY1)}/mois, 1/12ème ${s.y2} = ${fmtEur(monthlyRoundedY2)}/mois<br>`;
    } else {
        text += `Montant global = ${fmtEur(totalGlob)}<br>`;
        text += `1/12ème de ${fmtEur(totalGlob)} = ${fmtEur(monthlyRoundedY1)} par mois<br>`;
    }
    
    if (isFirstEverMonth) {
        let dateLocStr = `${String(md).padStart(2,'0')}/${String(mm).padStart(2,'0')}/${my}`;
        let baseForProrata = (my === parseInt(s.y1)) ? monthlyRoundedY1 : monthlyRoundedY2;
        text += `Particularité pour le 1er mois le ${dateLocStr}. Prorata de ${firstMonthDaysPresent}/${firstMonthDaysTotal} (${firstMonthDaysPresent} jours présents / ${firstMonthDaysTotal} jours du mois) = ${fmtEur(baseForProrata)} x ${firstMonthDaysPresent} / ${firstMonthDaysTotal} = ${fmtEur(firstMonthProrata)}<br>`;
    }
    
    if (!bien.regulExplications) bien.regulExplications = {};
    let oldText = bien.regulExplications[ex] || '';
    if (oldText && oldText.includes('\n')) oldText = oldText.replace(/\n/g, '<br>');
    
    function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    
    let regex = new RegExp(`(?:<br>|\\n|\\s)*(?:<b>|<strong>)\\s*${escapeRegExp(escapeHtml(col.name))}\\s*(?:<\\/b>|<\\/strong>)(?:<br>|\\n)[\\s\\S]*?(?=(?:<br>|\\n|\\s)*(?:<b>|<strong>)|$)`, 'i');
    if (regex.test(oldText)) {
        oldText = oldText.replace(regex, text);
    } else {
        oldText = oldText + text;
    }
    bien.regulExplications[ex] = oldText.trim();
    if (bien.regulExplications[ex].startsWith('<br>')) {
        bien.regulExplications[ex] = bien.regulExplications[ex].replace(/^(?:<br>\s*)+/, '');
    }
    
    triggerSave(true);
    window.closeDistributeCostsModal();
    window.renderRegul();
    showToast('Distribution appliquée ✓');
};

window.openWaterModal = function(colId) {
    let bien = getRegulBien(currentRegulBienId);
    if (!bien) return;
    let ex = $('regulExerciceSelect').value;
    if (bien.regulClosed && bien.regulClosed[ex]) return alert('Exercice clos.');
    
    let moveInDate = bien.dateAnniversaire;
    if (!moveInDate) return alert("La date d'emménagement n'est pas renseignée dans les quittances pour ce bien.");
    
    let col = bien.regulCols.find(c => c.id === colId);
    $('waterColName').textContent = col ? col.name : '';
    
    window._dcState.colId = colId;
    
    // v3.3.13 : reprise exercice précédent — même logique que le modal générique de distribution
    let exParts = ex.split('-');
    let prevEx = '';
    if (exParts.length === 1) {
        prevEx = String(parseInt(exParts[0]) - 1);
    } else {
        prevEx = String(parseInt(exParts[0]) - 1) + '-' + String(parseInt(exParts[1]) - 1);
    }
    let prevSum = 0;
    if (bien.regulData && bien.regulData[prevEx]) {
        Object.keys(bien.regulData[prevEx]).forEach(mK => {
            let v = bien.regulData[prevEx][mK][colId];
            if (v && !isNaN(v)) prevSum += parseFloat(v);
        });
    }
    let hasPrevEx = !!(bien.regulData && bien.regulData[prevEx] && Object.keys(bien.regulData[prevEx]).length > 0);
    window._dcState.waterPrevSum = prevSum;
    window._dcState.waterHasPrevEx = hasPrevEx;
    let prevRadio = $('waterTypePrev');
    if (prevRadio) { prevRadio.disabled = !hasPrevEx; if (!hasPrevEx) prevRadio.checked = false; }
    
    document.querySelector('input[name="waterType"][value="amount"]').checked = true;
    document.querySelector('input[name="waterAmountFlag"][value="est"]').checked = true;
    
    $('waterAmountTotal').value = '';
    $('waterInputTotal').value = '';
    $('waterInputStart').value = '';
    $('waterInputEnd').value = '';
    $('waterInputMoveIn').value = '';
    $('waterInputMoveOut').value = '';
    
    window.waterUpdateUI();
    $('distributeWaterModal').classList.add('open');
};

window.waterUpdateUI = function() {
    let type = document.querySelector('input[name="waterType"]:checked').value;
    let fmtEur = n => n.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' €';
    $('waterPrevGroup').style.display = (type === 'prev') ? 'block' : 'none';
    $('waterAmountGroup').style.display = (type === 'amount') ? 'block' : 'none';
    $('waterIndiceGroup').style.display = (type === 'indice') ? 'block' : 'none';
    if (type === 'prev') {
        $('waterPrevTotal').textContent = fmtEur(window._dcState.waterPrevSum || 0);
    }
};

window.closeDistributeWaterModal = function() {
    $('distributeWaterModal').classList.remove('open');
};

window.applyDistributeWater = function() {
    let s = window._dcState;
    let type = document.querySelector('input[name="waterType"]:checked').value;
    let fmtEur = n => n.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2}) + ' €';
    let fmtIdx = n => n.toLocaleString('fr-FR',{minimumFractionDigits:0,maximumFractionDigits:2});
    
    let bien = getRegulBien(currentRegulBienId);
    let ex = $('regulExerciceSelect').value;
    let col = bien.regulCols.find(c => c.id === s.colId);
    
    let months = getRegulMonthsForExercice(ex);
    let activeMonths = [];
    let my=0, mm=0, md=0;
    let moveInDate = bien.dateAnniversaire;
    if (moveInDate) {
        let parts = moveInDate.split('-');
        my = parseInt(parts[0], 10); mm = parseInt(parts[1], 10); md = parseInt(parts[2], 10);
    }
    
    months.forEach((mo) => {
        let moY = parseInt(mo.y, 10), moM = parseInt(mo.m, 10);
        let mKey = `${mo.y}-${mo.m}`;
        let isGreyed = false;
        if (moY < my || (moY === my && moM < mm)) isGreyed = true;
        if (!isGreyed) activeMonths.push({ mKey: mKey, moY, moM });
    });
    
    if (activeMonths.length === 0) return alert("Aucun mois actif pour le locataire.");
    
    let text = `<br><br><b>${escapeHtml(col.name)}</b><br>`;
    let monthlyBase = 0;
    let cellFlag = 'real'; // v3.3.13 : par défaut "réel" (reprise = estimation ; déclaration montant = choix utilisateur ; indice = mesure réelle)
    
    // ── Mode 1 : Reprise exercice précédent + % ──────────────────────────────
    if (type === 'prev') {
        let pctInput = $('waterPrevPct');
        let pct = pctInput ? (parseFloat(pctInput.value) || 0) : 0;
        let total = (s.waterPrevSum || 0) * (1 + pct / 100);
        monthlyBase = total / 12;
        cellFlag = 'est';
        text += `Reprise de l'exercice précédent (${pct}% d'augmentation).<br>`;
        text += `Montant global = ${fmtEur(total)}<br>`;
        text += `1/12ème de ${fmtEur(total)} = ${fmtEur(Math.round(monthlyBase * 100) / 100)} par mois<br>`;
    
    // ── Mode 2 : Déclaration d'un montant, avec bascule Estimation / Réel ────
    } else if (type === 'amount') {
        let totalInput = $('waterAmountTotal').value;
        let total = parseFloat(String(totalInput).replace(',', '.')) || 0;
        cellFlag = document.querySelector('input[name="waterAmountFlag"]:checked').value;
        monthlyBase = total / 12;
        text += `Montant global déclaré : ${fmtEur(total)} (${cellFlag === 'real' ? 'Réel' : 'Estimation'})<br>`;
        text += `1/12ème de ${fmtEur(total)} = ${fmtEur(Math.round(monthlyBase * 100) / 100)} par mois<br>`;
    
    // ── Mode 3 : Déclaration avec indice (relevé compteur) ───────────────────
    } else {
        let totalInput = $('waterInputTotal').value;
        let startInput = $('waterInputStart').value;
        let endInput = $('waterInputEnd').value;
        let total = parseFloat(String(totalInput).replace(',', '.')) || 0;
        
        let idxMoveInStr = $('waterInputMoveIn').value;
        let idxMoveOutStr = $('waterInputMoveOut').value;
        let idxMoveIn = idxMoveInStr ? parseFloat(idxMoveInStr.replace(',', '.')) : null;
        let idxMoveOut = idxMoveOutStr ? parseFloat(idxMoveOutStr.replace(',', '.')) : null;
        
        let idxStart = parseFloat(String(startInput).replace(',', '.')) || 0;
        let idxEnd = parseFloat(String(endInput).replace(',', '.')) || 0;
        
        if (idxEnd <= idxStart) {
            alert("L'indice de fin doit être supérieur à l'indice de début.");
            return;
        }
        
        let totalCons = idxEnd - idxStart;
        let locCons = totalCons;
        
        if (idxMoveIn !== null && !isNaN(idxMoveIn)) {
            locCons = idxEnd - idxMoveIn;
        } else if (idxMoveOut !== null && !isNaN(idxMoveOut)) {
            locCons = idxMoveOut - idxStart;
        }
        
        if (locCons < 0) locCons = 0;
        if (locCons > totalCons) locCons = totalCons;
        
        let amountLoc = (locCons / totalCons) * total;
        
        text += `Montant global de la facture : ${fmtEur(total)}<br>`;
        text += `Consommation totale : ${fmtIdx(totalCons)} m³ (Indice fin ${fmtIdx(idxEnd)} - Indice début ${fmtIdx(idxStart)})<br>`;
        if (idxMoveIn !== null && !isNaN(idxMoveIn)) {
            text += `Le locataire a emménagé en cours de période. Indice d'entrée : ${fmtIdx(idxMoveIn)} m³.<br>`;
            text += `Consommation locataire : ${fmtIdx(idxEnd)} - ${fmtIdx(idxMoveIn)} = ${fmtIdx(locCons)} m³.<br>`;
        } else if (idxMoveOut !== null && !isNaN(idxMoveOut)) {
            text += `Le locataire a quitté les lieux. Indice de sortie : ${fmtIdx(idxMoveOut)} m³.<br>`;
            text += `Consommation locataire : ${fmtIdx(idxMoveOut)} - ${fmtIdx(idxStart)} = ${fmtIdx(locCons)} m³.<br>`;
        } else {
            text += `Consommation locataire : ${fmtIdx(locCons)} m³.<br>`;
        }
        text += `Coût locataire (règle de 3) : ${fmtEur(total)} x (${fmtIdx(locCons)} / ${fmtIdx(totalCons)}) = ${fmtEur(amountLoc)}<br>`;
        
        let sumWeights = 0;
        activeMonths.forEach(am => {
            if (am.moY === my && am.moM === mm) {
                let daysInMonth = new Date(am.moY, am.moM, 0).getDate();
                sumWeights += (daysInMonth - md + 1) / daysInMonth;
            } else {
                sumWeights += 1;
            }
        });
        monthlyBase = amountLoc / sumWeights;
        cellFlag = 'real';
    }
    
    let monthlyRounded = Math.round(monthlyBase * 100) / 100;
    let isFirstEverMonth = false;
    let firstMonthProrata = 0, firstMonthDaysPresent = 0, firstMonthDaysTotal = 0;
    
    if (!bien.regulData) bien.regulData = {};
    if (!bien.regulData[ex]) bien.regulData[ex] = {};
    if (!bien.regulFlags) bien.regulFlags = {};
    if (!bien.regulFlags[ex]) bien.regulFlags[ex] = {};
    
    activeMonths.forEach((am) => {
        let moY = am.moY, moM = am.moM, mKey = am.mKey;
        if (!bien.regulData[ex][mKey]) bien.regulData[ex][mKey] = {};
        if (!bien.regulFlags[ex][mKey]) bien.regulFlags[ex][mKey] = {};
        
        if (moY === my && moM === mm) {
            isFirstEverMonth = true;
            firstMonthDaysTotal = new Date(moY, moM, 0).getDate();
            firstMonthDaysPresent = firstMonthDaysTotal - md + 1;
            firstMonthProrata = Math.round(monthlyBase * firstMonthDaysPresent / firstMonthDaysTotal * 100) / 100;
            bien.regulData[ex][mKey][s.colId] = firstMonthProrata;
            bien.regulFlags[ex][mKey][s.colId] = cellFlag;
        } else {
            bien.regulData[ex][mKey][s.colId] = monthlyRounded;
            bien.regulFlags[ex][mKey][s.colId] = cellFlag;
        }
    });
    
    if (isFirstEverMonth) {
        let dateLocStr = `${String(md).padStart(2,'0')}/${String(mm).padStart(2,'0')}/${my}`;
        text += `Particularité pour le 1er mois le ${dateLocStr}. Prorata de ${firstMonthDaysPresent}/${firstMonthDaysTotal} = ${fmtEur(monthlyRounded)} x ${firstMonthDaysPresent} / ${firstMonthDaysTotal} = ${fmtEur(firstMonthProrata)}<br>`;
    }
    
    if (!bien.regulExplications) bien.regulExplications = {};
    let oldText = bien.regulExplications[ex] || '';
    if (oldText && oldText.includes('\n')) oldText = oldText.replace(/\n/g, '<br>');
    
    function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    let regex = new RegExp(`(?:<br>\\s*|\\n)*(?:<b>|<strong>)\\s*${escapeRegExp(escapeHtml(col.name))}\\s*(?:<\\/b>|<\\/strong>)(?:<br>|\\n)[\\s\\S]*?(?=(?:<br>|\\n|\\s)*(?:<b>|<strong>)|$)`, 'i');
    if (regex.test(oldText)) {
        oldText = oldText.replace(regex, text);
    } else {
        oldText = oldText + text;
    }
    bien.regulExplications[ex] = oldText.trim();
    if (bien.regulExplications[ex].startsWith('<br>')) {
        bien.regulExplications[ex] = bien.regulExplications[ex].replace(/^(?:<br>\s*)+/, '');
    }
    
    triggerSave(true);
    window.closeDistributeWaterModal();
    window.renderRegul();
    showToast('Distribution d\'eau appliquée ✓');
};

window.onRegulIndicatorTripleClick = function(event, el) {
    if (event.detail < 3) return;
    event.preventDefault();
    event.stopPropagation();
    let mKey = el.getAttribute('data-mkey');
    let cId = el.getAttribute('data-cid');
    let realVal = el.getAttribute('data-real');
    let ex = $('regulExerciceSelect').value;
    let bien = getRegulBien(currentRegulBienId);
    if (bien.regulClosed && bien.regulClosed[ex]) return;

    if (event.shiftKey) {
        let indicators = document.querySelectorAll('#regulGrid .budget-indicator[data-cid="'+cId+'"]');
        let updated = false;
        indicators.forEach(ind => {
            let tm = ind.getAttribute('data-mkey');
            let trv = ind.getAttribute('data-real');
            window.setRegulCellSilent(tm, cId, trv);
            updated = true;
        });
        if (updated) {
            triggerSave(true);
            window.renderRegul();
            showToast("Toutes les provisions ont été copiées ✓");
        }
    } else {
        window.setRegulCell(mKey, cId, realVal);
    }
};
window.setRegulCell = function(mKey, colId, text) {
    let bien = getRegulBien(currentRegulBienId);
    if (!bien) return;
    let changed = window.setRegulCellSilent(mKey, colId, text);
    if (!changed) return;
    triggerSave(true);
    window.renderRegul();
};
window.validateRegul = function() {
    let bien = getRegulBien(currentRegulBienId);
    if (!bien) return;
    let ex = $('regulExerciceSelect').value;
    if (bien.regulClosed && bien.regulClosed[ex]) return alert('Exercice clos.');
    if (!bien.regulValidated) bien.regulValidated = {};
    bien.regulValidated[ex] = true;
    triggerSave(true); window.renderRegul();
};
window.cancelRegulValidation = function() {
    let bien = getRegulBien(currentRegulBienId);
    if (!bien) return;
    let ex = $('regulExerciceSelect').value;
    if (bien.regulClosed && bien.regulClosed[ex]) return alert('Exercice clos.');
    if (bien.regulValidated) delete bien.regulValidated[ex];
    triggerSave(true); window.renderRegul();
};
window.onCloturerRegulBtnClick = function(event) {
    let bien = getRegulBien(currentRegulBienId);
    if (!bien) return;
    let ex = $('regulExerciceSelect').value;
    if (!bien.regulClosed) bien.regulClosed = {};
    let isClosed = bien.regulClosed[ex];
    if (event && event.shiftKey && isClosed) {
        if(confirm('Rouvrir cet exercice ?')) { delete bien.regulClosed[ex]; triggerSave(true); window.renderRegul(); }
        return;
    }
    if (isClosed) return;
    if (confirm('Clôturer l\'exercice ? (lecture seule)')) {
        bien.regulClosed[ex] = true; triggerSave(true); window.renderRegul();
    }
};
window.openRegulColsModal = function() {
    let bien = getRegulBien(currentRegulBienId);
    if (!bien) return;
    window.renderRegulColsList();
    $('regulColsModal').classList.add('open');
};
window.closeRegulColsModal = function() {
    $('regulColsModal').classList.remove('open');
    window.renderRegul();
};
window.renderRegulColsList = function() {
    let bien = getRegulBien(currentRegulBienId);
    let html = '';
    bien.regulCols.forEach((c, idx) => {
        html += `<div style="display:flex;align-items:center;gap:8px;padding:6px;background:var(--bg);border:1px solid var(--ink-faint);border-radius:4px;">
            <button class="btn btn-outline" style="padding:2px 6px;" onclick="window.moveRegulCol(${idx}, -1)" ${idx===0?'disabled':''}>↑</button>
            <button class="btn btn-outline" style="padding:2px 6px;" onclick="window.moveRegulCol(${idx}, 1)" ${idx===bien.regulCols.length-1?'disabled':''}>↓</button>
            <input type="text" class="input-text" style="flex:1;" value="${escapeHtml(c.name)}" onchange="window.renameRegulCol('${c.id}', this.value)">
            <button class="btn btn-outline" style="padding:2px 6px;color:var(--urgent);" onclick="window.deleteRegulCol('${c.id}')">🗑</button>
        </div>`;
    });
    $('regulColsList').innerHTML = html;
};
window.addRegulCol = function() {
    let bien = getRegulBien(currentRegulBienId);
    let msg = "Choisissez le type de charge (tapez le numéro) :\n" +
              "1 - Charges communes\n" +
              "2 - Charges individuelles (eau)\n" +
              "3 - Taxe d'ordure ménagère\n" +
              "4 - Charges exceptionnelles\n" +
              "5 - Autre (personnalisé)";
    let num = prompt(msg, "1");
    if (!num) return;
    let choice = "";
    if (num === "1") choice = "Charges communes";
    else if (num === "2") choice = "Charges individuelles (eau)";
    else if (num === "3") choice = "Taxe d'ordure ménagère";
    else if (num === "4") choice = "Charges exceptionnelles";
    else if (num === "5") {
        choice = prompt("Saisissez le nom de la colonne :");
        if (!choice) return;
    } else {
        return;
    }
    let id = 'c' + Date.now();
    bien.regulCols.push({ id: id, name: choice });
    triggerSave(false);
    window.renderRegulColsList();
};
window.moveRegulCol = function(idx, dir) {
    let bien = getRegulBien(currentRegulBienId);
    if (idx+dir < 0 || idx+dir >= bien.regulCols.length) return;
    let temp = bien.regulCols[idx];
    bien.regulCols[idx] = bien.regulCols[idx+dir];
    bien.regulCols[idx+dir] = temp;
    triggerSave(false);
    window.renderRegulColsList();
};
window.renameRegulCol = function(id, name) {
    let bien = getRegulBien(currentRegulBienId);
    let col = bien.regulCols.find(c => c.id === id);
    if (col) col.name = name;
    triggerSave(false);
};
window.deleteRegulCol = function(id) {
    let bien = getRegulBien(currentRegulBienId);
    if (bien.regulCols.length <= 1) return alert("Il doit rester au moins une colonne.");
    bien.regulCols = bien.regulCols.filter(c => c.id !== id);
    triggerSave(false);
    window.renderRegulColsList();
};

window.adjustRegulFont = function(dir) {
    let cur = parseInt(localStorage.getItem('f_regul_fontsize') || '13', 10);
    cur = Math.min(24, Math.max(8, cur + dir));
    let px = cur + 'px';
    localStorage.setItem('f_regul_fontsize', String(cur)); triggerSave(false);
    document.querySelectorAll('#regulGrid .tcd-native th, #regulGrid .tcd-native td').forEach(el => {
        el.style.fontSize = px;
    });
};
// ──────────────────────────────

// Initialisation au chargement
document.addEventListener('DOMContentLoaded', function() {
    setTimeout(function() {
        try {
            quittancesEnabled = localStorage.getItem('f_quittances_enabled_' + currentAccountId) === '1';
            applyQuittancesOptionState();
            chartsEnabled = localStorage.getItem('f_charts_enabled_' + currentAccountId) !== '0'; // activé par défaut
            applyChartsOptionState();
            loadFiscalStartMonth();
    loadFiscalStartMonthSyndic();
            applyFiscalStartMonthState();
            budgetEnabled = localStorage.getItem('f_budget_enabled_' + currentAccountId) === '1';
            applyBudgetOptionState();
    regulEnabled = localStorage.getItem('f_regul_enabled_' + currentAccountId) === '1';
    applyRegulOptionState();
        } catch(e) {}
    }, 300);
});

window.importAccountFromDat = async function(input) {
    let file = input.files[0]; input.value = '';
    if (!file) return;
    if (!driveAccessToken) { alert('Connectez-vous à Drive d\'abord.'); return; }
    if (!appSecretKey) { alert('Mot de passe non initialisé. Reconnectez-vous.'); return; }
    if (!file.name.toLowerCase().endsWith('.dat')) { alert('Seuls les fichiers .dat sont acceptés.'); return; }
    try {
        showToast('📥 Lecture du fichier...');
        let text = await file.text();
        let remoteData = {};
        if (text && text.trim().startsWith('{')) remoteData = JSON.parse(text);
        if (!remoteData.vault) { alert('Fichier .dat invalide : format non reconnu.'); return; }
        let decrypted;
        try {
            decrypted = JSON.parse(CryptoJS.AES.decrypt(remoteData.vault, appSecretKey).toString(CryptoJS.enc.Utf8));
            if (!decrypted) throw new Error('empty');
        } catch(e) {
            alert('Impossible de déchiffrer ce fichier. Vérifiez que la clé de chiffrement (mot de passe) est la même que celle utilisée pour créer ce fichier.');
            return;
        }
        // Générer un nouvel ID de compte local, totalement isolé (jamais réutiliser l'accountId source)
        let newId = 'acc_' + Date.now();
        let suggestedName = (decrypted.accounts && Array.isArray(decrypted.accounts) && decrypted.accountId)
            ? (decrypted.accounts.find(a => a.id === decrypted.accountId) || {}).name
            : null;
        let defaultName = suggestedName || file.name.replace(/\.dat$/i, '');
        let name = prompt('Nom du compte importé :', defaultName);
        if (!name || !name.trim()) { showToast('Import annulé'); return; }
        name = name.trim();

        accounts.push({ id: newId, name });
        saveAccountsList();
        saveAccountsRegistry();
        window.renderAccountManagerList();
        window.renderAccountUI();

        // Construire le nouvel état isolé pour ce compte (accountId propre, jamais celui du fichier source)
        let fname = getAccountDriveFilename(newId);
        let isolatedState = {
            transactions: decrypted.transactions || [],
            rules: decrypted.rules || [],
            categories: decrypted.categories || {},
            savedCharts: decrypted.savedCharts || [],
            version: APP_VERSION,
            accounts: accounts,
            settings: decrypted.settings || {
                tcdHeaderColor: '', fontSize: '14', tcdFontSize: '13', budgetFontSize: '13', regulFontSize: '13', pivot: '',
                collapsedGroups: [], collapsedYears: [],
                tcdFilter: { cat1:[], cat2:[], yearsOp:[], yearsExpense:[], months:[] },
                budgetFilter: { cat1:[], cat2:[] },
                tcdRedCells: {}, settingsTs: Date.now()
            },
            accountId: newId,
            // v3.4.7 : reprendre TOUTES les données du fichier source, pas seulement les
            // transactions/règles/catégories — Quittances, Budget, Régule et les options
            // (cases à cocher, exercices fiscaux) étaient silencieusement perdues à l'import.
            quittancesBiens: decrypted.quittancesBiens || [],
            quittancesEnabled: !!decrypted.quittancesEnabled,
            budgetData: (decrypted.budgetData && typeof decrypted.budgetData === 'object') ? decrypted.budgetData : {},
            budgetEnabled: !!decrypted.budgetEnabled,
            regulEnabled: !!decrypted.regulEnabled,
            fiscalStartMonthSyndic: parseInt(decrypted.fiscalStartMonthSyndic) || 10,
            fiscalStartMonth: parseInt(decrypted.fiscalStartMonth) || 1,
            activeTab: decrypted.activeTab || 'view-summary',
            chartsEnabled: typeof decrypted.chartsEnabled === 'boolean' ? decrypted.chartsEnabled : true
        };
        let payload = JSON.stringify({ vault: CryptoJS.AES.encrypt(JSON.stringify(isolatedState), appSecretKey).toString() });
        let blob = new Blob([payload], { type: 'application/json' });
        let form = new FormData();
        form.append('metadata', new Blob([JSON.stringify({ name: fname, parents: ['appDataFolder'] })], { type: 'application/json' }));
        form.append('file', blob);
        let resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + driveAccessToken },
            body: form
        });
        let fileData = await resp.json();
        if (fileData.id) driveFileIdMap[newId] = fileData.id;
        if (typeof window.renderDriveAdmin === 'function') window.renderDriveAdmin();

        showToast('✅ Compte "' + name + '" importé (' + (isolatedState.transactions.length) + ' transaction(s))');
    } catch(err) {
        alert('Erreur lors de l\'import : ' + err.message);
    }
};

window.renameAccount = function(id, name) {
    if (!name.trim()) return;
    let acc = accounts.find(a => a.id === id);
    if (acc) { acc.name = name.trim(); saveAccountsList(); saveAccountsRegistry(); window.renderAccountUI(); triggerSave(false); }
};

window.deleteAccount = async function(id) {
    let acc = accounts.find(a => a.id === id);
    if (!acc) return;
    if (!confirm('Supprimer le compte "' + acc.name + '" et toutes ses données Drive ? Cette action est irréversible.')) return;
    // Supprimer fichier Drive de ce compte (résolution stable par accountId, avec migration
    // automatique si ce compte n'a jamais été chargé dans ce navigateur depuis la v3.4.5)
    if (driveAccessToken) {
        try {
            let fileId = await driveGetFileId(id);
            if (fileId) {
                await fetch('https://www.googleapis.com/drive/v3/files/' + fileId, {method:'DELETE', headers:{Authorization:'Bearer '+driveAccessToken}});
            }
        } catch(e) { console.warn('Erreur suppression Drive:', e); }
    }
    accounts = accounts.filter(a => a.id !== id);
    delete driveFileIdMap[id];
    saveAccountsList();
    await saveAccountsRegistry(); // met à jour la référence unique pour que ce compte ne ressurgisse pas ailleurs
    triggerSave(false);
    window.renderAccountManagerList();
    window.renderAccountUI();
    showToast('Compte et données Drive supprimés ✓');
};

// ══════════════════════════════════════════════════════
// ADMIN DRIVE
// ══════════════════════════════════════════════════════
window.loadDriveFilesList = async function() {
    let container = document.getElementById('driveFilesList');
    if (!driveAccessToken) { container.innerHTML = '<p style="color:var(--urgent);">Non connecté à Drive.</p>'; return; }
    container.innerHTML = '<p style="color:var(--ink-soft);">Chargement...</p>';
    try {
        let r = await fetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name+contains+%27appsysdata%27&fields=files(id,name,size,modifiedTime)&pageSize=100', {
            headers: { Authorization: 'Bearer ' + driveAccessToken }
        });
        let d = await r.json();
        let files = d.files || [];
        if (!files.length) { container.innerHTML = '<p style="color:var(--ink-soft);">Aucun fichier trouvé.</p>'; return; }

        // v3.4.12 : sépare les sauvegardes (nom contenant "-BackupAAAAMMJJ", cf. backupAdminDriveFile)
        // des fichiers de production, pour les distinguer visuellement dans la liste.
        let isBackup = f => f.name.indexOf('-Backup') !== -1;
        let prodFiles = files.filter(f => !isBackup(f)).sort((a,b) => a.name.localeCompare(b.name));
        let backupFiles = files.filter(isBackup).sort((a,b) => new Date(b.modifiedTime) - new Date(a.modifiedTime));

        const rowHtml = (f) => {
            let size = f.size ? Math.round(f.size/1024) + ' Ko' : '—';
            let date = f.modifiedTime ? new Date(f.modifiedTime).toLocaleString('fr-FR') : '—';
            let safeId = f.id.replace(/'/g, "\\'");
            let safeName = (f.name||'').replace(/</g,'&lt;');
            return '<tr>'
                + '<td style="text-align:center;"><input type="checkbox" class="admin-drive-cb" value="' + f.id + '" onclick="window.updateAdminDriveBulkActions()"></td>'
                + '<td>' + safeName + '</td>'
                + '<td style="text-align:right;">' + size + '</td>'
                + '<td>' + date + '</td>'
                + '<td style="display:flex;gap:6px;flex-wrap:wrap;">'
                + '<button class="btn btn-outline" style="padding:3px 8px;font-size:0.82em;" onclick="window.previewAdminDriveFile(\'' + safeId + '\',\'' + safeName + '\')">👁️ Visualiser</button>'
                + '<button class="btn btn-outline" style="padding:3px 8px;font-size:0.82em;" onclick="window.downloadAdminDriveFile(\'' + safeId + '\',\'' + safeName + '\')">⬇️ Télécharger</button>'
                + '<button class="btn btn-outline" style="padding:3px 8px;font-size:0.82em;color:var(--done);" onclick="window.backupAdminDriveFile(\'' + safeId + '\',\'' + safeName + '\')">☁️ Backup Cloud</button>'
                + '<button class="btn btn-danger" style="padding:3px 8px;font-size:0.82em;" onclick="window.deleteAdminDriveFile(\'' + safeId + '\',\'' + safeName + '\')">🗑️ Supprimer</button>'
                + '</td></tr>';
        };
        const sectionRow = (label, count) => '<tr><td colspan="5" style="background:var(--bg);font-weight:700;font-size:0.82em;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-soft);padding:6px 10px;">' + label + ' (' + count + ')</td></tr>';

        let html = '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">'
            + '<button class="btn btn-danger" id="adminDriveBulkDeleteBtn" style="display:none;padding:4px 10px;font-size:0.85em;" onclick="window.bulkDeleteAdminDriveFiles()">🗑️ Supprimer la sélection (<span id="adminDriveSelCount">0</span>)</button>'
            + '</div>';
        html += '<table class="std-table" style="width:100%;margin-top:8px;"><thead><tr>'
            + '<th style="width:36px;text-align:center;"><input type="checkbox" id="adminDriveSelectAllCb" onclick="window.toggleSelectAllAdminDrive(this)"></th>'
            + '<th>Nom</th><th>Taille</th><th>Modifié le</th><th>Action</th></tr></thead><tbody>';
        html += sectionRow('📁 Production', prodFiles.length);
        prodFiles.forEach(f => { html += rowHtml(f); });
        if (backupFiles.length) {
            html += sectionRow('🗄️ Sauvegardes', backupFiles.length);
            backupFiles.forEach(f => { html += rowHtml(f); });
        }
        html += '</tbody></table>';
        container.innerHTML = html;
        window.updateAdminDriveBulkActions();
    } catch(e) {
        container.innerHTML = '<p style="color:var(--urgent);">Erreur : ' + e.message + '</p>';
    }
};

window.toggleSelectAllAdminDrive = function(cb) {
    document.querySelectorAll('.admin-drive-cb').forEach(el => { el.checked = cb.checked; });
    window.updateAdminDriveBulkActions();
};

window.updateAdminDriveBulkActions = function() {
    let checked = document.querySelectorAll('.admin-drive-cb:checked');
    let btn = $('adminDriveBulkDeleteBtn'), cnt = $('adminDriveSelCount');
    if (cnt) cnt.textContent = checked.length;
    if (btn) btn.style.display = checked.length ? 'inline-flex' : 'none';
};

window.bulkDeleteAdminDriveFiles = async function() {
    let ids = Array.from(document.querySelectorAll('.admin-drive-cb:checked')).map(cb => cb.value);
    if (!ids.length) return;
    if (!confirm('Supprimer définitivement ' + ids.length + ' fichier(s) de Google Drive ? Cette action est irréversible.')) return;
    let okCount = 0, errCount = 0;
    for (let id of ids) {
        try {
            let r = await fetch('https://www.googleapis.com/drive/v3/files/' + id, { method: 'DELETE', headers: { Authorization: 'Bearer ' + driveAccessToken } });
            if (r.status === 204 || r.ok) {
                okCount++;
                Object.keys(driveFileIdMap).forEach(k => { if (driveFileIdMap[k] === id) delete driveFileIdMap[k]; });
                if (driveAccountsRegistryFileId === id) driveAccountsRegistryFileId = null;
            } else { errCount++; }
        } catch(e) { errCount++; }
    }
    showToast((errCount ? '⚠️ ' : '✅ ') + okCount + ' fichier(s) supprimé(s)' + (errCount ? ', ' + errCount + ' échec(s)' : ''));
    window.loadDriveFilesList();
};

// v3.4.12 : aperçu du contenu d'un fichier Drive dans un popup — déchiffré avec la clé de session
// courante (partagée entre tous les comptes d'un même utilisateur) quand c'est un vault reconnu.
window.previewAdminDriveFile = async function(fileId, fileName) {
    let modal = $('driveFilePreviewModal'), title = $('driveFilePreviewTitle'), body = $('driveFilePreviewBody');
    if (!modal || !body) return;
    if (title) title.textContent = fileName || 'Fichier';
    body.textContent = 'Chargement...';
    modal.classList.add('open');
    try {
        let r = await fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media', {
            headers: { Authorization: 'Bearer ' + driveAccessToken }
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        let text = await r.text();
        let out = text;
        let remoteData = null;
        try { remoteData = JSON.parse(text); } catch (parseErr) { /* pas du JSON : affiché tel quel */ }
        if (remoteData && remoteData.vault) {
            if (!appSecretKey) {
                out = '(Fichier chiffré — clé de déchiffrement indisponible dans cette session)';
            } else {
                try {
                    let decrypted = CryptoJS.AES.decrypt(remoteData.vault, appSecretKey).toString(CryptoJS.enc.Utf8);
                    if (!decrypted) throw new Error('résultat vide');
                    out = JSON.stringify(JSON.parse(decrypted), null, 2);
                } catch (decErr) {
                    out = '(Impossible de déchiffrer ce fichier avec la clé de session actuelle)';
                }
            }
        } else if (remoteData) {
            out = JSON.stringify(remoteData, null, 2);
        }
        let MAX = 300000;
        if (out.length > MAX) out = out.slice(0, MAX) + '\n\n… (tronqué — téléchargez le fichier pour le contenu complet)';
        body.textContent = out;
    } catch (e) {
        body.textContent = 'Erreur : ' + e.message;
    }
};
window.closeDriveFilePreview = function() {
    let modal = $('driveFilePreviewModal');
    if (modal) modal.classList.remove('open');
};

window.deleteAdminDriveFile = async function(fileId, fileName) {
    if (!confirm('Supprimer le fichier "' + fileName + '" de Google Drive ?')) return;
    try {
        let r = await fetch('https://www.googleapis.com/drive/v3/files/' + fileId, {
            method: 'DELETE',
            headers: { Authorization: 'Bearer ' + driveAccessToken }
        });
        if (r.status === 204 || r.ok) {
            // Invalider le cache du fileId si c'est un compte connu (ou le registre des comptes)
            Object.keys(driveFileIdMap).forEach(function(k) {
                if (driveFileIdMap[k] === fileId) delete driveFileIdMap[k];
            });
            if (driveAccountsRegistryFileId === fileId) driveAccountsRegistryFileId = null;
            showToast('Fichier "' + fileName + '" supprimé ✓');
            window.loadDriveFilesList();
        } else {
            alert('Erreur suppression : ' + r.status);
        }
    } catch(e) { alert('Erreur : ' + e.message); }
}

window.backupAdminDriveFile = async function(fileId, fileName) {
    if (!driveAccessToken) { showToast('⚠️ Non connecté à Drive'); return; }
    try {
        // ── 1. Télécharger le contenu du fichier source
        showToast('☁️ Backup Cloud en cours...');
        let r = await fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media', {
            headers: { Authorization: 'Bearer ' + driveAccessToken }
        });
        if (!r.ok) throw new Error('Téléchargement échoué (' + r.status + ')');
        let content = await r.text();

        // ── 2. Construire le nom de sauvegarde : nom-SauvAAAAMMJJ
        var now   = new Date();
        var yyyy  = now.getFullYear();
        var mm    = String(now.getMonth()+1).padStart(2,'0');
        var dd    = String(now.getDate()).padStart(2,'0');
        var suffix = '-Backup' + yyyy + mm + dd;
        // Insérer avant l'extension si présente, sinon en fin
        var dotIdx   = fileName.lastIndexOf('.');
        var backupName = dotIdx > 0
            ? fileName.substring(0, dotIdx) + suffix + fileName.substring(dotIdx)
            : fileName + suffix;

        // ── 3. Uploader sous le nouveau nom dans appDataFolder
        var meta = JSON.stringify({ name: backupName, parents: ['appDataFolder'] });
        var blob = new Blob([content], { type: 'application/octet-stream' });
        var form = new FormData();
        form.append('metadata', new Blob([meta], { type: 'application/json' }));
        form.append('file', blob);

        let up = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + driveAccessToken },
            body: form
        });
        if (!up.ok) throw new Error('Upload échoué (' + up.status + ')');
        let res = await up.json();
        showToast('✅ Backup Cloud créé : ' + backupName);
        // Recharger la liste
        window.loadDriveFilesList();
    } catch(e) {
        showToast('❌ Erreur sauvegarde : ' + e.message);
    }
};
;

window.downloadAdminDriveFile = async function(fileId, fileName) {
    if (!driveAccessToken) { alert('Non connecté à Drive.'); return; }
    try {
        showToast('⬇️ Téléchargement en cours...');
        let r = await fetch('https://www.googleapis.com/drive/v3/files/' + fileId + '?alt=media', {
            headers: { Authorization: 'Bearer ' + driveAccessToken }
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        let blob = await r.blob();
        let url = URL.createObjectURL(blob);
        let a = document.createElement('a');
        a.href = url; a.download = fileName || 'backup.dat';
        document.body.appendChild(a); a.click();
        document.body.removeChild(a); URL.revokeObjectURL(url);
        showToast('✅ Téléchargement terminé');
    } catch(e) { alert('Erreur téléchargement : ' + e.message); }
};

window.uploadDatFile = async function(input) {
    let file = input.files[0]; input.value = '';
    if (!file) return;
    if (!driveAccessToken) { alert('Connectez-vous à Drive d\'abord.'); return; }
    if (!file.name.endsWith('.dat')) { alert('Seuls les fichiers .dat sont acceptés.'); return; }
    if (!confirm('Uploader "' + file.name + '" sur Google Drive (appDataFolder) ? Cela remplacera le fichier existant du même nom.')) return;
    try {
        showToast('⬆️ Upload en cours...');
        // Check if file exists
        let searchR = await fetch('https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D%27' + encodeURIComponent(file.name) + '%27&fields=files(id,name)&pageSize=1', {
            headers: { Authorization: 'Bearer ' + driveAccessToken }
        });
        let searchD = await searchR.json();
        let existingId = (searchD.files && searchD.files[0]) ? searchD.files[0].id : null;
        let content = await file.arrayBuffer();
        let url, method, body;
        if (existingId) {
            url = 'https://www.googleapis.com/upload/drive/v3/files/' + existingId + '?uploadType=media';
            method = 'PATCH';
            body = content;
        } else {
            url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id';
            method = 'POST';
            let form = new FormData();
            let meta = { name: file.name, parents: ['appDataFolder'] };
            form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
            form.append('file', new Blob([content], { type: 'application/octet-stream' }));
            body = form;
        }
        let r = await fetch(url, { method, headers: { Authorization: 'Bearer ' + driveAccessToken }, body });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        showToast('✅ Fichier uploadé sur Drive');
        window.loadDriveFilesList();
    } catch(e) { alert('Erreur upload : ' + e.message); }
};


window.createNewCat2 = function() {
    let input = document.getElementById('newCat2Input');
    let name = input.value.trim();
    if (!name || !catModalSelectedCat1) return;
    if (!categories[catModalSelectedCat1]) categories[catModalSelectedCat1] = [];
    if (!categories[catModalSelectedCat1].includes(name)) {
        categories[catModalSelectedCat1].push(name);
        categories[catModalSelectedCat1].sort(customSortCmp);
        triggerSave(false);
        window.renderCatTab && window.renderCatTab();
    }
    input.value = '';
    showToast('Catégorie "' + name + '" créée ✓');
    // Passer directement à l'étape 3
    window.showStep3(catModalSelectedCat1, name, false);
};

// Restauration paramètres
document.addEventListener('DOMContentLoaded', function() {
    let rp = document.getElementById('restoreParamsFile');
    if (!rp) return;
    rp.addEventListener('change', function(e) {
        let file = e.target.files[0]; if (!file) return;
        let reader = new FileReader();
        reader.onload = function(ev) {
            try {
                let data = JSON.parse(ev.target.result);
                if (data.categories) { categories = data.categories; }
                if (data.rules) { rules = data.rules; }
                triggerSave(false);
                window.renderViewsSafe();
                showToast('✅ Paramètres restaurés (catégories + règles)');
            } catch(err) { alert('Erreur lecture fichier : ' + err.message); }
            e.target.value = '';
        };
        reader.readAsText(file);
    });
});

// ── SHIFT export : double onglet chiffré + clair ──────────────────────────
(function() {
    function updateExportBtn(shift) {
        let btn = document.getElementById('exportDbBtn');
        if (!btn) return;
        if (shift) {
            btn.textContent = '📤 Exporter (chiffré + clair)';
            btn.style.color = 'var(--pro)';
            btn.style.borderColor = 'var(--pro)';
            btn.dataset.shiftMode = '1';
        } else {
            btn.textContent = '📤 Exporter (chiffré)';
            btn.style.color = '';
            btn.style.borderColor = '';
            btn.dataset.shiftMode = '0';
        }
    }
    document.addEventListener('keydown', e => { if (e.key === 'Shift') updateExportBtn(true); });
    document.addEventListener('keyup',   e => { if (e.key === 'Shift') updateExportBtn(false); });
    document.addEventListener('visibilitychange', () => updateExportBtn(false));
})();



// ════════════════════════════════════════════════════════
// TCD — Persistance scroll + état (groupes/années réduits)
// ════════════════════════════════════════════════════════
let _lastR1Keys2 = []; // alias for collapsed toggle

function tcdSaveScroll() {
    let w = document.getElementById('tcdScrollWrapper');
    if (w && w.offsetWidth > 0) {
        localStorage.setItem('tcd_sx_' + currentAccountId, w.scrollLeft);
        localStorage.setItem('tcd_sy_' + currentAccountId, w.scrollTop);
    }
}

function tcdRestoreScroll() {
    let rawSx = localStorage.getItem('tcd_sx_' + currentAccountId);
    let sx = (rawSx !== null && rawSx !== '' && !isNaN(parseFloat(rawSx))) ? parseFloat(rawSx) : null;
    let sy = parseFloat(localStorage.getItem('tcd_sy_' + currentAccountId) || '0');
    
    requestAnimationFrame(() => requestAnimationFrame(() => {
        let w = document.getElementById('tcdScrollWrapper');
        if (!w) return;
        
        let attempts = 0;
        let iv = setInterval(() => {
            if (w && w.scrollWidth > 0 && w.offsetWidth > 0) {
                let targetX = (sx !== null) ? sx : w.scrollWidth;
                w.scrollLeft = targetX;
                w.scrollTop = sy || 0;
            }
            if (attempts++ > 15) clearInterval(iv);
        }, 30);
    }));
}

function tcdSaveCollapsed() {
    localStorage.setItem('tcd_cg', JSON.stringify([...collapsedGroups]));
    localStorage.setItem('tcd_cy', JSON.stringify([...collapsedYears]));
    localStorage.setItem('f_settings_ts', Date.now());
    triggerSave(false);
}

function tcdLoadCollapsed() {
    try {
        let hasSaved = localStorage.getItem('tcd_cg') !== null;
        let cg = JSON.parse(localStorage.getItem('tcd_cg') || '[]');
        let cy = JSON.parse(localStorage.getItem('tcd_cy') || '[]');
        collapsedGroups = new Set(cg);
        collapsedYears  = new Set(cy);
        if (!hasSaved) window._tcdCollapseAllOnFirstRender = true;
    } catch(e) {}
}

// ════════════════════════════════════════════════════════
// TCD — Filtre popup
// ════════════════════════════════════════════════════════
const MONTH_NAMES = ['','Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];

function hasTcdFilter() {
    return tcdFilter.cat1.size > 0 || tcdFilter.cat2.size > 0 ||
           tcdFilter.yearsOp.size > 0 || tcdFilter.yearsExpense.size > 0 || tcdFilter.months.size > 0;
}

function saveTcdFilter() {
    localStorage.setItem('tcd_filter', JSON.stringify({
        cat1:  [...tcdFilter.cat1],
        cat2:  [...tcdFilter.cat2],
        yearsOp: [...tcdFilter.yearsOp],
        yearsExpense: [...tcdFilter.yearsExpense],
        fiscalYearsOp: [...tcdFilter.fiscalYearsOp],
        fiscalYearsExpense: [...tcdFilter.fiscalYearsExpense],
        months:[...tcdFilter.months]
    }));
    localStorage.setItem('f_settings_ts', Date.now());
    triggerSave(false);
}

function loadTcdFilter() {
    try {
        let f = JSON.parse(localStorage.getItem('tcd_filter') || '{}');
        tcdFilter.cat1   = new Set(f.cat1   || []);
        tcdFilter.cat2   = new Set(f.cat2   || []);
        tcdFilter.yearsOp = new Set(f.yearsOp || f.years || []);
        tcdFilter.yearsExpense = new Set(f.yearsExpense || []);
        tcdFilter.fiscalYearsOp = new Set(f.fiscalYearsOp || []);
        tcdFilter.fiscalYearsExpense = new Set(f.fiscalYearsExpense || []);
        tcdFilter.months = new Set(f.months || []);
    } catch(e) {}
}

window.openTcdFilter = function(e) {
    e.stopPropagation();
    // Collecter toutes les valeurs disponibles depuis transactions
    let allCat1 = new Set(), allCat2 = new Set(), allYearsOp = new Set(), allYearsExpense = new Set(), allFiscalYearsOp = new Set(), allFiscalYearsExpense = new Set(), allMonths = new Set();
    let tAxe = ($('timeAxe')||{value:'dateOp'}).value;
    transactions.forEach(t => {
        if (t.amount === 0) return;
        allCat1.add(t.cat1 || '_SANS_CATEGORIE');
        allCat2.add(t.cat2 || '_SANS_CATEGORIE');
        let dOpStr = String(t.dateOp || '');
        if (dOpStr.length >= 4) {
            let yOpRaw = dOpStr.substring(0,4);
            let mOp = dOpStr.length >= 7 ? dOpStr.substring(5,7) : null;
            allYearsOp.add(yOpRaw);
            if (mOp) allFiscalYearsOp.add(getFiscalYearLabel(yOpRaw, mOp, fiscalStartMonth));
        }
        let dExpStr = String(t.dateExpense || t.dateOp || '');
        if (dExpStr.length >= 4) {
            let yExpRaw = dExpStr.substring(0,4);
            let mExp = dExpStr.length >= 7 ? dExpStr.substring(5,7) : null;
            allYearsExpense.add(yExpRaw);
            if (mExp) allFiscalYearsExpense.add(getFiscalYearLabel(yExpRaw, mExp, fiscalStartMonth));
        }
        let dStr = String(t[tAxe] || t.dateOp || '');
        if (dStr.length >= 7) allMonths.add(dStr.substring(5,7));
    });

    function buildTags(containerId, allValues, filterSet, sorted) {
        let el = document.getElementById(containerId);
        if (!el) return;
        let vals = sorted ? [...allValues].sort() : [...allValues].sort((a,b)=>Number(a)-Number(b));
        el.innerHTML = vals.map(v => {
            let excluded = filterSet.has(v);
            let label = containerId.includes('Month') ? (MONTH_NAMES[parseInt(v)] || v) : v;
            return `<span class="ftag${excluded?' excluded':''}" data-val="${v}" data-set="${containerId}">${label}</span>`;
        }).join('');
        el.querySelectorAll('.ftag').forEach(tag => {
            tag.addEventListener('click', () => {
                let val = tag.dataset.val;
                if (filterSet.has(val)) filterSet.delete(val); else filterSet.add(val);
                tag.classList.toggle('excluded');
                saveTcdFilter();
                window.renderSummary();
            });
        });
    }

    buildTags('tcdFilterCat1Tags',  allCat1,  tcdFilter.cat1,  true);
    buildTags('tcdFilterCat2Tags',  allCat2,  tcdFilter.cat2,  true);
    buildTags('tcdFilterYearOpTags',  allYearsOp, tcdFilter.yearsOp, true);
    buildTags('tcdFilterYearExpenseTags',  allYearsExpense, tcdFilter.yearsExpense, true);
    buildTags('tcdFilterFiscalYearOpTags',  allFiscalYearsOp, tcdFilter.fiscalYearsOp, true);
    buildTags('tcdFilterFiscalYearExpenseTags',  allFiscalYearsExpense, tcdFilter.fiscalYearsExpense, true);
    buildTags('tcdFilterMonthTags', allMonths,tcdFilter.months,false);

    // Positionner le popup près du bouton
    let popup = document.getElementById('tcdFilterPopup');
    let overlay = document.getElementById('tcdFilterOverlay');
    let btn = document.getElementById('tcdFilterBtn');
    if (btn) {
        let r = btn.getBoundingClientRect();
        popup.style.top  = (r.bottom + 8) + 'px';
        popup.style.left = Math.min(r.left, window.innerWidth - 440) + 'px';
    }
    popup.classList.add('open');
    overlay.classList.add('open');
};

window.closeTcdFilter = function() {
    document.getElementById('tcdFilterPopup').classList.remove('open');
    document.getElementById('tcdFilterOverlay').classList.remove('open');
};

window.resetTcdFilter = function() {
    tcdFilter.cat1.clear(); tcdFilter.cat2.clear();
    tcdFilter.yearsOp.clear(); tcdFilter.yearsExpense.clear();
    tcdFilter.fiscalYearsOp.clear(); tcdFilter.fiscalYearsExpense.clear();
    tcdFilter.months.clear();
    saveTcdFilter();
    window.renderSummary();
    window.closeTcdFilter();
};

// Fermer sur clic overlay
document.getElementById('tcdFilterOverlay').addEventListener('click', window.closeTcdFilter);

// ════════════════════════════════════════════════════════
// À catégoriser — filtres colonnes
// ════════════════════════════════════════════════════════




window.toggleUfCatNotEmpty = function() {
    uncatColFilters.catNotEmpty = !uncatColFilters.catNotEmpty;
    let btn = $('ufCatNotEmptyBtn');
    if (btn) {
        btn.style.background = uncatColFilters.catNotEmpty ? 'var(--accent,#e07b54)' : 'var(--surface)';
        btn.style.color      = uncatColFilters.catNotEmpty ? '#fff' : 'var(--ink-muted)';
        btn.style.borderColor= uncatColFilters.catNotEmpty ? 'var(--accent,#e07b54)' : 'var(--ink-faint)';
    }
    let i=$('ufCat'); if(i) { i.value=''; } uncatColFilters.cat='';
    window.renderUncategorized();
};
window.applyUncatFilters = function() {
    uncatColFilters.dateOp      = ($('ufDateOp')     ||{value:''}).value.toLowerCase();
    uncatColFilters.dateExpense = ($('ufDateExpense') ||{value:''}).value.toLowerCase();
    uncatColFilters.details     = ($('ufDetails')    ||{value:''}).value.toLowerCase();
    uncatColFilters.cat         = ($('ufCat')        ||{value:''}).value.toLowerCase();
    uncatColFilters.note        = ($('ufNote')       ||{value:''}).value.toLowerCase();
    uncatColFilters.amount      = ($('ufAmount')     ||{value:''}).value.toLowerCase();
    window.renderUncategorized();
};

window.resetUncatFilters = function() {
    uncatColFilters = {dateOp:'', dateExpense:'', details:'', cat:'', note:'', amount:'', catNotEmpty:false, noteNotEmpty:false};
    ['ufDateOp','ufDateExpense','ufDetails','ufNote','ufAmount'].forEach(id => { let el=document.getElementById(id); if(el) el.value=''; });
    let b=$('ufCatNotEmptyBtn'); if(b){b.style.background='var(--surface)';b.style.color='var(--ink-muted)';b.style.borderColor='var(--ink-faint)';}
    window.renderUncategorized();
};

// ════════════════════════════════════════════════════════
// Export CSV coloré après import banque
// ════════════════════════════════════════════════════════
function exportImportResult(rawRows, importedIdx, skippedIdx, bankType) {
    try {
        let importedSet = new Set(importedIdx);
        let skippedSet  = new Set(skippedIdx);
        let dataOffset  = (bankType==='SOGE') ? 3 : (bankType==='FORT' ? 1 : 0);

        // Construire les données avec colonne "Résultat import" ajoutée à droite
        let outputRows = [];
        rawRows.forEach((row, ri) => {
            let r = Array.isArray(row) ? row.slice() : [row];
            let dataRowIdx = ri - dataOffset;
            let isImported = importedSet.has(dataRowIdx);
            let isSkipped  = skippedSet.has(dataRowIdx);
            // Ajouter colonne résultat
            if (ri === dataOffset - 1) {
                // Ligne d'entête → label colonne
                r.push('Résultat import');
            } else if (isImported) {
                r.push('OUI');
            } else if (isSkipped) {
                r.push('NON');
            } else {
                r.push('');
            }
            outputRows.push(r);
        });

        let wb = XLSX.utils.book_new();
        let ws = XLSX.utils.aoa_to_sheet(outputRows);

        // Colorier en rouge uniquement les lignes NON (skipped)
        let redFill = {patternType:'solid', fgColor:{rgb:'FFC7CE'}};
        let redFont = {color:{rgb:'9C0006'}};
        let ncols = outputRows[0] ? outputRows[0].length : 7;

        skippedIdx.forEach(dataRowIdx => {
            let ri = dataRowIdx + dataOffset;
            for (let ci = 0; ci < ncols; ci++) {
                let addr = XLSX.utils.encode_cell({r:ri, c:ci});
                if (!ws[addr]) ws[addr] = {t:'z', v:''};
                ws[addr].s = {fill: redFill, font: redFont};
            }
        });

        // Largeurs colonnes
        ws['!cols'] = outputRows[0] ? outputRows[0].map(() => ({wch:20})) : [];

        let range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        range.e.c = Math.max(range.e.c, ncols - 1);
        ws['!ref'] = XLSX.utils.encode_range(range);

        XLSX.utils.book_append_sheet(wb, ws, 'Import');

        let today = new Date();
        let ds = today.getFullYear()+String(today.getMonth()+1).padStart(2,'0')+String(today.getDate()).padStart(2,'0');
        let fname = 'import_result_'+bankType+'_'+ds+'.xlsx';
        XLSX.writeFile(wb, fname, {bookType:'xlsx', type:'binary', cellStyles:true});
    } catch(e) {
        console.warn('exportImportResult error:', e);
    }
}


