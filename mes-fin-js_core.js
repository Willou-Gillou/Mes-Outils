// ==== INITIALISATIONS GLOBALES V3.2.1 ====
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);
const APP_VERSION = '3.2.1';
const DRIVE_FILE_NAME = 'app_sys_data_v1.dat';
const DRIVE_CLIENT_ID = '68487410553-mp697niljk1ov3sn2ucjfe8ckkqds48p.apps.googleusercontent.com';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.send';
const DRIVE_LS = 'finances_drive_';

var appSecretKey = null; 
var transactions = [], rules = [], categories = {}, selectedBankForImport = "";
let dbSortCol = 'dateOp', dbSortDir = -1, catModalTxId = null, catModalSelectedCat1 = null, catModalSelectedCat2 = null;
var driveAccessToken = null, driveFileId = null, driveTokenClient = null, saveTimer = null;
var driveDataLoaded = false; 

// ── Multi-compte ──
var accounts = JSON.parse(localStorage.getItem('f_accounts')||'[{"id":"default","name":"Mon Compte"}]');
var currentAccountId = localStorage.getItem('f_current_account')||'default';
let driveFileIdMap = {};

function getAccountDriveFilename(){
    if (currentAccountId === 'default') return 'appsysdata-default.dat';
    var idx = accounts.findIndex(function(a){ return a.id === currentAccountId; });
    if (idx <= 0) return 'appsysdata-default.dat';
    return 'appsysdata-' + (idx + 1) + '.dat';
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
var tcdFilter = { cat1: new Set(), cat2: new Set(), yearsOp: new Set(), yearsExpense: new Set(), fiscalYearsOp: new Set(), fiscalYearsExpense: new Set(), months: new Set() };
var budgetFilter = { cat1: new Set(), cat2: new Set() };

// ── Variables Modules (Quittances, Budget, Régul) ──
var quittancesEnabled = false;
var quittancesBiens = []; 
var fiscalStartMonth = 1; 
var budgetEnabled = false;
var regulEnabled = false;
var currentRegulBienId = null;
var fiscalStartMonthSyndic = 10;
var budgetData = {}; 
var currentQuittanceBienId = null;
let _lastR1Keys = [];
let selectedUncatTxId = null;
let selectedUncatIds = new Set();
let tcdMap = {}; tcdMap['GRAND_TOTAL'] = [];
let tcdTabulator = null; 

// Initialisation UI au démarrage
document.addEventListener('DOMContentLoaded', () => {
    let vl = $('versionLabel'); if(vl) vl.textContent = `v${APP_VERSION}`;
    document.title = 'Mes finances - v' + APP_VERSION;
    
    // Restauration de la liste des comptes
    if (typeof window.renderAccountUI === 'function') window.renderAccountUI();
    
    // Restauration des paramètres du TCD
    let savedPivot = localStorage.getItem('f_pivot_v2');
    if(savedPivot) {
        try {
            let conf = JSON.parse(savedPivot);
            if(conf.r1) { let el = $('pivotRows'); if(el) el.value = conf.r1; }
            if(conf.r2 !== undefined) { let el = $('pivotRows2'); if(el) el.value = conf.r2; }
            if(conf.axe) { let el = $('timeAxe'); if(el) el.value = conf.axe; }
        } catch(e){}
    }
});

// Cache-busting : si une version différente est détectée en localStorage, forcer un hard-reload une seule fois
(function() {
    try {
        var storedVersion = localStorage.getItem('f_app_version_seen');
        if (storedVersion !== APP_VERSION) {
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
    localStorage.setItem('f_fontSize', currentFontSize); 
    if(typeof window.triggerSave === 'function') window.triggerSave(false);
};

// Appliquer couleur TCD sauvegardée immédiatement
(function(){ const c=localStorage.getItem('f_tcd_header_color'); if(c) document.documentElement.style.setProperty('--tcd-header-color',c); })();

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
                if(typeof window.updateBulkActions === 'function') window.updateBulkActions();
                if(typeof window.renderDataTable === 'function') window.renderDataTable();
            } else if(duplicateFilterActive) {
                if(typeof window.toggleDuplicateFilter === 'function') window.toggleDuplicateFilter();
            } else if(fltNoteNotEmpty) {
                if(typeof window.toggleFltNoteNotEmpty === 'function') window.toggleFltNoteNotEmpty();
            } else {
                let cleared = false;
                $$('.col-filter').forEach(inp => { if(inp.value !== '') { inp.value = ''; cleared = true; } });
                if(cleared && typeof window.renderDataTable === 'function') window.renderDataTable();
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
                selectedUncatTxId = null; selectedUncatIds.clear(); 
                if(typeof window.renderUncategorized === 'function') window.renderUncategorized();
            } else if (selectedUncatIds.size > 0) {
                selectedUncatTxId = null; selectedUncatIds.clear(); 
                if(typeof window.renderUncategorized === 'function') window.renderUncategorized();
            } else if(anyFilter || uncatColFilters.catNotEmpty) {
                if(typeof window.resetUncatFilters === 'function') window.resetUncatFilters();
            }
        }
    }
});

