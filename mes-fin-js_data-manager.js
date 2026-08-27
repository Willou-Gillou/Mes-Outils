// ==== GESTION DE LA BASE DE DONNÉES ET AFFECTATIONS ====

// ── Doublons et Filtres BDD ──
window.toggleDuplicateFilter = function() {
    if (duplicateFilterActive) {
        duplicateFilterActive = false;
        duplicateIds.clear();
        let btn = $('dupBtn');
        if(btn){ btn.style.background=''; btn.style.color=''; btn.style.borderColor=''; btn.textContent='🔍 Doublons'; }
        if(typeof window.renderDataTable === 'function') window.renderDataTable();
        return;
    }
    let groups = {};
    transactions.forEach(t => {
        let key = (t.dateOp||'') + '|' + (String(t.details||'').trim().toLowerCase()) + '|' + (t.amount||0);
        if(!groups[key]) groups[key] = [];
        groups[key].push(t.id);
    });
    duplicateIds.clear();
    Object.values(groups).forEach(ids => { if(ids.length > 1) ids.forEach(id => duplicateIds.add(String(id))); });
    let count = duplicateIds.size;
    if(count === 0) { window.showToast('✅ Aucun doublon trouvé'); return; }
    duplicateFilterActive = true;
    let btn = $('dupBtn');
    if(btn){ btn.style.background='#dc2626'; btn.style.color='#fff'; btn.style.borderColor='#dc2626'; btn.textContent=`⚠ ${count} doublons — Echap pour retirer`; }
    if(typeof window.renderDataTable === 'function') window.renderDataTable();
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
    if(typeof window.renderDataTable === 'function') window.renderDataTable();
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
    let dataCountLabel = $('dataCountLabel'); if(dataCountLabel) dataCountLabel.textContent = flt.length + (dbPageCount > 1 ? ' · p.'+(dbPage+1)+'/'+dbPageCount : '');
    
    if(!tb) return;
    tb.innerHTML = fltPage.map(t => `<tr data-id="${t.id}">
        <td style="text-align:center;"><input type="checkbox" class="row-cb" value="${t.id}" onclick="window.updateBulkActions()"></td>
        <td><input type="date" class="inline-edit" data-id="${t.id}" data-field="dateOp" value="${t.dateOp}"></td>
        <td><input type="date" class="inline-edit" data-id="${t.id}" data-field="dateExpense" value="${t.dateExpense || t.dateOp}"></td>
        <td><input type="text" class="inline-edit" data-id="${t.id}" data-field="label" value="${window.escapeHtml(t.label)}"></td>
        <td class="wrap-text" style="font-size:0.9em; color:var(--ink-soft);"><input type="text" class="inline-edit" data-id="${t.id}" data-field="details" value="${window.escapeHtml(t.details)}"></td>
        <td class="wrap-text" style="font-size:0.9em; color:var(--ink-soft);"><input type="text" class="inline-edit" data-id="${t.id}" data-field="note" value="${window.escapeHtml(t.note||'')}"></td>
        <td><input type="text" class="inline-edit amount-input ${t.amount>0?'amount-pos':'amount-neg'}" data-id="${t.id}" data-field="amount" value="${t.amount} €"></td>
        <td><select class="inline-edit" data-id="${t.id}" data-field="cat1">${window.getC1Opts(t.cat1)}</select></td>
        <td><select class="inline-edit" data-id="${t.id}" data-field="cat2">${window.getC2Opts(t.cat1,t.cat2)}</select></td>
    </tr>`).join('');
    tb.querySelectorAll('.inline-edit').forEach(inp => inp.addEventListener('change', window.handleInlineChange));
    window.updateBulkActions();
    if (_wrap) _wrap.scrollTop = _savedScroll;
};

// Listeners table BDD
document.addEventListener('DOMContentLoaded', () => {
    $$('.col-filter').forEach(inp=>inp.addEventListener('input', ()=>{ dbPage=0; window.renderDataTable(); }));
    $$('.uf-filter').forEach(inp=>inp.addEventListener('input', window.applyUncatFilters));
    $$('.sort-btn').forEach(btn=>btn.addEventListener('click',e=>{let c=e.target.dataset.col;if(dbSortCol===c)dbSortDir*=-1;else{dbSortCol=c;dbSortDir=-1;}window.renderDataTable();}));
});

window.handleInlineChange = function(e) {
    let id=e.target.dataset.id, f=e.target.dataset.field, v=e.target.value, tx=transactions.find(x=>String(x.id)===String(id)); if(!tx)return;
    if(f==='amount') { let n=parseFloat(v.replace(/,/g,'.').replace(/[^0-9.-]/g,'')); if(!isNaN(n))tx.amount=n; } else tx[f]=v;
    if(f==='cat1') {
        tx.cat2 = '';
        let row = e.target.closest('tr');
        if (row) {
            let cat2Sel = row.querySelector('select[data-field="cat2"]');
            if (cat2Sel) cat2Sel.innerHTML = window.getC2Opts(v, '');
        }
    }
    window.triggerSave(false); 
    if(typeof window.renderSummary === 'function') window.renderSummary(); 
    if(typeof window.renderUncategorized === 'function') window.renderUncategorized();
    if($('view-data') && $('view-data').classList.contains('active')) { window.showToast("Modification enregistrée ✓"); }
};

window.updateBulkActions = function() { 
    let c=$$('.row-cb:checked').length; 
    let sc = $('selCount'); if(sc) sc.textContent=c; 
    let ba = $('bulkActions'); if(ba) ba.style.display=c>0?'flex':'none'; 
    let dbhn = $('dbHeaderNormal'); if(dbhn) dbhn.style.display=c>0?'none':'flex';
};

window.toggleSelectAll = function() { let v=$('selectAllCb').checked; $$('.row-cb').forEach(c=>c.checked=v); window.updateBulkActions(); };

window.bulkDelete = function() { 
    if(confirm("Supprimer la sélection ?")){ 
        let ids=Array.from($$('.row-cb:checked')).map(c=>c.value); 
        transactions=transactions.filter(t=>!ids.includes(String(t.id))); 
        let scb = $('selectAllCb'); if(scb) scb.checked=false; 
        window.triggerSave(true); 
        window.updateBulkActions(); 
        window.showToast("Supprimées"); 
    } 
};

window.bulkDuplicate = function() {
    let ids = Array.from($$('.row-cb:checked')).map(c => c.value);
    if (!ids.length) return;
    let copies = [];
    ids.forEach(function(id) {
        let tx = transactions.find(t => String(t.id) === String(id));
        if (!tx) return;
        copies.push(Object.assign({}, tx, { id: Date.now() + Math.random() }));
    });
    let lastIdx = -1;
    ids.forEach(function(id) {
        let i = transactions.findIndex(t => String(t.id) === String(id));
        if (i > lastIdx) lastIdx = i;
    });
    transactions.splice(lastIdx + 1, 0, ...copies);
    let scb = $('selectAllCb'); if(scb) scb.checked = false;
    window.triggerSave(false);
    window.renderDataTable();
    window.updateBulkActions();
    window.showToast('📋 ' + copies.length + ' ligne(s) dupliquée(s) ✓');
};

window.updateBulkCat2 = function() { 
    let bc2 = $('bulkCat2'); let bc1 = $('bulkCat1');
    if(bc2 && bc1) bc2.innerHTML = window.getC2Opts(bc1.value); 
};

window.bulkCategorize = function() { 
    let c1=$('bulkCat1').value, c2=$('bulkCat2').value; 
    if(!c1||!c2)return alert("Sélectionnez les 2 catégories."); 
    let ids=Array.from($$('.row-cb:checked')).map(c=>c.value); 
    transactions.forEach(t=>{if(ids.includes(String(t.id))){t.cat1=c1;t.cat2=c2;}}); 
    let scb = $('selectAllCb'); if(scb) scb.checked=false; 
    window.triggerSave(true); 
    if(typeof window.renderViewsSafe === 'function') window.renderViewsSafe(); 
    window.updateBulkActions(); 
    window.showToast("Affectées ✓"); 
};

window.addManualRow = function() {
    let dateOp = new Date().toISOString().slice(0,10);
    transactions.unshift({
        id: String(Date.now()),
        dateOp: dateOp,
        dateExpense: dateOp,
        label: 'Nouvelle ligne',
        details: '',
        note: '',
        amount: 0,
        paymentMethod: '',
        cat1: '',
        cat2: ''
    });
    window.triggerSave(true);
    window.renderDataTable();
};

// ── RÈGLES AUTO ──
window.addOrMergeRule = function(pStr, c1, c2) { 
    let ex=rules.find(r=>r.cat1===c1&&r.cat2===c2), np=pStr.split(';').map(x=>x.trim()).filter(x=>x); 
    if(ex){let s=new Set(ex.pattern.split(';').map(x=>x.trim()));np.forEach(x=>s.add(x));ex.pattern=Array.from(s).join(' ; ');} 
    else rules.push({pattern:np.join(' ; '),cat1:c1,cat2:c2}); 
};

window.updateNewRuleCat2 = () => {
    let rc2 = $('newRuleCat2'); let rc1 = $('newRuleCat1');
    if(rc2 && rc1) rc2.innerHTML=window.getC2Opts(rc1.value);
};

