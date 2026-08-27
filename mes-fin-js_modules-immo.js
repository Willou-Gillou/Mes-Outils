// ==== QUITTANCES DE LOYER ====

window.toggleQuittancesOption = function(checked) {
    quittancesEnabled = checked;
    localStorage.setItem('f_quittances_enabled_' + currentAccountId, checked ? '1' : '0');
    let tab = $('tabQuittances'); if(tab) tab.style.display = checked ? '' : 'none';
    if (!checked) {
        let activeTab = document.querySelector('.tab-btn.active');
        if (activeTab && activeTab.dataset.target === 'view-quittances') {
            document.querySelector('.tab-btn[data-target="view-summary"]').click();
        }
    }
    window.triggerSave(false);
};

window.applyQuittancesOptionState = function() {
    let enabled = quittancesEnabled;
    let tab = $('tabQuittances'); if(tab) tab.style.display = enabled ? '' : 'none';
    let cb = $('optQuittancesCb'); if (cb) cb.checked = enabled;
};

function saveQuittancesBiens() {
    window.triggerSave(false);
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
    else if (!bien.driveFolderId) { let l = $('qDriveFilesList'); if(l) l.innerHTML = ''; }
};

window.uploadQuittanceLogo = function(input) {
    let file = input.files[0]; if (!file) return;
    let bien = getCurrentBien(); if (!bien) return;
    let reader = new FileReader();
    reader.onload = function(e) {
        bien.logoDataUrl = e.target.result;
        let img = $('qLogoPreview');
        if(img) { img.src = e.target.result; img.style.display = 'inline-block'; }
        saveQuittancesBiens();
        window.showToast('✅ Logo enregistré');
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
    window.showToast('✅ Bailleur copié depuis "' + source.nom + '"');
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
    window.showToast('✅ Signature copiée depuis "' + source.nom + '"');
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
    window.showToast('✅ Bien exporté');
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
            window.showToast('✅ Bien importé : ' + imported.nom);
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

// Locataires
window.addQuittanceLocataire = function() {
    let bien = getCurrentBien(); if (!bien) return;
    bien.locataires.push({ nom:'', email:'', tel:'' });
    saveQuittancesBiens();
    window.renderQuittanceLocataires();
};
window.removeQuittanceLocataire = function(idx) {
    let bien = getCurrentBien(); if (!bien) return;
    if (bien.locataires.length <= 1) { window.showToast('⚠️ Au moins un locataire requis'); return; }
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
    let el = $('qLocatairesList'); if(!el) return;
    el.innerHTML = bien.locataires.map((l, idx) => `
        <div style="display:flex;gap:6px;align-items:center;">
            <input type="text" class="input-text" placeholder="Nom locataire ${idx+1}" value="${(l.nom||'').replace(/"/g,'&quot;')}" style="flex:1;" onchange="window.updateQuittanceLocataire(${idx},'nom',this.value)">
            <input type="email" class="input-text" placeholder="Email" value="${(l.email||'').replace(/"/g,'&quot;')}" style="flex:1;" onchange="window.updateQuittanceLocataire(${idx},'email',this.value)">
            <input type="text" class="input-text" placeholder="Téléphone" value="${(l.tel||'').replace(/"/g,'&quot;')}" style="flex:1;" onchange="window.updateQuittanceLocataire(${idx},'tel',this.value)">
            <button class="btn btn-outline" style="padding:4px 8px;" onclick="window.removeQuittanceLocataire(${idx})">🗑️</button>
        </div>
    `).join('');
};

// Désignation
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
    let qt = $('qDesignationTexte'); if(qt) qt.value = bien.designation.texte || '';
    let qa = $('qDesignationAdresse'); if(qa) qa.value = bien.designation.adresse || '';
};

// Echéancier
function fmtIsoLocal(y, m, d) { return y + '-' + String(m+1).padStart(2,'0') + '-' + String(d).padStart(2,'0'); }

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
    window.showToast('♻️ Échéancier réinitialisé');
};
window.updateQuittanceEcheance = function(dateIso, field, value) {
    let bien = getCurrentBien(); if (!bien) return;
    let target = bien.echeancier.find(e => e.date === dateIso);
    if (!target) return;
    if (field === 'montant') { target.montant = parseFloat(value) || 0; } 
    else if (field === 'detail') {
        target.detail = value;
        let parts = String(value).split('+').map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
        if (parts.length > 0) { target.montant = parts.reduce((a,b) => a+b, 0); }
    } else { target[field] = value; }
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
    window.showToast('✅ Ligne dupliquée sur l\'année en cours');
};

