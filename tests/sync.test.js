// Tests de bout en bout du moteur de synchronisation de "Mes finances".
//
// L'application réelle est ouverte dans un Chromium sans affichage, face à un FAUX Google Drive
// (aucune donnée réelle, aucun accès réseau) : chaque scénario provoque une situation à risque
// (panne Drive, jeton expiré, deux sauvegardes qui se chevauchent, changement de compte, compte
// modifié depuis un autre appareil...) et vérifie qu'aucune donnée n'est perdue ni écrasée.
//
// Lancer :   cd tests && npm install --no-save playwright crypto-js@4.1.1 && node sync.test.js
//            node sync.test.js 9        → un seul scénario (par son numéro)
// Chromium : variable CHROMIUM_PATH si le navigateur de Playwright n'est pas installé.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const http = require('http');
function need(name, fallback) { try { return require(name); } catch (e) { return require(fallback); } }
const { chromium } = need('playwright', '/opt/node-tools/node_modules/playwright');
const CryptoJS = require('crypto-js');
const CRYPTOJS_FILE = require.resolve('crypto-js/crypto-js.js');

const REPO = path.resolve(__dirname, '..');
const PORT = 8736;
const BASE = 'http://localhost:' + PORT;
const CHROMIUM = process.env.CHROMIUM_PATH || (fs.existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.css': 'text/css' };
const server = http.createServer((req, res) => {
    const file = path.join(REPO, decodeURIComponent(req.url.split('?')[0]));
    if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' }); res.end(fs.readFileSync(file));
});
const KEY = 'motdepasse';
const SCOPE = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/gmail.send';
const md5 = s => crypto.createHash('md5').update(s, 'utf8').digest('hex');
const enc = obj => JSON.stringify({ vault: CryptoJS.AES.encrypt(JSON.stringify(obj), KEY).toString() });
const dec = content => JSON.parse(CryptoJS.AES.decrypt(JSON.parse(content).vault, KEY).toString(CryptoJS.enc.Utf8));
const sleep = ms => new Promise(r => setTimeout(r, ms));

function tx(i, details) { return { id: 'tx' + i, date: '2026-01-0' + (1 + i % 9), dateReelle: '2026-01-0' + (1 + i % 9), details: details || ('LIGNE ' + i), amount: -10 * (i + 1), cat1: '', cat2: '', bank: 'CE' }; }
function vault(accountId, n, accounts) {
    return { transactions: Array.from({ length: n }, (_, i) => tx(i, accountId + ' LIGNE ' + i)), rules: [], categories: { 'A': ['B'] }, version: 'x', accounts, settings: {}, accountId, savedCharts: [], quittancesBiens: [], budgetData: {} };
}
const ACCOUNTS = [{ id: 'default', name: 'Compte A' }, { id: 'acc2', name: 'Compte B' }];

class FakeDrive {
    constructor() { this.files = new Map(); this.seq = 0; this.log = []; this.fail = {}; this.delay = {}; this.inFlightUploads = 0; this.maxConcurrentUploads = 0; this.dropResponseOnce = false; }
    put(name, content) { let id = 'f' + (++this.seq); this.files.set(id, { name, content }); return id; }
    byName(name) { return [...this.files.entries()].filter(([, f]) => f.name === name); }
    writes() { return this.log.filter(l => l.startsWith('PATCH') || l.startsWith('POST') || l.startsWith('DELETE')); }
    async handle(route) {
        const req = route.request(); const url = new URL(req.url()); const m = req.method(); const p = url.pathname;
        const json = (status, obj) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(obj), headers: { 'access-control-allow-origin': '*' } });
        if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
        let kind;
        const idm = p.match(/\/files\/([^/]+)$/);
        if (p === '/drive/v3/files' && m === 'GET') kind = 'list';
        else if (idm && m === 'GET' && url.searchParams.get('alt') === 'media') kind = 'media';
        else if (idm && m === 'GET') kind = 'meta';
        else if (idm && m === 'PATCH' && p.startsWith('/upload/')) kind = 'patch';
        else if (p === '/upload/drive/v3/files' && m === 'POST') kind = 'create';
        else if (idm && m === 'DELETE') kind = 'delete';
        else if (idm && m === 'PATCH') kind = 'rename';
        else { this.log.push('?? ' + m + ' ' + p); return json(404, { error: 'unknown' }); }
        this.log.push((kind === 'patch' ? 'PATCH' : kind === 'create' ? 'POST' : kind === 'delete' ? 'DELETE' : kind) + ' ' + (idm ? idm[1] : url.searchParams.get('q') || ''));
        if (this.delay[kind]) { if (kind === 'patch') { this.inFlightUploads++; this.maxConcurrentUploads = Math.max(this.maxConcurrentUploads, this.inFlightUploads); } await sleep(this.delay[kind]); if (kind === 'patch') this.inFlightUploads--; }
        if (this.fail[kind]) { let st = this.fail[kind]; if (this.fail[kind + 'Once']) { delete this.fail[kind]; delete this.fail[kind + 'Once']; } return json(st, { error: { code: st } }); }
        if (kind === 'list') {
            const q = url.searchParams.get('q') || ''; let out = [];
            let eq = q.match(/^name\s*=\s*'([^']+)'$/), ct = q.match(/name contains '([^']+)'/);
            for (const [id, f] of this.files) { if ((eq && f.name === eq[1]) || (ct && f.name.includes(ct[1]))) out.push({ id, name: f.name }); }
            return json(200, { files: out });
        }
        const f = idm && this.files.get(idm[1]);
        if (kind === 'media') return f ? route.fulfill({ status: 200, contentType: 'application/json', body: f.content, headers: { 'access-control-allow-origin': '*' } }) : json(404, {});
        if (kind === 'meta') return f ? json(200, { md5Checksum: md5(f.content) }) : json(404, {});
        if (kind === 'patch') {
            if (!f) return json(404, {});
            f.content = req.postData();
            if (this.dropResponseOnce) { this.dropResponseOnce = false; return route.abort('connectionreset'); }
            return json(200, { id: idm[1], md5Checksum: md5(f.content) });
        }
        if (kind === 'create') {
            const body = req.postData() || '';
            const name = (body.match(/"name":"([^"]+)"/) || [])[1]; const content = (body.match(/\{"vault":"[^"]*"\}/) || [])[0];
            const id = this.put(name, content); return json(200, { id, name, md5Checksum: md5(content) });
        }
        if (kind === 'delete') { this.files.delete(idm[1]); return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } }); }
        return json(200, {});
    }
}