window.addManualRule = () => { 
    let p=$('newRulePattern').value, c1=$('newRuleCat1').value, c2=$('newRuleCat2').value; 
    if(!p||!c1||!c2)return alert("Formulaire incomplet."); 
    window.addOrMergeRule(p,c1,c2); 
    $('newRulePattern').value=''; 
    $('newRuleCat2').innerHTML='<option value="">-- Cat 2 --</option>'; 
    window.triggerSave(); window.renderRules(); window.showToast("Règle ajoutée"); 
};

window.renderRules = function() {
    let rc1 = $('newRuleCat1'); if(rc1) rc1.innerHTML=window.getC1Opts(); 
    let rt = $('rulesTable'); if(!rt) return;
    let tb = rt.querySelector('tbody'); 
    rules.sort((a,b)=>window.customSortCmp(a.cat1,b.cat1));
    if(!rules.length)return tb.innerHTML='<tr><td colspan="4" style="text-align:center;padding:32px;color:var(--ink-soft);">Aucune règle automatique configurée.</td></tr>';
    tb.innerHTML=rules.map((r,i)=>`<tr data-idx="${i}"><td><input type="text" class="inline-edit" value="${window.escapeHtml(r.pattern)}" onchange="rules[${i}].pattern=this.value;window.triggerSave()"></td><td><select class="inline-edit" onchange="rules[${i}].cat1=this.value;window.triggerSave();window.renderRules()">${window.getC1Opts(r.cat1)}</select></td><td><select class="inline-edit" onchange="rules[${i}].cat2=this.value;window.triggerSave()">${window.getC2Opts(r.cat1,r.cat2)}</select></td><td><button class="btn btn-outline" style="color:var(--urgent); padding:4px 8px;" onclick="rules.splice(${i},1);window.triggerSave();window.renderRules()">Suppr.</button></td></tr>`).join('');
};

document.addEventListener('DOMContentLoaded', () => {
    let exRule = $('exportRuleBtn');
    if(exRule) exRule.addEventListener('click', () => {
        try {
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
            const wbout = XLSX.write(wb, {bookType: 'xlsx', type: 'array'});
            const blob = new Blob([wbout], {type: 'application/octet-stream'});
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'regles_finances.xlsx';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            window.showToast('✅ ' + rules.length + ' règle(s) exportée(s)');
        } catch(err) { alert('Erreur export : ' + err.message); }
    });

    let imRule = $('importRuleBtn');
    if(imRule) imRule.addEventListener('click', () => $('ruleFileInput').click());

    let rfIn = $('ruleFileInput');
    if(rfIn) rfIn.addEventListener('change', e => {
        let f = e.target.files[0]; if(!f) return;
        let r = new FileReader();
        r.onerror = () => { alert('Impossible de lire le fichier.'); e.target.value = ''; };
        r.onload = ev => {
            try {
                let wb;
                if (f.name.toLowerCase().endsWith('.csv')) { wb = XLSX.read(ev.target.result, {type: 'string'}); } 
                else { wb = XLSX.read(new Uint8Array(ev.target.result), {type: 'array'}); }
                let rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, defval: ''});
                if (!rows || rows.length === 0) { alert('Fichier vide ou non reconnu.'); e.target.value = ''; return; }
                let startIdx = (rows[0] && rows[0][0] && String(rows[0][0]).toLowerCase().includes('cat')) ? 1 : 0;
                let added = 0;
                for (let i = startIdx; i < rows.length; i++) {
                    let row = rows[i];
                    if (!row || row.length < 2) continue;
                    let c1 = String(row[0] || '').trim();
                    let c2 = String(row[1] || '').trim();
                    if (!c1) continue; 
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
                    window.triggerSave(true); 
                    if(typeof window.renderViewsSafe === 'function') window.renderViewsSafe();
                    window.showToast('✅ ' + added + ' règle(s) importée(s)');
                } else {
                    window.showToast('⚠️ Aucune règle valide trouvée');
                }
            } catch(err) { alert('Erreur de lecture du fichier : ' + err.message); }
            e.target.value = '';
        };
        if (f.name.toLowerCase().endsWith('.csv')) { r.readAsText(f, 'UTF-8'); } 
        else { r.readAsArrayBuffer(f); }
    });
});


// ── CATÉGORIES ──
window.renderCategories = function() {
    let c = $('categoriesContainer'); if(!c) return;
    c.innerHTML=Object.keys(categories).sort(window.customSortCmp).map(c1=>`<div class="summary-card cat1-dropzone" data-c1="${window.escapeHtml(c1)}" ondragover="window.onCat1DragOver(event,this)" ondragleave="window.onCat1DragLeave(event,this)" ondrop="window.onCat1Drop(event,'${window.escapeHtml(c1)}')"><div style="display:flex;justify-content:space-between;font-weight:600;align-items:center;"><span class="cat1-editable" data-c1="${window.escapeHtml(c1)}" title="Cliquer pour renommer" style="cursor:pointer;border-bottom:1px dashed transparent;" onmouseover="this.style.borderBottomColor='var(--ink-faint)'" onmouseout="this.style.borderBottomColor='transparent'" onclick="window.startRenameCat1(this,'${window.escapeHtml(c1)}')">${window.escapeHtml(c1)}</span> <button class="btn btn-outline" style="padding:2px 6px;color:var(--urgent)" onclick="window.deleteCategory1('${window.escapeHtml(c1)}')">X</button></div><div style="display:flex;flex-wrap:wrap;gap:4px;margin:8px 0;">${categories[c1].sort(window.customSortCmp).map(c2=>`<div class="cat2-chip" draggable="true" data-c1="${window.escapeHtml(c1)}" data-c2="${window.escapeHtml(c2)}" ondragstart="window.onCat2DragStart(event,'${window.escapeHtml(c1)}','${window.escapeHtml(c2)}')" ondragend="window.onCat2DragEnd(event)" style="background:var(--bg);border:1px solid var(--ink-faint);padding:2px 6px 2px 2px;border-radius:12px;font-size:0.85em;display:flex;gap:4px;align-items:center;"><span class="cat2-drag-handle" title="Glisser pour déplacer" style="cursor:grab;color:var(--ink-faint);font-size:1em;line-height:1;padding:0 2px;user-select:none;">⠿</span><span class="cat2-editable" data-c1="${window.escapeHtml(c1)}" data-c2="${window.escapeHtml(c2)}" title="Cliquer pour renommer" style="cursor:pointer;border-bottom:1px dashed transparent;" onmouseover="this.style.borderBottomColor='var(--ink-faint)'" onmouseout="this.style.borderBottomColor='transparent'" onclick="window.startRenameCat2(this,'${window.escapeHtml(c1)}','${window.escapeHtml(c2)}')">${window.escapeHtml(c2)}</span> <button style="background:none;border:none;color:var(--urgent);cursor:pointer;font-size:1.1em;" onclick="window.deleteCategory2('${window.escapeHtml(c1)}','${window.escapeHtml(c2)}')">×</button></div>`).join('')}</div><div style="display:flex;gap:4px;"><input type="text" class="input-text" placeholder="Ajouter sous-cat..." onkeypress="if(event.key==='Enter'){if(this.value.trim()){categories['${window.escapeHtml(c1)}'].push(this.value.trim());categories['${window.escapeHtml(c1)}'].sort(window.customSortCmp);window.triggerSave();window.renderCategories();}}"></div></div>`).join('');
};

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
window.onCat1DragLeave = function(ev, el) { el.classList.remove('cat1-drop-hover'); };
window.onCat1Drop = function(ev, targetC1) {
    ev.preventDefault();
    document.querySelectorAll('.cat1-dropzone').forEach(el => el.classList.remove('cat1-drop-hover'));
    let d = window._draggedCat2; window._draggedCat2 = null;
    if (!d) return; window.moveCategory2(d.c1, d.c2, targetC1);
};
window.moveCategory2 = function(sourceC1, c2, targetC1) {
    if (sourceC1 === targetC1) return;
    if (!categories[sourceC1] || !categories[targetC1]) { window.renderCategories(); return; }
    if (categories[targetC1].includes(c2)) { window.showToast('⚠️ Sous-catégorie existante.'); window.renderCategories(); return; }
    categories[sourceC1] = categories[sourceC1].filter(x => x !== c2);
    categories[targetC1].push(c2); categories[targetC1].sort(window.customSortCmp);
    let count = 0;
    transactions.forEach(t => { if (t.cat1 === sourceC1 && t.cat2 === c2) { t.cat1 = targetC1; count++; } });
    rules.forEach(r => { if (r.cat1 === sourceC1 && r.cat2 === c2) { r.cat1 = targetC1; } });
    window.triggerSave(true); window.renderViewsSafe();
    window.showToast(`✅ Sous-catégorie déplacée`);
};

