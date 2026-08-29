// ─── TCD : Clic droit → couleur rouge/noir ──────────────────────────────────
// Persistance via appState (sauvegardé sur Drive avec triggerSave)
(function() {

  // ── Accès au store rouge (objet { "clé": true }) ────────────────────────
  function getRedStore() {
    if (!window.appState) window.appState = {};
    if (!window.appState.tcdRedCells) window.appState.tcdRedCells = {};
    return window.appState.tcdRedCells;
  }

  // Construire une clé stable basée sur le texte de la première cellule de la ligne + index colonne
  function buildKey(cell) {
    var row = cell.closest('tr');
    if (!row) return null;
    var firstCell = row.querySelector('td, th');
    var rowLabel = firstCell ? firstCell.textContent.trim().slice(0, 40) : '';
    var colIdx = Array.from(row.children).indexOf(cell);
    return rowLabel + '|col' + colIdx;
  }

  // Appliquer les tags rouge après chaque rendu TCD
  function applyTcdRedTags() {
    var grid = document.getElementById('summaryGrid');
    if (!grid) return;
    var store = getRedStore();
    grid.querySelectorAll('td, th').forEach(function(cell) {
      var key = buildKey(cell);
      if (!key) return;
      cell.dataset.redKey = key;
      if (store[key]) {
        cell.classList.add('tcd-red-tag');
      } else {
        cell.classList.remove('tcd-red-tag');
      }
    });
  }
  window.applyTcdRedTags = applyTcdRedTags;

  // Patch renderSummary
  var origRenderSummary = window.renderSummary;
  if (origRenderSummary) {
    window.renderSummary = function() {
      origRenderSummary.apply(this, arguments);
      setTimeout(applyTcdRedTags, 80);
    };
  }

  // Menu contextuel
  var ctxMenu = document.getElementById('tcdContextMenu');
  var ctxCell = null;

  function openCtxMenuForCell(cell, clientX, clientY) {
    ctxCell = cell;
    var key = buildKey(cell);
    cell.dataset.redKey = key;
    var store = getRedStore();
    var isRed = !!(key && store[key]);
    document.getElementById('ctxTagRed').style.display = isRed ? 'none' : 'flex';
    document.getElementById('ctxTagBlack').style.display = isRed ? 'flex' : 'none';
    ctxMenu.style.left = Math.max(4, Math.min(clientX, window.innerWidth - 220)) + 'px';
    ctxMenu.style.top = Math.max(4, Math.min(clientY, window.innerHeight - 100)) + 'px';
    ctxMenu.style.display = 'block';
  }

  document.addEventListener('contextmenu', function(e) {
    var grid = document.getElementById('summaryGrid');
    if (!grid) return;
    var cell = e.target.closest('td, th');
    if (!cell || !grid.contains(cell)) return;
    e.preventDefault();
    openCtxMenuForCell(cell, e.clientX, e.clientY);
  });

  // v3.3.8 : Appui long tactile (iOS Safari ne déclenche pas 'contextmenu' de façon fiable sur une cellule)
  (function() {
    var pressTimer = null, startX = 0, startY = 0, longPressCell = null;
    var LONG_PRESS_MS = 500, MOVE_TOLERANCE = 10;
    document.addEventListener('touchstart', function(e) {
      var grid = document.getElementById('summaryGrid');
      if (!grid || e.touches.length !== 1) return;
      var cell = e.target.closest('td, th');
      if (!cell || !grid.contains(cell)) return;
      longPressCell = cell;
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
      pressTimer = setTimeout(function() {
        if (!longPressCell) return;
        if (navigator.vibrate) { try { navigator.vibrate(15); } catch(e){} }
        openCtxMenuForCell(longPressCell, startX, startY);
        longPressCell = null;
      }, LONG_PRESS_MS);
    }, { passive: true });
    document.addEventListener('touchmove', function(e) {
      if (!pressTimer || !e.touches.length) return;
      var dx = Math.abs(e.touches[0].clientX - startX), dy = Math.abs(e.touches[0].clientY - startY);
      if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) { clearTimeout(pressTimer); pressTimer = null; longPressCell = null; }
    }, { passive: true });
    document.addEventListener('touchend', function() { clearTimeout(pressTimer); pressTimer = null; longPressCell = null; });
    document.addEventListener('touchcancel', function() { clearTimeout(pressTimer); pressTimer = null; longPressCell = null; });
  })();

  document.getElementById('ctxTagRed').addEventListener('click', function() {
    if (!ctxCell) return;
    var key = ctxCell.dataset.redKey;
    if (!key) return;
    getRedStore()[key] = true;
    ctxCell.classList.add('tcd-red-tag');
    ctxMenu.style.display = 'none';
    if (window.triggerSave) window.triggerSave(false);
  });

  document.getElementById('ctxTagBlack').addEventListener('click', function() {
    if (!ctxCell) return;
    var key = ctxCell.dataset.redKey;
    if (!key) return;
    delete getRedStore()[key];
    ctxCell.classList.remove('tcd-red-tag');
    ctxMenu.style.display = 'none';
    if (window.triggerSave) window.triggerSave(false);
  });

  document.addEventListener('click', function() { if(ctxMenu) ctxMenu.style.display = 'none'; });
  document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && ctxMenu) ctxMenu.style.display = 'none'; });

  // Appliquer au chargement initial
  document.addEventListener('DOMContentLoaded', function() { setTimeout(applyTcdRedTags, 1000); });
})();

