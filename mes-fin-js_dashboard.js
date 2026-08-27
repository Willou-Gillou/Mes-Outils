// ==== VUES ET TABLEAU CROISE DYNAMIQUE (TCD) ====

window.toggleGroup = function(r1) { 
    if(typeof window.tcdSaveScroll === 'function') window.tcdSaveScroll(); 
    if(collapsedGroups.has(r1)) collapsedGroups.delete(r1); 
    else collapsedGroups.add(r1); 
    if(typeof window.tcdSaveCollapsed === 'function') window.tcdSaveCollapsed(); 
    window.renderSummary(); 
};

window.toggleAllGroups = function(expand) {
    if(expand) { collapsedGroups.clear(); }
    else { 
        (_lastR1Keys.length ? _lastR1Keys : Object.keys(categories)).forEach(k => collapsedGroups.add(k)); 
        collapsedGroups.add('_SANS_CATEGORIE'); 
    } 
    if(typeof window.tcdSaveCollapsed === 'function') window.tcdSaveCollapsed(); 
    window.renderSummary();
};

window.toggleYear = function(y) { 
    if(typeof window.tcdSaveScroll === 'function') window.tcdSaveScroll(); 
    if(collapsedYears.has(y)) collapsedYears.delete(y); 
    else collapsedYears.add(y); 
    if(typeof window.tcdSaveCollapsed === 'function') window.tcdSaveCollapsed(); 
    window.renderSummary(); 
};

window.toggleAllYears = function(expand) {
    if(expand) collapsedYears.clear();
    else {
        let tAxeEl = $('timeAxe');
        let tAxe = tAxeEl ? tAxeEl.value : 'dateOp';
        transactions.forEach(t => {
            let dStr = String(t[tAxe] || t.dateOp || '');
            let y = dStr.length >= 4 ? dStr.substring(0,4) : '(vide)';
            collapsedYears.add(y);
        });
    }
    if(typeof window.tcdSaveCollapsed === 'function') window.tcdSaveCollapsed(); 
    window.renderSummary();
};

window.getFiscalYearLabel = function(y, m, startMonth) {
    if (!y || y === 'vide' || !m || m === 'vide') return 'vide';
    let yi = parseInt(y, 10), mi = parseInt(m, 10);
    if (startMonth === 1) return String(yi);
    let fiscalStartYear = (mi >= startMonth) ? yi : (yi - 1);
    return `${fiscalStartYear}-${fiscalStartYear + 1}`;
};

window.getFiscalMonthOrder = function(m, startMonth) {
    let mi = parseInt(m, 10);
    if (isNaN(mi)) return 99;
    return (mi - startMonth + 12) % 12;
};

window.loadFiscalStartMonth = function() {
    let v = localStorage.getItem('f_fiscal_start_' + currentAccountId);
    fiscalStartMonth = v ? parseInt(v, 10) : 1;
    if (isNaN(fiscalStartMonth) || fiscalStartMonth < 1 || fiscalStartMonth > 12) fiscalStartMonth = 1;
};

window.setFiscalStartMonth = function(v) {
    fiscalStartMonth = parseInt(v, 10) || 1;
    localStorage.setItem('f_fiscal_start_' + currentAccountId, String(fiscalStartMonth));
    window.renderSummary();
    window.showToast('Exercice fiscal mis à jour ✓');
};