window.startRenameCat1 = function(el, oldName) {
    let input = document.createElement('input'); input.type = 'text'; input.value = oldName; input.className = 'input-text';
    input.style.cssText = 'width:auto;min-width:80px;font-weight:600;padding:2px 6px;';
    el.replaceWith(input); input.focus(); input.select();
    let commit = () => { window.renameCategory1(oldName, input.value.trim()); };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = oldName; input.blur(); } });
    input.addEventListener('blur', commit, { once: true });
};
window.renameCategory1 = function(oldName, newName) {
    if (!newName || newName === oldName) { window.renderCategories(); return; }
    if (categories[newName]) { window.showToast('⚠️ Catégorie existante.'); window.renderCategories(); return; }
    categories[newName] = categories[oldName]; delete categories[oldName];
    transactions.forEach(t => { if (t.cat1 === oldName) t.cat1 = newName; });
    rules.forEach(r => { if (r.cat1 === oldName) r.cat1 = newName; });
    window.triggerSave(true); window.renderViewsSafe(); window.showToast('✅ Catégorie renommée');
};
window.startRenameCat2 = function(el, c1, oldName) {
    let input = document.createElement('input'); input.type = 'text'; input.value = oldName; input.className = 'input-text';
    input.style.cssText = 'width:auto;min-width:60px;font-size:0.85em;padding:1px 4px;';
    el.replaceWith(input); input.focus(); input.select();
    let commit = () => { window.renameCategory2(c1, oldName, input.value.trim()); };
    input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { input.value = oldName; input.blur(); } });
    input.addEventListener('blur', commit, { once: true });
};
window.renameCategory2 = function(c1, oldName, newName) {
    if (!newName || newName === oldName) { window.renderCategories(); return; }
    if (!categories[c1]) { window.renderCategories(); return; }
    if (categories[c1].includes(newName)) { window.showToast('⚠️ Sous-catégorie existante.'); window.renderCategories(); return; }
    let idx = categories[c1].indexOf(oldName); if (idx === -1) { window.renderCategories(); return; }
    categories[c1][idx] = newName; categories[c1].sort(window.customSortCmp);
    transactions.forEach(t => { if (t.cat1 === c1 && t.cat2 === oldName) t.cat2 = newName; });
    rules.forEach(r => { if (r.cat1 === c1 && r.cat2 === oldName) r.cat2 = newName; });
    window.triggerSave(true); window.renderViewsSafe(); window.showToast('✅ Sous-catégorie renommée');
};
window.deleteCategory1 = function(c1) {
    if (!confirm(`⚠️ Supprimer la catégorie "${c1}" et toutes ses sous-catégories ?`)) return;
    delete categories[c1];
    let count = 0; transactions.forEach(t => { if (t.cat1 === c1) { t.cat1 = ''; t.cat2 = ''; count++; } });
    rules = rules.filter(r => r.cat1 !== c1);
    window.triggerSave(true); window.renderViewsSafe(); window.showToast(`✅ Catégorie supprimée`);
};
window.deleteCategory2 = function(c1, c2) {
    if (!confirm(`⚠️ Supprimer la sous-catégorie "${c2}" ?`)) return;
    if (!categories[c1]) { window.renderCategories(); return; }
    categories[c1] = categories[c1].filter(x => x !== c2);
    let count = 0; transactions.forEach(t => { if (t.cat1 === c1 && t.cat2 === c2) { t.cat2 = ''; count++; } });
    rules = rules.filter(r => !(r.cat1 === c1 && r.cat2 === c2));
    window.triggerSave(true); window.renderViewsSafe(); window.showToast(`✅ Sous-catégorie supprimée`);
};

document.addEventListener('DOMContentLoaded', () => {
    let btnAddCat1 = $('addCat1Btn');
    if(btnAddCat1) btnAddCat1.addEventListener('click',()=>{let v=$('newCat1Input').value.trim();if(v&&!categories[v]){categories[v]=[];$('newCat1Input').value='';window.triggerSave();window.renderCategories();}});

    let exportCatBtn = $('exportCatBtn');
    if(exportCatBtn) exportCatBtn.addEventListener('click', () => {
        try {
            const rows = [['Catégorie 1', 'Catégorie 2']];
            Object.keys(categories).sort(window.customSortCmp).forEach(c1 => {
                const subs = categories[c1] || [];
                if (subs.length === 0) { rows.push([c1, '']); }
                else { subs.sort(window.customSortCmp).forEach(c2 => rows.push([c1, c2])); }
            });
            const ws = XLSX.utils.aoa_to_sheet(rows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Categories');
            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'categories.xlsx';
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            window.showToast('✅ Catégories exportées en Excel');
        } catch(err) { alert('Erreur export catégories : ' + err.message); }
    });

    let importCatBtn = $('importCatBtn');
    if(importCatBtn) importCatBtn.addEventListener('click',()=>$('catFileInput').click());

    let catFileInput = $('catFileInput');
    if(catFileInput) catFileInput.addEventListener('change', e => {
        const f = e.target.files[0]; if (!f) return;
        if (!confirm('⚠️ Cet import va ÉCRASER toutes les catégories existantes de ce compte.\n\nContinuer ?')) { e.target.value = ''; return; }
        const reader = new FileReader();
        reader.onerror = () => { alert('Impossible de lire le fichier.'); e.target.value = ''; };
        reader.onload = ev => {
            try {
                const name = f.name.toLowerCase();
                if (name.endsWith('.json')) {
                    categories = JSON.parse(ev.target.result);
                    window.triggerSave(); window.renderViewsSafe(); window.showToast('✅ Catégories remplacées');
                } else {
                    let wb;
                    if (name.endsWith('.csv')) { wb = XLSX.read(ev.target.result, { type: 'string' }); }
                    else { wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array', raw: true }); }
                    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '' });
                    const startIdx = (rows[0] && String(rows[0][0]).toLowerCase().includes('cat')) ? 1 : 0;
                    const newCats = {};
                    for (let i = startIdx; i < rows.length; i++) {
                        const c1 = String(rows[i][0] || '').trim(); const c2 = String(rows[i][1] || '').trim();
                        if (!c1) continue;
                        if (!newCats[c1]) newCats[c1] = [];
                        if (c2 && !newCats[c1].includes(c2)) newCats[c1].push(c2);
                    }
                    if (Object.keys(newCats).length === 0) { window.showToast('⚠️ Aucune catégorie valide trouvée.'); e.target.value=''; return; }
                    categories = newCats;
                    window.triggerSave(); window.renderViewsSafe();
                    window.showToast('✅ Remplacement effectué');
                }
            } catch(err) { alert('Erreur import catégories : ' + err.message); }
            e.target.value = '';
        };
        if (f.name.toLowerCase().endsWith('.json') || f.name.toLowerCase().endsWith('.csv')) { reader.readAsText(f, 'UTF-8'); } 
        else { reader.readAsArrayBuffer(f); }
    });
});

// ── IMPORT/EXPORT BDD ──
const DB_EXPORT_HEADERS = ["Date de l'opération", "Date OP", "Libellé", "Détail de l'écriture", "Montant de l'opération", "Notes", "CAT1", "CAT2"];

function txToExportRow(t) {
  const ds = v => v ? {t:'s', v: String(v)} : {t:'s', v:''};
  return [ ds(t.dateOp), ds(t.dateExpense || t.dateOp), t.label || '', t.details || '', (t.amount != null ? t.amount : ''), t.note || '', t.cat1 || '', t.cat2 || '' ];
}

function xlsxDateToStr(val) {
  if (!val && val !== 0) return '';
  if (val && typeof val === 'object' && 't' in val) val = val.v;
  if (!val && val !== 0) return '';
  if (typeof val === 'number') {
    let serial = Math.floor(val);
    if (serial <= 0) return '';
    if (serial >= 60) serial--; 
    let d = new Date(Date.UTC(1900, 0, 1) + (serial - 1) * 86400000);
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth()+1).padStart(2,'0') + '-' + String(d.getUTCDate()).padStart(2,'0');
  }
  if (val instanceof Date) { return val.toISOString().slice(0, 10); }
  const s = String(val).trim();
  const fw = s.match(/^="(.+)"$/); const clean = fw ? fw[1].trim() : s;
  const dmy = clean.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) return dmy[3] + '-' + dmy[2].padStart(2,'0') + '-' + dmy[1].padStart(2,'0');
  if (clean.match(/^\d{4}-\d{2}-\d{2}/)) return clean.slice(0, 10);
  return clean;
}

function importRowToTx(row) {
  const dateOp  = xlsxDateToStr(row[0]), dateExp = xlsxDateToStr(row[1]), label   = String(row[2] || '').trim(), details = String(row[3] || '').trim();
  const amtRaw  = row[4], note    = String(row[5] || '').trim(), cat1    = String(row[6] || '').trim(), cat2    = String(row[7] || '').trim();
  if (!dateOp && !label && !details) return null;
  let amount = 0;
  if (amtRaw !== '' && amtRaw !== null && amtRaw !== undefined) { const s = String(amtRaw).replace(/\s/g,'').replace(',','.'); amount = parseFloat(s) || 0; }
  return { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()+'_'+Math.random().toString(36).slice(2,9)), dateOp, dateExpense: dateExp || dateOp, paymentMethod: '', label, details, amount, cat1, cat2, note: note || '' };
}

