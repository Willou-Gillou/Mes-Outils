// ==== CONNEXION DRIVE ET CHIFFREMENT ====

const driveShowLoading = txt => {
    let lt = $('loadingText'); if(lt) lt.textContent = txt;
    let overlay = $('driveLoadingOverlay'); if(overlay) overlay.classList.add('open');
    let login = $('driveLoginOverlay'); if(login) login.classList.remove('open');
};
const driveHideLoading = () => {
    let overlay = $('driveLoadingOverlay'); if(overlay) overlay.classList.remove('open');
};
const driveShowLogin = () => {
    driveDataLoaded = true; 
    driveHideLoading();
    let login = $('driveLoginOverlay'); if(login) login.classList.add('open');
};

document.addEventListener('DOMContentLoaded', () => {
    let pwd = $('appPassword');
    if(pwd) pwd.addEventListener('keypress', e => { if(e.key === 'Enter') $('unlockBtn').click(); });
    
    let unlockBtn = $('unlockBtn');
    if(unlockBtn) unlockBtn.addEventListener('click', () => {
        const pwdVal = $('appPassword').value.trim(); 
        if(!pwdVal) return alert("Mot de passe requis.");
        appSecretKey = pwdVal;
        $('authOverlay').classList.remove('open');
        driveShowLoading('Chargement des données...');
        fetchDriveData().catch(() => { driveDataLoaded = true; driveShowLogin(); });
    });

    let googleBtn = $('googleLoginBtnReal');
    if(googleBtn) googleBtn.addEventListener('click', () => { 
        driveShowLoading("Authentification..."); 
        driveTokenClient.requestAccessToken({ prompt: 'consent' }); 
    });

    let logoutBtn = $('logoutBtn');
    if(logoutBtn) logoutBtn.addEventListener('click', () => { 
        if(driveAccessToken) google.accounts.oauth2.revoke(driveAccessToken); 
        localStorage.removeItem(DRIVE_LS+'token'); 
        localStorage.removeItem(DRIVE_LS+'token_exp'); 
        localStorage.removeItem(DRIVE_LS+'scope'); 
        localStorage.removeItem(DRIVE_LS+'granted_scope'); 
        location.reload(); 
    });

    // Lancement de la vérification des API Google
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
                let overlay = $('driveLoginOverlay');
                if(overlay) {
                    overlay.innerHTML = '<div style="text-align:center;max-width:420px;padding:24px;background:white;border-radius:12px;box-shadow:var(--shadow);">'
                        + '<h2 style="margin-bottom:8px;">⚠️ Connexion impossible</h2>'
                        + '<p style="color:var(--ink-soft);margin-bottom:20px;">Les API Google Drive ne sont pas disponibles.<br>Vérifiez votre connexion ou désactivez votre bloqueur de publicités.</p>'
                        + '<button class="btn btn-primary" onclick="location.reload()" style="width:100%;padding:14px;">🔄 Réessayer</button>'
                        + '</div>';
                    overlay.classList.add('open');
                }
            }
        }
    }, 200);
});

const buildEncryptedPayload = () => {
    let settings = {
        tcdHeaderColor: localStorage.getItem('f_tcd_header_color') || '',
        fontSize: localStorage.getItem('f_fontSize') || '14',
        tcdFontSize: localStorage.getItem('f_tcd_fontsize') || '13',
        pivot: localStorage.getItem('f_pivot_v2') || '',
        collapsedGroups: [...collapsedGroups],
        collapsedYears:  [...collapsedYears],
        tcdFilter: { 
            cat1: [...tcdFilter.cat1], 
            cat2: [...tcdFilter.cat2], 
            yearsOp: [...tcdFilter.yearsOp], 
            yearsExpense: [...tcdFilter.yearsExpense], 
            months: [...tcdFilter.months] 
        },
        tcdRedCells: (window.appState && window.appState.tcdRedCells) ? window.appState.tcdRedCells : {},
        settingsTs: Date.now(),
    };
    let payloadObj = {
        transactions, rules, categories, version: APP_VERSION, accounts, settings, 
        accountId: currentAccountId, 
        savedCharts: typeof savedCharts !== 'undefined' ? savedCharts : [],
        quittancesBiens: quittancesBiens, 
        quittancesEnabled: quittancesEnabled,
        budgetData: budgetData, 
        budgetEnabled: budgetEnabled, 
        regulEnabled: regulEnabled, 
        fiscalStartMonthSyndic: fiscalStartMonthSyndic
    };
    return JSON.stringify({vault: CryptoJS.AES.encrypt(JSON.stringify(payloadObj), appSecretKey).toString()});
};