window.renderSummary = function(force=false) {
    const r1FEl = $('pivotRows'), r2FEl = $('pivotRows2'), tAxeEl = $('timeAxe');
    if(!r1FEl || !r2FEl || !tAxeEl) return;
    const r1F = r1FEl.value, r2F = r2FEl.value, tAxe = tAxeEl.value;
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
        let fyOp = mOpForFy ? window.getFiscalYearLabel(yOp, mOpForFy, fiscalStartMonth) : 'vide';
        if (tcdFilter.fiscalYearsOp.has(fyOp)) return false;
        let mExpForFy = dExpStr.length >= 7 ? dExpStr.substring(5,7) : null;
        let fyExp = mExpForFy ? window.getFiscalYearLabel(yExp, mExpForFy, fiscalStartMonth) : 'vide';
        if (tcdFilter.fiscalYearsExpense.has(fyExp)) return false;
        let dStr = String(t[tAxeEl.value || 'dateOp'] || t.dateOp || '');
        let m = dStr.length >= 7 ? dStr.substring(5,7) : 'vide';
        if (tcdFilter.months.has(m)) return false;
        return true;
    });
    let yearsMap = {}, tree = {}, colTotals = {}, totalGrand = 0;
    tcdMap = {}; tcdMap['GRAND_TOTAL'] = validTx;

    validTx.forEach(t => {
        let dStr = String(t[tAxe] || t.dateOp || '');
        let yRaw = dStr.length >= 4 ? dStr.substring(0,4) : 'vide';
        let m = dStr.length >= 7 ? dStr.substring(5,7) : 'vide';
        let y = window.getFiscalYearLabel(yRaw, m, fiscalStartMonth);
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

        let mkey = `MONTH_TOTAL::${y}::${m}`;
        if (!tcdMap[mkey]) tcdMap[mkey] = []; tcdMap[mkey].push(t);
        let ykey = `YEAR_TOTAL::${y}`;
        if (!tcdMap[ykey]) tcdMap[ykey] = []; tcdMap[ykey].push(t);
    });

    let yearsSorted = Object.keys(yearsMap).sort();
    let r1Sorted = Object.keys(tree).sort(window.customSortCmp);
    _lastR1Keys = r1Sorted.slice();
    
    if (window._tcdCollapseAllOnFirstRender) {
        window._tcdCollapseAllOnFirstRender = false;
        _lastR1Keys.forEach(k => collapsedGroups.add(k));
        collapsedGroups.add('_SANS_CATEGORIE');
        if(typeof window.tcdSaveCollapsed === 'function') window.tcdSaveCollapsed();
    }

    let html = '<table class="tcd-native" cellspacing="0" cellpadding="0"><thead>';

    html += '<tr><th class="tcd-col-axis" rowspan="2" style="text-align:center;"><span id="tcdFilterBtn" class="' + (window.hasTcdFilter() ? 'active' : '') + '" title="Filtrer" onclick="window.openTcdFilter(event)">⚙️</span></th>';
    yearsSorted.forEach(y => {
        let isCol = collapsedYears.has(y);
        let monthCount = isCol ? 1 : Array.from(yearsMap[y]).length;
        let span = isCol ? 1 : monthCount;
        html += '<th class="tcd-th-year" colspan="' + span + '" data-y="' + y + '">';
        html += '<span class="tcd-toggle-year" data-y="' + y + '" style="cursor:pointer">' + y + '</span></th>';
    });
    html += '<th class="tcd-th-grand" rowspan="2">TOTAL<br>GLOBAL</th></tr>';

    html += '<tr>';
    yearsSorted.forEach(y => {
        let isCol = collapsedYears.has(y);
        if (isCol) {
            html += '<th class="tcd-th-month tcd-total-col' + (isCol ? '' : ' tcd-year-total-hidden') + '"><b>TOTAL</b></th>';
        } else {
            let monthNames = ['','Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
            Array.from(yearsMap[y]).sort((a,b)=>window.getFiscalMonthOrder(a,fiscalStartMonth)-window.getFiscalMonthOrder(b,fiscalStartMonth)).forEach(m => {
                html += '<th class="tcd-th-month">' + (monthNames[parseInt(m)] || m) + '</th>';
            });
            html += '<th class="tcd-th-month tcd-total-col' + (isCol ? '' : ' tcd-year-total-hidden') + '"><b>TOTAL</b></th>';
        }
    });
    html += '</tr></thead><tbody>';

    const cellFmt2 = (val, key, isSub=false) => val === 0 ? '<td class="tcd-cell tcd-zero"></td>' :
        '<td class="tcd-cell' + (isSub?' tcd-sub-amount':'') + '"><span class="tcd-clickable" data-k="' + window.escapeHtml(key) + '">' + window.formatCurrency(val) + '</span></td>';

    r1Sorted.forEach(r1 => {
        let collapsed = collapsedGroups.has(r1);
        html += '<tr class="tcd-row-main-tr">';
        html += '<td class="tcd-col-axis"><div class="tcd-row-main" style="cursor:pointer" data-toggle-r1="' + btoa(unescape(encodeURIComponent(r1))) + '">' + window.escapeHtml(r1) + '</div></td>';
        yearsSorted.forEach(y => {
            let isCol = collapsedYears.has(y);
            if (!isCol) {
                Array.from(yearsMap[y]).sort((a,b)=>window.getFiscalMonthOrder(a,fiscalStartMonth)-window.getFiscalMonthOrder(b,fiscalStartMonth)).forEach(m => {
                    let padM = m.toString().padStart(2,'0');
                    html += cellFmt2(tree[r1].cells[`${r1}::*::${y}::${m}`]||0, `${r1}::*::${y}::${m}`);
                });
            }
            let _ytClass = collapsedYears.has(y) ? 'tcd-cell tcd-total-col' : 'tcd-cell tcd-total-col tcd-year-total-hidden';
            html += '<td class="' + _ytClass + '"><b>' + (tree[r1].yearTotals[y] ?
                '<span class="tcd-clickable" data-k="' + window.escapeHtml(`${r1}::*::${y}::ALL`) + '">' + window.formatCurrency(tree[r1].yearTotals[y]) + '</span>' : '') + '</b></td>';
        });
        html += '<td class="tcd-cell tcd-total-col tcd-grand"><b><span class="tcd-clickable" data-k="' + window.escapeHtml(`${r1}::*::ALL::ALL`) + '">' + window.formatCurrency(tree[r1].total) + '</span></b></td>';
        html += '</tr>';

        if (r2F && !collapsed) {
            Object.keys(tree[r1].sub).sort(window.customSortCmp).forEach(r2 => {
                html += '<tr class="tcd-row-sub-tr">';
                html += '<td class="tcd-col-axis"><div class="tcd-row-sub">↳ ' + window.escapeHtml(r2) + '</div></td>';
                yearsSorted.forEach(y => {
                    let isCol = collapsedYears.has(y);
                    if (!isCol) {
                        Array.from(yearsMap[y]).sort((a,b)=>window.getFiscalMonthOrder(a,fiscalStartMonth)-window.getFiscalMonthOrder(b,fiscalStartMonth)).forEach(m => {
                            let padM = m.toString().padStart(2,'0');
                            html += cellFmt2(tree[r1].sub[r2].cells[`${r1}::${r2}::${y}::${m}`]||0, `${r1}::${r2}::${y}::${m}`, true);
                        });
                    }
                    let ytVal = tree[r1].sub[r2].yearTotals[y]||0;
                    let _ytSubClass = collapsedYears.has(y) ? 'tcd-cell tcd-sub-amount tcd-total-col' : 'tcd-cell tcd-sub-amount tcd-total-col tcd-year-total-hidden';
                    html += '<td class="' + _ytSubClass + '">' + (ytVal ?
                        '<span class="tcd-clickable" data-k="' + window.escapeHtml(`${r1}::${r2}::${y}::ALL`) + '">' + window.formatCurrency(ytVal) + '</span>' : '') + '</td>';
                });
                let gtVal = tree[r1].sub[r2].total;
                html += '<td class="tcd-cell tcd-sub-amount tcd-total-col tcd-grand">' + (gtVal ?
                    '<span class="tcd-clickable" data-k="' + window.escapeHtml(`${r1}::${r2}::ALL::ALL`) + '">' + window.formatCurrency(gtVal) + '</span>' : '') + '</td>';
                html += '</tr>';
            });
        }
    });

    html += '<tr class="tcd-total-row">';
    html += '<td class="tcd-col-axis"><div class="tcd-row-main">TOTAL GLOBAL</div></td>';
    yearsSorted.forEach(y => {
        let isCol = collapsedYears.has(y);
        if (!isCol) {
            Array.from(yearsMap[y]).sort((a,b)=>window.getFiscalMonthOrder(a,fiscalStartMonth)-window.getFiscalMonthOrder(b,fiscalStartMonth)).forEach(m => {
                let padM = m.toString().padStart(2,'0');
                let v = colTotals[`${y}::${m}`]||0;
                html += '<td class="tcd-cell">' + (v ? '<span class="tcd-clickable" data-k="MONTH_TOTAL::' + y + '::' + padM + '">' + window.formatCurrency(v) + '</span>' : '') + '</td>';
            });
        }
        let yTotal = colTotals[`${y}::ALL`]||0;
        let _ytTotClass = collapsedYears.has(y) ? 'tcd-cell tcd-total-col' : 'tcd-cell tcd-total-col tcd-year-total-hidden';
        html += '<td class="' + _ytTotClass + '"><b>' + (yTotal ?
            '<span class="tcd-clickable" data-k="YEAR_TOTAL::' + y + '">' + window.formatCurrency(yTotal) + '</span>' : '') + '</b></td>';
    });
    html += '<td class="tcd-cell tcd-total-col tcd-grand"><b><span class="tcd-clickable" data-k="GRAND_TOTAL">' + window.formatCurrency(totalGrand) + '</span></b></td>';
    html += '</tr></tbody></table>';

    if (tcdTabulator) { try { tcdTabulator.destroy(); } catch(e){} tcdTabulator = null; }
    let grid = document.getElementById('summaryGrid');
    if(grid) grid.innerHTML = html;
    applyTcdStyles();
    if(typeof window.tcdRestoreScroll === 'function') window.tcdRestoreScroll();
};

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