document.addEventListener('DOMContentLoaded', () => {
    let exportDbBtn = $('exportDbBtn');
    if(exportDbBtn) exportDbBtn.addEventListener('click', () => {
        if (!appSecretKey) { alert("Déverrouillez l'application avant d'exporter."); return; }
        let shiftMode = document.getElementById('exportDbBtn').dataset.shiftMode === '1';
        try {
            const plain = JSON.stringify({ version: APP_VERSION, cols: DB_EXPORT_HEADERS, rows: transactions.map(txToExportRow) });
            const encrypted = CryptoJS.AES.encrypt(plain, appSecretKey).toString();
            const jsonPayload = JSON.stringify({ type: 'FINANCES_ENCRYPTED', v: APP_VERSION, payload: encrypted });
            const jsonBlob = new Blob([jsonPayload], { type: 'application/json' });
            const jsonUrl = URL.createObjectURL(jsonBlob);
            const a1 = document.createElement('a'); a1.href = jsonUrl; a1.download = 'finances_backup_' + new Date().toISOString().slice(0,10) + '.json';
            document.body.appendChild(a1); a1.click(); document.body.removeChild(a1);
            setTimeout(() => URL.revokeObjectURL(jsonUrl), 1000);
            if (shiftMode) {
                const dataRows = [DB_EXPORT_HEADERS].concat(transactions.map(txToExportRow));
                const wsData = XLSX.utils.aoa_to_sheet(dataRows); const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, wsData, 'DATA');
                const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
                const xlsxBlob = new Blob([wbout], { type: 'application/octet-stream' });
                const xlsxUrl = URL.createObjectURL(xlsxBlob);
                const a2 = document.createElement('a'); a2.href = xlsxUrl; a2.download = 'finances_clair_' + new Date().toISOString().slice(0,10) + '.xlsx';
                document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);
                setTimeout(() => URL.revokeObjectURL(xlsxUrl), 1000);
            }
            window.showToast('✅ ' + transactions.length + ' transaction(s) exportée(s)');
        } catch(err) { alert('Erreur export : ' + err.message); }
    });

    let importDbBtn = $('importDbBtn');
    if(importDbBtn) importDbBtn.addEventListener('click', () => $('dbFileInput').click());

    let dbFileInput = $('dbFileInput');
    if(dbFileInput) dbFileInput.addEventListener('change', e => {
        const f = e.target.files[0]; if (!f) return;
        const reader = new FileReader();
        reader.onerror = () => { alert('Impossible de lire le fichier.'); e.target.value = ''; };
        reader.onload = ev => {
            try {
                const isJson = f.name.toLowerCase().endsWith('.json');
                const isCsv  = f.name.toLowerCase().endsWith('.csv');
                let importedTxs = [];
                if (isJson) {
                    const txt = typeof ev.target.result === 'string' ? ev.target.result : new TextDecoder().decode(ev.target.result);
                    const obj = JSON.parse(txt);
                    if (!obj || obj.type !== 'FINANCES_ENCRYPTED' || !obj.payload) throw new Error('Format JSON non reconnu.');
                    const tryDecrypt = (key) => { try { const b = CryptoJS.AES.decrypt(obj.payload, key); const s = b.toString(CryptoJS.enc.Utf8); return s ? JSON.parse(s) : null; } catch(ex) { return null; } };
                    let parsed = appSecretKey ? tryDecrypt(appSecretKey) : null;
                    if (!parsed) {
                        const altKey = prompt('🔐 Ce fichier est chiffré.\nSaisissez le mot de passe de déchiffrement :');
                        if (!altKey) { e.target.value = ''; return; }
                        parsed = tryDecrypt(altKey);
                        if (!parsed) { alert('❌ Déchiffrement échoué. Mot de passe incorrect.'); e.target.value = ''; return; }
                    }
                    importedTxs = (parsed.rows || []).map(importRowToTx).filter(Boolean);
                } else {
                    let wb;
                    if (isCsv) { wb = XLSX.read(ev.target.result, { type: 'string' }); } 
                    else { wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array', raw: true }); }
                    if (wb.SheetNames.includes('ENCRYPTED')) {
                        const rowsEnc = XLSX.utils.sheet_to_json(wb.Sheets['ENCRYPTED'], { header: 1, defval: '' });
                        const payload = rowsEnc.slice(1).map(r => r[0] ? String(r[0]) : '').join('');
                        if (!payload) throw new Error('Payload chiffré introuvable dans le fichier.');
                        const tryDecrypt = (key) => { try { const b = CryptoJS.AES.decrypt(payload, key); const s = b.toString(CryptoJS.enc.Utf8); return s ? JSON.parse(s) : null; } catch(ex) { return null; } };
                        let parsed = appSecretKey ? tryDecrypt(appSecretKey) : null;
                        if (!parsed) {
                            const altKey = prompt('🔐 Ce fichier est chiffré.\nSaisissez le mot de passe de déchiffrement :');
                            if (!altKey) { e.target.value = ''; return; }
                            parsed = tryDecrypt(altKey);
                            if (!parsed) { alert('❌ Déchiffrement échoué. Mot de passe incorrect.'); e.target.value = ''; return; }
                        }
                        importedTxs = (parsed.rows || []).map(importRowToTx).filter(Boolean);
                    } else {
                        const sheetName = wb.SheetNames.includes('DATA') ? 'DATA' : wb.SheetNames[0];
                        const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '' });
                        if (!rows || rows.length < 2) { window.showToast('⚠️ Fichier vide ou format non reconnu.'); e.target.value = ''; return; }
                        const startIdx = (rows[0] && String(rows[0][0]).toLowerCase().includes('date')) ? 1 : 0;
                        for (let i = startIdx; i < rows.length; i++) { const tx = importRowToTx(rows[i]); if (tx) importedTxs.push(tx); }
                    }
                }
                if (importedTxs.length === 0) { window.showToast('⚠️ Aucune transaction valide trouvée.'); e.target.value = ''; return; }
                const confirmPrompt = window.confirm('⚠️ ATTENTION\n\nCet import va remplacer intégralement les ' + transactions.length + ' transaction(s) existante(s) par les ' + importedTxs.length + ' transaction(s) du fichier importé.\n\nCette action est irréversible.\n\nConfirmer le remplacement ?');
                if (!confirmPrompt) { e.target.value = ''; return; }
                transactions = importedTxs;
                window.triggerSave(true); window.renderViewsSafe();
                window.showToast('✅ Base remplacée : ' + importedTxs.length + ' transaction(s)');
            } catch(err) { alert('Erreur import BDD : ' + err.message); }
            e.target.value = '';
        };
        if (f.name.toLowerCase().endsWith('.csv') || f.name.toLowerCase().endsWith('.json')) { reader.readAsText(f, 'UTF-8'); } 
        else { reader.readAsArrayBuffer(f); }
    });

    let triggerFileBtn = $('triggerFileBtn');
    if(triggerFileBtn) triggerFileBtn.addEventListener('click',()=>{
        selectedBankForImport = $('bankSelectImport').value;
        let isCsvOnly = (selectedBankForImport==='SOGE'||selectedBankForImport==='FORTUNEO'||selectedBankForImport==='CE');
        $('bankFileInput').accept = isCsvOnly ? '.csv' : '.csv,.xls,.xlsx';
        $('bankFileInput').click();
    });

    let bankFileInput = $('bankFileInput');
    if(bankFileInput) bankFileInput.addEventListener('change',e=>{
        let f=e.target.files[0]; if(!f)return;
        if(!driveDataLoaded){ alert('⚠️ Les données ne sont pas chargées depuis Drive.\nVeuillez patienter.'); e.target.value=''; return; }
        $('importOverlay').classList.remove('open'); 
        let r=new FileReader(); 
        r.onload=ev=>{
            try {
                let rows, bankType = selectedBankForImport==='SOGE'?'SOGE':selectedBankForImport==='FORTUNEO'?'FORT':selectedBankForImport==='CE'?'CE':'GEN';
                let rawRows;
                if (f.name.match(/\.xlsx?$/i)) {
                    let wb = XLSX.read(new Uint8Array(ev.target.result), {type:'array', raw:true});
                    let ws = wb.Sheets[wb.SheetNames[0]];
                    rawRows = XLSX.utils.sheet_to_json(ws, {header:1, defval:'', raw:true});
                    rows = bankType==='SOGE' ? rawRows.slice(3) : (bankType==='CE' ? rawRows.slice(1) : rawRows);
                } else {
                    rawRows = ev.target.result.split(/?\n/).map(l=>l.split(';').map(x=>x.replace(/(^"|"$)/g,'').trim()));
                    rows = rawRows;
                    if (bankType==='SOGE') rows = rawRows.slice(3);
                    if (bankType==='FORT') rows = rawRows.slice(1);
                    if (bankType==='CE') rows = rawRows.slice(1);
                }
                let res = window.parseBankData(rows, bankType, selectedBankForImport);
                if(res.add>0){
                    window.triggerSave(true); window.renderViewsSafe(); window.showToast(res.add+' importés');
                } else { alert('Aucune donnée nouvelle détectée.'); }
            } catch(err) { alert('Erreur import: '+err.message); }
        }; 
        f.name.match(/\.xlsx?$/i)?r.readAsArrayBuffer(f):r.readAsText(f); e.target.value='';
    });
});