function decryptPayload(remoteData) {
    if(!remoteData.vault) { driveDataLoaded=true; return true; }
    try {
        const p = JSON.parse(CryptoJS.AES.decrypt(remoteData.vault, appSecretKey).toString(CryptoJS.enc.Utf8));
        if(!p) throw new Error("Bad pwd");
        
        // Sécurité: vérifier que ce fichier appartient bien au compte actif
        if(p.accountId && p.accountId !== currentAccountId) {
            // Fusionner la liste des comptes
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
            driveFileIdMap = {}; 
            if(!window._redirectCount) window._redirectCount = 0;
            window._redirectCount++;
            if(window._redirectCount > 3) {
                window._redirectCount = 0;
                driveHideLoading();
                alert('Impossible de charger le bon compte. Vérifiez votre configuration.');
                return 'redirect';
            }
            setTimeout(() => fetchDriveData(), 300);
            return false; 
        }
        
        transactions = p.transactions || []; 
        rules = p.rules || [];
        if(p.categories) categories = p.categories;
        if(p.savedCharts) savedCharts = p.savedCharts;
        
        quittancesBiens = Array.isArray(p.quittancesBiens) ? p.quittancesBiens : [];
        let _todayStr = new Date().toISOString().slice(0,10);
        quittancesBiens.forEach(b => { b.signatureDate = _todayStr; });
        if (typeof p.quittancesEnabled === 'boolean') {
            quittancesEnabled = p.quittancesEnabled;
            localStorage.setItem('f_quittances_enabled', quittancesEnabled ? '1' : '0');
        }
        currentQuittanceBienId = quittancesBiens.length ? quittancesBiens[0].id : null;
        if (typeof applyQuittancesOptionState === 'function') applyQuittancesOptionState();
        
        budgetData = (p.budgetData && typeof p.budgetData === 'object') ? p.budgetData : {};
        if (typeof p.budgetEnabled === 'boolean') {
            budgetEnabled = p.budgetEnabled;
            localStorage.setItem('f_budget_enabled_' + currentAccountId, budgetEnabled ? '1' : '0');
        }
        if (typeof applyBudgetOptionState === 'function') applyBudgetOptionState();
        
        regulEnabled = localStorage.getItem('f_regul_enabled_' + currentAccountId) === '1';
        if (typeof applyRegulOptionState === 'function') applyRegulOptionState();
        if (typeof p.regulEnabled === 'boolean') {
            regulEnabled = p.regulEnabled;
            localStorage.setItem('f_regul_enabled_' + currentAccountId, regulEnabled ? '1' : '0');
        }
        if (p.fiscalStartMonthSyndic) {
            fiscalStartMonthSyndic = parseInt(p.fiscalStartMonthSyndic) || 10;
            localStorage.setItem('f_fiscal_syndic_' + currentAccountId, fiscalStartMonthSyndic);
        }
        currentRegulBienId = quittancesBiens.length ? quittancesBiens[0].id : null;
        if (typeof applyRegulOptionState === 'function') applyRegulOptionState();
        
        if(p.accounts && Array.isArray(p.accounts) && p.accounts.length > 0) {
            let merged = accounts.slice();
            p.accounts.forEach(function(remoteAcc) {
                if (!merged.find(function(a){ return a.id === remoteAcc.id; })) {
                    merged.push(remoteAcc);
                } else {
                    let localAcc = merged.find(function(a){ return a.id === remoteAcc.id; });
                    if (localAcc && remoteAcc.name) localAcc.name = remoteAcc.name;
                }
            });
            accounts = merged;
            saveAccountsList();
        }
        
        if(p.settings) {
            let s = p.settings;
            let localTs  = parseInt(localStorage.getItem('f_settings_ts') || '0');
            let driveTs  = parseInt(s.settingsTs || '0');
            let driveFresher = driveTs >= localTs;
            
            if(driveFresher) localStorage.setItem('f_settings_ts', driveTs);
            if(s.tcdHeaderColor) { localStorage.setItem('f_tcd_header_color', s.tcdHeaderColor); document.documentElement.style.setProperty('--tcd-header-color', s.tcdHeaderColor); let pk=$('tcdColorPicker'); if(pk) pk.value=s.tcdHeaderColor; }
            if(s.tcdFontSize) { localStorage.setItem('f_tcd_fontsize', s.tcdFontSize); let px=s.tcdFontSize+'px'; document.querySelectorAll('#summaryGrid .tcd-native th, #summaryGrid .tcd-native td').forEach(el=>{el.style.fontSize=px;el.style.height=px;}); }
            if(s.fontSize) { localStorage.setItem('f_fontSize', s.fontSize); currentFontSize=parseInt(s.fontSize)||14; document.documentElement.style.setProperty('--font-size', currentFontSize+'px'); }            
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
                    if (s.tcdRedCells && typeof s.tcdRedCells === 'object') {
                        if (!window.appState) window.appState = {};
                        window.appState.tcdRedCells = s.tcdRedCells;
                        setTimeout(function() { if(window.applyTcdRedTags) window.applyTcdRedTags(); }, 300);
                    }
                }
            }
        }
        mergeRules(); 
        return true;
    } catch(e) { return false; }
}

