// node --test tests/   (aucune dépendance)
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../regles.js');

const pt = (batiment, zone, texte = 'x', d = '2026-11-01', extra = {}) =>
  ({ id: texte, batiment, zone, precision: '', texte, responsable: 'moi', lotBloquant: '',
     dateConstat: d + 'T08:00:00.000Z', dateFait: null, ...extra });

test('valeurs par défaut demandées', () => {
  assert.deepEqual(R.ZONES_PAR_DEFAUT, ['R-2', 'R-1', 'RDC', 'R+1', 'R+2', 'R+3', 'R+4', 'R+5', 'R+6', 'R+7']);
  assert.deepEqual(R.BATIMENTS_PAR_DEFAUT, ['A', 'B', 'C']);
  assert.equal(R.LOTS_PROPOSES[0], 'Matériel non livré');
});

test("tri : bâtiment (sans en dernier), puis ordre de l'immeuble, puis date", () => {
  const pts = [pt('B', 'RDC', 'b-rdc'), pt('', 'R+1', 'sans'), pt('A', 'R+1', 'a-r1'),
    pt('a', 'R-1', 'a-r-1'), pt('C', 'RDC', 'c-rdc'), pt('A', 'R+1', 'a-r1-ancien', '2026-10-01')];
  assert.deepEqual(R.trier(pts).map((p) => p.texte), ['a-r-1', 'a-r1-ancien', 'a-r1', 'b-rdc', 'c-rdc', 'sans']);
  const zones = ['R+2', 'Toiture', 'RDC', 'Sous-sol', 'R+10', 'R+1', '', 'Couloir nord'];
  assert.deepEqual(R.trier(zones.map((z) => pt('', z, z))).map((p) => p.zone),
    ['Sous-sol', 'RDC', 'R+1', 'R+2', 'R+10', 'Couloir nord', 'Toiture', '']);
});

test('nom de bâtiment et emplacement', () => {
  assert.equal(R.nomBatiment('A'), 'Bâtiment A');
  assert.equal(R.nomBatiment('Bât. A'), 'Bât. A');
  assert.equal(R.nomBatiment(''), 'Sans bâtiment');
  assert.equal(R.emplacement({ ...pt('A', 'RDC'), precision: 'Piscine' }), 'Bâtiment A — RDC — Piscine');
  assert.equal(R.emplacement(pt('', 'R+2')), 'R+2');
  assert.equal(R.emplacement(pt('', '')), 'Zone non précisée');
});

test('listes « Où ? » : défauts + valeurs des points ; liste choisie (même vide) fait foi', () => {
  const pts = [pt('Nord', 'Toiture'), pt('a', 'rdc')];
  assert.deepEqual(R.listeBatiments(null, pts), ['A', 'B', 'C', 'Nord']);
  assert.deepEqual(R.listeEtages(null, pts), R.ZONES_PAR_DEFAUT.concat(['Toiture']));
  assert.deepEqual(R.listeBatiments(['A', 'D'], pts), ['A', 'D']);
  assert.deepEqual(R.listeBatiments([], pts), []);
});

test('ajouter, retirer, pastilles', () => {
  assert.deepEqual(R.ajouterBatiment(' d ', ['A', 'B', 'C']), ['A', 'B', 'C', 'd']);
  assert.deepEqual(R.ajouterBatiment('b', ['A', 'B']), ['A', 'B']);
  assert.deepEqual(R.ajouterBatiment('  ', ['A']), ['A']);
  assert.equal(R.ajouterEtage('R+8', R.ZONES_PAR_DEFAUT).at(-1), 'R+8');
  assert.equal(R.ajouterEtage('R-3', R.ZONES_PAR_DEFAUT)[0], 'R-3');
  assert.deepEqual(R.retirer('b', ['A', 'B', 'C']), ['A', 'C']);
  assert.deepEqual(R.pastilles(['A', 'C'], 'B'), ['A', 'C', 'B']);
  assert.deepEqual(R.pastilles(['A', 'B'], 'b'), ['A', 'B']);
});

test('dernier bâtiment repris', () => {
  assert.equal(R.dernierBatiment([pt('A', 'RDC', 'x', '2026-11-01'), pt('C', 'R+1', 'y', '2026-11-04')]), 'C');
  assert.equal(R.dernierBatiment([]), '');
});