window.parseBankData = function(rows, type, bName) {
    let add=0, importedIdx=[], skippedIdx=[];
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
    const isStrictAmount = s => /^-?\d+(\.\d+)?$/.test((s||'').toString().replace(/[\s\u00A0\u202F€a-zA-Z]/g,'').replace(',','.'));
    const parseAmount = s => parseFloat((s||'').toString().replace(/[\s\u00A0\u202F€a-zA-Z]/g,'').replace(',','.'));

    rows.forEach((r, rowIdx) => {
        if(!r||r.length<2) return;
        let c0raw = r[0];
        let dop = null, det='', a=NaN;
        if(type==='SOGE'){
            const sv = v => { let s=String(v===null||v===undefined?'':v).trim(); let m=s.match(/^=?"?([^"]+)"?$/); return m?m[1].trim():s; };
            dop = xlsxDateToStr(r[0]); if (!dop) return;
            det = sv(r[2]); if (!det || det==='-') det = sv(r[1]); if (!det || det==='-') det = '';
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
            dop = xlsxDateToStr(r[0]); if (!dop) return;
            let libSimp = String(r[1]||'').trim(); let refer = String(r[2]||'').trim();
            det = [libSimp, refer].filter(Boolean).join(' ');
            let note = String(r[3]||'').trim();
            let debitStr = String(r[5]||'').trim(); let creditStr = String(r[6]||'').trim();
            let debit = debitStr ? parseAmount(debitStr) : NaN; let credit = creditStr ? parseAmount(creditStr) : NaN;
            a = !isNaN(credit) && credit!==0 ? Math.abs(credit) : (!isNaN(debit) && debit!==0 ? -Math.abs(debit) : NaN);
            if (isNaN(a) || a===0) return;
            if (!isDuplicate(dop, a, det, 'CE')){
                transactions.push({id:String(Date.now()+add)+String(Math.random()).slice(2),dateOp:dop,dateExpense:dop,label:'CE',details:det,note:note,amount:a,paymentMethod:'',cat1:'',cat2:''});
                add++; importedIdx.push(rowIdx);
            } else { skippedIdx.push(rowIdx); }
            return;
        }
        let c0=String(c0raw).trim();
        if(c0.match(/^\d{2}\/\d{2}\/\d{4}$/)){
            let dp=c0.split('/'); dop=`${dp[2]}-${dp[1]}-${dp[0]}`;
            if(type==='FORT'){
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
                let l=String(r[1]||'Inconnu').trim();
                det = r[2]&&!isStrictAmount(String(r[2]))?String(r[2]).trim():'';
                for(let j=r.length-1;j>=1;j--){if(isStrictAmount(String(r[j]))){a=parseAmount(String(r[j]));break;}}
                if(isNaN(a)) return;
                if(!isDuplicate(dop, a, det, l)){
                    transactions.push({id:String(Date.now()+add),dateOp:dop,dateExpense:dop,label:l,details:det,note:'',amount:a,paymentMethod:'',cat1:'',cat2:''}); add++; importedIdx.push(rowIdx);
                } else { skippedIdx.push(rowIdx); }
            }
        }
    }); 
    return {add, importedIdx, skippedIdx};
};

// ── VUE A CATEGORISER ──
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
        let m = rules.find(r => r.pattern.split(';').map(p=>p.trim()).filter(p=>p).some(p => (t.label && t.label.toUpperCase().includes(p.toUpperCase())) || (t.details && t.details.toUpperCase().includes(p.toUpperCase()))));
        let rc1 = m ? m.cat1 : '', rc2 = m ? m.cat2 : '';
        let eff1 = c1 || rc1, eff2 = c2 || rc2;
        let displayCat = (eff1 && eff2) ? eff1+' > '+eff2 : (eff1 || eff2);
        const chk = (fv, raw) => { if (!fv) return true; let vs = String(raw||'').toLowerCase(); if (fv.startsWith(' ')) return vs.trim() === ''; return vs.includes(fv); };
        if (!chk(f.dateOp, String(t.dateOp||'').split('-').reverse().join('/'))) return false;
        if (!chk(f.dateExpense, String(t.dateExpense||t.dateOp||'').split('-').reverse().join('/'))) return false;
        if (!chk(f.details, t.details)) return false;
        if (!chk(f.cat, displayCat)) return false;
        if (!chk(f.note, t.note)) return false;
        if (!chk(f.amount, String(t.amount||''))) return false;
        if (f.catNotEmpty && !displayCat) return false;
        if (f.noteNotEmpty && !String(t.note||'').trim()) return false;
        return true;
    }).sort((a,b) => {
        let va = a[uncatSortCol]||'', vb = b[uncatSortCol]||'';
        return (va < vb ? -1 : va > vb ? 1 : 0) * uncatSortDir;
    });
    let uncC = $('uncatCount'); if(uncC) uncC.textContent = uncat.length;
    [{col:'dateOp',id:'uncatSortDateOp',lbl:'Date Écriture'},{col:'dateExpense',id:'uncatSortDateExp',lbl:'Date réelle'},{col:'amount',id:'uncatSortAmount',lbl:'Montant'}].forEach(s => {
        let el=$(s.id); if(el) el.textContent = s.lbl + (uncatSortCol===s.col ? (uncatSortDir===-1?' ▼':' ▲') : ' ⇅');
    });
    
    let ut = $('uncatTable'); if(!ut) return;
    let tb = ut.querySelector('tbody');
    if(!uncat.length) return tb.innerHTML='<tr><td colspan="8" style="text-align:center; padding:32px; color:var(--ink-soft);">Toutes les écritures sont affectées ! 🎉</td></tr>';

    tb.innerHTML = uncat.map(t => {
        let m = rules.find(r => r.pattern.split(';').map(p=>p.trim()).filter(p=>p).some(p => (t.label && t.label.toUpperCase().includes(p.toUpperCase())) || (t.details && t.details.toUpperCase().includes(p.toUpperCase()))));
        let sc1=m?m.cat1:'', sc2=m?m.cat2:'', isM=!!m, isPrefilled = (t.cat1 && t.cat1 !== "_SANS_CATEGORIE" && t.cat2 && t.cat2 !== "_SANS_CATEGORIE");
        let displayCat = isPrefilled ? `${t.cat1} > ${t.cat2}` : (isM ? `${sc1} > ${sc2}` : "-");
        let act = `<button class="action-cell-btn ${isM||isPrefilled?'action-btn-prefilled':'action-btn-empty'} btn-cat-action" data-id="${t.id}" data-c1="${window.escapeHtml(sc1||t.cat1)}" data-c2="${window.escapeHtml(sc2||t.cat2)}" data-match="${isM||isPrefilled}">${isM||isPrefilled?'✏️':'🔍'}</button>`;

        return `<tr data-id="${t.id}" class="${selectedUncatIds.has(String(t.id))?'selected-row':''}">
            <td style="text-align:center;"><input type="checkbox" class="uncat-row-cb" value="${t.id}" ${selectedUncatIds.has(String(t.id))?'checked':''} onclick="window.toggleUncatCb(this, event)"></td>
            <td>${String(t.dateOp||'').split('-').reverse().join('/')}</td>
            <td><input type="date" class="inline-edit" data-id="${t.id}" data-field="dateExpense" value="${t.dateExpense || t.dateOp}" onclick="event.stopPropagation()"></td>
            <td class="wrap-text" style="font-size:0.9em; color:var(--ink-soft);">${window.escapeHtml(t.details)}</td>
            <td style="vertical-align:middle;padding:2px 4px;"><div style="display:flex;flex-wrap:wrap;gap:2px;align-items:center;">${window.renderPills?window.renderPills(t):''}</div></td>
            <td><input type="text" class="inline-edit" data-id="${t.id}" data-field="note" value="${window.escapeHtml(t.note||'')}" placeholder="Notes..." onclick="event.stopPropagation()"></td>
            <td style="font-weight:600; text-align:right; color:${t.amount>0?'var(--done)':'var(--ink)'}">${t.amount} €</td>
            <td style="text-align:right; white-space:nowrap;">${act}</td>
        </tr>`;
    }).join('');
    
    tb.querySelectorAll('.btn-cat-action').forEach(b => b.addEventListener('click', e => { e.stopPropagation(); let el=e.currentTarget; window.openCatModal(el.dataset.id, el.dataset.c1, el.dataset.c2, el.dataset.match==='true'); }));
    tb.querySelectorAll('.inline-edit').forEach(inp => inp.addEventListener('change', window.handleInlineChange));
    let allCb = $('selectAllUncatCb');
    if (allCb) allCb.checked = uncat.length > 0 && uncat.every(t => selectedUncatIds.has(String(t.id)));
    let wrap = $('quickCatSearchWrap'); if(wrap) wrap.style.display = selectedUncatIds.size > 0 ? 'flex' : 'none';
    if (_wrap) _wrap.scrollTop = _savedScroll;
};

window.toggleUncatCb = function(cb, event) {
    event.stopPropagation();
    let sid = String(cb.value);
    if (cb.checked) { selectedUncatIds.add(sid); let tr = cb.closest('tr'); if(tr) tr.classList.add('selected-row'); } 
    else { selectedUncatIds.delete(sid); let tr = cb.closest('tr'); if(tr) tr.classList.remove('selected-row'); let allCb = $('selectAllUncatCb'); if (allCb) allCb.checked = false; }
    selectedUncatTxId = selectedUncatIds.size > 0 ? Array.from(selectedUncatIds)[0] : null;
    let wrap = $('quickCatSearchWrap'); if(wrap) wrap.style.display = selectedUncatIds.size > 0 ? 'flex' : 'none';
};
window.toggleSelectAllUncat = function() {
    let v = $('selectAllUncatCb').checked;
    $$('.uncat-row-cb').forEach(c => {
        c.checked = v;
        if (v) { selectedUncatIds.add(c.value); let tr = c.closest('tr'); if(tr) tr.classList.add('selected-row'); } 
        else { selectedUncatIds.delete(c.value); let tr = c.closest('tr'); if(tr) tr.classList.remove('selected-row'); }
    });
    selectedUncatTxId = selectedUncatIds.size > 0 ? Array.from(selectedUncatIds)[0] : null;
    let wrap = $('quickCatSearchWrap'); if(wrap) wrap.style.display = selectedUncatIds.size > 0 ? 'flex' : 'none';
};

// ── SUGGESTIONS ET RECHERCHE CAT ──
window.stripCardPrefix = function(s) {
    var v = (s || '').trim();
    v = v.replace(/^CARTE\s+\d{2}\/\d{2}(?:\/\d{2,4})?\s+/i, '');
    v = v.replace(/^VIR\s+INST\s+/i, '');
    v = v.replace(/^VIR\s+/i, '');
    return v.trim();
};