function computeEcheanceMontantAffiche(e, fmtEur) {
    let detail = (e.detail||'').trim();
    if (!detail) return fmtEur(e.montant);
    let cleaned = detail.replace(/€/g, '').replace(/\s+/g, '');
    if (/^[0-9,.+\-]+$/.test(cleaned)) {
        let normalized = cleaned.replace(/,/g, '.');
        let parts = normalized.split(/(?=[+\-])/).filter(Boolean);
        let sum = 0; let valid = true;
        parts.forEach(p => { let v = parseFloat(p); if (isNaN(v)) { valid = false; return; } sum += v; });
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
        <td><select class="input-text" style="color:#111;${isPaid?'background:transparent;border-color:rgba(0,0,0,0.3);':''}" onchange="window.updateQuittanceEcheance('${dateIso}','statut',this.value)">
                <option value="Payé" ${e.statut==='Payé'?'selected':''}>Payé</option>
                <option value="À venir" ${e.statut==='À venir'?'selected':''}>À venir</option>
            </select></td>
    </tr>`;
}

window.renderQuittanceEcheancier = function() {
    let bien = getCurrentBien(); if (!bien) return;
    let qa = $('qDateAnniversaire'); if(qa) qa.value = bien.dateAnniversaire || '';
    let bodyA = $('qEcheancierBodyA'), bodyB = $('qEcheancierBodyB');
    let yearSelWrap = $('qEcheancierYearWrap');

    if (!bien.dateAnniversaire) {
        if(bodyA) bodyA.innerHTML = ''; 
        if(bodyB) bodyB.innerHTML = '';
        if(yearSelWrap) yearSelWrap.style.display = 'none';
        return;
    }
    if(yearSelWrap) yearSelWrap.style.display = 'inline-block';
    
    let [y, m, d] = bien.dateAnniversaire.split('-').map(Number);
    let now = new Date();
    let currentMonthsDiff = (now.getFullYear() - y) * 12 + (now.getMonth() - (m - 1));
    let totalYears = Math.max(1, Math.ceil((currentMonthsDiff + 1) / 12)) + 1; 

    let sel = $('qEcheancierYearSelect');
    let currentSelYear = sel && sel.value ? parseInt(sel.value) : Math.max(1, totalYears - 1);
    if (currentSelYear > totalYears) currentSelYear = totalYears;
    
    let opts = '';
    for (let i = 1; i <= totalYears; i++) {
        let yStart = y + i - 1;
        let yearLabel = (m === 1) ? yStart : `${yStart}-${yStart+1}`;
        opts += `<option value="${i}" ${i === currentSelYear ? 'selected' : ''}>Année ${i} (${yearLabel})</option>`;
    }
    if(sel) sel.innerHTML = opts;
    
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
                if (pastDates.length > 0) { existing = { date: isoDate, detail: pastDates[0].detail, montant: pastDates[0].montant, statut: 'À venir', selected: false }; }
            }
            if (!existing) existing = { date: isoDate, detail: '', montant: 0, statut: 'À venir', selected: false };
            bien.echeancier.push(existing);
        }
        displayList.push(existing);
    });
    bien.echeancier.sort((a,b) => a.date.localeCompare(b.date));
    
    if(bodyA) bodyA.innerHTML = displayList.slice(0,6).map((e, i) => renderEcheanceRow(e, e.date, i===0)).join('');
    if(bodyB) bodyB.innerHTML = displayList.slice(6,12).map((e, i) => renderEcheanceRow(e, e.date, false)).join('');
};

function newQuittanceLigne(libelle) { return { libelle: libelle, detail: '', debit: 0, credit: 0 }; }

window.updateQuittancePeriodeFromMonth = function() {
    let el = $('qGenPeriodeMois'); if(!el) return;
    let val = el.value; if (!val) return;
    let [y, m] = val.split('-').map(Number);
    let debut = y + '-' + String(m).padStart(2,'0') + '-01';
    let lastDay = new Date(y, m, 0).getDate();
    let fin = y + '-' + String(m).padStart(2,'0') + '-' + String(lastDay).padStart(2,'0');
    let qgd = $('qGenPeriodeDebut'); if(qgd) qgd.value = debut;
    let qgf = $('qGenPeriodeFin'); if(qgf) qgf.value = fin;
    let fmt = d => { let [yy,mm,dd] = d.split('-'); return dd+'/'+mm+'/'+yy; };
    let qga = $('qGenPeriodeAffichee'); if(qga) qga.textContent = 'Du ' + fmt(debut) + ' au ' + fmt(fin);
    window.renderQuittanceTableLignes();
};

window.applyRevenuToQuittanceLignes = function(dateIso, montant, dateExpenseIso) {
    let bien = getCurrentBien(); if (!bien) return;
    if (!dateIso) { window.showToast('⚠️ Date manquante sur cette écriture'); return; }
    let amt = parseFloat(montant) || 0;
    let moisRef = (dateExpenseIso || dateIso || '').slice(0,7);
    if (moisRef && $('qGenPeriodeMois')) {
        $('qGenPeriodeMois').value = moisRef;
        window.updateQuittancePeriodeFromMonth();
    }
    let absAmt = Math.abs(amt); let updatedCount = 0;

    function isDateLine(l) { return l.libelle === 'Payé par virement bancaire, le' || l.dateDetail === true || /^\d{4}-\d{2}-\d{2}$/.test(l.detail || ''); }

    [bien.lignesQuittance, bien.lignesCaution].forEach(list => {
        if (!Array.isArray(list)) return;
        list.forEach(l => {
            if (isDateLine(l)) {
                l.detail = dateIso;
                if (amt >= 0) { l.credit = absAmt; l.debit = 0; } else { l.debit = absAmt; l.credit = 0; }
                updatedCount++;
            }
        });
    });

    if (!updatedCount) { window.showToast('⚠️ Aucune ligne datée trouvée dans les tableaux'); return; }
    saveQuittancesBiens();
    window.renderQuittanceLignesBody();
    if(typeof window.renderQuittanceCautionLignesBody === 'function') window.renderQuittanceCautionLignesBody();
    window.showToast('✅ Écriture reportée dans ' + updatedCount + ' ligne(s) datée(s)');
};

window.renderQuittanceRevenusTable = function() {
    let body = $('qRevenusBody'); if (!body) return;
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
        let dateIso = t.dateOp || ''; let dateExpenseIso = t.dateExpense || '';
        let amount = parseFloat(t.amount) || 0;
        return `<tr style="cursor:pointer;" title="Cliquer pour reporter cette écriture dans les lignes datées des tableaux de quittance" onclick="window.applyRevenuToQuittanceLignes('${dateIso}', ${amount}, '${dateExpenseIso}')">
        <td>${fmtDate(t.dateOp)}</td><td>${fmtDate(t.dateExpense)}</td>
        <td colspan="2" title="${escaped}" style="max-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${detailTxt}</td>
        <td style="text-align:right;white-space:nowrap;">${fmtEur(t.amount)}</td></tr>`;
    }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--ink-soft);padding:16px;">Aucun revenu trouvé sur les 6 derniers mois</td></tr>';
};

window.renderQuittanceTableLignes = function() {
    let bien = getCurrentBien(); if (!bien) return;
    if (!bien.lignesQuittance || !Array.isArray(bien.lignesQuittance) || bien.lignesQuittance.length === 0) {
        bien.lignesQuittance = [ newQuittanceLigne('Loyer'), newQuittanceLigne('Provision sur charges'), newQuittanceLigne('Autre'), newQuittanceLigne('Payé par virement bancaire, le') ];
    }
    if (!bien.lignesCaution || !Array.isArray(bien.lignesCaution) || bien.lignesCaution.length === 0) {
        bien.lignesCaution = [ newQuittanceLigne('Dépôt de garantie'), newQuittanceLigne('Payé par virement bancaire, le') ];
    }
    window.renderQuittanceLignesBody();
    if(typeof window.renderQuittanceCautionLignesBody === 'function') window.renderQuittanceCautionLignesBody();
};

window.updateQuittanceLigne = function(idx, field, value) {
    let bien = getCurrentBien(); if (!bien) return;
    if (field === 'debit' || field === 'credit') { bien.lignesQuittance[idx][field] = parseFloat(value) || 0; } 
    else { bien.lignesQuittance[idx][field] = value; }
    saveQuittancesBiens(); window.renderQuittanceLignesBody();
};

window.renderQuittanceLignesBody = function() {
    let bien = getCurrentBien(); if (!bien) return;
    let body = $('qLignesBody'); if(!body) return;
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
    let qtd = $('qTotalDebit'); if(qtd) qtd.textContent = fmtEur(totalDebit) + ' €';
    let qtc = $('qTotalCredit'); if(qtc) qtc.textContent = fmtEur(totalCredit) + ' €';
};

window.renderQuittanceCautionLignesBody = function() {
    let bien = getCurrentBien(); if (!bien) return;
    let body = $('qCautionLignesBody'); if (!body) return;
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
                <button class="btn btn-outline" style="padding:1px 4px;font-size:0.85em;" title="Supprimer" onclick="window.removeQuittanceCautionLigne(${idx})">🗑️</button>
            </td>
        </tr>`;
    }).join('');
    let totalDebit = bien.lignesCaution.reduce((s,l) => s + (parseFloat(l.debit)||0), 0);
    let totalCredit = bien.lignesCaution.reduce((s,l) => s + (parseFloat(l.credit)||0), 0);
    let qcd = $('qCautionTotalDebit'); if(qcd) qcd.textContent = fmtEur(totalDebit) + ' €';
    let qcc = $('qCautionTotalCredit'); if(qcc) qcc.textContent = fmtEur(totalCredit) + ' €';
};