function initDrive() {
    let gapiReady = false, gisReady = false;
    const checkReady = () => {
        if (gapiReady && gisReady) {
            driveTokenClient = google.accounts.oauth2.initTokenClient({
                client_id: DRIVE_CLIENT_ID, 
                scope: DRIVE_SCOPE,
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
                driveAccessToken = token; 
                gapi.client.setToken({ access_token: driveAccessToken });
                $('logoutBtn').style.display = 'inline-flex';
                driveHideLoading();
                $('authOverlay').classList.add('open');
                $('appPassword').focus();
            } else {
                localStorage.removeItem(DRIVE_LS+'token');
                localStorage.removeItem(DRIVE_LS+'token_exp');
                localStorage.removeItem(DRIVE_LS+'scope');
                localStorage.removeItem(DRIVE_LS+'granted_scope');
                driveShowLogin();
            }
        }
    };
    gapi.load('client', async () => { await gapi.client.init({}); gapiReady = true; checkReady(); }); 
    gisReady = true; 
    checkReady();
}

const updateSyncBadge = (st, txt) => {
    let b = $('syncBadge');
    if(!b) return;
    b.textContent = txt;
    b.className = `badge badge-sync ${st==='ok'?'synced':st==='syncing'?'syncing':st==='error'?'error':''}`;
    b.onclick = st === 'error' ? () => { triggerSave(false); } : null;
    b.title = st === 'error' ? 'Cliquez pour réessayer la sauvegarde' : '';
};

async function driveGetFileId() {
    let fname = getAccountDriveFilename();
    if(driveFileIdMap[currentAccountId]) return driveFileIdMap[currentAccountId];
    let r = await fetch(`https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name='${fname}'&fields=files(id)`,{headers:{Authorization:'Bearer '+driveAccessToken}});
    let d = await r.json();
    let fid = (d.files&&d.files.length>0) ? d.files[0].id : null;
    if(fid) driveFileIdMap[currentAccountId] = fid;
    return fid;
}

async function fetchDriveData() {
    try {
        const fileId = await driveGetFileId();
        if (fileId) {
            const resp = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, { headers: { Authorization: `Bearer ${driveAccessToken}` } });
            let text = await resp.text(), remoteData={}; 
            if(text && text.trim().startsWith('{')) remoteData = JSON.parse(text);
            
            const decryptResult = decryptPayload(remoteData);
            if(decryptResult === true) {
                driveDataLoaded = true; 
                window._suppressSave = true;
                localStorage.setItem(DRIVE_LS+'token', driveAccessToken); 
                if(typeof window.tcdLoadCollapsed === 'function') window.tcdLoadCollapsed(); 
                if(typeof window.loadTcdFilter === 'function') window.loadTcdFilter(); 
                if(typeof window.renderAccountUI === 'function') window.renderAccountUI(); 
                if(typeof window.renderViewsSafe === 'function') window.renderViewsSafe(); 
                window._suppressSave = false;
                updateSyncBadge('ok', '✓ Connecté'); 
                driveHideLoading();
            } else if(decryptResult === 'redirect') {
                updateSyncBadge('syncing', 'Chargement du compte...');
            } else {
                appSecretKey = null;
                updateSyncBadge('error', 'Clé erronée');
                driveHideLoading();
                $('authOverlay').classList.add('open');
                $('appPassword').value = '';
                $('appPassword').focus();
                alert('❌ Mot de passe incorrect. Veuillez réessayer.');
            }
        } else { 
            updateSyncBadge('ok', '✓ Nouveau'); 
            if(typeof window.tcdLoadCollapsed === 'function') window.tcdLoadCollapsed(); 
            if(typeof window.renderViewsSafe === 'function') window.renderViewsSafe();  
            driveHideLoading(); 
        }
    } catch (e) { 
        updateSyncBadge('error', 'Erreur Sync'); 
        driveHideLoading(); 
        $('authOverlay').classList.add('open'); 
    }
}