window.getSuggestions = function(tx) {
    var rawDetail = tx.details || tx.label || '';
    var words = window.stripCardPrefix(rawDetail).split(/\s+/).filter(function(w){ return w.length >= 4; });
    var matchedRule = rules.find(function(r) {
        return r.pattern.split(';').map(function(p){ return p.trim(); }).filter(Boolean).some(function(p) {
            return rawDetail.toUpperCase().includes(p.toUpperCase()) || (tx.label && tx.label.toUpperCase().includes(p.toUpperCase()));
        });
    });
    var histCat = null;
    if (words.length > 0) {
        var cleanUp = window.stripCardPrefix(rawDetail).toUpperCase();
        var freq = {};
        transactions.forEach(function(t) {
            if (!t.cat1 || !t.cat2 || t.cat1 === '_SANS_CATEGORIE' || t.cat2 === '_SANS_CATEGORIE') return;
            var tClean = window.stripCardPrefix(t.details || t.label || '').toUpperCase();
            var score = 0;
            if (cleanUp.length >= 4 && tClean.includes(cleanUp)) score += words.length + 2;
            else words.forEach(function(w) { if (tClean.includes(w.toUpperCase())) score++; });
            if (score > 0) { var k = t.cat1+'|||'+t.cat2; freq[k]=(freq[k]||0)+score; }
        });
        var best = Object.keys(freq).sort(function(a,b){ return freq[b]-freq[a]; })[0];
        if (best) { var bp = best.split('|||'); histCat = { c1: bp[0], c2: bp[1] }; }
    }
    var sugg = [];
    if (matchedRule && matchedRule.cat1 && matchedRule.cat2) { sugg.push({ c1: matchedRule.cat1, c2: matchedRule.cat2, type: 'rule' }); } 
    else if (histCat) { sugg.push({ c1: histCat.c1, c2: histCat.c2, type: 'history' }); }
    if (typeof _lastChosenCat !== 'undefined' && _lastChosenCat.c1 && _lastChosenCat.c2) {
        if (!sugg.find(function(s){ return s.c1===_lastChosenCat.c1&&s.c2===_lastChosenCat.c2; }))
            sugg.push({ c1: _lastChosenCat.c1, c2: _lastChosenCat.c2, type: 'global' });
    }
    return sugg.slice(0, 2);
};