window.updateQuittanceCautionLigne = function(idx, field, value) {
    let bien = getCurrentBien(); if (!bien) return;
    if (field === 'debit' || field === 'credit') { bien.lignesCaution[idx][field] = parseFloat(value) || 0; } 
    else { bien.lignesCaution[idx][field] = value; }
    saveQuittancesBiens(); window.renderQuittanceCautionLignesBody();
};

window.removeQuittanceCautionLigne = function(idx) {
    let bien = getCurrentBien(); if (!bien) return;
    if (bien.lignesCaution.length <= 1) { window.showToast('⚠️ Au moins une ligne requise'); return; }
    bien.lignesCaution.splice(idx, 1);
    saveQuittancesBiens(); window.renderQuittanceCautionLignesBody();
};

window.moveQuittanceCautionLigne = function(idx, direction) {
    let bien = getCurrentBien(); if (!bien) return;
    let newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= bien.lignesCaution.length) return;
    let arr = bien.lignesCaution;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    saveQuittancesBiens(); window.renderQuittanceCautionLignesBody();
};

window.toggleQuittanceLigneVisible = function(idx) {
    let bien = getCurrentBien(); if (!bien) return;
    bien.lignesQuittance[idx].hidden = !bien.lignesQuittance[idx].hidden;
    saveQuittancesBiens(); window.renderQuittanceLignesBody();
};

window.insertQuittanceLigne = function(afterIdx) {
    let bien = getCurrentBien(); if (!bien) return;
    bien.lignesQuittance.splice(afterIdx + 1, 0, { libelle: '', detail: '', debit: 0, credit: 0, dateDetail: false });
    saveQuittancesBiens(); window.renderQuittanceLignesBody();
};

window.removeQuittanceLigne = function(idx) {
    let bien = getCurrentBien(); if (!bien) return;
    if (bien.lignesQuittance.length <= 1) { window.showToast('⚠️ Au moins une ligne requise'); return; }
    bien.lignesQuittance.splice(idx, 1);
    saveQuittancesBiens(); window.renderQuittanceLignesBody();
};

window.moveQuittanceLigne = function(idx, direction) {
    let bien = getCurrentBien(); if (!bien) return;
    let newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= bien.lignesQuittance.length) return;
    let arr = bien.lignesQuittance;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    saveQuittancesBiens(); window.renderQuittanceLignesBody();
};

// ── Rendu global de la vue Quittances ──
window.renderQuittancesView = function() {
    let sel = $('quittanceBienSelector');
    if(sel) sel.innerHTML = quittancesBiens.map(b => `<option value="${b.id}" ${b.id===currentQuittanceBienId?'selected':''}>${b.nom}</option>`).join('');

    let empty = $('quittanceEmptyState'), form = $('quittanceFormWrapper');
    let bien = getCurrentBien();
    if (!bien) {
        if(empty) empty.style.display = 'block';
        if(form) form.style.display = 'none';
        return;
    }
    if(empty) empty.style.display = 'none';
    if(form) form.style.display = 'block';

    let n = $('qBailleurNom'); if(n) n.value = bien.bailleur.nom || '';
    let a = $('qBailleurAdresse'); if(a) a.value = bien.bailleur.adresse || '';
    let m = $('qBailleurEmail'); if(m) m.value = bien.bailleur.email || '';
    let tl = $('qBailleurTel'); if(tl) tl.value = bien.bailleur.tel || '';
    let fA = $('qFaitA'); if(fA) fA.value = bien.faitA || '';
    let sT = $('qSignatureTexte'); if(sT) sT.value = bien.signatureTexte || '';
    let sD = $('qSignatureDate'); if(sD) sD.value = bien.signatureDate || new Date().toISOString().slice(0,10);
    let comm = $('qCommentaires'); if(comm) comm.value = bien.commentaires || '';
    let dF = $('qDriveFolderId'); if(dF) dF.value = bien.driveFolderId || '';
    
    if(typeof window.updateQuittanceDriveLink === 'function') window.updateQuittanceDriveLink();
    
    let lP = $('qLogoPreview');
    if(lP) {
        if (bien.logoDataUrl) { lP.src = bien.logoDataUrl; lP.style.display = 'inline-block'; }
        else { lP.style.display = 'none'; }
    }
    if (bien.driveFolderId && typeof window.loadQuittanceDriveFiles === 'function') { window.loadQuittanceDriveFiles(); } 
    else { let qdfl = $('qDriveFilesList'); if(qdfl) qdfl.innerHTML = ''; }

    populateCopySelectors();
    window.renderQuittanceLocataires();
    window.renderQuittanceDesignations();
    window.renderQuittanceEcheancier();
    window.renderQuittanceTableLignes();
    window.renderQuittanceRevenusTable();
    let qpc = $('quittancePreviewContainer'); if(qpc) qpc.style.display = 'none';
};