let _tcdClickHandler = null;
window.bindTcdDrillDown = function() {
    let grid = $('summaryGrid');
    if(!grid) return;
    if (_tcdClickHandler) { grid.removeEventListener('click', _tcdClickHandler); _tcdClickHandler = null; }
    _tcdClickHandler = function(e) {
        let toggleEl = e.target.closest('[data-toggle-r1]');
        if (toggleEl) {
            try { let r1 = decodeURIComponent(escape(atob(toggleEl.dataset.toggleR1))); window.toggleGroup(r1); } catch(ex){}
            return;
        }
        let yearEl = e.target.closest('.tcd-toggle-year');
        if (yearEl) { e.stopPropagation(); window.toggleYear(yearEl.dataset.y); return; }
        let el = e.target.closest('.tcd-clickable');
        if (!el) return;
        let key = el.dataset.k;
        if (!key) return;
        let txs = tcdMap[key] || [];
        if (txs.length === 0) return;
        window.openTcdDetails(txs);
    };
    grid.addEventListener('click', _tcdClickHandler);
};

window.openTcdDetails = function(txs) {
    window._lastTcdDetailTxs = txs;
    txs = txs.slice().sort((a,b) => {
        let va = a[tcdDetailSortCol]||'', vb = b[tcdDetailSortCol]||'';
        return (va < vb ? -1 : va > vb ? 1 : 0) * tcdDetailSortDir;
    });
    ['dateOp','dateExpense','amount'].forEach(c => {
        let el = $('tcdSort'+{dateOp:'DateOp',dateExpense:'DateExp',amount:'Amount'}[c]);
        if(el) el.textContent = {dateOp:'Date Écr.',dateExpense:'Date réelle',amount:'Montant'}[c]
            + (tcdDetailSortCol===c ? (tcdDetailSortDir===-1?' ▼':' ▲') : ' ⇅');
    });
    
    let tb = $('tcdDetailsTbody'); if(!tb) return;
    tb.innerHTML = txs.map(tx => `
        <tr data-id="${tx.id}">
            <td><input type="date" class="inline-edit tcd-inline" data-id="${tx.id}" data-field="dateOp" value="${tx.dateOp||''}"></td>
            <td><input type="date" class="inline-edit tcd-inline" data-id="${tx.id}" data-field="dateExpense" value="${tx.dateExpense||tx.dateOp||''}"></td>
            <td style="white-space:normal;word-break:break-word;overflow:visible;min-width:200px;">
                <input type="text" class="inline-edit tcd-inline" data-id="${tx.id}" data-field="details" value="${window.escapeHtml(tx.details||'')}" style="background:var(--bg);border:1px solid var(--ink-faint);height:auto;min-height:32px;">
            </td>
            <td style="text-align:right;font-weight:600;color:${tx.amount>=0?'var(--done)':'var(--ink)'}">
                <input type="text" class="inline-edit tcd-inline" data-id="${tx.id}" data-field="amount" value="${tx.amount}" style="width:90px;text-align:right;">
            </td>
            <td>
                <input type="text" class="inline-edit tcd-inline" data-id="${tx.id}" data-field="note" value="${window.escapeHtml(tx.note||'')}" placeholder="Note..." style="font-size:0.9em;color:var(--ink-soft);background:var(--bg);border:1px solid var(--ink-faint);height:auto;min-height:32px;">
            </td>
            <td style="text-align:center;">
                ${(tx.cat1 && tx.cat1 !== '_SANS_CATEGORIE')
                    ? `<button class="btn btn-outline tcd-cat-edit" data-id="${tx.id}" style="padding:2px 8px;font-size:1.1em;" title="Modifier catégorie">✏️</button>`
                    : `<button class="btn btn-outline tcd-cat-edit" data-id="${tx.id}" style="padding:2px 8px;font-size:1.1em;border-color:var(--warn);color:var(--warn);" title="Affecter catégorie">🔍</button>`}
            </td>
        </tr>`).join('');
    
    let overlay = $('tcdDetailsOverlay'); if(overlay) overlay.classList.add('open');

    tb.querySelectorAll('.tcd-inline').forEach(inp => {
        inp.addEventListener('change', ev => {
            let tx = transactions.find(x => String(x.id) === String(ev.target.dataset.id));
            if (!tx) return;
            let f = ev.target.dataset.field, v = ev.target.value;
            if (f === 'amount') { let n = parseFloat(v.replace(/,/g,'.').replace(/[^0-9.-]/g,'')); if (!isNaN(n)) tx.amount = n; }
            else tx[f] = v;
            window.triggerSave(false);
            window.renderSummary(); 
            if(typeof window.renderUncategorized === 'function') window.renderUncategorized(); 
            if(typeof window.renderDataTable === 'function') window.renderDataTable();
            window.showToast('Modification enregistrée ✓');
        });
    });

    tb.querySelectorAll('.tcd-cat-edit').forEach(btn => {
        btn.addEventListener('click', ev => {
            ev.stopPropagation();
            let tx = transactions.find(x => String(x.id) === String(btn.dataset.id));
            if (!tx) return;
            if(typeof window.openCatModal === 'function') window.openCatModal(tx.id, tx.cat1||'', tx.cat2||'', !!(tx.cat1 && tx.cat1 !== '_SANS_CATEGORIE'));
        });
    });
};