window.renderPills = function(tx) {
    var suggs = window.getSuggestions(tx);
    if (!suggs.length) return '';
    var html = '';
    suggs.forEach(function(s) {
        var icon  = s.type==='rule' ? '🎯' : s.type==='history' ? '📊' : '⟲';
        var color = s.type==='rule' ? '#2e7d32' : s.type==='history' ? '#1565c0' : '#757575';
        var bg    = s.type==='rule' ? 'rgba(46,125,50,.10)' : s.type==='history' ? 'rgba(21,101,192,.10)' : 'rgba(0,0,0,.05)';
        var c2e   = window.escapeHtml(s.c2);
        var c1e   = window.escapeHtml(s.c1);
        html += '<button class="sugg-pill"'
              + ' data-txid="' + window.escapeHtml(String(tx.id)) + '"'
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
};

document.addEventListener('click', function(e) {
    var hit = e.target.closest('.cat-search-hit');
    if (hit) { window.catModalSearchApply(hit.getAttribute('data-c1'), hit.getAttribute('data-c2')); return; }
    var btn = e.target.closest('.sugg-pill');
    if (!btn) return;
    e.stopPropagation();
    window.applySuggPill(btn.getAttribute('data-txid'), btn.getAttribute('data-c1'), btn.getAttribute('data-c2'));
});

window.applySuggPill = function(id, c1, c2) {
    var tx = transactions.find(function(t){ return String(t.id)===String(id); });
    if (!tx) return;
    tx.cat1 = c1; tx.cat2 = c2;
    if(typeof _lastChosenCat !== 'undefined') _lastChosenCat = { c1: c1, c2: c2 };
    window.triggerSave(false); 
    if(typeof window.renderSummary === 'function') window.renderSummary(); 
    window.renderUncategorized();
    window.showToast('OK ' + c1 + ' > ' + c2);
};

var _qcResults = [], _qcIdx = -1;
window.onQuickCatInput = function() {
    var q = ($('quickCatInput').value || '').trim().toLowerCase();
    var dd = $('quickCatDropdown');
    if (!q) { dd.style.display = 'none'; _qcResults = []; return; }
    var pairs = [];
    Object.keys(categories).sort().forEach(function(c1) { (categories[c1] || []).sort().forEach(function(c2) { pairs.push({ c1: c1, c2: c2, label: (c1 + ' > ' + c2).toLowerCase() }); }); });
    _qcResults = pairs.filter(function(p) { return p.label.includes(q) || p.c1.toLowerCase().includes(q) || p.c2.toLowerCase().includes(q); }).slice(0, 12);
    _qcIdx = _qcResults.length ? 0 : -1;
    if (!_qcResults.length) { dd.style.display = 'none'; return; }
    dd.style.display = 'block';
    dd.innerHTML = _qcResults.map(function(p, i) {
        var active = i === 0 ? ' qc-active' : '';
        return '<div class="qc-item' + active + '" data-idx="' + i + '" onmousedown="event.preventDefault();window.qcApply(' + i + ')" onmouseenter="window.qcHover(' + i + ')" style="padding:8px 14px;cursor:pointer;font-size:0.92em;border-bottom:1px solid var(--ink-faint);color:var(--ink);"><span style="font-weight:600;color:var(--accent,#e07b54);">' + window.escapeHtml(p.c1) + '</span><span style="color:var(--ink-muted);"> › </span><span>' + window.escapeHtml(p.c2) + '</span></div>';
    }).join('');
};
window.qcHover = function(i) { _qcIdx = i; $$('.qc-item').forEach(function(el, j) { el.classList.toggle('qc-active', j === i); }); };
window.onQuickCatKey = function(e) {
    var dd = $('quickCatDropdown');
    if (e.key === 'ArrowDown') { e.preventDefault(); _qcIdx = Math.min(_qcIdx + 1, _qcResults.length - 1); $$('.qc-item').forEach(function(el, j) { el.classList.toggle('qc-active', j === _qcIdx); }); } 
    else if (e.key === 'ArrowUp') { e.preventDefault(); _qcIdx = Math.max(_qcIdx - 1, 0); $$('.qc-item').forEach(function(el, j) { el.classList.toggle('qc-active', j === _qcIdx); }); } 
    else if (e.key === 'Enter') { e.preventDefault(); if (_qcIdx >= 0) window.qcApply(_qcIdx); } 
    else if (e.key === 'Escape') { dd.style.display = 'none'; $('quickCatInput').value = ''; let wrap = $('quickCatSearchWrap'); if(wrap) wrap.style.display = 'none'; _qcResults = []; }
};
window.qcApply = function(i) {
    var p = _qcResults[i]; if (!p) return;
    var ids = selectedUncatIds.size > 0 ? Array.from(selectedUncatIds) : (selectedUncatTxId ? [selectedUncatTxId] : []);
    if (!ids.length) { window.showToast('⚠️ Sélectionnez d\'abord une ou plusieurs lignes'); return; }
    ids.forEach(function(id) { var tx = transactions.find(function(t) { return String(t.id) === String(id); }); if (tx) { tx.cat1 = p.c1; tx.cat2 = p.c2; } });
    if(typeof _lastChosenCat !== 'undefined') _lastChosenCat = { c1: p.c1, c2: p.c2 };
    selectedUncatIds.clear();
    $('quickCatDropdown').style.display = 'none'; $('quickCatInput').value = ''; let wrap = $('quickCatSearchWrap'); if(wrap) wrap.style.display = 'none'; _qcResults = [];
    window.triggerSave(false); if(typeof window.renderSummary === 'function') window.renderSummary(); window.renderUncategorized();
    window.showToast('✅ ' + p.c1 + ' › ' + p.c2 + ' appliqué à ' + ids.length + ' ligne(s)');
};

window.onBulkQuickCatInput = function() {
    var q = ($('bulkQuickCatInput').value || '').trim().toLowerCase();
    var dd = $('bulkQuickCatDropdown');
    if (!q) { dd.style.display = 'none'; _qcResults = []; return; }
    var pairs = [];
    Object.keys(categories).sort().forEach(function(c1) { (categories[c1] || []).sort().forEach(function(c2) { pairs.push({ c1: c1, c2: c2, label: (c1 + ' > ' + c2).toLowerCase() }); }); });
    _qcResults = pairs.filter(function(p) { return p.label.includes(q) || p.c1.toLowerCase().includes(q) || p.c2.toLowerCase().includes(q); }).slice(0, 12);
    _qcIdx = _qcResults.length ? 0 : -1;
    if (!_qcResults.length) { dd.style.display = 'none'; return; }
    dd.style.display = 'block';
    dd.innerHTML = _qcResults.map(function(p, i) {
        var active = i === 0 ? ' qc-active' : '';
        return '<div class="qc-item' + active + '" data-idx="' + i + '" onmousedown="event.preventDefault();window.bulkQcApply(' + i + ')" onmouseenter="window.qcHover(' + i + ')" style="padding:8px 14px;cursor:pointer;font-size:0.92em;border-bottom:1px solid var(--ink-faint);color:var(--ink);"><span style="font-weight:600;color:var(--accent,#e07b54);">' + window.escapeHtml(p.c1) + '</span><span style="color:var(--ink-muted);"> › </span><span>' + window.escapeHtml(p.c2) + '</span></div>';
    }).join('');
};
window.onBulkQuickCatKey = function(e) {
    var dd = $('bulkQuickCatDropdown');
    if (e.key === 'ArrowDown') { e.preventDefault(); _qcIdx = Math.min(_qcIdx + 1, _qcResults.length - 1); $$('#bulkQuickCatDropdown .qc-item').forEach(function(el, j) { el.classList.toggle('qc-active', j === _qcIdx); }); } 
    else if (e.key === 'ArrowUp') { e.preventDefault(); _qcIdx = Math.max(_qcIdx - 1, 0); $$('#bulkQuickCatDropdown .qc-item').forEach(function(el, j) { el.classList.toggle('qc-active', j === _qcIdx); }); } 
    else if (e.key === 'Enter') { e.preventDefault(); if (_qcIdx >= 0) window.bulkQcApply(_qcIdx); } 
    else if (e.key === 'Escape') { dd.style.display = 'none'; $('bulkQuickCatInput').value = ''; _qcResults = []; }
};
window.bulkQcApply = function(i) {
    var p = _qcResults[i]; if (!p) return;
    var ids = Array.from($$('.row-cb:checked')).map(c=>c.value);
    if (!ids.length) { window.showToast('⚠️ Sélectionnez d\'abord une ou plusieurs lignes'); return; }
    transactions.forEach(t=>{if(ids.includes(String(t.id))){t.cat1=p.c1;t.cat2=p.c2;}});
    if(typeof _lastChosenCat !== 'undefined') _lastChosenCat = { c1: p.c1, c2: p.c2 };
    let scb = $('selectAllCb'); if(scb) scb.checked=false;
    $('bulkQuickCatDropdown').style.display = 'none'; $('bulkQuickCatInput').value = ''; _qcResults = [];
    window.triggerSave(true); if(typeof window.renderViewsSafe === 'function') window.renderViewsSafe(); window.updateBulkActions();
    window.showToast('✅ ' + p.c1 + ' › ' + p.c2 + ' appliqué à ' + ids.length + ' ligne(s)');
};

// ── MODALE CATÉGORISATION ──
window.openCatModal = function(tid, p1, p2, isRule) {
    catModalTxId=String(tid); let t=transactions.find(x=>String(x.id)===catModalTxId); if(!t)return;
    let labelEl = $('catModalTxLabel'); if(labelEl) labelEl.textContent=t.label||'Opération'; 
    let detailEl = $('catModalTxDetails'); if(detailEl) detailEl.textContent=t.details||''; 
    let amountEl = $('catModalTxAmount'); if(amountEl) { amountEl.textContent=t.amount+" €"; amountEl.style.color=t.amount>0?'var(--done)':'var(--urgent)'; }
    catModalSelectedCat1 = t.cat1 || p1 || ''; catModalSelectedCat2 = t.cat2 || p2 || '';
    
    let list1 = $('catModalCat1List');
    if(list1) {
        list1.innerHTML=Object.keys(categories).sort(window.customSortCmp).map(c1=>`<button class="cat-step-btn cat1-btn ${c1===catModalSelectedCat1?'selected':''}" data-c1="${window.escapeHtml(c1)}">${window.escapeHtml(c1)}</button>`).join('');
        $$('.cat1-btn').forEach(b=>b.addEventListener('click', e=>window.selectCat1(e.currentTarget.dataset.c1)));
    }
    if(isRule && catModalSelectedCat1 && catModalSelectedCat2) window.showStep3(catModalSelectedCat1,catModalSelectedCat2,true); 
    else { $('catModalStep1').style.display='block';$('catModalStep2').style.display='none';$('catModalStep3').style.display='none'; }
    
    $('catSelectionOverlay').classList.add('open');
    if($('catModalSearchInput')) {
        var _rawD = t && (t.details || t.label || '') || '';
        var _cleanD = _rawD.replace(/^CARTE\s+\d{2}\/\d{2}(?:\/\d{2,4})?\s+/i,'').replace(/^VIR\s+INST\s+/i,'').replace(/^VIR\s+/i,'').trim();
        $('catModalSearchInput').value = _cleanD;
    }
    if($('catModalSearchResults')) $('catModalSearchResults').innerHTML='<div style="color:var(--ink-muted);padding:8px 0;">Saisissez un mot-clé…</div>';
    if($('catModalSearchInput') && $('catModalSearchInput').value) window.onCatModalSearch();
};

window.selectCat1 = function(c1) { 
    catModalSelectedCat1=c1; 
    $('catModalStep1').style.display='none'; $('catModalStep2').style.display='block'; $('catModalStep3').style.display='none'; 
    let s2lbl = $('catModalStep2Label'); if(s2lbl) s2lbl.textContent=c1; 
    let list2 = $('catModalCat2List');
    if(list2) {
        list2.innerHTML=(categories[c1]||[]).sort(window.customSortCmp).map(c2=>`<button class="cat-step-btn cat2-btn ${c2===catModalSelectedCat2?'selected':''}" data-c2="${window.escapeHtml(c2)}">${window.escapeHtml(c2)}</button>`).join(''); 
        $$('.cat2-btn').forEach(b=>b.addEventListener('click', e=>window.showStep3(c1,e.currentTarget.dataset.c2,false)));
    }
};

window.showStep3 = function(c1,c2,isRule) {
    catModalSelectedCat1=c1; catModalSelectedCat2=c2; 
    $('catModalStep1').style.display='none';$('catModalStep2').style.display='none';$('catModalStep3').style.display='block';
    let fc = $('catModalFinalCat'); if(fc) fc.textContent=`${c1} > ${c2}`; 
    let cb=$('catModalCreateRule'), grp=$('catModalRuleGroup'), inp=$('catModalRulePattern'); 
    if(cb) cb.checked=false; if(grp) grp.style.display='none'; 
    if(!isRule){let t=transactions.find(x=>String(x.id)===catModalTxId), dp=t?t.details.split(' ')[0].replace(/[^a-zA-Z0-9]/g,''):''; if(dp.length<3&&t)dp=t.details.substring(0,8).trim(); if(inp) inp.value=dp;}
};

window.validateCategorization = function() {
    let t=transactions.find(x=>String(x.id)===catModalTxId); if(!t)return; 
    t.cat1=catModalSelectedCat1; t.cat2=catModalSelectedCat2; 
    if(typeof _lastChosenCat !== 'undefined') _lastChosenCat={c1:catModalSelectedCat1,c2:catModalSelectedCat2};
    let cb = $('catModalCreateRule');
    if(cb && cb.checked){let p=$('catModalRulePattern').value.trim();if(p)window.addOrMergeRule(p,t.cat1,t.cat2);} 
    window.triggerSave(true); window.closeCatModal(); 
    if(typeof window.renderViewsSafe === 'function') window.renderViewsSafe(); 
    window.showToast("Enregistré ✓");
};
window.closeCatModal = function() { let o=$('catSelectionOverlay'); if(o) o.classList.remove('open'); };

window.onCatModalSearch = function() {
    var q = ($('catModalSearchInput').value || '').trim().toLowerCase();
    var out = $('catModalSearchResults'); if (!out) return;
    if (!q) { out.innerHTML = '<div style="color:var(--ink-muted);padding:8px 0;">Saisissez un mot-clé…</div>'; return; }
    var hits = transactions.filter(function(t) {
        if (!t.cat1 || t.cat1 === '_SANS_CATEGORIE') return false;
        var label = (t.label || '').toLowerCase(), details = (t.details || '').toLowerCase(), amount = String(t.amount || '');
        return label.includes(q) || details.includes(q) || amount.includes(q);
    }).slice(0, 40);
    if (!hits.length) { out.innerHTML = '<div style="color:var(--ink-muted);padding:8px 0;">Aucun résultat.</div>'; return; }
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
            var c1e = window.escapeHtml(g.c1), c2e = window.escapeHtml(g.c2);
            return '<div style="border:1px solid var(--ink-faint);border-radius:6px;padding:7px 10px;margin-bottom:5px;cursor:pointer;background:var(--surface);" data-c1="' + c1e + '" data-c2="' + c2e + '" class="cat-search-hit" title="Appliquer ' + c1e + ' > ' + c2e + '">'
                 + '<div style="font-weight:600;font-size:0.9em;">' + c1e + ' <span style="color:var(--ink-muted);">›</span> ' + c2e + '</div>'
                 + '<div style="font-size:0.78em;color:var(--ink-muted);margin-top:2px;">' + window.escapeHtml(g.examples[0] || '') + ' <span style="color:#c0392b;font-weight:600;">(' + g.count + ')</span>' + '</div>'
                 + '</div>';
        }).join('');
};

window.catModalSearchApply = function(c1, c2) {
    catModalSelectedCat1 = c1; catModalSelectedCat2 = c2;
    let fc = $('catModalFinalCat'); if(fc) fc.textContent = c1 + ' > ' + c2;
    $('catModalStep1').style.display = 'none'; $('catModalStep2').style.display = 'none'; $('catModalStep3').style.display = 'block';
    var s3 = $('catModalStep3'); if(s3) s3.scrollIntoView({behavior:'smooth',block:'nearest'});
};