window.generateQuittanceAffichage = function() { window._generateQuittanceCore('loyer'); };
window.generateAppelLoyerAffichage = function() { window._generateQuittanceCore('appel'); };
window.generateCautionAffichage = function() { window._generateQuittanceCore('caution'); };

window._generateQuittanceCore = function(type) {
    let bien = getCurrentBien();
    if (!bien) { alert('Sélectionnez ou créez un bien.'); return; }
    let debut = '', fin = '';
    if (type !== 'caution') {
        let qgd = $('qGenPeriodeDebut'); debut = qgd ? qgd.value : ''; 
        let qgf = $('qGenPeriodeFin'); fin = qgf ? qgf.value : '';
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
        let libelleAffiche = isDatedLine ? (l.libelle + (l.detail ? ' ' + fmtDate(l.detail) : '')) : (l.libelle + (l.detail ? ' : ' + l.detail : ''));
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
        return `<tr style="${bg}"><td style="padding:4px 8px;border:1px solid #ccc;">${d ? fmtDate(e.date) : ''}</td><td style="padding:4px 8px;border:1px solid #ccc;">${e.detail||''}${e.detail?' = ':''}${fmtEur(e.montant)}</td></tr>`;
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
    let nomsLocatairesHtml = bien.locataires.map(l => l.nom || '').filter(Boolean).join('<br>');
    let adresseLocativeHtml = designation.adresse ? `<span style="font-size:0.85em;color:#555;">${designation.adresse}</span><br>` : '';
    let contactsLocatairesHtml = bien.locataires.map(l => {
        let lignes = [l.email, l.tel].filter(Boolean);
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
        <div style="width:48%;"><strong>Le bailleur:</strong><div style="margin-top:4px;">${bien.bailleur.nom}<br>${bien.bailleur.adresse}<br>${bien.bailleur.email}<br>${bien.bailleur.tel}</div></div>
        <div style="width:48%;"><strong>Le(s) locataire(s):</strong><div style="margin-top:4px;">${locatairesHtml}</div></div>
    </div>
    <p style="margin-bottom:12px;font-size:0.92em;">Désignation des locaux : ${designation.texte || ''}</p>
    <div style="border:0.6px solid #111;text-align:center;padding:8px;font-size:1.1em;font-weight:bold;margin-bottom:12px;">${titreAffiche}</div>
    ${periodeHtml}
    <table style="width:100%;border-collapse:collapse;margin-bottom:0;font-size:0.85em;">
        <thead><tr style="background:#333;color:white;"><th style="padding:5px 8px;text-align:left;font-weight:bold;">Libellé</th><th style="padding:5px 8px;text-align:right;font-weight:bold;">Débit</th><th style="padding:5px 8px;text-align:right;font-weight:bold;">Crédit</th></tr></thead>
        <tbody>${lignesHtml}</tbody>
        <tfoot><tr style="font-weight:bold;border-top:0.6px solid #333;"><td style="padding:6px 8px;">TOTAL</td><td style="padding:6px 8px;text-align:right;">${fmtEur(totalDebit)}</td><td style="padding:6px 8px;text-align:right;">${fmtEur(totalCredit)}</td></tr></tfoot>
    </table>
    <p style="text-align:right;margin:16px 0 3px;font-size:0.85em;">Fait à ${bien.faitA || ''}, le ${fmtDate(bien.signatureDate) || new Date().toLocaleDateString('fr-FR')}</p>
    <p style="text-align:right;font-size:0.85em;">${bien.signatureTexte || ''}</p>
    <div style="text-align:right;">${logoHtml}</div>
    ${(bien.commentaires||'').trim() ? `<div style="margin-top:14px;font-size:0.8em;"><strong>Commentaires:</strong><br>${(bien.commentaires||'').replace(/\n/g,'<br>')}</div>` : ''}
    ${echeancierHtml}
    `;

    let qp = $('quittancePreview'); if(qp) qp.innerHTML = html;
    let qpc = $('quittancePreviewContainer');
    if(qpc) {
        qpc.style.display = 'block';
        qpc.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

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

    window.showToast('✅ Document généré');
};

window.getQuittanceFileName = function() {
    let d = window._lastQuittanceData;
    let type = d ? d.type : 'loyer';
    let qgm = $('qGenPeriodeMois'); let mois = qgm ? qgm.value : '';
    if (!mois) { let debut = $('qGenPeriodeDebut') ? $('qGenPeriodeDebut').value : ''; mois = debut.slice(0,7); }
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
        startY: y, margin: { left: marginX, right: marginX },
        head: [['Libellé', 'Débit', 'Crédit']], body: rows,
        foot: [['TOTAL', d.fmtEur(d.totalDebit), d.fmtEur(d.totalCredit)]],
        theme: 'plain', styles: { fontSize: 9, cellPadding: 2 },
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
    let bien = getCurrentBien(); if (!bien) return;
    let pdf = await window.buildQuittancePdfBlob(); if (!pdf) return;
    pdf.save(window.getQuittanceFileName());
    window.showToast('✅ PDF téléchargé');
};

// ==== BUDGET / PROJECTION ====

window.toggleBudgetOption = function(checked) {
    budgetEnabled = checked;
    localStorage.setItem('f_budget_enabled_' + currentAccountId, checked ? '1' : '0');
    let tab = $('tabBudget'); if(tab) tab.style.display = checked ? '' : 'none';
    if (!checked) {
        let activeTab = document.querySelector('.tab-btn.active');
        if (activeTab && activeTab.dataset.target === 'view-budget') {
            document.querySelector('.tab-btn[data-target="view-summary"]').click();
        }
    }
    window.triggerSave(false);
};

window.applyBudgetOptionState = function() {
    let enabled = budgetEnabled;
    let tab = $('tabBudget'); if(tab) tab.style.display = enabled ? '' : 'none';
    let cb = $('optBudgetCb'); if (cb) cb.checked = enabled;
    if (enabled) window.populateBudgetExerciceSelect();
};

window.populateBudgetExerciceSelect = function() {
    let sel = $('budgetExerciceSelect'); if (!sel) return;
    let exercices = new Set();
    transactions.forEach(t => {
        let dStr = String(t.dateExpense || t.dateOp || '');
        if (dStr.length < 7) return;
        let y = dStr.substring(0,4), m = dStr.substring(5,7);
        if(typeof window.getFiscalYearLabel === 'function') {
            exercices.add(window.getFiscalYearLabel(y, m, fiscalStartMonth));
        }
    });
    Object.keys(budgetData).forEach(ex => exercices.add(ex));
    let sorted = [...exercices].sort();
    if (sorted.length === 0) {
        let now = new Date();
        let y = String(now.getFullYear()), m = String(now.getMonth()+1).padStart(2,'0');
        if(typeof window.getFiscalYearLabel === 'function') {
            sorted = [window.getFiscalYearLabel(y, m, fiscalStartMonth)];
        } else {
            sorted = [y];
        }
    }
    let prevVal = sel.value;
    sel.innerHTML = sorted.map(ex => `<option value="${ex}">${ex}</option>`).join('');
    if (sorted.includes(prevVal)) sel.value = prevVal;
    else sel.value = sorted[sorted.length-1];
    window.renderBudget();
};

window.setBudgetCell = function(ex, c1, c2, month, val) {
    if (budgetData[ex] && budgetData[ex].__closed) { window.renderBudget(); return; }
    let cleaned = String(val||'').replace(/[\s\u00A0\u202F€a-zA-Z]/g,'').replace(',', '.').trim();
    let n = parseFloat(cleaned);
    if (isNaN(n)) n = 0;
    if (!budgetData[ex]) budgetData[ex] = {};
    if (!budgetData[ex][c1]) budgetData[ex][c1] = {};
    if (!budgetData[ex][c1][c2]) budgetData[ex][c1][c2] = {};
    if (n === 0) delete budgetData[ex][c1][c2][month];
    else budgetData[ex][c1][c2][month] = n;
    window.triggerSave(true);
    window.renderBudget();
};

window.renderBudget = function() {
    let sel = $('budgetExerciceSelect'); let container = $('budgetGrid');
    if (!sel || !container) return;
    let ex = sel.value; if (!ex) return;

    let months = [];
    for (let i = 0; i < 12; i++) {
        let mi = ((fiscalStartMonth - 1 + i) % 12) + 1;
        months.push(String(mi).padStart(2,'0'));
    }
    const monthNames = ['','Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
    const monthLabel = (m, extraMap) => {
        if (extraMap && extraMap[m]) { let ex2 = extraMap[m]; return `${monthNames[parseInt(ex2.m)]} ${ex2.y}`; }
        return monthNames[parseInt(m)];
    };

    let realByC1C2Month = {}, realByC1Month = {};
    let extraMonthsMap = {}; 
    transactions.forEach(t => {
        if (t.amount === 0) return;
        let dRealStr = String(t.dateExpense || t.dateOp || '');
        if (dRealStr.length < 7) return;
        let yReal = dRealStr.substring(0,4), mReal = dRealStr.substring(5,7);
        if (typeof window.getFiscalYearLabel === 'function' && window.getFiscalYearLabel(yReal, mReal, fiscalStartMonth) !== ex) return;
        let dOpStr = String(t.dateOp || t.dateExpense || '');
        if (dOpStr.length < 7) return;
        let yOp = dOpStr.substring(0,4), mOp = dOpStr.substring(5,7);
        let c1 = t.cat1 || '_SANS_CATEGORIE', c2 = t.cat2 || '_SANS_CATEGORIE';
        if (budgetFilter.cat1.has(c1) || budgetFilter.cat2.has(c2)) return;
        let amt = Number(t.amount) || 0;
        let isStandard = typeof window.getFiscalYearLabel === 'function' && window.getFiscalYearLabel(yOp, mOp, fiscalStartMonth) === ex;
        let m = isStandard ? mOp : `X${yOp}${mOp}`;
        if (!isStandard) extraMonthsMap[m] = { m: mOp, y: yOp };
        let k = `${c1}::${c2}::${m}`; realByC1C2Month[k] = (realByC1C2Month[k]||0) + amt;
        let k1 = `${c1}::${m}`; realByC1Month[k1] = (realByC1Month[k1]||0) + amt;
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
                if (existsInDb) return; 
                if (hasNonZeroBudget(c1, c2)) {
                    if (!allCats[c1]) allCats[c1] = new Set();
                    allCats[c1].add(c2);
                }
            });
        });
    }
    let c1Sorted = Object.keys(allCats).sort(window.customSortCmp);

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
        return ` <span class="budget-delta ${cls}">(${d>0?'+':''}${window.formatCurrency(d)})</span>`;
    };

    let nowY = new Date().getFullYear(), nowM = new Date().getMonth() + 1;
    const isFutureMonth = (m) => {
        if (extraMonthsMap[m]) return false;
        let mi = parseInt(m, 10);
        let yFiscalStart = parseInt(ex.split('-')[0], 10);
        let yReal = (mi >= fiscalStartMonth) ? yFiscalStart : yFiscalStart + 1;
        return (yReal > nowY) || (yReal === nowY && mi > nowM);
    };
    const indicatorHtml = (bVal, rVal, c1, c2, m) => {
        if (isFutureMonth(m)) return '';
        let bEmpty = !bVal, rEmpty = !rVal;
        if (bEmpty && rEmpty) return '';
        let dataAttrs = `data-ex="${window.escapeHtml(ex)}" data-c1="${window.escapeHtml(c1)}" data-c2="${window.escapeHtml(c2)}" data-m="${m}" data-real="${rVal}"`;
        if (!bEmpty && bVal !== rVal) return `<span class="budget-indicator ind-warn" ${dataAttrs} onclick="window.onIndicatorTripleClick(event, this)">⚠️</span>`;
        if (bEmpty && !rEmpty) return `<span class="budget-indicator ind-dot-red" ${dataAttrs} onclick="window.onIndicatorTripleClick(event, this)"></span>`;
        return '<span class="budget-indicator ind-check">✔︎</span>';
    };
    let budgetLocked = !!(budgetData[ex] && budgetData[ex].__closed);
    const budgetEditableCell = (c1, c2, m) => {
        let bVal = getBudget(c1, c2, m);
        let rVal = realByC1C2Month[`${c1}::${c2}::${m}`] || 0;
        if (budgetLocked) {
            return `<td class="tcd-cell budget-editable-cell"><span class="budget-val">${bVal ? window.formatCurrency(bVal) : ''}</span>${indicatorHtml(bVal, rVal, c1, c2, m)}</td>`;
        }
        return `<td class="tcd-cell budget-editable-cell">
            <span class="budget-val" contenteditable="true" data-ex="${window.escapeHtml(ex)}" data-c1="${window.escapeHtml(c1)}" data-c2="${window.escapeHtml(c2)}" data-m="${m}"
                onfocus="window.onBudgetCellFocus(this)"
                onblur="window.setBudgetCell('${window.escapeHtml(ex)}','${window.escapeHtml(c1)}','${window.escapeHtml(c2)}','${m}',this.textContent)"
                onkeydown="if(event.key==='Enter'){event.preventDefault();this.blur();}">${bVal ? window.formatCurrency(bVal) : ''}</span>${indicatorHtml(bVal, rVal, c1, c2, m)}
        </td>`;
    };
    const budgetAggCell = (bVal, extraClass, forceShowBudget, validatedVal, isRowTotal) => {
        let txt = window.formatCurrency(bVal || 0);
        let delta = (isRowTotal && validatedVal !== undefined) ? deltaHtml(bVal, validatedVal) : '';
        return `<td class="tcd-cell budget-agg-cell${extraClass?(' '+extraClass):''}"><span class="budget-val-ro">${txt}</span>${delta}</td>`;
    };
    const realCell = (rVal, extraClass, forceShow) => {
        let txt = (rVal || forceShow) ? window.formatCurrency(rVal || 0) : '';
        return `<td class="tcd-cell real-cell${extraClass?(' '+extraClass):''}">${txt}</td>`;
    };

    let colGroupHtml = '<colgroup><col style="width:240px;">' + months.map(()=>'<col>').join('') + '<col style="width:110px;">' + (hasValidated ? '<col style="width:110px;">' : '') + '</colgroup>';
    let totalHeaderLabel = hasValidated ? 'TOTAL PROJECTION' : 'TOTAL BUDGET';
    let validatedHeaderHtml = hasValidated ? '<th class="tcd-th-grand">BUDGET VALIDÉ</th>' : '';

    let htmlBudget = '<table class="tcd-native budget-table" cellspacing="0" cellpadding="0">';
    htmlBudget += colGroupHtml;
    htmlBudget += '<thead><tr><th class="tcd-col-axis" style="text-align:center;">Catégorie</th>';
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
        let c2List = [...allCats[c1]].sort(window.customSortCmp);

        htmlBudget += `<tr class="tcd-row-main-tr"><td class="tcd-col-axis"><div class="tcd-row-main">${window.escapeHtml(c1)}</div></td>`;
        htmlReal += `<tr class="tcd-row-main-tr"><td class="tcd-col-axis"><div class="tcd-row-main">${window.escapeHtml(c1)}</div></td>`;
        months.forEach(m => {
            let bSum = 0, vSum = 0;
            c2List.forEach(c2 => { bSum += getBudget(c1, c2, m); vSum += getValidatedBudget(c1, c2, m); });
            let rSum = realByC1Month[`${c1}::${m}`] || 0;
            c1BudgetByMonth[m] = bSum; c1RealByMonth[m] = rSum; c1ValidatedByMonth[m] = vSum;
            grandBudgetByMonth[m] = (grandBudgetByMonth[m]||0) + bSum;
            grandRealByMonth[m] = (grandRealByMonth[m]||0) + rSum;
            grandValidatedByMonth[m] = (grandValidatedByMonth[m]||0) + vSum;
            htmlBudget += budgetAggCell(bSum, 'tcd-row-main-cell', c2List.length > 0, vSum, false);
            htmlReal += realCell(rSum, 'tcd-row-main-cell');
        });
        let c1BudgetTotal = Object.values(c1BudgetByMonth).reduce((a,b)=>a+b,0);
        let c1RealTotal = Object.values(c1RealByMonth).reduce((a,b)=>a+b,0);
        let c1ValidatedTotal = Object.values(c1ValidatedByMonth).reduce((a,b)=>a+b,0);
        grandBudgetTotal += c1BudgetTotal; grandRealTotal += c1RealTotal; grandValidatedTotal += c1ValidatedTotal;
        htmlBudget += budgetAggCell(c1BudgetTotal, 'tcd-total-col tcd-grand tcd-row-main-cell', c2List.length > 0, c1ValidatedTotal, true);
        if (hasValidated) htmlBudget += `<td class="tcd-cell tcd-total-col tcd-grand tcd-row-main-cell"><span class="budget-val-ro">${window.formatCurrency(c1ValidatedTotal)}</span></td>`;
        htmlReal += realCell(c1RealTotal, 'tcd-total-col tcd-grand tcd-row-main-cell', true);
        if (hasValidated) htmlReal += `<td class="tcd-cell tcd-total-col tcd-grand tcd-row-main-cell"><span class="budget-val-ro">${window.formatCurrency(c1ValidatedTotal)}</span></td>`;
        htmlBudget += '</tr>';
        htmlReal += '</tr>';

        c2List.forEach(c2 => {
            htmlBudget += `<tr class="tcd-row-sub-tr"><td class="tcd-col-axis"><div class="tcd-row-sub">↳ ${window.escapeHtml(c2)}</div></td>`;
            htmlReal += `<tr class="tcd-row-sub-tr"><td class="tcd-col-axis"><div class="tcd-row-sub">↳ ${window.escapeHtml(c2)}</div></td>`;
            let c2BudgetTotal = 0, c2RealTotal = 0, c2ValidatedTotal = 0;
            months.forEach(m => {
                let bVal = getBudget(c1, c2, m);
                let rVal = realByC1C2Month[`${c1}::${c2}::${m}`] || 0;
                let vVal = getValidatedBudget(c1, c2, m);
                c2BudgetTotal += bVal; c2RealTotal += rVal; c2ValidatedTotal += vVal;
                htmlBudget += budgetEditableCell(c1, c2, m);
                htmlReal += realCell(rVal);
            });
            htmlBudget += budgetAggCell(c2BudgetTotal, 'tcd-total-col tcd-grand', false, c2ValidatedTotal, true);
            if (hasValidated) htmlBudget += `<td class="tcd-cell tcd-total-col tcd-grand"><span class="budget-val-ro">${window.formatCurrency(c2ValidatedTotal)}</span></td>`;
            htmlReal += realCell(c2RealTotal, 'tcd-total-col tcd-grand', true);
            if (hasValidated) htmlReal += `<td class="tcd-cell tcd-total-col tcd-grand"><span class="budget-val-ro">${window.formatCurrency(c2ValidatedTotal)}</span></td>`;
            htmlBudget += '</tr>';
            htmlReal += '</tr>';
        });
    });

    htmlBudget += '<tr class="tcd-total-row"><td class="tcd-col-axis"><div class="tcd-row-main">TOTAL GLOBAL</div></td>';
    htmlReal += '<tr class="tcd-total-row"><td class="tcd-col-axis"><div class="tcd-row-main">TOTAL GLOBAL</div></td>';
    months.forEach(m => {
        htmlBudget += budgetAggCell(grandBudgetByMonth[m]||0, 'tcd-total-row-cell', true, grandValidatedByMonth[m]||0, false);
        htmlReal += realCell(grandRealByMonth[m]||0, 'tcd-total-row-cell');
    });
    htmlBudget += budgetAggCell(grandBudgetTotal, 'tcd-total-col tcd-grand tcd-total-row-cell', true, grandValidatedTotal, true);
    if (hasValidated) htmlBudget += `<td class="tcd-cell tcd-total-col tcd-grand tcd-total-row-cell"><span class="budget-val-ro">${window.formatCurrency(grandValidatedTotal)}</span></td>`;
    htmlReal += realCell(grandRealTotal, 'tcd-total-col tcd-grand tcd-total-row-cell', true);
    if (hasValidated) htmlReal += `<td class="tcd-cell tcd-total-col tcd-grand tcd-total-row-cell"><span class="budget-val-ro">${window.formatCurrency(grandValidatedTotal)}</span></td>`;
    htmlBudget += '</tr>';
    htmlReal += '</tr>';

    htmlBudget += '</tbody></table>';
    htmlReal += '</tbody></table>';

    let banner = $('budgetValidatedBanner');
    if(banner) {
        if (hasValidated) {
            let validatedRevenueTotal = 0, validatedCostTotal = 0;
            let vRoot = budgetData[ex].__validated || {};
            Object.keys(vRoot).forEach(c1k => {
                if (c1k === '__validated') return;
                let isRev = /^5/.test(c1k) || c1k.toUpperCase().includes('RECETTE');
                let isCost = /^[1234]/.test(c1k) || c1k.toUpperCase().includes('CHARGE');
                Object.keys(vRoot[c1k] || {}).forEach(c2k => {
                    let c2Total = 0;
                    Object.keys(vRoot[c1k][c2k] || {}).forEach(mk => { c2Total += Number(vRoot[c1k][c2k][mk]) || 0; });
                    if (isRev) validatedRevenueTotal += c2Total;
                    else if (isCost) validatedCostTotal += c2Total;
                    else { if (c2Total < 0) validatedCostTotal += c2Total; else validatedRevenueTotal += c2Total; }
                });
            });
            banner.style.display = 'block';
            banner.innerHTML = `✅ Budget validé pour l'exercice ${ex} — Recettes : ${window.formatCurrency(validatedRevenueTotal)} · Charges : ${window.formatCurrency(validatedCostTotal)}<br>📊 Balance planifiée en fin d'exercice : ${window.formatCurrency(grandValidatedTotal)}`;
        } else {
            banner.style.display = 'none';
        }
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
        let deltaStr = cl.planned !== undefined ? ` (Écart = <span class="${delta>=0?'budget-delta delta-pos':'budget-delta delta-neg'}" style="font-size:1em;">${delta>0?'+':''}${window.formatCurrency(delta)}</span>)` : '';
        if(closeBanner) { closeBanner.style.display = 'block'; closeBanner.innerHTML = `🔒 Bilan clos : Recettes: ${window.formatCurrency(cl.revenue||0)} &middot; Charges: ${window.formatCurrency(cl.cost||0)} &middot; Balance: <strong>${window.formatCurrency(bal)}</strong>${deltaStr}`; }
        if(notesWrap) notesWrap.style.display = 'block';
        if(notesTa) notesTa.value = cl.notes || '';
        if(closeBtn) closeBtn.textContent = '🔓 Rouvrir Exercice';
    } else {
        if(closeBanner) closeBanner.style.display = 'none';
        if(notesWrap) notesWrap.style.display = 'none';
        if(closeBtn) closeBtn.textContent = '🔒 Clôturer exercice';
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
};

window.validateBudget = function() {
    let sel = $('budgetExerciceSelect'); if (!sel) return;
    let ex = sel.value; if (!ex) return;
    if (!budgetData[ex]) budgetData[ex] = {};
    if (budgetData[ex].__closed) { alert(`L'exercice ${ex} est clos. Rouvrez-le pour modifier.`); return; }
    let alreadyValidated = !!budgetData[ex].__validated;
    const doValidate = () => {
        budgetData[ex].__validated = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(budgetData[ex]).filter(([k]) => k !== '__validated'))));
        window.triggerSave(true); window.renderBudget();
    };
    if (alreadyValidated) {
        if (confirm(`Le budget de l'exercice ${ex} a déjà été validé. Voulez-vous le valider à nouveau ?`)) { doValidate(); }
    } else { doValidate(); }
};