const GAPI_STUB = `window.gapi = { load: (n, cb) => cb(), client: { init: async () => {}, setToken() {} } };`;
const GIS_STUB = `window.__tokenRequests = 0; window.__tokenMode = window.__pendingMode || 'ok';
window.google = { accounts: { oauth2: { revoke() {}, initTokenClient(cfg) { window.__tokenCfg = cfg; return { requestAccessToken(o) {
    window.__tokenRequests++;
    if (window.__tokenMode === 'fail') setTimeout(() => cfg.error_callback({ type: 'popup_failed_to_open' }), 20);
    else setTimeout(() => cfg.callback({ access_token: 'tok' + window.__tokenRequests, expires_in: 3599, scope: ${JSON.stringify(SCOPE)} }), 20);
} }; } } } };`;

let results = [];
function check(name, cond, extra) { results.push({ name, ok: !!cond }); console.log((cond ? '  ✓ ' : '  ✗ ÉCHEC ') + name + (extra !== undefined && !cond ? '  → ' + JSON.stringify(extra) : '')); }

async function openApp(browser, drive, opts = {}) {
    const ctx = await browser.newContext(opts.context || {});
    const page = await ctx.newPage();
    page.on('pageerror', e => console.log('   [pageerror] ' + e.message));
    page.on('dialog', async d => { page.__dialogs = (page.__dialogs || []); page.__dialogs.push(d.type() + ':' + d.message().slice(0, 80)); if (d.type() === 'beforeunload') await d.accept(); else if (opts.dismissDialogs) await d.dismiss(); else await d.accept(); });
    await page.route('**/*', r => { const u = r.request().url(); if (u.startsWith(BASE)) return r.continue(); return r.abort(); });
    await page.route('https://cdnjs.cloudflare.com/ajax/libs/crypto-js/4.1.1/crypto-js.min.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: fs.readFileSync(CRYPTOJS_FILE, 'utf8'), headers: { 'access-control-allow-origin': '*' } }));
    await page.route('https://apis.google.com/js/api.js', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: GAPI_STUB }));
    await page.route('https://accounts.google.com/gsi/client', r => r.fulfill({ status: 200, contentType: 'application/javascript', body: GIS_STUB }));
    await page.route('https://www.googleapis.com/**', r => drive.handle(r));
    await page.route(BASE + '/mes-finances.html', async r => {
        let html = fs.readFileSync(path.join(REPO, 'mes-finances.html'), 'utf8').replace(/\s+integrity="[^"]*"/g, '').replace(/\s+crossorigin="[^"]*"/g, '');
        r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html });
    });
    if (opts.noToken) await page.addInitScript(() => { window.__noToken = true; });
    if (opts.tokenMode) await page.addInitScript(m => { window.__pendingMode = m; }, opts.tokenMode);
    await page.addInitScript(([scope, accounts, cur]) => {
        if (!window.__noToken) {
        localStorage.setItem('finances_drive_token', 'tok0');
        localStorage.setItem('finances_drive_token_exp', String(Date.now() + 3500000));
        localStorage.setItem('finances_drive_granted_scope', scope);
        }
        if (!localStorage.getItem('f_accounts')) localStorage.setItem('f_accounts', JSON.stringify(accounts));
        if (!localStorage.getItem('f_current_account')) localStorage.setItem('f_current_account', cur);
    }, [SCOPE, ACCOUNTS, opts.account || 'default']);
    await page.goto(BASE + '/mes-finances.html');
    await page.waitForSelector(opts.noToken ? '#driveLoginOverlay.open' : '#authOverlay.open', { timeout: 15000 });
    if (!opts.noUnlock && !opts.noToken) {
        await page.fill('#appPassword', opts.password || KEY);
        await page.click('#unlockBtn');
        await page.waitForFunction(() => !document.getElementById('driveLoadingOverlay').classList.contains('open'), null, { timeout: 15000 });
        await sleep(300);
    }
    return { ctx, page };
}
const state = page => page.evaluate(() => ({ n: transactions.length, first: transactions[0] ? transactions[0].details : null, saveReady, unsaved: _unsavedChanges, acct: currentAccountId, badge: document.getElementById('syncBadge').textContent, badgeCls: document.getElementById('syncBadge').className, auth: document.getElementById('authOverlay').classList.contains('open'), login: document.getElementById('driveLoginOverlay').classList.contains('open'), conflict: document.getElementById('syncConflictOverlay').classList.contains('open'), loading: document.getElementById('driveLoadingOverlay').classList.contains('open') }));
function seeded() {
    const d = new FakeDrive();
    d.idA = d.put('appsysdata-default.dat', enc(vault('default', 3, ACCOUNTS)));
    d.idB = d.put('appsysdata-acc2.dat', enc(vault('acc2', 5, ACCOUNTS)));
    d.put('appsysdata-accounts.dat', JSON.stringify({ vault: CryptoJS.AES.encrypt(JSON.stringify(ACCOUNTS), KEY).toString() }));
    return d;
}
const edit = (page, label) => page.evaluate(l => { transactions[0].details = l; triggerSave(false); }, label);

