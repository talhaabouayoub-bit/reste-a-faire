/* Reste à faire — règles pures (aucun accès à l'écran ni au stockage).
 *
 * Transposition des règles de l'onglet « Reste à faire » de JournéePro (v2.70), pour un chef
 * de chantier sur Android. Testées par `node --test tests/` : ne rien y mettre qui dépende du
 * navigateur. Chargé tel quel dans la page (window.Regles) et dans node (module.exports).
 */
(function (racine) {
  'use strict';

  const ZONES_PAR_DEFAUT = ['R-2', 'R-1', 'RDC', 'R+1', 'R+2', 'R+3', 'R+4', 'R+5', 'R+6', 'R+7'];
  const BATIMENTS_PAR_DEFAUT = ['A', 'B', 'C'];
  /** Causes proposées sous « Bloqué ». « Matériel non livré » en tête : c'est la plus fréquente. */
  const LOTS_PROPOSES = ['Matériel non livré', 'Plaquiste', 'Électricien', 'Plombier', 'Maçon',
    'Menuisier', 'Peintre', 'Charpentier / couvreur', 'Client'];

  // ── Texte ──

  /** Minuscules, sans accents ni espaces autour : « Bât. A » et « bat. a » sont le même. */
  function replier(s) {
    return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  const propre = (s) => String(s || '').trim();

  // ── Bâtiments et étages ──

  /** Ordre de l'immeuble : sous-sol, R-2, R-1, RDC, R+1…, puis le reste par ordre alphabétique,
   *  zone vide en dernier. Rend [rang, texte] à comparer avec `comparerCles`. */
  function cleZone(zone) {
    const r = replier(zone);
    if (r.startsWith('sous-sol') || r.startsWith('sous sol') || r === 'ss') return [-10, r];
    if (r.startsWith('rdc') || r.startsWith('rez')) return [0, r];
    const m = /^r([+-])(\d+)/.exec(r);
    if (m) return [(m[1] === '-' ? -1 : 1) * parseInt(m[2], 10), r];
    if (r === '') return [10000, ''];
    return [1000, r];
  }
  /** Bâtiments : ordre alphabétique, sans bâtiment en dernier. */
  function cleBatiment(b) {
    const r = replier(b);
    return [r === '' ? 1 : 0, r];
  }
  function comparerCles(a, b) {
    if (a[0] !== b[0]) return a[0] - b[0];
    return a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0;
  }

  /** « A » → « Bâtiment A » ; « Bât. A » reste tel quel ; vide → « Sans bâtiment ». */
  function nomBatiment(b) {
    const p = propre(b);
    if (!p) return 'Sans bâtiment';
    return replier(p).startsWith('bat') ? p : 'Bâtiment ' + p;
  }

  /** Titre d'une ligne : « Bâtiment A — RDC — Piscine », « R+2 », « Zone non précisée ». */
  function emplacement(p) {
    const parts = [propre(p.batiment) ? nomBatiment(p.batiment) : '', propre(p.zone), propre(p.precision)]
      .filter(Boolean);
    return parts.length ? parts.join(' — ') : 'Zone non précisée';
  }

  function ajouter(valeur, liste) {
    const v = propre(valeur);
    if (!v || liste.some((x) => replier(x) === replier(v))) return liste.slice();
    return liste.concat([v]);
  }
  function ajouterBatiment(valeur, liste) {
    return ajouter(valeur, liste).sort((a, b) => comparerCles(cleBatiment(a), cleBatiment(b)));
  }
  function ajouterEtage(valeur, liste) {
    return ajouter(valeur, liste).sort((a, b) => comparerCles(cleZone(a), cleZone(b)));
  }
  /** Retire une pastille de la liste. Ne touche à aucun point. */
  function retirer(valeur, liste) {
    return liste.filter((x) => replier(x) !== replier(valeur));
  }
  /** La liste, plus la valeur du point si elle n'y est plus. */
  function pastilles(liste, valeur) {
    const v = propre(valeur);
    if (!v || liste.some((x) => replier(x) === replier(v))) return liste.slice();
    return liste.concat([v]);
  }

  /** Liste « Où ? » d'un chantier : celle choisie (même vide) ; sinon, chantier jamais réglé,
   *  les défauts plus ce que ses points portent déjà. `null` = jamais réglée. */
  function listeBatiments(stockee, points) {
    if (Array.isArray(stockee)) return stockee.slice();
    return points.map((p) => p.batiment).reduce((l, b) => ajouterBatiment(b, l), BATIMENTS_PAR_DEFAUT.slice());
  }
  function listeEtages(stockee, points) {
    if (Array.isArray(stockee)) return stockee.slice();
    return points.map((p) => p.zone).reduce((l, z) => ajouterEtage(z, l), ZONES_PAR_DEFAUT.slice());
  }

  /** Bâtiment du point le plus récent : repris d'office pour un nouveau point. */
  function dernierBatiment(points) {
    let dernier = null;
    for (const p of points) if (!dernier || p.dateConstat > dernier.dateConstat) dernier = p;
    return dernier ? propre(dernier.batiment) : '';
  }

  /** Ordre de l'écran et du PDF : bâtiment, étage, puis du plus ancien au plus récent. */
  function trier(points) {
    return points.slice().sort((a, b) =>
      comparerCles(cleBatiment(a.batiment), cleBatiment(b.batiment)) ||
      comparerCles(cleZone(a.zone), cleZone(b.zone)) ||
      (a.dateConstat < b.dateConstat ? -1 : a.dateConstat > b.dateConstat ? 1 : 0));
  }

  // ── Qui doit agir ──

  const estFait = (p) => !!p.dateFait;
  /** Pour l'écran ET le PDF : le document parle au nom de l'entreprise. */
  function libelleResponsable(p) {
    if (p.responsable !== 'autreLot') return 'À notre charge';
    const lot = propre(p.lotBloquant);
    return lot ? 'Bloqué par : ' + lot : 'Bloqué';
  }

  // ── Choix du contenu du PDF ──

  function cleEmplacement(p) { return replier(p.batiment) + '|' + replier(p.zone); }

  /** Un groupe par bâtiment, et dans chacun les étages qui ont des points (avec leur nombre).
   *  « RDC » et « rdc » font une case. La précision n'entre pas dans la grille. */
  function grille(points) {
    const nomBat = new Map(), nomZone = new Map(), compte = new Map(), cases = new Map();
    for (const p of points) {
      const b = replier(p.batiment), cle = cleEmplacement(p);
      if (!nomBat.has(b)) nomBat.set(b, propre(p.batiment));
      if (!nomZone.has(cle)) {
        nomZone.set(cle, propre(p.zone));
        if (!cases.has(b)) cases.set(b, []);
        cases.get(b).push(cle);
      }
      compte.set(cle, (compte.get(cle) || 0) + 1);
    }
    return Array.from(nomBat.keys())
      .sort((x, y) => comparerCles(cleBatiment(x), cleBatiment(y)))
      .map((b) => {
        const cs = (cases.get(b) || [])
          .map((cle) => ({ cle, zone: nomZone.get(cle), nombre: compte.get(cle) }))
          .sort((x, y) => comparerCles(cleZone(x.zone), cleZone(y.zone)));
        return { batiment: nomBat.get(b), cases: cs, nombre: cs.reduce((n, c) => n + c.nombre, 0) };
      });
  }

  function filtrer(points, garder) {
    const g = garder instanceof Set ? garder : new Set(garder);
    return points.filter((p) => g.has(cleEmplacement(p)));
  }

  /** Ce que couvre un envoi partiel. `null` quand tout est coché. */
  function perimetre(choisis, gr) {
    const c = choisis instanceof Set ? choisis : new Set(choisis);
    const toutes = gr.flatMap((g) => g.cases.map((x) => x.cle));
    if (toutes.every((k) => c.has(k))) return null;
    const seulSansBatiment = gr.length === 1 && !propre(gr[0].batiment);
    return gr.map((g) => {
      const gardees = g.cases.filter((x) => c.has(x.cle));
      if (!gardees.length) return null;
      const zones = gardees.map((x) => x.zone || 'zone non précisée').join(', ');
      if (seulSansBatiment) return zones;
      const nom = nomBatiment(g.batiment);
      return gardees.length === g.cases.length ? nom + ' en entier' : nom + ' : ' + zones;
    }).filter(Boolean).join(' ; ');
  }

  /** Cases cochées à l'ouverture : le dernier choix sans les cases disparues ; tout sinon. */
  function selectionInitiale(memorisee, disponibles) {
    const dispo = new Set(disponibles);
    const reste = (memorisee || []).filter((k) => dispo.has(k));
    return new Set(reste.length ? reste : dispo);
  }

  // ── Textes du PDF et du mail ──

  /** « de Dupont Ventilation », mais « d'Alpes Clim ». */
  function de(nom) {
    const p = replier(nom).charAt(0);
    return 'aeiouy'.includes(p) && p ? "d'" + nom : 'de ' + nom;
  }

  function synthese(ouverts, entreprise) {
    const total = ouverts.length;
    if (!total) return 'Aucun point en suspens à ce jour.';
    const bloques = ouverts.filter((p) => p.responsable === 'autreLot').length;
    const nous = total - bloques;
    const tete = total === 1 ? '1 point ouvert' : total + ' points ouverts';
    const parts = [];
    if (bloques) parts.push(bloques + " en attente d'un autre corps d'état ou de matériel");
    if (nous) parts.push(nous + ' à la charge ' + de(entreprise || 'notre entreprise'));
    return tete + ' : ' + parts.join(', ') + '.';
  }

  const deux = (n) => String(n).padStart(2, '0');
  /** Date ISO (ou Date) → « 17/11/2026 », à l'heure du téléphone. */
  function dateCourte(d) {
    const x = d instanceof Date ? d : new Date(d);
    return deux(x.getDate()) + '/' + deux(x.getMonth() + 1) + '/' + x.getFullYear();
  }

  function mail({ chantier, ouverts, entreprise, signature, destinataire, perimetre: perim, date }) {
    const jour = dateCourte(date || new Date());
    const nomChantier = propre(chantier) || 'le chantier';
    const nomDest = destinataire ? propre(destinataire.nom) : '';
    const partiel = perim ? ' Cet envoi ne porte que sur : ' + perim + '.' : '';
    const signe = [propre(signature), propre(entreprise)].filter(Boolean).join('\n');
    return {
      objet: nomChantier + ' — points en suspens au ' + jour,
      corps: (nomDest ? 'Bonjour ' + nomDest + ',' : 'Bonjour,') + '\n\n' +
        'Vous trouverez ci-joint la liste des points en suspens sur le chantier ' + nomChantier +
        ', au ' + jour + '.' + partiel + '\n\n' +
        synthese(ouverts, entreprise) + '\n\n' +
        'Je reste à votre disposition pour en parler.\n\nCordialement,' + (signe ? '\n' + signe : ''),
    };
  }

  // ── Destinataires ──

  function ajouterDestinataire(liste, nom, email) {
    const n = propre(nom), e = propre(email);
    if (!n && !e) return liste.slice();
    return liste.concat([{ id: 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), nom: n, email: e }]);
  }

  // ── Fichier de réglages ──

  /** Valide un fichier de réglages et rend la version propre. Lève une Error lisible sinon.
   *  Format : { type: "reste-a-faire-reglages", version: 1, entreprise: { nom, adresse,
   *  telephone, logo (data:image/…) }, signature, destinataires: [{ nom, email }] }. */
  function lireReglages(obj) {
    if (!obj || typeof obj !== 'object' || obj.type !== 'reste-a-faire-reglages') {
      throw new Error("Ce fichier n'est pas un fichier de réglages « Reste à faire ».");
    }
    const e = obj.entreprise || {};
    const logo = typeof e.logo === 'string' && /^data:image\/(png|jpeg);base64,/.test(e.logo) ? e.logo : '';
    if (e.logo && !logo) throw new Error('Le logo du fichier de réglages est illisible (PNG ou JPEG attendu).');
    const dest = Array.isArray(obj.destinataires) ? obj.destinataires : [];
    return {
      entreprise: { nom: propre(e.nom), adresse: propre(e.adresse), telephone: propre(e.telephone), logo },
      signature: propre(obj.signature),
      destinataires: dest
        .filter((d) => d && (propre(d.nom) || propre(d.email)))
        .map((d, i) => ({ id: 'r' + i, nom: propre(d.nom), email: propre(d.email) })),
    };
  }

  const Regles = {
    ZONES_PAR_DEFAUT, BATIMENTS_PAR_DEFAUT, LOTS_PROPOSES,
    replier, cleZone, cleBatiment, comparerCles, nomBatiment, emplacement,
    ajouterBatiment, ajouterEtage, retirer, pastilles, listeBatiments, listeEtages, dernierBatiment, trier,
    estFait, libelleResponsable, cleEmplacement, grille, filtrer, perimetre, selectionInitiale,
    de, synthese, dateCourte, mail, ajouterDestinataire, lireReglages,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Regles;
  else racine.Regles = Regles;
})(typeof window !== 'undefined' ? window : globalThis);