// ── FILTRES TCD ──
window.openTcdFilter = function(e) {
    if(e) e.stopPropagation();
    let allCat1 = new Set(), allCat2 = new Set(), allYearsOp = new Set(), allYearsExpense = new Set(), allFiscalYearsOp = new Set(), allFiscalYearsExpense = new Set(), allMonths = new Set();
    Object.keys(categories).forEach(c1 => {
        allCat1.add(c1);
        (categories[c1]||[]).forEach(c2 => allCat2.add(c2));
    });
    transactions.forEach(t => {
        let dop = String(t.dateOp || '');
        if (dop.length >= 4) allYearsOp.add(dop.substring(0,4));
        if (dop.length >= 7) {
            allMonths.add(dop.substring(5,7));
            allFiscalYearsOp.add(window.getFiscalYearLabel(dop.substring(0,4), dop.substring(5,7), fiscalStartMonth));
        }
        let dexp = String(t.dateExpense || t.dateOp || '');
        if (dexp.length >= 4) allYearsExpense.add(dexp.substring(0,4));
        if (dexp.length >= 7) {
            allMonths.add(dexp.substring(5,7));
            allFiscalYearsExpense.add(window.getFiscalYearLabel(dexp.substring(0,4), dexp.substring(5,7), fiscalStartMonth));
        }
    });

    function buildTags(containerId, allValues, filterSet, sortFn) {
        let el = document.getElementById(containerId);
        if (!el) return;
        let vals = [...allValues];
        if(sortFn) vals.sort(sortFn); else vals.sort(window.customSortCmp);
        el.innerHTML = vals.map(v => {
            let excluded = filterSet.has(v);
            return `<span class="ftag${excluded?' excluded':''}" data-val="${window.escapeHtml(v)}" data-set="${containerId}">${window.escapeHtml(v)}</span>`;
        }).join('');
        el.querySelectorAll('.ftag').forEach(tag => {
            tag.onclick = function() {
                let val = this.dataset.val;
                if (filterSet.has(val)) filterSet.delete(val); else filterSet.add(val);
                this.classList.toggle('excluded');
                window.saveTcdFilter();
                window.renderSummary();
            };
        });
    }

    buildTags('tcdFilterCat1Tags', allCat1, tcdFilter.cat1);
    buildTags('tcdFilterCat2Tags', allCat2, tcdFilter.cat2);
    buildTags('tcdFilterYearOpTags', allYearsOp, tcdFilter.yearsOp, (a,b)=>b.localeCompare(a));
    buildTags('tcdFilterYearExpenseTags', allYearsExpense, tcdFilter.yearsExpense, (a,b)=>b.localeCompare(a));
    buildTags('tcdFilterFiscalYearOpTags', allFiscalYearsOp, tcdFilter.fiscalYearsOp, (a,b)=>b.localeCompare(a));
    buildTags('tcdFilterFiscalYearExpenseTags', allFiscalYearsExpense, tcdFilter.fiscalYearsExpense, (a,b)=>b.localeCompare(a));
    buildTags('tcdFilterMonthTags', allMonths, tcdFilter.months, (a,b)=>parseInt(a)-parseInt(b));

    let popup = document.getElementById('tcdFilterPopup');
    let overlay = document.getElementById('tcdFilterOverlay');
    if(popup && overlay) {
        popup.classList.add('open');
        overlay.classList.add('open');
    }
};

window.closeTcdFilter = function() {
    let o = document.getElementById('tcdFilterOverlay'); if(o) o.classList.remove('open');
    let p = document.getElementById('tcdFilterPopup'); if(p) p.classList.remove('open');
};

window.resetTcdFilter = function() {
    tcdFilter.cat1.clear(); tcdFilter.cat2.clear(); 
    tcdFilter.yearsOp.clear(); tcdFilter.yearsExpense.clear(); 
    tcdFilter.fiscalYearsOp.clear(); tcdFilter.fiscalYearsExpense.clear(); 
    tcdFilter.months.clear();
    window.saveTcdFilter();
    window.renderSummary();
    window.openTcdFilter();
};