// ─── Base de données : Ajout catégorie 2 depuis la colonne ─────────────────────
// La cellule cat2 est un <select data-field="cat2">
// On y injecte une option spéciale "➕ Nouvelle catégorie..." pour créer une cat2 à la volée
(function() {
  var SENTINEL = '__NEW_CAT2__';

  function injectNewCat2Option() {
    var tbl = document.getElementById('dataTable');
    if (!tbl) return;
    tbl.querySelectorAll('select[data-field="cat2"]').forEach(function(sel) {
      if (sel.dataset.newCat2Injected) return;
      sel.dataset.newCat2Injected = '1';
      var opt = document.createElement('option');
      opt.value = SENTINEL;
      opt.textContent = '➕ Nouvelle catégorie...';
      opt.style.fontStyle = 'italic';
      sel.appendChild(opt);

      sel.addEventListener('change', function() {
        if (sel.value !== SENTINEL) return;
        var row = sel.closest('tr[data-id]');
        if (!row) return;
        var txId = row.dataset.id;
        var tx = (window.transactions || []).find(function(t){ return String(t.id) === String(txId); });
        var cat1 = tx ? tx.cat1 : '';
        var prevVal = tx ? (tx.cat2 || '') : '';
        sel.value = prevVal; // rétablir visuellement

        if (!cat1 || cat1 === 'SANS CATEGORIE' || cat1 === '') {
          if (window.showToast) window.showToast('⚠️ Définissez d\'abord une Catégorie 1');
          return;
        }
        var newCat2 = window.prompt('Nouvelle catégorie 2 pour "' + cat1 + '" :', '');
        if (!newCat2 || !newCat2.trim()) return;
        newCat2 = newCat2.trim();

        // Ajouter dans l'arborescence si inexistante
        var cats = window.categories || {};
        if (!cats[cat1]) cats[cat1] = [];
        var isNew = !cats[cat1].includes(newCat2);
        if (isNew) {
          cats[cat1].push(newCat2);
          window.categories = cats;
          if (window.triggerSave) window.triggerSave(false);
          if (window.renderCategories) window.renderCategories();
          if (window.showToast) window.showToast('✅ Catégorie "' + newCat2 + '" ajoutée sous "' + cat1 + '"');
        }
        // Mettre à jour la transaction
        if (tx) {
          tx.cat2 = newCat2;
          if (window.triggerSave) window.triggerSave(false);
          if (window.renderSummary) window.renderSummary();
        }
        // Reconstruire le select avec la nouvelle valeur sélectionnée
        if (window.getC2Opts) {
          sel.innerHTML = window.getC2Opts(cat1, newCat2);
          var optNew = document.createElement('option');
          optNew.value = SENTINEL;
          optNew.textContent = '➕ Nouvelle catégorie...';
          optNew.style.fontStyle = 'italic';
          sel.appendChild(optNew);
          sel.dataset.newCat2Injected = '1';
          sel.value = newCat2;
        }
      });
    });
  }
  window._injectNewCat2Option = injectNewCat2Option;

  // Patch renderDataTable
  var _origRDT = window.renderDataTable;
  window.renderDataTable = function() {
    _origRDT && _origRDT.apply(this, arguments);
    setTimeout(injectNewCat2Option, 100);
  };

  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(injectNewCat2Option, 900);
  });
})();


// ─── Base de données : Ajout manuel d'une ligne ───────────────────────────────
window.addManualRow = function() {
  var today = new Date().toISOString().slice(0, 10);
  var newTx = {
    id: Date.now(),
    dateOp: today,
    dateExpense: today,
    label: '',
    details: '',
    note: '',
    amount: 0,
    cat1: '',
    cat2: ''
  };
  transactions.unshift(newTx);
  dbPage = 0;
  window.renderDataTable();
  // Focus sur le champ label de la première ligne
  setTimeout(function() {
    var firstLabel = document.querySelector('#dataTable tbody tr:first-child input[data-field="label"]');
    if (firstLabel) { firstLabel.focus(); firstLabel.select(); }
  }, 150);
  triggerSave(false);
  showToast('✅ Ligne ajoutée — renseignez les champs');
};

