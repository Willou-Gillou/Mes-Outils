// Tests de l'affichage téléphone de "Mes finances".
//
// L'appli est ouverte dans un Chromium sans affichage réglé comme un téléphone (tactile, 390 px
// puis 360 px de large), avec un compte de démonstration réaliste (≈550 opérations) et le même
// faux Google Drive que sync.test.js. On vérifie que rien ne dépasse de l'écran sur aucun onglet
// et que les gestes courants fonctionnent dans l'affichage "cartes" : catégoriser, filtrer,
// sélection multiple, pagination, modification d'un champ, fenêtres.
//
// Lancer :   cd tests && npm install --no-save playwright crypto-js@4.1.1 && node mobile.test.js
const H = require('./sync.test.js');

function richVault() {
    const cats = { '1 - REVENUS': ['SALAIRE', 'LOYERS PERCUS', 'REMBOURSEMENTS'], '2 - CHARGES FIXES': ['ELECTRICITE', 'ASSURANCE HABITATION', 'INTERNET & TELEPHONE', 'IMPOTS & TAXES FONCIERES'], '3 - TRAVAUX & INVESTISSEMENTS': ['ABATTAGE ARBRES', 'PLOMBERIE', 'RENOVATION CUISINE'], '4 - VIE COURANTE': ['ALIMENTATION', 'RESTAURANTS', 'TRANSPORT', 'SANTE'], '5 - LOISIRS': ['VACANCES', 'SPORT', 'CULTURE'], '6 - EPARGNE': ['LIVRET A', 'ASSURANCE VIE'] };
    const labels = { 'SALAIRE': 'VIR SEPA ENTREPRISE DURAND SAS SALAIRE MENSUEL', 'LOYERS PERCUS': 'VIR SEPA M. MARTIN LOYER APPARTEMENT LYON', 'REMBOURSEMENTS': 'VIR CPAM REMBOURSEMENT SOINS', 'ELECTRICITE': 'PRLV SEPA EDF CLIENTS PARTICULIERS REF 0012345678', 'ASSURANCE HABITATION': 'PRLV SEPA MAIF ASSURANCE HABITATION CONTRAT 889123', 'INTERNET & TELEPHONE': 'PRLV SEPA FREE TELECOM FACTURE 1234567', 'IMPOTS & TAXES FONCIERES': 'PRLV SEPA DGFIP FINANCES PUBLIQUES TAXE FONCIERE', 'ABATTAGE ARBRES': 'VIR SEPA SARL DUPERRET ELAGAGE ABATTAGE FACTURE 2026-014', 'PLOMBERIE': 'CB PLOMBERIE DU RHONE LYON 03', 'RENOVATION CUISINE': 'CB LEROY MERLIN BRON', 'ALIMENTATION': 'CB CARREFOUR MARKET VILLEURBANNE', 'RESTAURANTS': 'CB RESTAURANT LE BOUCHON LYON 02', 'TRANSPORT': 'CB TOTALENERGIES STATION A7', 'SANTE': 'CB PHARMACIE DES TERREAUX', 'VACANCES': 'CB AIRBNB * HMXYZ12345 LUXEMBOURG', 'SPORT': 'PRLV SEPA BASIC FIT ABONNEMENT', 'CULTURE': 'CB FNAC LYON BELLECOUR', 'LIVRET A': 'VIR VERS LIVRET A EPARGNE MENSUELLE', 'ASSURANCE VIE': 'PRLV SEPA GENERALI VIE VERSEMENT PROGRAMME' };
    const tx = []; let n = 0; let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let y = 2024; y <= 2026; y++) for (let mo = 1; mo <= (y === 2026 ? 11 : 12); mo++) {
        for (const c1 of Object.keys(cats)) for (const c2 of cats[c1]) {
            if (rnd() < 0.35 && c1 !== '1 - REVENUS' && c1 !== '2 - CHARGES FIXES') continue;
            const d = y + '-' + String(mo).padStart(2, '0') + '-' + String(1 + Math.floor(rnd() * 27)).padStart(2, '0');
            let amt = c1 === '1 - REVENUS' ? (c2 === 'SALAIRE' ? 3250.4 : c2 === 'LOYERS PERCUS' ? 780 : 42.5) : -Math.round((20 + rnd() * (c1.startsWith('3') ? 2400 : 180)) * 100) / 100;
            tx.push({ id: 't' + (n++), dateOp: d, dateExpense: d, label: 'CE', details: labels[c2], note: rnd() < 0.08 ? 'facture reçue par mail' : '', amount: amt, paymentMethod: '', cat1: c1, cat2: c2 });
        }
    }
    const un = ['CB AMAZON PAYMENTS LUXEMBOURG', 'VIR SEPA DUPONT JEAN PARTICIPATION CADEAU', 'CB SNCF INTERNET PARIS', 'PRLV SEPA SPOTIFY AB', 'RETRAIT DAB 12/11 LYON PART DIEU', 'CB DECATHLON BRON', 'CB BOULANGERIE PAUL', 'VIR INST RE M OU MME BERNARD'];
    for (let i = 0; i < 24; i++) { const d = '2026-11-' + String(1 + (i % 13)).padStart(2, '0'); tx.push({ id: 'u' + i, dateOp: d, dateExpense: d, label: 'CE', details: un[i % un.length] + ' ' + (1000 + i), note: '', amount: -Math.round((5 + rnd() * 140) * 100) / 100, paymentMethod: '', cat1: '', cat2: '' }); }
    [[1140, '2026-03-04', -50], [1141, '2026-05-17', -120], [1143, '2026-09-17', -75.5], [1144, '2026-10-02', -230]].forEach(([num, d, a]) => tx.push({ id: 'c' + num, dateOp: d, dateExpense: d, label: 'CE', details: 'CHEQUE ' + num, note: '', amount: a, paymentMethod: '', cat1: '4 - VIE COURANTE', cat2: 'SANTE' }));
    const rules = Object.entries(labels).slice(0, 12).map(([c2, l]) => ({ pattern: l.split(' ').slice(0, 3).join(' '), cat1: Object.keys(cats).find(c => cats[c].includes(c2)), cat2: c2 }));
    const bien = { id: 'bien_1', nom: 'Appartement Lyon 3e', bailleur: { nom: 'Jean Dupont', adresse: '12 rue de la République, 69002 Lyon', email: 'bailleur@example.com', tel: '06 00 00 00 00' }, locataires: [{ nom: 'Paul Martin', email: 'locataire@example.com', tel: '06 11 11 11 11' }], designation: { texte: 'Appartement T2 de 48 m² au 3e étage', adresse: '45 cours Lafayette, 69003 Lyon' }, dateAnniversaire: '2025-03-01', echeancier: [], lignesQuittance: [{ libelle: 'Loyer', montant: 700 }, { libelle: 'Provision pour charges', montant: 80 }], commentairesLoyer: '', commentairesCaution: '', faitA: 'Lyon', signatureTexte: 'Jean Dupont', logoDataUrl: '', dateAchat: '2019-06-15', montantAchat: 185000, montantRenovation: 22000 };
    return { transactions: tx, rules, categories: cats, version: 'x', accounts: H.ACCOUNTS, settings: {}, accountId: 'default', savedCharts: [], quittancesBiens: [bien], quittancesEnabled: true, budgetData: {}, budgetEnabled: true, chartsEnabled: true, chequesEnabled: true, chequesManual: [] };
}
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' };
async function start(ctxOpts) {
    await new Promise(r => H.server.listen(H.PORT, r));
    const browser = await H.chromium.launch({ executablePath: H.CHROMIUM, headless: true, args: ['--headless=new'] });
    const d = new H.FakeDrive(); d.idA = d.put('appsysdata-default.dat', H.enc(richVault()));
    d.put('appsysdata-accounts.dat', JSON.stringify({ vault: H.CryptoJS.AES.encrypt(JSON.stringify(H.ACCOUNTS), H.KEY).toString() }));
    const { ctx, page } = await H.openApp(browser, d, { context: ctxOpts || PHONE });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    const stop = async () => { await browser.close(); H.server.close(); };
    return { browser, page, d, errors, stop, H };
}
// Éléments qui dépassent de l'écran sans être dans une zone à défilement horizontal
const overflowScan = () => {
    const vw = document.documentElement.clientWidth, out = [];
    const scrollableX = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 1) return true; } return false; };
    document.querySelectorAll('main *, header *, .nav-tabs').forEach(el => {
        if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') return;
        const r = el.getBoundingClientRect(); if (r.width === 0 || r.height === 0) return;
        if ((r.right > vw + 1 || r.left < -1) && !scrollableX(el)) out.push((el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '')) + ' [' + Math.round(r.left) + '→' + Math.round(r.right) + ']');
    });
    const main = document.querySelector('main');
    return { vw, mainOverflowX: main.scrollWidth - main.clientWidth, bodyOverflowX: document.documentElement.scrollWidth - vw, offenders: [...new Set(out)].slice(0, 12) };
};
let ko = 0; const check = (n, c, x) => { if (!c) ko++; console.log((c ? '  ✓ ' : '  ✗ ÉCHEC ') + n + (!c && x !== undefined ? ' → ' + JSON.stringify(x) : '')); };
(async () => {
    for (const [label, vp] of [['iPhone 390×844', { width: 390, height: 844 }], ['petit Android 360×640', { width: 360, height: 640 }]]) {
        console.log('\n' + label);
        const { page, d, errors, stop, H } = await start(Object.assign({}, PHONE, { viewport: vp, deviceScaleFactor: 1 }));
        const go = async t => { await page.evaluate(t => document.querySelector('.tab-btn[data-target="' + t + '"]').click(), t); await H.sleep(400); };
        const tabs = await page.$$eval('.tab-btn', bs => bs.filter(b => b.style.display !== 'none').map(b => b.dataset.target));
        let worst = [];
        for (const t of tabs) { await go(t); const o = await page.evaluate(overflowScan); if (o.mainOverflowX > 0 || o.bodyOverflowX > 0 || o.offenders.length) worst.push(t + ':' + o.mainOverflowX + ':' + o.offenders.slice(0, 3).join('|')); }
        check('aucun élément hors de l\'écran, sur aucun onglet', worst.length === 0, worst);
        const tabVisible = await page.evaluate(() => { const b = document.querySelector('.tab-btn.active').getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth; });
        check('l\'onglet actif est visible dans la barre', tabVisible);

        // À catégoriser
        await go('view-categorize');
        const card = await page.evaluate(() => { const tr = document.querySelector('#uncatTable tbody tr'); const r = tr.getBoundingClientRect(); return { w: Math.round(r.width), vw: innerWidth, cells: [...tr.children].every(td => { const c = td.getBoundingClientRect(); return c.right <= innerWidth && c.left >= 0; }) }; });
        check('une carte tient dans la largeur de l\'écran', card.w <= card.vw && card.cells, card);
        const before = await page.evaluate(() => +document.getElementById('uncatCount').textContent);
        await page.tap('#uncatTable .sugg-pill'); await H.sleep(500);
        const after = await page.evaluate(() => +document.getElementById('uncatCount').textContent);
        check('toucher une suggestion catégorise la ligne', after === before - 1, { before, after });
        await page.tap('#uncatTable tbody tr:nth-child(2) .uncat-row-cb'); await H.sleep(300);
        const sel = await page.evaluate(() => ({ sel: document.querySelector('#uncatTable tbody tr:nth-child(2)').classList.contains('selected-row'), bar: getComputedStyle(document.getElementById('quickCatSearchWrap')).display }));
        check('cocher une carte la sélectionne et affiche la saisie rapide', sel.sel && sel.bar === 'flex', sel);
        await page.evaluate(() => { document.querySelector('main').scrollTop = 1500; }); await H.sleep(200);
        const sticky = await page.evaluate(() => { const r = document.getElementById('quickCatSearchWrap').getBoundingClientRect(), m = document.querySelector('main').getBoundingClientRect(); return Math.round(r.top - m.top); });
        check('la saisie rapide reste visible en haut pendant le défilement', sticky >= -12 && sticky <= 4, sticky);
        await page.evaluate(() => { document.querySelector('main').scrollTop = 0; }); await page.tap('#uncatTable tbody tr:nth-child(2) .uncat-row-cb');
        await page.tap('#uncatFiltersBtn'); await H.sleep(200); await page.fill('#ufDetails', 'sncf'); await H.sleep(600);
        const flt = await page.evaluate(() => ({ n: document.querySelectorAll('#uncatTable tbody tr[data-id]').length, btn: document.getElementById('uncatFiltersBtn').textContent, all: [...document.querySelectorAll('#uncatTable tbody tr[data-id]')].every(tr => /SNCF/.test(tr.textContent)) }));
        check('le filtre "Détails" filtre les cartes et le bouton indique (1)', flt.n > 0 && flt.all && /\(1\)/.test(flt.btn), flt);
        await page.fill('#ufDetails', ''); await H.sleep(500); await page.tap('#uncatFiltersBtn');
        await page.tap('#uncatTable .btn-cat-action'); await H.sleep(400);
        const modal = await page.evaluate(() => { const m = document.querySelector('#catSelectionOverlay .modal').getBoundingClientRect(); const btns = [...document.querySelectorAll('#catModalCat1List .cat-step-btn')]; return { open: document.getElementById('catSelectionOverlay').classList.contains('open'), fits: m.left >= 0 && m.right <= innerWidth, btnOk: btns.every(b => b.getBoundingClientRect().width > 120 && b.scrollWidth <= b.clientWidth + 1), focus: document.activeElement.id }; });
        check('fenêtre d\'affectation : catégories lisibles, pas de clavier ouvert d\'office', modal.open && modal.fits && modal.btnOk && modal.focus !== 'catModalSearchInput', modal);
        await page.tap('#catModalCat1List .cat-step-btn'); await H.sleep(300); await page.tap('#catModalCat2List .cat-step-btn'); await H.sleep(300);
        const n1 = await page.evaluate(() => +document.getElementById('uncatCount').textContent);
        await page.evaluate(() => window.validateCategorization()); await H.sleep(500);
        const n2 = await page.evaluate(() => ({ n: +document.getElementById('uncatCount').textContent, open: document.getElementById('catSelectionOverlay').classList.contains('open') }));
        check('affectation manuelle complète (cat. 1 → cat. 2 → confirmer)', n2.n === n1 - 1 && !n2.open, { n1, n2 });

        // Base de données
        await go('view-data');
        const pg = await page.evaluate(() => ({ rows: document.querySelectorAll('#dataTable tbody tr').length, bottom: document.getElementById('dbPaginationNavBottom').textContent, cells: [...document.querySelector('#dataTable tbody tr').children].every(td => { const c = td.getBoundingClientRect(); return c.right <= innerWidth && c.left >= 0 && c.width > 20; }) }));
        check('50 cartes par page, pagination en bas, tous les champs dans l\'écran', pg.rows === 50 && /Page 1/.test(pg.bottom) && pg.cells, pg);
        await page.evaluate(() => { const i = document.querySelector('#dataTable tbody tr input[data-field="note"]'); i.value = 'note depuis le téléphone'; i.dispatchEvent(new Event('change', { bubbles: true })); }); await H.sleep(1500);
        const saved = H.dec(d.files.get(d.idA).content).transactions.some(t => t.note === 'note depuis le téléphone');
        check('modifier un champ d\'une carte est enregistré sur Drive', saved);
        await page.evaluate(() => document.querySelector('#dbPaginationNavBottom button:last-child').click()); await H.sleep(400);
        const p2 = await page.evaluate(() => ({ lbl: document.getElementById('dbPaginationNavBottom').textContent, top: document.querySelector('main').scrollTop }));
        check('"Suivantes" (en bas) change de page et remonte en haut', /Page 2/.test(p2.lbl) && p2.top === 0, p2);
        await page.tap('#dataTable tbody tr:nth-child(1) .row-cb'); await page.tap('#dataTable tbody tr:nth-child(3) .row-cb'); await H.sleep(300);
        await page.evaluate(() => { document.querySelector('main').scrollTop = 1200; }); await H.sleep(200);
        const bulk = await page.evaluate(() => { const r = document.getElementById('bulkActions').getBoundingClientRect(), m = document.querySelector('main').getBoundingClientRect(); return { n: document.getElementById('selCount').textContent, top: Math.round(r.top - m.top), fits: r.right <= innerWidth && [...document.querySelectorAll('#bulkActions *')].every(e => e.getBoundingClientRect().right <= innerWidth + 1) }; });
        check('actions groupées visibles en haut pendant le défilement, sans débordement', bulk.n === '2' && bulk.top >= -12 && bulk.top <= 4 && bulk.fits, bulk);
        await page.selectOption('#bulkCat1', { index: 1 }); await H.sleep(200); await page.selectOption('#bulkCat2', { index: 1 }); await page.evaluate(() => window.bulkCategorize()); await H.sleep(400);
        check('affectation groupée effectuée', await page.evaluate(() => document.getElementById('selCount').textContent === '0' || getComputedStyle(document.getElementById('bulkActions')).display === 'none'));
        await page.tap('#dataFiltersBtn'); await H.sleep(200);
        const fp = await page.evaluate(() => [...document.querySelectorAll('#dataTable thead .col-filter')].every(i => { const r = i.getBoundingClientRect(); return r.width > 100 && r.right <= innerWidth; }));
        check('panneau de filtres de la Base de données dans l\'écran', fp);

        // Tableau de bord → détail
        await go('view-summary');
        await page.evaluate(() => window.openTcdDetails(transactions.filter(t => t.cat2 === 'ELECTRICITE').slice(0, 8), 'x')); await H.sleep(400);
        const det = await page.evaluate(() => { const rows = [...document.querySelectorAll('#tcdDetailsTbody tr')]; return rows.length === 8 && rows.every(tr => [...tr.children].every(td => { const c = td.getBoundingClientRect(); return c.right <= innerWidth && c.left >= 0; })); });
        check('détail des opérations : 8 cartes entièrement dans l\'écran', det);
        await page.evaluate(() => document.querySelectorAll('.overlay.open').forEach(o => o.classList.remove('open')));
        await page.tap('#mobileMenuToggle'); await H.sleep(300);
        const menuTop = await page.evaluate(() => { const b = document.getElementById('logoutBtn').getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return e && (e.id === 'logoutBtn' || e.closest('#headerControlsRow') !== null); });
        check('le menu ⋮ passe au-dessus du tableau de bord', menuTop);
        check('aucune erreur JavaScript', errors.length === 0, errors);
        await stop();
    }
    console.log('\n' + (ko ? ko + ' ÉCHEC(S)' : 'Tout est réussi'));
    process.exit(ko ? 1 : 0);
})();