window.saveTcdFilter = function() {
    localStorage.setItem('tcd_filter', JSON.stringify({ 
        cat1: [...tcdFilter.cat1], cat2: [...tcdFilter.cat2], 
        yearsOp: [...tcdFilter.yearsOp], yearsExpense: [...tcdFilter.yearsExpense], 
        fiscalYearsOp: [...tcdFilter.fiscalYearsOp], fiscalYearsExpense: [...tcdFilter.fiscalYearsExpense], 
        months: [...tcdFilter.months] 
    }));
    window.triggerSave(false);
};

window.loadTcdFilter = function() {
    try {
        let raw = localStorage.getItem('tcd_filter');
        if (!raw) return;
        let obj = JSON.parse(raw);
        tcdFilter.cat1 = new Set(obj.cat1||[]);
        tcdFilter.cat2 = new Set(obj.cat2||[]);
        tcdFilter.yearsOp = new Set(obj.yearsOp || obj.years || []);
        tcdFilter.yearsExpense = new Set(obj.yearsExpense||[]);
        tcdFilter.fiscalYearsOp = new Set(obj.fiscalYearsOp||[]);
        tcdFilter.fiscalYearsExpense = new Set(obj.fiscalYearsExpense||[]);
        tcdFilter.months = new Set(obj.months||[]);
    } catch(e) {}
};

window.hasTcdFilter = function() {
    return tcdFilter.cat1.size > 0 || tcdFilter.cat2.size > 0 || 
           tcdFilter.yearsOp.size > 0 || tcdFilter.yearsExpense.size > 0 || 
           tcdFilter.fiscalYearsOp.size > 0 || tcdFilter.fiscalYearsExpense.size > 0 || 
           tcdFilter.months.size > 0;
};

// Sauvegarde scroll TCD
window.tcdSaveScroll = function() {
    let w = document.getElementById('tcdScrollWrapper');
    if (w && !document.hidden) {
        localStorage.setItem('tcd_scroll_top', w.scrollTop);
        localStorage.setItem('tcd_scroll_left', w.scrollLeft);
    }
};

window.tcdRestoreScroll = function() {
    let w = document.getElementById('tcdScrollWrapper');
    if (w) {
        let st = localStorage.getItem('tcd_scroll_top');
        let sl = localStorage.getItem('tcd_scroll_left');
        if (st) w.scrollTop = parseInt(st, 10);
        if (sl) w.scrollLeft = parseInt(sl, 10);
    }
};

window.tcdSaveCollapsed = function() {
    localStorage.setItem('tcd_cg', JSON.stringify([...collapsedGroups]));
    localStorage.setItem('tcd_cy', JSON.stringify([...collapsedYears]));
    window.triggerSave(false);
};

window.tcdLoadCollapsed = function() {
    try {
        let cg = localStorage.getItem('tcd_cg');
        if (cg) collapsedGroups = new Set(JSON.parse(cg));
        let cy = localStorage.getItem('tcd_cy');
        if (cy) collapsedYears = new Set(JSON.parse(cy));
    } catch(e) {}
};


// ════════════════════════════════════════════════════
// GRAPHIQUES ENGINE (Chart.js)
// ════════════════════════════════════════════════════
var savedCharts = [];            
var _cbEditId   = null;          
var _cbPreviewChart = null;      
var _chartInstances = {};        