async function main() {
    await new Promise(r => server.listen(PORT, r));
    const browser = await chromium.launch({ executablePath: CHROMIUM, headless: true, args: ['--headless=new'] });
    const only = process.argv[2];
    const scenarios = {
        async '1. Chargement normal puis sauvegarde'() {
            const d = seeded(); const { ctx, page } = await openApp(browser, d);
            let s = await state(page);
            check('données chargées (3 lignes)', s.n === 3 && s.saveReady, s);
            check('badge "Connecté"', /Connecté/.test(s.badge), s.badge);
            check('aucune écriture de données au chargement', d.writes().filter(w => w.includes(d.idA)).length === 0, d.writes());
            await edit(page, 'MODIF 1'); await sleep(1500);
            s = await state(page);
            check('modification arrivée sur Drive', dec(d.files.get(d.idA).content).transactions[0].details === 'MODIF 1');
            check('badge "Sauvegardé", plus rien en attente', /Sauvegardé/.test(s.badge) && !s.unsaved, s);
            check('compte B intact', dec(d.files.get(d.idB).content).transactions.length === 5);
            await edit(page, 'MODIF 2'); await sleep(1500);
            check('2e sauvegarde sans faux conflit', dec(d.files.get(d.idA).content).transactions[0].details === 'MODIF 2' && !(await state(page)).conflict);
            await ctx.close();
        },
        async '2. Drive en panne au chargement (500 sur le contenu)'() {
            const d = seeded(); d.fail.media = 500; const before = d.files.get(d.idA).content;
            const { ctx, page } = await openApp(browser, d);
            let s = await state(page);
            check('sauvegardes verrouillées (saveReady=false)', s.saveReady === false, s);
            check('erreur visible + retour au déverrouillage', /Erreur/.test(s.badge) && s.auth, s);
            await page.evaluate(() => { transactions.push({ id: 'zz', details: 'X', amount: 1, date: '2026-01-01' }); triggerSave(false); performSave(false); });
            await sleep(1200);
            check('AUCUNE écriture sur Drive', d.writes().filter(w => !w.includes('accounts')).length === 0, d.writes());
            check('fichier du compte inchangé', d.files.get(d.idA).content === before);
            d.fail = {};
            await page.fill('#appPassword', KEY); await page.click('#unlockBtn'); await sleep(1200);
            s = await state(page);
            check('nouvel essai → données réelles rechargées', s.n === 3 && s.saveReady, s);
            await ctx.close();
        },
        async '3. Drive en panne sur la recherche du fichier (ancien "compte neuf vide")'() {
            const d = seeded(); d.fail.list = 503; const before = d.files.get(d.idA).content;
            const { ctx, page } = await openApp(browser, d);
            let s = await state(page);
            check('pas pris pour un compte neuf', !/Nouveau|Connecté/.test(s.badge) && s.saveReady === false, s);
            await page.evaluate(() => { triggerSave(false); performSave(false); }); await sleep(1200);
            check('aucun fichier créé ni écrasé', d.writes().length === 0 && d.files.size === 3 && d.files.get(d.idA).content === before, d.writes());
            await ctx.close();
        },
        async '4. Jeton Google expiré au chargement (401)'() {
            const d = seeded(); d.fail.list = 401; d.fail.media = 401;
            const { ctx, page } = await openApp(browser, d);
            let s = await state(page);
            check('renvoi vers la connexion Google', s.login && !s.saveReady, s);
            check('aucune écriture', d.writes().length === 0, d.writes());
            d.fail = {};
            await page.click('#googleLoginBtnReal'); await sleep(1500);
            s = await state(page);
            check('reconnexion → données chargées sans retaper le mot de passe', s.n === 3 && s.saveReady && !s.auth, s);
            await ctx.close();
        },
        async '5. Mauvais mot de passe'() {
            const d = seeded(); const before = d.files.get(d.idA).content;
            const { ctx, page } = await openApp(browser, d, { password: 'faux' });
            let s = await state(page);
            check('mot de passe refusé, rien de chargé', s.auth && !s.saveReady && s.n === 0, s);
            await page.evaluate(() => { triggerSave(false); performSave(false); }); await sleep(1000);
            check('aucune écriture avec la mauvaise clé', d.files.get(d.idA).content === before && d.writes().filter(w => !w.includes('accounts')).length === 0, d.writes());
            await ctx.close();
        },
        async '6. Sauvegardes rapprochées : une seule à la fois, la dernière gagne'() {
            const d = seeded(); const { ctx, page } = await openApp(browser, d);
            d.delay.patch = 1500;
            await edit(page, 'V1'); await sleep(700);           // envoi 1 en cours
            await edit(page, 'V2'); await sleep(600);           // le minuteur se déclenche pendant l'envoi 1
            let mid = await state(page);
            check('badge encore "en cours" tant que tout n\'est pas parti', /en cours/.test(mid.badge) && mid.unsaved, mid);
            await edit(page, 'V3');
            await sleep(5500);
            const s = await state(page);
            check('jamais deux envois simultanés', d.maxConcurrentUploads === 1, d.maxConcurrentUploads);
            check('Drive contient la dernière version', dec(d.files.get(d.idA).content).transactions[0].details === 'V3', dec(d.files.get(d.idA).content).transactions[0].details);
            check('badge final "Sauvegardé"', /Sauvegardé/.test(s.badge) && !s.unsaved, s);
            await ctx.close();
        },
        async '7. Changement de compte avec une modification en attente'() {
            const d = seeded(); const { ctx, page } = await openApp(browser, d);
            d.delay.patch = 800;
            await edit(page, 'MODIF AVANT SWITCH');
            await page.evaluate(() => window.switchAccount('acc2'));   // immédiatement, avant même le minuteur
            await sleep(600);
            const s = await state(page);
            const a = dec(d.files.get(d.idA).content), b = dec(d.files.get(d.idB).content);
            check('la modification est dans le fichier du compte A', a.transactions[0].details === 'MODIF AVANT SWITCH' && a.accountId === 'default', a.transactions[0].details);
            check('le fichier du compte B est intact (5 lignes, ses données)', b.transactions.length === 5 && b.accountId === 'acc2' && b.transactions[0].details === 'acc2 LIGNE 0', b.transactions[0]);
            check('écran = compte B', s.acct === 'acc2' && s.n === 5 && s.saveReady, s);
            await edit(page, 'MODIF B'); await sleep(2000);
            check('puis sauvegarde de B dans le fichier de B', dec(d.files.get(d.idB).content).transactions[0].details === 'MODIF B' && dec(d.files.get(d.idA).content).transactions[0].details === 'MODIF AVANT SWITCH');
            await ctx.close();
        },
        async '8. Changement de compte pendant un envoi en cours'() {
            const d = seeded(); const { ctx, page } = await openApp(browser, d);
            d.delay.patch = 1500;
            await edit(page, 'ENVOI EN COURS'); await sleep(700);
            await edit(page, 'DERNIERE MODIF A');
            await page.evaluate(() => window.switchAccount('acc2'));
            await sleep(600);
            const a = dec(d.files.get(d.idA).content), b = dec(d.files.get(d.idB).content), s = await state(page);
            check('A contient la toute dernière modification', a.transactions[0].details === 'DERNIERE MODIF A' && a.transactions.length === 3, a.transactions[0].details);
            check('B intact, écran = B', b.transactions.length === 5 && b.transactions[0].details === 'acc2 LIGNE 0' && s.acct === 'acc2' && s.n === 5, s);
            await ctx.close();
        },
        async '9. Conflit : compte modifié depuis un autre appareil'() {
            const d = seeded(); const { ctx, page } = await openApp(browser, d);
            const other = vault('default', 4, ACCOUNTS); other.transactions[0].details = 'AUTRE APPAREIL';
            d.files.get(d.idA).content = enc(other);
            const before = d.files.get(d.idA).content;
            await edit(page, 'MODIF LOCALE'); await sleep(1200);
            let s = await state(page);
            check('fenêtre de conflit affichée', s.conflict, s);
            check('rien écrit tant que l\'utilisateur n\'a pas choisi', d.files.get(d.idA).content === before);
            await page.click('#syncConflictReloadBtn'); await sleep(1200);
            s = await state(page);
            check('"Recharger" → version de l\'autre appareil à l\'écran', s.n === 4 && s.first === 'AUTRE APPAREIL' && !s.conflict && s.saveReady, s);
            check('Drive non modifié', d.files.get(d.idA).content === before);
            // second conflit → écraser
            const other2 = vault('default', 6, ACCOUNTS); d.files.get(d.idA).content = enc(other2);
            await edit(page, 'JE GARDE LE MIEN'); await sleep(1200);
            check('2e conflit détecté', (await state(page)).conflict);
            await page.click('#syncConflictOverwriteBtn'); await sleep(1200);
            const fin = dec(d.files.get(d.idA).content);
            check('"Conserver" → Drive remplacé par les données de l\'onglet', fin.transactions.length === 4 && fin.transactions[0].details === 'JE GARDE LE MIEN', fin.transactions[0].details);
            await edit(page, 'SUITE'); await sleep(1200);
            check('sauvegarde suivante sans conflit', !(await state(page)).conflict && dec(d.files.get(d.idA).content).transactions[0].details === 'SUITE');
            await ctx.close();
        },
        async '10. Fichier supprimé sur Drive entre-temps'() {
            const d = seeded(); const { ctx, page } = await openApp(browser, d);
            d.files.delete(d.idA);
            await edit(page, 'APRES SUPPRESSION'); await sleep(1500);
            const f = d.byName('appsysdata-default.dat');
            check('fichier recréé avec les données', f.length === 1 && dec(f[0][1].content).transactions[0].details === 'APRES SUPPRESSION', f.length);
            check('badge "Sauvegardé"', /Sauvegardé/.test((await state(page)).badge));
            await ctx.close();
        },
        async '11. Jeton expiré pendant la session (401 à la sauvegarde)'() {
            const d = seeded(); const { ctx, page } = await openApp(browser, d);
            d.fail.meta = 401; d.fail.metaOnce = true;
            await edit(page, 'APRES 1H'); await sleep(1800);
            let s = await state(page);
            check('jeton renouvelé et sauvegarde réussie', dec(d.files.get(d.idA).content).transactions[0].details === 'APRES 1H' && /Sauvegardé/.test(s.badge), s);
            check('le mot de passe n\'est PAS redemandé, données en mémoire conservées', !s.auth && s.first === 'APRES 1H', s);
            // renouvellement impossible (fenêtre bloquée)
            await page.evaluate(() => { window.__tokenMode = 'fail'; });
            d.fail.meta = 401;
            await edit(page, 'POPUP BLOQUEE'); await sleep(1500);
            s = await state(page);
            check('badge "Session Google expirée", modifications gardées en mémoire', /Session Google expirée/.test(s.badge) && s.unsaved && s.first === 'POPUP BLOQUEE' && !s.auth, s);
            await page.evaluate(() => { window.__tokenMode = 'ok'; }); d.fail = {};
            await page.click('#syncBadge'); await sleep(1800);
            s = await state(page);
            check('clic sur le badge → reconnexion puis sauvegarde', dec(d.files.get(d.idA).content).transactions[0].details === 'POPUP BLOQUEE' && /Sauvegardé/.test(s.badge) && !s.unsaved, s);
            await ctx.close();
        },
        async '12. Échec réseau à la sauvegarde puis nouvel essai'() {
            const d = seeded(); const { ctx, page } = await openApp(browser, d);
            d.fail.patch = 500;
            await edit(page, 'ECHEC'); await sleep(1500);
            let s = await state(page);
            check('badge d\'échec cliquable, modifications toujours "non enregistrées"', /Échec/.test(s.badge) && s.unsaved, s);
            d.fail = {};
            await page.click('#syncBadge'); await sleep(1500);
            s = await state(page);
            check('nouvel essai réussi', dec(d.files.get(d.idA).content).transactions[0].details === 'ECHEC' && /Sauvegardé/.test(s.badge) && !s.unsaved, s);
            // réponse perdue alors que Drive a bien reçu l'écriture → pas de faux conflit ensuite
            d.dropResponseOnce = true;
            await edit(page, 'REPONSE PERDUE'); await sleep(1500);
            check('réponse perdue → signalé comme échec', /Échec/.test((await state(page)).badge));
            await page.click('#syncBadge'); await sleep(1500);
            s = await state(page);
            check('nouvel essai sans faux conflit', !s.conflict && /Sauvegardé/.test(s.badge), s);
            await ctx.close();
        },
        async '13. Fermeture de l\'onglet avec des modifications non enregistrées'() {
            const d = seeded(); const { ctx, page } = await openApp(browser, d);
            const fire = () => page.evaluate(() => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; });
            check('rien à enregistrer → pas d\'avertissement', (await fire()) === false);
            d.delay.patch = 1000;
            await edit(page, 'NON ENREGISTRE');
            check('modification en attente → avertissement', (await fire()) === true);
            await sleep(700);
            check('envoi en cours → avertissement', (await fire()) === true);
            await sleep(1500);
            check('une fois enregistré → plus d\'avertissement', (await fire()) === false);
            // changement d'onglet seul (sauvegarde silencieuse) : pas d'avertissement
            await page.evaluate(() => triggerSave(false, true));
            check('simple réglage d\'affichage → pas d\'avertissement', (await fire()) === false);
            await ctx.close();
        },
        async '14. Compte neuf (aucun fichier sur Drive)'() {
            const d = new FakeDrive(); const { ctx, page } = await openApp(browser, d);
            let s = await state(page);
            check('compte neuf reconnu, sauvegarde autorisée', /Nouveau/.test(s.badge) && s.saveReady, s);
            await page.evaluate(() => { transactions.push({ id: 'n1', date: '2026-02-01', dateReelle: '2026-02-01', details: 'PREMIERE', amount: -5, cat1: '', cat2: '', bank: 'CE' }); triggerSave(false); });
            await sleep(1500);
            const f = d.byName('appsysdata-default.dat');
            check('fichier créé une seule fois', f.length === 1 && dec(f[0][1].content).transactions.length === 1, f.length);
            await page.evaluate(() => { transactions[0].details = 'DEUXIEME'; triggerSave(false); }); await sleep(1500);
            check('2e sauvegarde = mise à jour du même fichier', d.byName('appsysdata-default.dat').length === 1 && dec(d.byName('appsysdata-default.dat')[0][1].content).transactions[0].details === 'DEUXIEME');
            await ctx.close();
        },
        async '15. Nouvel essai automatique après une panne passagère'() {
            const d = seeded(); const { ctx, page } = await openApp(browser, d);
            d.fail.patch = 503; d.fail.patchOnce = true;
            await edit(page, 'PANNE PASSAGERE'); await sleep(1500);
            check('échec signalé', /Échec/.test((await state(page)).badge));
            await sleep(5500);
            const s = await state(page);
            check('renvoyé tout seul sans clic', dec(d.files.get(d.idA).content).transactions[0].details === 'PANNE PASSAGERE' && /Sauvegardé/.test(s.badge) && !s.unsaved, s);
            await ctx.close();
        },
        async '16. Changement de compte alors que la sauvegarde échoue'() {
            const d = seeded(); const { ctx, page } = await openApp(browser, d, { dismissDialogs: true });
            d.fail.patch = 500;
            await edit(page, 'IMPOSSIBLE A ENVOYER');
            await page.evaluate(() => window.switchAccount('acc2')); await sleep(400);
            let s = await state(page);
            check('demande de confirmation avant de perdre des modifications', (page.__dialogs || []).some(x => x.startsWith('confirm:')), page.__dialogs);
            check('refus → on reste sur le compte A, données intactes', s.acct === 'default' && s.first === 'IMPOSSIBLE A ENVOYER' && s.unsaved && !s.loading, s);
            check('compte B jamais touché', dec(d.files.get(d.idB).content).transactions.length === 5);
            d.fail = {};
            await page.click('#syncBadge'); await sleep(1500);
            check('la sauvegarde repart ensuite normalement', dec(d.files.get(d.idA).content).transactions[0].details === 'IMPOSSIBLE A ENVOYER');
            await ctx.close();
        },
        async '17. Effacement du compte : Drive refuse puis accepte'() {
            const d = seeded(); const { ctx, page } = await openApp(browser, d);
            d.fail.delete = 500;
            await page.evaluate(() => document.getElementById('deleteAllBtn').click()); await sleep(800);
            let s = await state(page);
            check('Drive refuse → rien n\'est effacé, message clair', s.n === 3 && d.files.has(d.idA) && (page.__dialogs || []).some(x => x.startsWith('alert:') && /échoué/.test(x)), page.__dialogs);
            d.fail = {};
            await edit(page, 'JUSTE AVANT EFFACEMENT');                 // sauvegarde en attente au moment de l'effacement
            await page.evaluate(() => document.getElementById('deleteAllBtn').click()); await sleep(2500);
            s = await state(page);
            check('fichier supprimé et pas recréé par une sauvegarde en retard', d.byName('appsysdata-default.dat').length === 0 && s.n === 0, d.byName('appsysdata-default.dat').length);
            check('nouvelle clé demandée', s.auth, s);
            check('compte B intact', dec(d.files.get(d.idB).content).transactions.length === 5);
            await ctx.close();
        },
        async '18. Appareil neuf : le compte "default" n\'a pas de fichier, un autre oui'() {
            const d = new FakeDrive();
            d.idB = d.put('appsysdata-acc2.dat', enc(vault('acc2', 5, ACCOUNTS)));
            d.put('appsysdata-accounts.dat', JSON.stringify({ vault: CryptoJS.AES.encrypt(JSON.stringify(ACCOUNTS), KEY).toString() }));
            const { ctx, page } = await openApp(browser, d);
            const s = await state(page);
            check('ouvre le compte qui a des données (pas un compte vide)', s.acct === 'acc2' && s.n === 5 && s.saveReady, s);
            check('aucun fichier vide créé pour "default"', d.byName('appsysdata-default.dat').length === 0 && !d.writes().some(w => w.startsWith('POST') || w.includes(d.idB)), d.writes());
            await ctx.close();
        },
        async '19. Un vrai nouveau compte vide reste ouvrable après changement volontaire'() {
            const d = seeded(); const { ctx, page } = await openApp(browser, d);
            d.files.delete(d.idB);
            await page.evaluate(() => window.switchAccount('acc2')); await sleep(900);
            const s = await state(page);
            check('changement volontaire vers un compte sans fichier : pas de redirection', s.acct === 'acc2' && s.n === 0, s);
            await ctx.close();
        },
        async '20. Souris qui quitte la fenêtre : aucune erreur JavaScript'() {
            const d = seeded(); const { ctx, page } = await openApp(browser, d);
            const errs = []; page.on('pageerror', e => errs.push(e.message));
            await page.evaluate(() => { document.dispatchEvent(new Event('mouseleave')); document.dispatchEvent(new Event('mouseover')); }); await sleep(200);
            check('pas de TypeError closest', errs.filter(e => /closest/.test(e)).length === 0, errs);
            await ctx.close();
        },
        async '21. Connexion Google : fenêtre fermée ou bloquée → pas de chargement infini'() {
            for (const [mode, attendu] of [['fail', /pop-up|fermée|abouti/i]]) {
                const d = seeded(); const { ctx, page } = await openApp(browser, d, { noToken: true, tokenMode: mode });
                await page.click('#googleLoginBtnReal'); await sleep(600);
                const r = await page.evaluate(() => ({ loading: document.getElementById('driveLoadingOverlay').classList.contains('open'), login: document.getElementById('driveLoginOverlay').classList.contains('open'), msg: document.getElementById('driveLoginMsg').textContent, shown: getComputedStyle(document.getElementById('driveLoginMsg')).display }));
                check('le spinner disparaît, le bouton revient avec un message', !r.loading && r.login && r.shown === 'block' && attendu.test(r.msg), r);
                await ctx.close();
            }
            const d2 = seeded(); const { ctx, page } = await openApp(browser, d2, { noToken: true, tokenMode: 'ok' });
            await page.click('#googleLoginBtnReal'); await sleep(600);
            check('connexion normale : on arrive au mot de passe', await page.evaluate(() => document.getElementById('authOverlay').classList.contains('open') && !document.getElementById('driveLoadingOverlay').classList.contains('open')));
            await ctx.close();
        },
    };
    for (const [name, fn] of Object.entries(scenarios)) {
        if (only && !name.startsWith(only + '.')) continue;
        console.log('\n' + name);
        try { await fn(); } catch (e) { check('scénario sans exception', false, e.message.split('\n')[0]); }
    }
    await browser.close(); server.close();
    const ko = results.filter(r => !r.ok);
    console.log('\n' + (results.length - ko.length) + '/' + results.length + ' vérifications réussies' + (ko.length ? ' — ÉCHECS : ' + ko.map(k => k.name).join(' | ') : ''));
    process.exit(ko.length ? 1 : 0);
}
if (require.main === module) main();
// Réutilisé par mobile.test.js (faux Drive, ouverture de l'appli, chiffrement de test)
module.exports = { chromium, CryptoJS, FakeDrive, openApp, enc, dec, sleep, state, server, PORT, CHROMIUM, KEY, ACCOUNTS };