window.triggerSave = function(reRenderDbView = false) {
    if(window._suppressSave) return; 
    updateSyncBadge('syncing', 'Sauvegarde en cours...'); 
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
        if (!driveAccessToken || !appSecretKey) return;
        try {
            const payload = buildEncryptedPayload(); 
            const fileId = await driveGetFileId();
            let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', method = 'POST'; 
            const form = new FormData();
            
            if (fileId) { 
                url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`; 
                method = 'PATCH'; 
            } else { 
                const meta = { name: getAccountDriveFilename(), parents: ['appDataFolder'] }; 
                form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' })); 
            }
            form.append('file', new Blob([payload], { type: 'application/json' }));
            
            const _sr = await fetch(url, {method, headers:{Authorization:`Bearer ${driveAccessToken}`}, body: fileId ? payload : form});
            
            if(!_sr.ok) {
                if(_sr.status === 401) {
                    driveAccessToken = null;
                    try {
                        await new Promise((res,rej)=>{ driveTokenClient.requestAccessToken({prompt:''}); setTimeout(res,3000); });
                        const _sr2 = await fetch(url, {method, headers:{Authorization:`Bearer ${driveAccessToken}`}, body: fileId ? payload : form});
                        if(!_sr2.ok) throw new Error('HTTP '+_sr2.status);
                    } catch(e2) { throw new Error('401 retry failed'); }
                } else {
                    throw new Error('HTTP '+_sr.status);
                }
            }
            if(!fileId) {
                try {
                    const _d = await _sr.clone().json();
                    if(_d.id) driveFileIdMap[currentAccountId] = _d.id;
                } catch(e){}
            }
            updateSyncBadge('ok', '✓ Sauvegardé'); 
            if(reRenderDbView && typeof window.renderDataTable === 'function') window.renderDataTable();
        } catch (e) {
            updateSyncBadge('error', '⚠ Échec sauvegarde — cliquez');
            showSaveError(e);
        }
    }, 1000);
};