window.cancelBudgetValidation = function() {
    let sel = $('budgetExerciceSelect'); if (!sel) return;
    let ex = sel.value; if (!ex || !budgetData[ex] || !budgetData[ex].__validated) return;
    if (budgetData[ex].__closed) { alert(`L'exercice ${ex} est clos. Rouvrez-le pour modifier.`); return; }
    if (confirm(`Voulez-vous annuler la validation du budget pour ${ex} ?`)) {
        delete budgetData[ex].__validated;
        window.triggerSave(true); window.renderBudget();
    }
};

window.onCloturerBtnClick = function(event) {
    let sel = $('budgetExerciceSelect'); if (!sel) return;
    let ex = sel.value; if (!ex) return;
    if (!budgetData[ex]) budgetData[ex] = {};
    let isClosed = !!budgetData[ex].__closed;
    if (event && event.shiftKey && isClosed) {
        if (confirm(`Voulez-vous rouvrir l'exercice ${ex} ?`)) { delete budgetData[ex].__closed; window.triggerSave(true); window.renderBudget(); }
        return;
    }
    if (isClosed) return; 
    if (confirm(`Voulez-vous clôturer l'exercice ${ex} ? Les tableaux Budget et Réel ne seront plus modifiables.`)) {
        let c2Totals = {};
        transactions.forEach(t => {
            if (t.amount === 0) return;
            let dRealStr = String(t.dateExpense || t.dateOp || '');
            if (dRealStr.length < 7) return;
            let yReal = dRealStr.substring(0,4), mReal = dRealStr.substring(5,7);
            if (typeof window.getFiscalYearLabel === 'function' && window.getFiscalYearLabel(yReal, mReal, fiscalStartMonth) !== ex) return;
            let c1 = t.cat1 || '_SANS_CATEGORIE', c2 = t.cat2 || '_SANS_CATEGORIE';
            if (budgetFilter.cat1.has(c1) || budgetFilter.cat2.has(c2)) return;
            let k = `${c1}::${c2}`; c2Totals[k] = (c2Totals[k] || 0) + (Number(t.amount) || 0);
        });
        let realRevenueTotal = 0, realCostTotal = 0;
        Object.keys(c2Totals).forEach(k => {
            let c1 = k.split('::')[0]; let tot = c2Totals[k];
            let isRev = /^5/.test(c1) || c1.toUpperCase().includes('RECETTE');
            let isCost = /^[1234]/.test(c1) || c1.toUpperCase().includes('CHARGE');
            if (isRev) realRevenueTotal += tot; else if (isCost) realCostTotal += tot;
            else { if (tot < 0) realCostTotal += tot; else realRevenueTotal += tot; }
        });
        let plannedTotal = 0;
        let vRoot = budgetData[ex].__validated || {};
        Object.keys(vRoot).forEach(c1k => {
            if (c1k === '__validated') return;
            Object.keys(vRoot[c1k] || {}).forEach(c2k => { Object.keys(vRoot[c1k][c2k] || {}).forEach(mk => { plannedTotal += Number(vRoot[c1k][c2k][mk]) || 0; }); });
        });
        budgetData[ex].__closed = { revenue: realRevenueTotal, cost: realCostTotal, balance: realRevenueTotal + realCostTotal, planned: plannedTotal, notes: (budgetData[ex].__closed && budgetData[ex].__closed.notes) || '' };
        window.triggerSave(true); window.renderBudget();
    }
};