var CHART_COLORS = ['#01696f','#da7101','#006494','#7a39bb','#437a22','#a12c7b','#d19900','#a13544','#4f98a3','#bb653b'];
var DATASET_COLORS = ['#4e8bcd','#e07b54','#5bab6e','#c45fa0','#e6b93a','#7c6fcd','#3bbfb5','#d95555'];

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

    if (!isStacked) {
        var dsDefs = (cfg.datasets && cfg.datasets.length > 0) ? cfg.datasets : [{ label: cfg.title||'', filterCat1:[], filterCat2:[], color: CHART_COLORS[0] }];
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

    var matrix = {}; 
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

function renderChartOnCanvas(canvas, cfg) {
    var data     = buildChartData(cfg);
    var ctx      = canvas.getContext('2d');
    var isDark   = document.documentElement.getAttribute('data-theme') === 'dark';
    var gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    var tickColor = isDark ? '#797876' : '#7a7974';
    var isStacked    = cfg.type === 'bar-stacked' || cfg.type === 'bar-stacked100';
    var is100        = cfg.type === 'bar-stacked100';
    var isLine       = cfg.type === 'line';

    var datasets = data.datasets;
    if (!isStacked && datasets.length === 1 && !isLine) {
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

window.renderCharts = function() {
    var container = $('chartsList');
    var empty     = $('chartsEmpty');
    if (!container) return;

    Object.keys(_chartInstances).forEach(function(id) {
        try { _chartInstances[id].destroy(); } catch(e) {}
    });
    _chartInstances = {};
    container.innerHTML = '';

    if (!savedCharts || !savedCharts.length) {
        if(empty) empty.style.display = 'block'; 
        container.style.display = 'none'; return;
    }
    if(empty) empty.style.display = 'none';
    container.style.cssText = 'display:flex;flex-direction:column;gap:32px;';

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
          + '<span class="chart-title-inline" data-chart-id="' + sc.id + '" contenteditable="true" spellcheck="false" style="font-weight:700;font-size:1.05em;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;outline:none;border-bottom:1px dashed transparent;cursor:text;padding:2px 4px;border-radius:4px;" title="Cliquer pour renommer">' + window.escapeHtml(sc.config.title || 'Graphique') + '</span>'
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
          + '<textarea class="input-text chart-comment-area" data-chart-id="' + sc.id + '" rows="2" style="width:100%;margin-top:2px;font-size:0.88em;resize:vertical;" placeholder="Commentaire…">' + window.escapeHtml(sc.comment || '') + '</textarea>'
          + '</div>';

        container.appendChild(wrap);

        setTimeout(function() {
            var canvas = document.getElementById('chart-' + sc.id);
            if (canvas) _chartInstances[sc.id] = renderChartOnCanvas(canvas, sc.config);
        }, 30);
    });

    // Boutons de floutage (eye buttons)
    savedCharts.forEach(function(sc) {
        if (!sc.config.blur) return;
        var eyeBtn   = document.getElementById('eye-' + sc.id);
        var blurDiv  = document.getElementById('blur-' + sc.id);
        var _blurTimer = null;
        if (!eyeBtn || !blurDiv) return;
        eyeBtn.addEventListener('click', function() {
            var isHidden = blurDiv.classList.contains('hidden');
            if (isHidden) {
                blurDiv.classList.remove('hidden');
                eyeBtn.textContent = '🙈';
                clearTimeout(_blurTimer);
            } else {
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

    // Délégation pour les commentaires
    container.querySelectorAll('.chart-comment-area').forEach(function(ta) {
        ta.addEventListener('input', function() {
            var sc = savedCharts.find(function(c){ return c.id === ta.getAttribute('data-chart-id'); });
            if (sc) { sc.comment = ta.value; window.triggerSave(false); }
        });
    });

    // Délégation pour modifier/supprimer
    container.addEventListener('click', function(e) {
        var editBtn = e.target.closest('[data-edit-id]');
        var delBtn  = e.target.closest('[data-del-id]');
        if (editBtn) window.editChart(editBtn.getAttribute('data-edit-id'));
        if (delBtn)  window.deleteChart(delBtn.getAttribute('data-del-id'));
    });

    // Titres éditables
    container.querySelectorAll('.chart-title-inline').forEach(function(el) {
        el.addEventListener('focus', function() { el.style.borderBottomColor = 'var(--pro)'; el.style.background = 'var(--bg)'; });
        el.addEventListener('blur', function() {
            el.style.borderBottomColor = 'transparent'; el.style.background = '';
            var sc = savedCharts.find(function(c){ return c.id === el.getAttribute('data-chart-id'); });
            if (sc) { sc.config.title = el.textContent.trim() || 'Graphique'; window.triggerSave(false); }
        });
        el.addEventListener('keydown', function(e) { if (e.key === 'Enter') { e.preventDefault(); el.blur(); } });
    });

    // Drag & drop pour réordonner
    var dragSrc = null;
    container.querySelectorAll('[draggable]').forEach(function(item) {
        item.addEventListener('dragstart', function(e) {
            dragSrc = item; e.dataTransfer.effectAllowed = 'move'; item.style.opacity = '0.5';
        });
        item.addEventListener('dragend', function() { item.style.opacity = ''; });
        item.addEventListener('dragover', function(e) {
            e.preventDefault(); e.dataTransfer.dropEffect = 'move'; item.style.outline = '2px dashed var(--pro)';
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
                window.triggerSave(false);
                window.renderCharts();
            }
        });
    });
};

window.openChartBuilder = function(editId) {
    _cbEditId = editId || null;
    var existing = editId ? savedCharts.find(function(c){ return c.id === editId; }) : null;
    var cfg = existing ? existing.config : {};

    let titleEl = $('chartBuilderTitle'); if(titleEl) titleEl.textContent = editId ? 'Modifier le graphique' : 'Nouveau graphique';
    if($('cbTitle')) $('cbTitle').value = cfg.title || '';
    if($('cbType')) $('cbType').value = cfg.type || 'bar';
    if($('cbAxisX')) $('cbAxisX').value = cfg.axisX || 'month';
    if($('cbAxisY')) $('cbAxisY').value = cfg.axisY || 'sum';
    if($('cbDateSource')) $('cbDateSource').value = cfg.dateSource || 'dateOp';
    if($('cbWidth')) $('cbWidth').value = cfg.width || 'full';
    if($('cbInvertY')) $('cbInvertY').checked = cfg.invertY || false;
    if($('cbBlur')) $('cbBlur').checked = cfg.blur || false;
    if($('cbSeries')) $('cbSeries').value = cfg.series || 'cat1';
    
    window.onCbTypeChange();
    window.setCbDatasets(cfg.datasets || []);
    if($('cbFilterSign')) $('cbFilterSign').value = cfg.filterSign || 'all';

    window.populateCbFilters(cfg);

    let overlay = $('chartBuilderOverlay');
    if(overlay) overlay.classList.add('open');
    window.updateCbPreview();
};

window.closeChartBuilder = function() {
    let overlay = $('chartBuilderOverlay');
    if(overlay) overlay.classList.remove('open');
    if (_cbPreviewChart) { try { _cbPreviewChart.destroy(); } catch(e) {} _cbPreviewChart = null; }
};

document.addEventListener('change', function(e) {
    var ids = ['cbType','cbAxisX','cbAxisY','cbFilterYear','cbFilterSign','cbFilterCat1','cbFilterCat2','cbDateSource','cbWidth','cbInvertY','cbSeries'];
    if (e.target.id === 'cbDateSource') { window.populateCbFilters(window.readCbConfig()); }
    if (ids.indexOf(e.target.id) !== -1) window.updateCbPreview();
});
document.addEventListener('input', function(e) {
    if (e.target.id === 'cbTitle') window.updateCbPreview();
});

window.populateCbFilters = function(cfg) {
    var years = [];
    var _ds = ($('cbDateSource') && $('cbDateSource').value) || 'dateOp';
    transactions.forEach(function(t) {
        var raw = t[_ds] || t.dateOp || '';
        var y = raw.length >= 4 ? raw.substring(0,4) : '';
        if (y && years.indexOf(y) === -1) years.push(y);
    });
    years.sort().reverse();
    var yearSel = $('cbFilterYear');
    if(yearSel) {
        yearSel.innerHTML = years.map(function(y) {
            var sel = cfg.filterYears && cfg.filterYears.indexOf(y) !== -1;
            return '<option value="' + y + '"' + (sel?' selected':'') + '>' + y + '</option>';
        }).join('');
    }

    var cat1s = Object.keys(categories).sort(window.customSortCmp);
    var c1Sel = $('cbFilterCat1');
    if(c1Sel) {
        c1Sel.innerHTML = '<option value="">Toutes</option>' + cat1s.map(function(c) {
            var sel = cfg.filterCat1 && cfg.filterCat1.indexOf(c) !== -1;
            return '<option value="' + window.escapeHtml(c) + '"' + (sel?' selected':'') + '>' + window.escapeHtml(c) + '</option>';
        }).join('');
    }

    window.updateCbCat2Filter(cfg);
};

window.onCbCat1Change = function() { window.updateCbCat2Filter({}); window.updateCbPreview(); };
window.onCbAxisChange = function() { window.updateCbPreview(); };
window.onCbTypeChange = function() {
    let tEl = $('cbType'); if(!tEl) return;
    var t = tEl.value;
    var isStacked = t === 'bar-stacked' || t === 'bar-stacked100';
    if($('cbSeriesGroup')) $('cbSeriesGroup').style.display = isStacked ? 'block' : 'none';
    window.updateCbPreview();
};

window.updateCbCat2Filter = function(cfg) {
    let c1Sel = $('cbFilterCat1'); if(!c1Sel) return;
    var sel1 = Array.from(c1Sel.selectedOptions).map(function(o){ return o.value; }).filter(Boolean);
    var cat2s = [];
    (sel1.length ? sel1 : Object.keys(categories)).forEach(function(c1) {
        var subs = categories[c1] || [];
        subs.forEach(function(c2) { if (cat2s.indexOf(c2) === -1) cat2s.push(c2); });
    });
    cat2s.sort();
    var c2Sel = $('cbFilterCat2');
    if(c2Sel) {
        c2Sel.innerHTML = '<option value="">Toutes</option>' + cat2s.map(function(c) {
            var sel = cfg.filterCat2 && cfg.filterCat2.indexOf(c) !== -1;
            return '<option value="' + window.escapeHtml(c) + '"' + (sel?' selected':'') + '>' + window.escapeHtml(c) + '</option>';
        }).join('');
    }
};

window.readCbConfig = function() {
    return {
        title:      $('cbTitle') ? $('cbTitle').value.trim() || 'Graphique' : 'Graphique',
        type:       $('cbType') ? $('cbType').value : 'bar',
        axisX:      $('cbAxisX') ? $('cbAxisX').value : 'month',
        axisY:      $('cbAxisY') ? $('cbAxisY').value : 'sum',
        dateSource: $('cbDateSource') ? $('cbDateSource').value : 'dateOp',
        width:      $('cbWidth') ? $('cbWidth').value || 'full' : 'full',
        filterSign: $('cbFilterSign') ? $('cbFilterSign').value : 'all',
        invertY:    $('cbInvertY') ? $('cbInvertY').checked : false,
        blur:       $('cbBlur')    ? $('cbBlur').checked    : false,
        series:     $('cbSeries') ? $('cbSeries').value : 'cat1',
        datasets:   window.getCbDatasets ? window.getCbDatasets() : [],
        filterYears: $('cbFilterYear') ? Array.from($('cbFilterYear').selectedOptions).map(function(o){ return o.value; }) : [],
        filterCat1:  $('cbFilterCat1') ? Array.from($('cbFilterCat1').selectedOptions).map(function(o){ return o.value; }).filter(Boolean) : [],
        filterCat2:  $('cbFilterCat2') ? Array.from($('cbFilterCat2').selectedOptions).map(function(o){ return o.value; }).filter(Boolean) : [],
    };
};

window.updateCbPreview = function() {
    var canvas = $('cbPreviewCanvas');
    if (!canvas) return;
    if (_cbPreviewChart) { try { _cbPreviewChart.destroy(); } catch(e) {} _cbPreviewChart = null; }
    var cfg = window.readCbConfig();
    _cbPreviewChart = renderChartOnCanvas(canvas, cfg);
};

window.saveChart = function() {
    var cfg = window.readCbConfig();
    if (_cbEditId) {
        var sc = savedCharts.find(function(c){ return c.id === _cbEditId; });
        if (sc) sc.config = cfg;
    } else {
        savedCharts.push({ id: 'chart_' + Date.now(), config: cfg, comment: '' });
    }
    window.triggerSave(false);
    window.closeChartBuilder();
    window.renderCharts();
};

window.editChart = function(id) { window.openChartBuilder(id); };

window.deleteChart = function(id) {
    if (!confirm('Supprimer ce graphique ?')) return;
    savedCharts = savedCharts.filter(function(c){ return c.id !== id; });
    if (_chartInstances[id]) { try { _chartInstances[id].destroy(); } catch(e) {} delete _chartInstances[id]; }
    window.triggerSave(false);
    window.renderCharts();
};

// ── DRILL-DOWN (Portion d'histogramme) ──
var _drillChart = null;

window.closeDrillDown = function() {
    let overlay = $('drillDownOverlay'); if(overlay) overlay.classList.remove('open');
    if (_drillChart) { try { _drillChart.destroy(); } catch(e) {} _drillChart = null; }
};

window.openDrillDown = function(parentCfg, clickedLabel, clickedSeries) {
    var dateField   = parentCfg.dateSource || 'dateOp';
    var seriesField = parentCfg.series || 'cat1';

    var txs = transactions.filter(function(t) {
        if (!t.cat1 || t.cat1 === '_SANS_CATEGORIE') return false;
        if (parentCfg.filterSign === 'debit'  && t.amount >= 0) return false;
        if (parentCfg.filterSign === 'credit' && t.amount <  0) return false;
        var txDateStr = t[dateField] || t.dateOp || '';
        var xKey;
        if (parentCfg.axisX === 'month')     xKey = txDateStr.length >= 7 ? txDateStr.substring(0,7) : txDateStr.substring(0,4)||'?';
        else if (parentCfg.axisX === 'year') xKey = txDateStr.length >= 4 ? txDateStr.substring(0,4) : '?';
        else if (parentCfg.axisX === 'cat1') xKey = t.cat1 || '?';
        else if (parentCfg.axisX === 'cat2') xKey = t.cat2 || '?';
        if (xKey !== clickedLabel) return false;
        if ((t[seriesField] || '?') !== clickedSeries) return false;
        return true;
    });

    if (!txs.length) { window.showToast('Aucune transaction pour cette sélection.'); return; }

    var subField = seriesField === 'cat2' ? 'cat1' : 'cat2';
    var subGroups = {};
    txs.forEach(function(t) {
        var k = t[subField] || '?';
        subGroups[k] = (subGroups[k] || 0) + Math.abs(t.amount);
    });
    var total = Object.values(subGroups).reduce(function(a,b){return a+b;},0);
    var subKeys = Object.keys(subGroups).sort(function(a,b){ return subGroups[b]-subGroups[a]; });
    var pctData = subKeys.map(function(k){ return total > 0 ? Math.round(subGroups[k]/total*10000)/100 : 0; });

    let titleEl = $('drillDownTitle');
    if(titleEl) titleEl.textContent = '📊 ' + clickedSeries + '  ›  ' + clickedLabel + ' — répartition ' + subField.replace('cat','Cat ');

    let overlay = $('drillDownOverlay'); if(overlay) overlay.classList.add('open');
    if (_drillChart) { try { _drillChart.destroy(); } catch(e) {} _drillChart = null; }

    var isDark    = document.documentElement.getAttribute('data-theme') === 'dark';
    var tickColor = isDark ? '#797876' : '#7a7974';
    var gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    var canvas    = $('drillDownCanvas');
    if(!canvas) return;
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
                x: { min:0, max:100, ticks: { color: tickColor, font:{size:11}, callback: function(v){ return v+'%'; } }, grid:  { color: gridColor } },
                y: { ticks: { color: tickColor, font:{size:11} }, grid: { color: gridColor } }
            }
        }
    });
};

window.getCbDatasets = function() {
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
};

window.setCbDatasets = function(datasets) {
    var container = document.getElementById('cbDatasetsContainer');
    if(!container) return;
    container.innerHTML = '';
    (datasets && datasets.length ? datasets : [{}]).forEach(function(ds) {
        window.addCbDataset(ds);
    });
};

function buildDatasetRow(ds, idx) {
    var colors = DATASET_COLORS;
    var color  = (ds && ds.color) ? ds.color : colors[idx % colors.length];
    var label  = (ds && ds.label) ? ds.label : ('Série ' + (idx+1));

    var cat1Array = Array.isArray(categories) ? categories : Object.keys(categories).map(function(k){ return {name:k}; });
    var cat1Opts = cat1Array.map(function(c){
        var sel = (ds && ds.filterCat1 && ds.filterCat1.indexOf(c.name) !== -1) ? ' selected' : '';
        return '<option value="' + window.escapeHtml(c.name) + '"' + sel + '>' + window.escapeHtml(c.name) + '</option>';
    }).join('');

    var row = document.createElement('div');
    row.className = 'cb-dataset-row';
    row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr 36px;gap:6px;align-items:start;margin-bottom:8px;padding:8px;background:var(--bg);border-radius:6px;border:1px solid var(--ink-faint);';
    row.innerHTML =
        '<div><label style="font-size:0.75em;color:var(--ink-soft);display:block;margin-bottom:2px;">Libellé</label><div style="display:flex;gap:4px;">'
      + '<input type="color" class="cb-ds-color" value="' + color + '" style="width:28px;height:28px;padding:0;border:none;cursor:pointer;border-radius:4px;" oninput="window.updateCbPreview()">'
      + '<input type="text" class="cb-ds-label input-text" value="' + window.escapeHtml(label) + '" style="flex:1;font-size:0.85em;" oninput="window.updateCbPreview()">'
      + '</div></div><div><label style="font-size:0.75em;color:var(--ink-soft);display:block;margin-bottom:2px;">Cat 1 (multi)</label>'
      + '<select class="cb-ds-cat1 input-text" multiple style="width:100%;height:60px;font-size:0.82em;" onchange="window.updateCbCat2ForRow(this);window.updateCbPreview();">' + cat1Opts + '</select>'
      + '</div><div><label style="font-size:0.75em;color:var(--ink-soft);display:block;margin-bottom:2px;">Cat 2 (multi)</label>'
      + '<select class="cb-ds-cat2 input-text" multiple style="width:100%;height:60px;font-size:0.82em;" onchange="window.updateCbPreview();"></select>'
      + '</div><div style="padding-top:18px;"><button class="btn btn-outline" style="padding:3px 6px;font-size:0.85em;color:var(--urgent);" onclick="window.removeCbDataset(this);">✕</button></div>';
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
    if (idx >= 6) { window.showToast('Maximum 6 jeux de données'); return; }
    var row = buildDatasetRow(ds || {}, idx);
    container.appendChild(row);
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
        return '<option value="' + window.escapeHtml(c) + '"' + sel + '>' + window.escapeHtml(c) + '</option>';
    }).join('');
};