// ── IDÉES AMÉLIORATION ──
var _ideasFileId = null;
window.openIdeasPopup = function() {
    let io = $('ideasOverlay'); if(io) io.classList.add('open');
    let iss = $('ideasSaveStatus'); if(iss) iss.textContent = '';
    window.loadIdeasText();
};
window.closeIdeasPopup = function() { let io = $('ideasOverlay'); if(io) io.classList.remove('open'); };
window.loadIdeasText = async function() {
    if (!driveAccessToken) {
        let ta = $('ideasTextarea'); if(ta) { ta.value = ''; ta.placeholder = 'Connectez-vous à Drive pour sauvegarder vos idées.'; }
        return;
    }
    let iss = $('ideasSaveStatus'); if(iss) iss.textContent = '⏳ Chargement...';
    try {
        var fname = 'appsysdata_ideas_' + (currentAccountId || 'default') + '.dat';
        var r = await fetch("https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=name%3D'" + encodeURIComponent(fname) + "'&fields=files(id,name)&pageSize=1", { headers: { Authorization: 'Bearer ' + driveAccessToken } });
        var d = await r.json();
        if (d.files && d.files.length > 0) {
            _ideasFileId = d.files[0].id;
            var rc = await fetch('https://www.googleapis.com/drive/v3/files/' + _ideasFileId + '?alt=media', { headers: { Authorization: 'Bearer ' + driveAccessToken } });
            let ta = $('ideasTextarea'); if(ta) ta.value = await rc.text();
            if(iss) iss.textContent = '✅ Chargé';
        } else {
            _ideasFileId = null;
            let ta = $('ideasTextarea'); if(ta) ta.value = '';
            if(iss) iss.textContent = 'Nouveau fichier';
        }
    } catch(e) { if(iss) iss.textContent = '❌ Erreur chargement'; }
};
window.saveIdeasText = async function() {
    if (!driveAccessToken) return;
    let ta = $('ideasTextarea'); if(!ta) return;
    var text = ta.value;
    let iss = $('ideasSaveStatus'); if(iss) iss.textContent = '💾 Sauvegarde...';
    try {
        var fname = 'appsysdata_ideas_' + (currentAccountId || 'default') + '.dat';
        var blob = new Blob([text], { type: 'text/plain' });
        var url, method;
        if (_ideasFileId) { url = 'https://www.googleapis.com/upload/drive/v3/files/' + _ideasFileId + '?uploadType=media'; method = 'PATCH'; } 
        else {
            var meta = JSON.stringify({ name: fname, parents: ['appDataFolder'] });
            var form = new FormData();
            form.append('metadata', new Blob([meta], { type: 'application/json' }));
            form.append('file', blob);
            var r2 = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', { method: 'POST', headers: { Authorization: 'Bearer ' + driveAccessToken }, body: form });
            var res = await r2.json();
            _ideasFileId = res.id;
            if(iss) iss.textContent = '✅ Sauvegardé';
            return;
        }
        await fetch(url, { method: method, headers: { Authorization: 'Bearer ' + driveAccessToken, 'Content-Type': 'text/plain' }, body: text });
        if(iss) iss.textContent = '✅ Sauvegardé — ' + new Date().toLocaleTimeString('fr-FR');
    } catch(e) { if(iss) iss.textContent = '❌ Erreur sauvegarde'; }
};

// ── SETTINGS / ADMIN ──
document.addEventListener('DOMContentLoaded', () => {
    let backupBtn = $('backupBtn');
    if(backupBtn) backupBtn.addEventListener('click',()=>{let a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({transactions,rules,categories,version:APP_VERSION},null,2)],{type:'application/json'}));a.download=`finances_secours_${new Date().toISOString().slice(0,10)}.json`;a.click();});

    let deleteAllBtn = $('deleteAllBtn');
    if(deleteAllBtn) deleteAllBtn.addEventListener('click', async () => {
        let _acName=accounts.find(a=>a.id===currentAccountId)?.name||currentAccountId;
        if (!confirm(`⚠️ EFFACEMENT du compte "${_acName}" — données, catégories, règles et fichier Drive. Confirmer ?`)) return;
        transactions = []; rules = []; categories = {};
        driveFileId = null; delete driveFileIdMap[currentAccountId];
        if (driveAccessToken) {
            try {
                const fileId = await driveGetFileId();
                if (fileId) { await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, { method: 'DELETE', headers: { Authorization: `Bearer ${driveAccessToken}` } }); driveFileId = null; }
            } catch(err) { console.warn('Erreur suppression Drive:', err.message); }
        }
        appSecretKey = null; driveFileId = null;
        if(typeof window.renderViewsSafe === 'function') window.renderViewsSafe();
        window.showToast('✅ Réinitialisation complète — définissez une nouvelle clé');
        setTimeout(() => { let ap = $('appPassword'); if(ap) ap.value = ''; let ao = $('authOverlay'); if(ao) ao.classList.add('open'); }, 600);
    });
});

// ── ACCOUNT MANAGER ──
window.renderAccountUI = function() {
    let sel = document.getElementById('accountSelector');
    if (!sel) return;
    sel.innerHTML = accounts.map(a => `<option value="${a.id}" ${a.id===currentAccountId?'selected':''}>${a.name}</option>`).join('');
};

window.switchAccount = async function(newId) {
    if (newId === currentAccountId) return;
    currentAccountId = newId;
    localStorage.setItem('f_current_account', newId);
    window._isFirstTcdScrollRestored = false;
    transactions = []; rules = []; categories = {}; 
    if(typeof savedCharts !== 'undefined') savedCharts = [];
    quittancesBiens = []; currentQuittanceBienId = null;
    budgetData = {};
    if(typeof loadFiscalStartMonth === 'function') loadFiscalStartMonth();
    if(typeof loadFiscalStartMonthSyndic === 'function') loadFiscalStartMonthSyndic(); 
    if(typeof applyFiscalStartMonthState === 'function') applyFiscalStartMonthState();
    budgetEnabled = localStorage.getItem('f_budget_enabled_' + currentAccountId) === '1';
    if(typeof applyBudgetOptionState === 'function') applyBudgetOptionState();
    regulEnabled = localStorage.getItem('f_regul_enabled_' + currentAccountId) === '1';
    if(typeof applyRegulOptionState === 'function') applyRegulOptionState();
    if (window.appState) window.appState.tcdRedCells = window.appState.tcdRedCells || {};
    driveFileId = null;
    window.renderAccountUI();
    if(typeof driveShowLoading === 'function') driveShowLoading('Chargement du compte...');
    driveDataLoaded=false;
    try { if(typeof fetchDriveData === 'function') await fetchDriveData(); } 
    catch(e) { if(typeof driveHideLoading === 'function') driveHideLoading(); if(typeof window.renderViewsSafe === 'function') window.renderViewsSafe(); }
};

window.openAccountManager = function() {
    window.renderAccountManagerList();
    let am = document.getElementById('accountManagerModal'); if(am) am.classList.add('open');
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
        if (isCurrent) { html += '<span style="font-size:0.8em;color:var(--pro);font-weight:600;padding:0 8px;">Actif</span>'; } 
        else { html += '<button class="btn btn-primary" style="padding:4px 10px;font-size:0.85em;" onclick="window.switchAccount(\'' + safeId + '\');let am=document.getElementById(\'accountManagerModal\');if(am)am.classList.remove(\'open\')">Activer</button>'; }
        if (accounts.length > 1 && !isCurrent) { html += '<button class="btn btn-danger" style="padding:4px 8px;font-size:0.85em;" onclick="window.deleteAccount(\'' + safeId + '\')">🗑️</button>'; }
        html += '</div>';
    });
    list.innerHTML = html;
};

window.addAccount = async function() {
    let nameEl = document.getElementById('newAccountName'); if(!nameEl) return;
    let name = nameEl.value.trim(); if (!name) return;
    let id = 'acc_' + Date.now();
    accounts.push({id, name});
    if(typeof saveAccountsList === 'function') saveAccountsList();
    nameEl.value = '';
    window.renderAccountManagerList();
    window.renderAccountUI();
    if (driveAccessToken) {
        let newIdx = accounts.length;
        let fname = 'appsysdata-' + newIdx + '.dat';
        try {
            let emptyState = {
                transactions: [], rules: [], categories: {}, savedCharts: [],
                version: APP_VERSION, accounts: accounts,
                settings: { tcdHeaderColor: localStorage.getItem('f_tcd_header_color') || '', fontSize: localStorage.getItem('f_fontSize') || '14', tcdFontSize: localStorage.getItem('f_tcd_fontsize') || '13', pivot: localStorage.getItem('f_pivot_v2') || '', collapsedGroups: [], collapsedYears: [], tcdFilter: { cat1:[], cat2:[], years:[], months:[] }, tcdRedCells: {}, settingsTs: Date.now() },
                accountId: id
            };
            let emptyPayload = JSON.stringify({vault: CryptoJS.AES.encrypt(JSON.stringify(emptyState), appSecretKey || '').toString()});
            let blob = new Blob([emptyPayload], {type:'application/json'});
            let form = new FormData();
            form.append('metadata', new Blob([JSON.stringify({ name: fname, parents: ['appDataFolder'] })], {type:'application/json'}));
            form.append('file', blob);
            let resp = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name', { method: 'POST', headers: { Authorization: 'Bearer ' + driveAccessToken }, body: form });
            let fileData = await resp.json();
            if (fileData.id) driveFileIdMap[id] = fileData.id;
        } catch(e) { console.warn('Erreur création fichier Drive:', e); }
        if (typeof window.renderDriveAdmin === 'function') window.renderDriveAdmin();
    }
    window.showToast('Compte "' + name + '" créé ✓');
};