window.onBudgetCloseNotesBlur = function() {
    let sel = $('budgetExerciceSelect'); if (!sel) return;
    let ex = sel.value; if (!ex || !budgetData[ex] || !budgetData[ex].__closed) return;
    let ta = $('budgetCloseNotes'); if (!ta) return;
    budgetData[ex].__closed.notes = ta.value;
    window.triggerSave(true);
};

// ==== RÉGULARISATION DE CHARGES ====
window.toggleRegulOption = function(checked) {
    regulEnabled = checked;
    localStorage.setItem('f_regul_enabled_' + currentAccountId, checked ? '1' : '0');
    let tab = $('tabRegul'); if(tab) tab.style.display = checked ? '' : 'none';
    if (!checked) {
        let activeTab = document.querySelector('.tab-btn.active');
        if (activeTab && activeTab.dataset.target === 'view-regul') {
            document.querySelector('.tab-btn[data-target="view-summary"]').click();
        }
    }
    window.applyRegulOptionState();
    window.triggerSave(false);
};

window.applyRegulOptionState = function() {
    let enabled = regulEnabled;
    let tab = $('tabRegul'); if(tab) tab.style.display = enabled ? '' : 'none';
    let cb = $('optRegulCb'); if (cb) cb.checked = enabled;
    let group = $('regulSettingsGroup'); if(group) group.style.display = enabled ? 'block' : 'none';
    if (enabled && typeof window.renderRegul === 'function') window.renderRegul();
};