// ==== UTILITAIRES ET TRI ====
window.escapeHtml = function(unsafe) { return (unsafe||'').toString().replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#039;"); };
window.formatCurrency = function(val) { return new Intl.NumberFormat('fr-FR', {style:'currency',currency:'EUR'}).format(val||0); };

window.getC1Opts = function(sv) { 
    let keys = Object.keys(categories);
    if(sv && !keys.includes(sv)) keys.push(sv);
    return `<option value="">-- Cat 1 --</option>` + keys.sort(window.customSortCmp).map(k=>`<option value="${window.escapeHtml(k)}" ${k===sv?'selected':''}>${window.escapeHtml(k)}</option>`).join(''); 
};

window.getC2Opts = function(c1,sv) { 
    let arr = (c1 && categories[c1]) ? [...categories[c1]] : [];
    if(sv && !arr.includes(sv)) arr.push(sv);
    return `<option value="">-- Cat 2 --</option>` + arr.sort(window.customSortCmp).map(c=>`<option value="${window.escapeHtml(c)}" ${c===sv?'selected':''}>${window.escapeHtml(c)}</option>`).join(''); 
};

window.showSaveError = function(e) {
    const t = $('toast');
    t.textContent = '⚠ Sauvegarde Drive échouée : ' + (e && e.message ? e.message : 'erreur inconnue') + ' — Réessayez ou vérifiez votre connexion.';
    t.classList.add('show','toast-error');
    setTimeout(()=>{ t.classList.remove('show','toast-error'); }, 6000);
};

window.showToast = function(msg) { 
    const t=$('toast'); t.textContent=msg; t.classList.add('show'); 
    setTimeout(()=>t.classList.remove('show'),3000); 
};

window.mergeRules = function() { 
    if(!rules || !Array.isArray(rules)) rules=[]; 
    let m={}; 
    rules.forEach(r => { 
        let k=(r.cat1||'')+"|||"+(r.cat2||''); 
        if(!m[k])m[k]={c1:r.cat1,c2:r.cat2,p:new Set()}; 
        if(r.pattern&&typeof r.pattern==='string')r.pattern.split(';').forEach(p=>{if(p.trim())m[k].p.add(p.trim());}); 
    }); 
    rules = Object.values(m).map(r => ({cat1:r.c1,cat2:r.c2,pattern:Array.from(r.p).join(' ; ')})); 
};

window.customSortCmp = function(a, b) {
    let sa = String(a).toUpperCase(), sb = String(b).toUpperCase();
    let wA = sa.startsWith('_') ? 1 : (sa.startsWith('-') ? 2 : 3);
    let wB = sb.startsWith('_') ? 1 : (sb.startsWith('-') ? 2 : 3);
    if (wA !== wB) return wA - wB;
    return sa.localeCompare(sb);
};

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

// ==== NAVIGATION ONGLETS ====
document.addEventListener('DOMContentLoaded', () => {
    $$('.tab-btn').forEach(btn => btn.addEventListener('click', () => {
        if(typeof window.tcdSaveScroll === 'function') window.tcdSaveScroll();
        $$('.tab-btn').forEach(b => b.classList.remove('active'));
        $$('.view').forEach(v => v.classList.remove('active'));
        btn.classList.add('active');
        $(btn.dataset.target).classList.add('active');
        if(typeof window.renderViewsSafe === 'function') window.renderViewsSafe();
    }));
});

window.renderViewsSafe = function() {
    try { 
        if(typeof window.renderSummary === 'function') window.renderSummary(); 
        if(typeof window.renderUncategorized === 'function') window.renderUncategorized(); 
        if(typeof window.renderDataTable === 'function') window.renderDataTable(); 
        if(typeof window.renderRules === 'function') window.renderRules(); 
        if(typeof window.renderCategories === 'function') window.renderCategories(); 
        let bc = $('bulkCat1'); if(bc) bc.innerHTML=window.getC1Opts(); 
        if(typeof window.renderCharts === 'function') window.renderCharts(); 
        if(typeof window.applyQuittancesOptionState === 'function') window.applyQuittancesOptionState(); 
        if(typeof window.renderQuittancesView === 'function') window.renderQuittancesView(); 
        if(typeof window.applyBudgetOptionState === 'function') window.applyBudgetOptionState();
        
        regulEnabled = localStorage.getItem('f_regul_enabled_' + currentAccountId) === '1';
        if(typeof window.applyRegulOptionState === 'function') window.applyRegulOptionState(); 
        
        if (budgetEnabled && typeof window.renderBudget === 'function') window.renderBudget(); 
        if (regulEnabled && typeof window.renderRegul === 'function') window.renderRegul(); 
    } catch(err) { 
        console.error('Erreur affichage:', err); 
        alert("Erreur d'affichage: " + err.message); 
    }
};

window.addEventListener('beforeunload', () => {
    if(typeof window.tcdSaveScroll === 'function') window.tcdSaveScroll();
});
document.addEventListener('visibilitychange', () => { 
    if (document.hidden && typeof window.tcdSaveScroll === 'function') window.tcdSaveScroll(); 
});