test('grille, filtre et périmètre', () => {
  const pts = [pt('A', 'RDC', 'a-rdc'), pt('A', 'rdc', 'a-rdc2'), pt('A', 'R+1', 'a-r1'), pt('B', 'RDC', 'b-rdc'),
    pt('B', 'R+1', 'b-r1'), pt('C', 'RDC', 'c-rdc')];
  const g = R.grille(pts);
  assert.deepEqual(g.map((x) => x.batiment), ['A', 'B', 'C']);
  assert.deepEqual(g[0].cases.map((c) => [c.zone, c.nombre]), [['RDC', 2], ['R+1', 1]]);
  const tout = g.flatMap((x) => x.cases.map((c) => c.cle));
  assert.equal(R.perimetre(new Set(tout), g), null);
  const choix = new Set([g[0].cases[0].cle, ...g[1].cases.map((c) => c.cle)]);
  assert.equal(R.perimetre(choix, g), 'Bâtiment A : RDC ; Bâtiment B en entier');
  assert.deepEqual(R.filtrer(pts, choix).map((p) => p.texte), ['a-rdc', 'a-rdc2', 'b-rdc', 'b-r1']);
  const g2 = R.grille([pt('', 'RDC'), pt('', 'R+1'), pt('', '')]);
  assert.equal(R.perimetre(new Set([g2[0].cases[0].cle, g2[0].cases[2].cle]), g2), 'RDC, zone non précisée');
});

test('sélection initiale', () => {
  const dispo = ['a|rdc', 'a|r+1', 'b|rdc'];
  assert.deepEqual([...R.selectionInitiale(null, dispo)].sort(), [...dispo].sort());
  assert.deepEqual([...R.selectionInitiale(['a|rdc', 'z|r+9'], dispo)], ['a|rdc']);
  assert.deepEqual([...R.selectionInitiale(['z|r+9'], dispo)].sort(), [...dispo].sort());
});

test('synthèse, élision, libellés', () => {
  const pts = [pt('A', 'RDC', 'a', '2026-11-01', { responsable: 'autreLot', lotBloquant: 'Plaquiste' }), pt('A', 'RDC', 'b')];
  assert.equal(R.synthese(pts, 'DUPONT'),
    "2 points ouverts : 1 en attente d'un autre corps d'état ou de matériel, 1 à la charge de DUPONT.");
  assert.equal(R.synthese([], 'DUPONT'), 'Aucun point en suspens à ce jour.');
  assert.equal(R.de('Alpes Clim'), "d'Alpes Clim");
  assert.equal(R.de('Électro Savoie'), "d'Électro Savoie");
  assert.equal(R.libelleResponsable(pts[0]), 'Bloqué par : Plaquiste');
  assert.equal(R.libelleResponsable(pts[1]), 'À notre charge');
});

test('mail : objet, destinataire, périmètre, signature', () => {
  const d = new Date(2026, 10, 17, 10, 0);
  const m = R.mail({ chantier: 'Les Arcs', ouverts: [pt('A', 'RDC')], entreprise: 'DUPONT',
    signature: 'Paul MARTIN', destinataire: { nom: 'Jean DURAND' }, perimetre: 'Bâtiment A : RDC', date: d });
  assert.equal(m.objet, 'Les Arcs — points en suspens au 17/11/2026');
  assert.ok(m.corps.startsWith('Bonjour Jean DURAND,'));
  assert.ok(m.corps.includes('Cet envoi ne porte que sur : Bâtiment A : RDC.'));
  assert.ok(m.corps.includes('1 point ouvert : 1 à la charge de DUPONT.'));
  assert.ok(m.corps.endsWith('Cordialement,\nPaul MARTIN\nDUPONT'));
  assert.ok(!R.mail({ chantier: 'X', ouverts: [], entreprise: 'S', date: d }).corps.includes('ne porte que'));
  assert.ok(!/réserve/i.test(m.corps), 'le mot « réserves » a une portée juridique');
});

test('destinataires', () => {
  const l = R.ajouterDestinataire([], 'Paul', 'paul@x.fr');
  assert.equal(l.length, 1);
  assert.equal(R.ajouterDestinataire(l, ' ', '').length, 1, 'personne vide ajoutée');
});

test('fichier de réglages', () => {
  const ok = R.lireReglages({ type: 'reste-a-faire-reglages', version: 1,
    entreprise: { nom: ' DUPONT ', adresse: 'a', telephone: 't', logo: 'data:image/png;base64,AAAA' },
    signature: 'Hamid', destinataires: [{ nom: 'Marc', email: 'm@x' }, { nom: 'Nicolas', email: '' }, { nom: '', email: '' }] });
  assert.equal(ok.entreprise.nom, 'DUPONT');
  assert.deepEqual(ok.destinataires.map((d) => d.nom), ['Marc', 'Nicolas']);
  assert.throws(() => R.lireReglages({ type: 'autre' }), /pas un fichier de réglages/);
  assert.throws(() => R.lireReglages({ type: 'reste-a-faire-reglages', entreprise: { logo: 'http://x/y.png' } }), /logo/);
});
