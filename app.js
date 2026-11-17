/* Reste à faire — l'écran. Les règles sont dans regles.js (testées), le PDF dans document.js,
 * le stockage dans stockage.js. Tout reste sur le téléphone. */
(function () {
  'use strict';
  const R = window.Regles, S = window.Stockage, D = window.DocumentPDF;
  const $ = (s) => document.querySelector(s);
  const el = (tag, attrs = {}, ...enfants) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v);
    }
    for (const e of enfants.flat()) if (e != null && e !== false) n.append(e.nodeType ? e : document.createTextNode(e));
    return n;
  };
  const nouvelId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  // ── État ──
  let etat = {
    reglages: { entreprise: { nom: '', adresse: '', telephone: '', logo: '' }, signature: '', destinataires: [] },
    chantiers: [], chantierCourant: null, inclureRegles: false, reglagesImportes: false,
  };
  let points = [];

  const sauver = () => S.ecrireEtat(etat).catch(erreurStockage);
  function erreurStockage(e) { toast("Enregistrement impossible : " + (e && e.message ? e.message : e)); }

  const chantier = () => etat.chantiers.find((c) => c.id === etat.chantierCourant) || etat.chantiers[0] || null;
  const pointsDu = (c) => (c ? points.filter((p) => p.chantierId === c.id) : []);
  const destinataires = () => etat.reglages.destinataires;
  function destinataire(c) {
    if (!c || c.destinataire === 'aucun') return null;
    return destinataires().find((d) => d.id === c.destinataire) || destinataires()[0] || null;
  }

  // ── Messages ──
  let minuterie = null;
  function toast(texte, duree = 4500) {
    const t = $('#toast');
    t.textContent = texte; t.hidden = false;
    // En « popover », le message passe au-dessus des fenêtres ouvertes (couche supérieure).
    if (t.showPopover) { try { t.hidePopover(); } catch (_) {} try { t.showPopover(); } catch (_) {} }
    clearTimeout(minuterie);
    minuterie = setTimeout(() => { t.hidden = true; if (t.hidePopover) { try { t.hidePopover(); } catch (_) {} } }, duree);
  }
  function message(texte, ok) {
    const m = $('#message');
    m.textContent = texte; m.className = 'carte message ' + (ok ? 'ok' : 'ko'); m.hidden = !texte;
  }

  // ── Petite saisie ──
  function demander(titre, champs) {
    const dlg = $('#dlg-saisie');
    $('#saisie-titre').textContent = titre;
    const zone = $('#saisie-champs'); zone.replaceChildren();
    const entrees = champs.map((c) => {
      const i = el('input', { value: c.valeur || '', placeholder: c.placeholder || '', type: c.type || 'text',
        autocomplete: 'off', inputmode: c.inputmode || null });
      zone.append(el('label', { class: 'champ' }, c.label, i));
      return i;
    });
    return new Promise((ok) => {
      const fin = (v) => { dlg.close(); $('#form-saisie').onsubmit = null; dlg.onclose = null; ok(v); };
      $('#form-saisie').onsubmit = (e) => { e.preventDefault(); fin(entrees.map((i) => i.value.trim())); };
      dlg.querySelector('[data-fermer]').onclick = () => fin(null);
      dlg.onclose = () => ok(null);
      dlg.showModal();
      setTimeout(() => entrees[0] && entrees[0].focus(), 50);
    });
  }

  // ── Écran principal ──
  function afficher() {
    const c = chantier();
    $('#bandeau-reglages').hidden = etat.reglagesImportes;

    const sel = $('#choix-chantier'); sel.replaceChildren();
    for (const ch of etat.chantiers) {
      const n = pointsDu(ch).filter((p) => !R.estFait(p)).length;
      sel.append(el('option', { value: ch.id, selected: c && ch.id === c.id }, (ch.nom || 'Sans nom') + ' (' + n + ')'));
    }
    sel.append(el('option', { value: '__nouveau' }, '+ Nouveau chantier…'));

    const sd = $('#choix-destinataire'); sd.replaceChildren();
    const d = destinataire(c);
    for (const p of destinataires()) sd.append(el('option', { value: p.id, selected: d && d.id === p.id }, p.nom || p.email));
    sd.append(el('option', { value: 'aucun', selected: !d }, 'Personne'));
    sd.disabled = !c;

    const tous = pointsDu(c);
    const ouverts = R.trier(tous.filter((p) => !R.estFait(p)));
    let synth = c ? R.synthese(ouverts, etat.reglages.entreprise.nom || 'notre entreprise') : 'Crée un chantier pour commencer.';
    if (c && !destinataires().length) synth += ' Aucune personne à qui envoyer : ajoute-la dans Réglages.';
    else if (c && d && !d.email) synth += ' ' + (d.nom || 'Cette personne') + " n'a pas d'e-mail : complète-le dans Réglages.";
    $('#synthese').textContent = synth;
    $('#btn-pdf').disabled = !c || !tous.length;
    $('#btn-ajouter').hidden = !c;

    const liste = $('#liste'); liste.replaceChildren();
    if (c && !ouverts.length) {
      liste.append(el('div', { class: 'carte vide' }, el('strong', {}, 'Rien en suspens sur ce chantier.'),
        el('p', { class: 'discret' }, "Touche + pour noter ce qui reste à faire : l'endroit, ce qui manque, et qui doit agir. Tu peux dicter avec le micro du clavier.")));
    }
    const bloques = ouverts.filter((p) => p.responsable === 'autreLot');
    const nous = ouverts.filter((p) => p.responsable !== 'autreLot');
    if (bloques.length) liste.append(el('div', { class: 'section-titre orange' }, "Bloqués — autre corps d'état ou matériel (" + bloques.length + ')'),
      el('div', { class: 'groupe' }, bloques.map(lignePoint)));
    if (nous.length) liste.append(el('div', { class: 'section-titre bleu' }, 'À notre charge (' + nous.length + ')'),
      el('div', { class: 'groupe' }, nous.map(lignePoint)));
    const regles = tous.filter(R.estFait).sort((a, b) => (a.dateFait < b.dateFait ? 1 : -1));
    if (regles.length) liste.append(el('details', {}, el('summary', { class: 'section-titre vert' }, 'Réglés (' + regles.length + ')'),
      el('div', { class: 'groupe' }, regles.map(lignePoint))));
  }

  function lignePoint(p) {
    const fait = R.estFait(p);
    const coul = fait ? 'var(--vert)' : p.responsable === 'autreLot' ? 'var(--orange)' : 'var(--bleu)';
    const meta = (fait ? 'Réglé le ' + R.dateCourte(p.dateFait) : R.libelleResponsable(p)) + ' · ' + R.dateCourte(p.dateConstat);
    return el('div', { class: 'point' + (fait ? ' fait' : ''), onclick: () => ouvrirPoint(p) },
      el('div', { class: 'corps' }, el('div', { class: 'ou' }, R.emplacement(p)), el('div', { class: 'txt' }, p.texte),
        el('div', { class: 'meta', style: 'color:' + coul }, meta)),
      p.photo ? el('img', { src: p.photo, alt: '' }) : null,
      el('button', { class: 'regler', 'aria-label': fait ? 'Rouvrir' : 'Réglé', title: fait ? 'Rouvrir' : 'Réglé',
        onclick: (e) => { e.stopPropagation(); basculerRegle(p); } }, fait ? '↺' : '✓'));
  }

  async function basculerRegle(p) {
    p.dateFait = p.dateFait ? null : new Date().toISOString();
    await S.ecrirePoint(p).catch(erreurStockage);
    afficher();
    toast(p.dateFait ? 'Point réglé.' : 'Point rouvert.');
  }

  // ── Formulaire d'un point ──
  let enCours = null;       // copie modifiée
  let original = null;      // point d'origine (édition) ou null (nouveau)
  const edition = { batiments: false, etages: false };

  function ouvrirPoint(p) {
    const c = chantier(); if (!c) return;
    original = p || null;
    enCours = p ? { ...p } : { id: nouvelId(), chantierId: c.id, batiment: R.dernierBatiment(pointsDu(c)), zone: '',
      precision: '', texte: '', responsable: 'moi', lotBloquant: '', dateConstat: new Date().toISOString(), dateFait: null, photo: '' };
    edition.batiments = edition.etages = false;
    $('#titre-point').textContent = p ? 'Modifier le point' : 'Nouveau point';
    $('#titre-ou').textContent = 'Où ? — ' + (c.nom || 'Sans nom');
    $('#precision').value = enCours.precision;
    $('#texte').value = enCours.texte;
    $('#section-etat').hidden = !p;
    dessinerFormulaire();
    $('#dlg-point').showModal();
    if (!p) setTimeout(() => $('#texte').focus(), 300);
  }

  function dessinerFormulaire() {
    const c = chantier(), pts = pointsDu(c);
    dessinerListe('batiments', R.listeBatiments(c.batiments, pts), 'batiment');
    dessinerListe('etages', R.listeEtages(c.etages, pts), 'zone');
    document.querySelectorAll('[data-qui]').forEach((b) => b.classList.toggle('actif', b.dataset.qui === enCours.responsable));
    $('#zone-causes').hidden = enCours.responsable !== 'autreLot';
    const causes = $('#pastilles-causes'); causes.replaceChildren();
    const lot = enCours.lotBloquant;
    const autre = !!lot && !R.LOTS_PROPOSES.includes(lot) || enCours._autre;
    for (const l of R.LOTS_PROPOSES.concat(['Autre…'])) {
      const choisi = l === 'Autre…' ? autre : lot === l && !enCours._autre;
      causes.append(el('button', { type: 'button', class: 'pastille' + (choisi ? ' choisie' : ''), onclick: () => {
        if (l === 'Autre…') { enCours._autre = true; if (R.LOTS_PROPOSES.includes(enCours.lotBloquant)) enCours.lotBloquant = ''; }
        else { enCours._autre = false; enCours.lotBloquant = choisi ? '' : l; }
        dessinerFormulaire();
      } }, l));
    }
    $('#cause-libre').hidden = !autre;
    if (autre) $('#cause-libre').value = R.LOTS_PROPOSES.includes(lot) ? '' : lot;
    $('#apercu-photo').hidden = !enCours.photo;
    if (enCours.photo) $('#apercu-photo').src = enCours.photo;
    $('#photo-retirer').hidden = !enCours.photo;
    if (original) {
      $('#etat-texte').textContent = enCours.dateFait ? 'Réglé le ' + R.dateCourte(enCours.dateFait) : 'Ouvert, constaté le ' + R.dateCourte(enCours.dateConstat);
      $('#btn-basculer-regle').textContent = enCours.dateFait ? 'Rouvrir' : 'Marquer réglé';
    }
    validerFormulaire();
  }

  function dessinerListe(type, liste, champ) {
    const zone = $('#pastilles-' + type); zone.replaceChildren();
    const valeur = enCours[champ];
    for (const v of R.pastilles(liste, valeur)) {
      const choisi = R.replier(v) === R.replier(valeur);
      const b = el('button', { type: 'button', class: 'pastille' + (choisi ? ' choisie' : '') }, v);
      if (edition[type]) {
        b.append(el('span', { class: 'croix', 'aria-hidden': 'true' }, '×'));
        b.setAttribute('aria-label', 'Retirer ' + v);
        b.onclick = () => ecrireListe(type, R.retirer(v, liste));
      } else {
        b.onclick = () => { enCours[champ] = choisi ? '' : v; dessinerFormulaire(); };
      }
      zone.append(b);
    }
    zone.append(el('button', { type: 'button', class: 'pastille ajout', 'aria-label': type === 'batiments' ? 'Nouveau bâtiment' : 'Nouvel étage',
      onclick: async () => {
        const r = await demander(type === 'batiments' ? 'Nouveau bâtiment' : 'Nouvel étage',
          [{ label: type === 'batiments' ? 'Nom' : 'Étage', placeholder: type === 'batiments' ? 'D, Nord, Annexe…' : 'R+8, Combles, Sous-sol…' }]);
        if (!r || !r[0]) return;
        const nouvelle = type === 'batiments' ? R.ajouterBatiment(r[0], liste) : R.ajouterEtage(r[0], liste);
        enCours[champ] = nouvelle.find((x) => R.replier(x) === R.replier(r[0])) || r[0];
        ecrireListe(type, nouvelle);
      } }, '+'));
    document.querySelector('[data-modifier="' + type + '"]').textContent = edition[type] ? 'Terminé' : 'Modifier la liste';
  }

  /** Les listes appartiennent au CHANTIER : enregistrées tout de suite, même si on annule le point. */
  function ecrireListe(type, liste) {
    chantier()[type] = liste;
    sauver();
    dessinerFormulaire();
  }

  function validerFormulaire() { $('#btn-enregistrer').disabled = !$('#texte').value.trim(); }

  async function enregistrerPoint() {
    enCours.precision = $('#precision').value.trim();
    enCours.texte = $('#texte').value.trim();
    if (!enCours.texte) return;
    if (enCours.responsable !== 'autreLot') enCours.lotBloquant = '';
    else if (enCours._autre) enCours.lotBloquant = $('#cause-libre').value.trim();
    delete enCours._autre;
    const i = points.findIndex((p) => p.id === enCours.id);
    if (i >= 0) points[i] = enCours; else points.push(enCours);
    try { await S.ecrirePoint(enCours); } catch (e) { erreurStockage(e); }
    $('#dlg-point').close();
    afficher();
  }

  function compresserPhoto(fichier) {
    return new Promise((ok, ko) => {
      const url = URL.createObjectURL(fichier);
      const img = new Image();
      img.onload = () => {
        const r = Math.min(1, 1600 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * r); c.height = Math.round(img.height * r);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        ok(c.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => { URL.revokeObjectURL(url); ko(new Error('Photo illisible.')); };
      img.src = url;
    });
  }
  async function prendrePhoto(input) {
    const f = input.files && input.files[0]; input.value = '';
    if (!f) return;
    try { enCours.photo = await compresserPhoto(f); dessinerFormulaire(); } catch (e) { toast(e.message); }
  }

  // ── Choix du contenu du PDF ──
  let choisis = new Set();
  const candidats = () => pointsDu(chantier()).filter((p) => !R.estFait(p) || etat.inclureRegles);
  const grilleCourante = () => R.grille(candidats());
  const disponibles = () => grilleCourante().flatMap((g) => g.cases.map((x) => x.cle));
  const retenus = () => R.filtrer(candidats(), choisis);
  const perimetreCourant = () => R.perimetre(choisis, grilleCourante());

  function ouvrirChoix() {
    const c = chantier(); if (!c) return;
    $('#inclure-regles').checked = etat.inclureRegles;
    choisis = R.selectionInitiale(c.choixPDF, disponibles());
    dessinerChoix();
    $('#dlg-choix').showModal();
  }

  function dessinerChoix() {
    const g = grilleCourante(), zone = $('#grille'); zone.replaceChildren();
    if (!g.length) zone.append(el('div', { class: 'carte discret' },
      etat.inclureRegles ? 'Aucun point sur ce chantier.' : "Aucun point ouvert. Active « Inclure les points réglés » pour envoyer l'historique."));
    const seul = g.length === 1 && !g[0].batiment;
    for (const groupe of g) {
      const cles = groupe.cases.map((x) => x.cle);
      const tous = cles.every((k) => choisis.has(k)), aucun = cles.every((k) => !choisis.has(k));
      zone.append(el('div', { class: 'groupe-bat' },
        el('button', { type: 'button', class: 'entete', onclick: () => {
          cles.forEach((k) => (tous ? choisis.delete(k) : choisis.add(k))); dessinerChoix();
        } }, (tous ? '◉ ' : aucun ? '○ ' : '◐ ') + (seul ? 'Tout le chantier' : R.nomBatiment(groupe.batiment)) + ' (' + groupe.nombre + ')'),
        el('div', { class: 'pastilles' }, groupe.cases.map((x) => el('button', {
          type: 'button', class: 'pastille compte' + (choisis.has(x.cle) ? ' choisie' : ''), 'aria-pressed': String(choisis.has(x.cle)),
          onclick: () => { choisis.has(x.cle) ? choisis.delete(x.cle) : choisis.add(x.cle); dessinerChoix(); },
        }, (x.zone || 'Non précisé') + '  ' + x.nombre)))));
    }
    const n = retenus().length;
    $('#compteur').textContent = n === 0 ? 'Aucun point sélectionné' : n === 1 ? '1 point sélectionné' : n + ' points sélectionnés';
    $('#perimetre').textContent = perimetreCourant() || '';
    ['#btn-apercu', '#btn-envoyer', '#btn-partager'].forEach((s) => { $(s).disabled = n === 0; });
  }

  function memoriserChoix() {
    const dispo = new Set(disponibles());
    chantier().choixPDF = [...choisis].filter((k) => dispo.has(k));
    sauver();
  }

  // ── Fabriquer, voir, envoyer ──
  let dernierPDF = null;   // { fichier, objet, corps, email, nomDest }

  async function preparerPDF() {
    const c = chantier(), d = destinataire(c), pts = retenus(), perim = perimetreCourant(), date = new Date();
    const blob = await D.fabriquer({ chantier: c, points: pts, inclureRegles: etat.inclureRegles,
      reglages: etat.reglages, destinataire: d, perimetre: perim, date });
    const m = R.mail({ chantier: c.nom, ouverts: pts.filter((p) => !R.estFait(p)), entreprise: etat.reglages.entreprise.nom,
      signature: etat.reglages.signature, destinataire: d, perimetre: perim, date });
    dernierPDF = { fichier: new File([blob], D.nomFichier(c, date), { type: 'application/pdf' }), objet: m.objet, corps: m.corps,
      email: d ? d.email : '', nomDest: d ? d.nom : '' };
    return dernierPDF;
  }

  async function apercu() {
    memoriserChoix();
    const zone = $('#pages-apercu'); zone.replaceChildren(el('p', { class: 'carte' }, 'Préparation du PDF…'));
    $('#dlg-apercu').showModal();
    try {
      const { fichier } = await preparerPDF();
      const pdfjs = window.pdfjsLib;
      pdfjs.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
      const pdf = await pdfjs.getDocument({ data: new Uint8Array(await fichier.arrayBuffer()) }).promise;
      zone.replaceChildren();
      const largeur = Math.min(zone.clientWidth - 32, 900);
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const base = page.getViewport({ scale: 1 });
        const echelle = (largeur / base.width) * Math.min(window.devicePixelRatio || 1, 2.5);
        const vue = page.getViewport({ scale: echelle });
        const canvas = el('canvas', { width: Math.floor(vue.width), height: Math.floor(vue.height), 'aria-label': 'Page ' + i });
        zone.append(canvas);
        await page.render({ canvasContext: canvas.getContext('2d'), viewport: vue }).promise;
      }
    } catch (e) {
      zone.replaceChildren(el('p', { class: 'carte' }, "Le PDF n'a pas pu être affiché : " + e.message));
    }
  }

  /** Envoyer : feuille de partage d'Android avec le PDF joint (choisir Gmail / Outlook).
   *  ⚠️ Une page web ne peut pas pré-remplir le destinataire d'un mail AVEC une pièce jointe :
   *  l'adresse est copiée, à coller dans « À ». Sans partage de fichiers : PDF téléchargé +
   *  mail pré-rempli (destinataire, objet, texte) où il reste à joindre le PDF. */
  async function envoyer(depuisApercu) {
    memoriserChoix();
    let pdf;
    try { pdf = depuisApercu && dernierPDF ? dernierPDF : await preparerPDF(); }
    catch (e) { toast("Le PDF n'a pas pu être créé : " + e.message); return; }
    fermerDialogues();
    if (pdf.email && navigator.clipboard) { try { await navigator.clipboard.writeText(pdf.email); } catch (_) { /* refusé : on le dit plus bas */ } }
    if (navigator.canShare && navigator.canShare({ files: [pdf.fichier] })) {
      try {
        await navigator.share({ files: [pdf.fichier], title: pdf.objet, text: pdf.corps });
        message(pdf.email ? 'PDF partagé. Adresse de ' + (pdf.nomDest || 'la personne') + ' copiée : colle-la dans « À » si le mail ne l\'a pas.' : 'PDF partagé.', true);
      } catch (e) {
        if (e.name === 'AbortError') return;
        proposerNouvelEssai('envoyer');
      }
      return;
    }
    telecharger(pdf.fichier);
    location.href = 'mailto:' + encodeURIComponent(pdf.email) + '?subject=' + encodeURIComponent(pdf.objet) + '&body=' + encodeURIComponent(pdf.corps);
    message('PDF téléchargé : joins-le au mail qui vient de s\'ouvrir.', false);
  }

  async function partager(depuisApercu) {
    memoriserChoix();
    let pdf;
    try { pdf = depuisApercu && dernierPDF ? dernierPDF : await preparerPDF(); }
    catch (e) { toast("Le PDF n'a pas pu être créé : " + e.message); return; }
    fermerDialogues();
    if (navigator.canShare && navigator.canShare({ files: [pdf.fichier] })) {
      try { await navigator.share({ files: [pdf.fichier], title: pdf.objet }); }
      catch (e) { if (e.name !== 'AbortError') proposerNouvelEssai('partager'); }
      return;
    }
    telecharger(pdf.fichier);
    message('PDF téléchargé dans « Téléchargements ».', true);
  }

  /** Android n'ouvre le partage que juste après un toucher : si la fabrication du PDF a été
   *  longue (beaucoup de photos), on redemande un toucher, le PDF est déjà prêt. */
  function proposerNouvelEssai(quoi) {
    const m = $('#message');
    m.replaceChildren('Le PDF est prêt. ', el('button', { class: 'bouton plein', onclick: () => (quoi === 'envoyer' ? envoyer(true) : partager(true)) },
      quoi === 'envoyer' ? 'Envoyer maintenant' : 'Partager maintenant'));
    m.className = 'carte message'; m.hidden = false;
  }

  function telecharger(fichier) {
    const a = el('a', { href: URL.createObjectURL(fichier), download: fichier.name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  }

  function fermerDialogues() { ['#dlg-apercu', '#dlg-choix'].forEach((s) => { if ($(s).open) $(s).close(); }); }

  // ── Réglages ──
  function ouvrirReglages() { dessinerReglages(); $('#dlg-reglages').showModal(); }

  function dessinerReglages() {
    const e = etat.reglages.entreprise;
    $('#ent-nom').value = e.nom; $('#ent-adresse').value = e.adresse; $('#ent-tel').value = e.telephone;
    $('#signature').value = etat.reglages.signature;
    $('#ent-logo').hidden = !e.logo; if (e.logo) $('#ent-logo').src = e.logo;
    $('#btn-retirer-logo').hidden = !e.logo;

    const lc = $('#liste-chantiers'); lc.replaceChildren();
    if (!etat.chantiers.length) lc.append(el('p', { class: 'discret' }, 'Aucun chantier.'));
    for (const c of etat.chantiers) {
      const n = pointsDu(c).length;
      lc.append(el('div', { class: 'ligne-gestion' },
        el('div', { class: 'nom' }, c.nom || 'Sans nom', el('small', {}, (c.adresse || 'Sans adresse') + ' · ' + n + ' point' + (n > 1 ? 's' : ''))),
        el('button', { class: 'lien', onclick: () => modifierChantier(c) }, 'Modifier'),
        el('button', { class: 'lien', style: 'color:var(--rouge)', onclick: () => supprimerChantier(c) }, 'Supprimer')));
    }
    const ld = $('#liste-destinataires'); ld.replaceChildren();
    if (!destinataires().length) ld.append(el('p', { class: 'discret' }, 'Personne pour le moment.'));
    for (const d of destinataires()) {
      ld.append(el('div', { class: 'ligne-gestion' },
        el('div', { class: 'nom' }, d.nom || '(sans nom)', el('small', { style: d.email ? '' : 'color:var(--orange)' }, d.email || 'e-mail à compléter')),
        el('button', { class: 'lien', onclick: () => modifierDestinataire(d) }, 'Modifier'),
        el('button', { class: 'lien', style: 'color:var(--rouge)', onclick: () => {
          if (!confirm('Retirer ' + (d.nom || d.email) + ' de la liste ?')) return;
          etat.reglages.destinataires = destinataires().filter((x) => x.id !== d.id); sauver(); dessinerReglages(); afficher();
        } }, 'Retirer')));
    }
    const info = $('#info-stockage');
    if (navigator.storage && navigator.storage.persisted) {
      navigator.storage.persisted().then((p) => { info.textContent = p ? 'Données protégées : Chrome ne les effacera pas pour gagner de la place.' : 'Chrome peut effacer ces données si le téléphone manque de place : la sauvegarde est ta seule copie.'; });
    }
  }

  async function modifierDestinataire(d) {
    const r = await demander(d ? 'Modifier la personne' : 'Ajouter une personne',
      [{ label: 'Nom', valeur: d ? d.nom : '' }, { label: 'E-mail', valeur: d ? d.email : '', type: 'email', inputmode: 'email' }]);
    if (!r || (!r[0] && !r[1])) return;
    if (d) { d.nom = r[0]; d.email = r[1]; }
    else etat.reglages.destinataires = R.ajouterDestinataire(destinataires(), r[0], r[1]);
    sauver(); dessinerReglages(); afficher();
  }

  async function modifierChantier(c) {
    const r = await demander(c ? 'Modifier le chantier' : 'Nouveau chantier',
      [{ label: 'Nom du chantier', valeur: c ? c.nom : '', placeholder: 'Résidence Les Pins…' }, { label: 'Adresse (facultatif)', valeur: c ? c.adresse : '' }]);
    if (!r || !r[0]) return null;
    if (c) { c.nom = r[0]; c.adresse = r[1]; }
    else {
      c = { id: nouvelId(), nom: r[0], adresse: r[1], batiments: null, etages: null, choixPDF: null };
      etat.chantiers.push(c); etat.chantierCourant = c.id;
    }
    await sauver(); dessinerReglages(); afficher();
    return c;
  }

  async function supprimerChantier(c) {
    const n = pointsDu(c).length;
    if (!confirm('Supprimer « ' + (c.nom || 'Sans nom') + ' »' + (n ? ' et ses ' + n + ' point(s), photos comprises' : '') + ' ? C\'est définitif.')) return;
    for (const p of pointsDu(c)) await S.supprimerPoint(p.id).catch(erreurStockage);
    points = points.filter((p) => p.chantierId !== c.id);
    etat.chantiers = etat.chantiers.filter((x) => x.id !== c.id);
    if (etat.chantierCourant === c.id) etat.chantierCourant = etat.chantiers[0] ? etat.chantiers[0].id : null;
    await sauver(); dessinerReglages(); afficher();
  }

  async function importerReglages(input) {
    const f = input.files && input.files[0]; input.value = '';
    if (!f) return;
    try {
      const r = R.lireReglages(JSON.parse(await f.text()));
      etat.reglages.entreprise = r.entreprise;
      if (r.signature) etat.reglages.signature = r.signature;
      // Les personnes du fichier s'ajoutent à celles déjà là (même nom = mise à jour, sans écraser un e-mail saisi).
      for (const d of r.destinataires) {
        const deja = destinataires().find((x) => R.replier(x.nom) === R.replier(d.nom));
        if (deja) { if (d.email) deja.email = d.email; }
        else etat.reglages.destinataires = R.ajouterDestinataire(destinataires(), d.nom, d.email);
      }
      etat.reglagesImportes = true;
      await sauver();
      if ($('#dlg-reglages').open) dessinerReglages();
      afficher();
      toast('Réglages importés : ' + (r.entreprise.nom || 'entreprise') + ', ' + r.destinataires.length + ' personne(s).');
      if (!etat.chantiers.length) modifierChantier(null);
    } catch (e) { toast(e.message || 'Fichier illisible.'); }
  }

  async function sauvegarder() {
    const contenu = JSON.stringify({ type: 'reste-a-faire-sauvegarde', version: 1, date: new Date().toISOString(), etat, points });
    const d = new Date();
    const nom = 'reste-a-faire_sauvegarde_' + d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + '.json';
    const fichier = new File([contenu], nom, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [fichier] })) {
      try { await navigator.share({ files: [fichier], title: 'Sauvegarde Reste à faire' }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    telecharger(fichier);
    toast('Sauvegarde téléchargée dans « Téléchargements ».');
  }

  async function restaurer(input) {
    const f = input.files && input.files[0]; input.value = '';
    if (!f) return;
    try {
      const s = JSON.parse(await f.text());
      if (s.type !== 'reste-a-faire-sauvegarde' || !s.etat || !Array.isArray(s.points)) throw new Error("Ce fichier n'est pas une sauvegarde « Reste à faire ».");
      if (!confirm('Remplacer TOUT ce qui est sur ce téléphone par la sauvegarde du ' + R.dateCourte(s.date) + ' (' + s.points.length + ' points) ?')) return;
      etat = s.etat; points = s.points;
      await S.remplacerPoints(points); await sauver();
      dessinerReglages(); afficher();
      toast('Sauvegarde restaurée.');
    } catch (e) { toast(e.message || 'Fichier illisible.'); }
  }

  // ── Branchements ──
  function brancher() {
    document.querySelectorAll('dialog [data-fermer]').forEach((b) => b.addEventListener('click', () => b.closest('dialog').close()));
    $('#btn-ajouter').onclick = () => ouvrirPoint(null);
    $('#btn-pdf').onclick = ouvrirChoix;
    $('#btn-reglages').onclick = ouvrirReglages;
    $('#btn-importer-bandeau').onclick = () => $('#fichier-reglages').click();
    $('#choix-chantier').onchange = async (e) => {
      if (e.target.value === '__nouveau') { const c = await modifierChantier(null); if (!c) afficher(); return; }
      etat.chantierCourant = e.target.value; message(''); sauver(); afficher();
    };
    $('#choix-destinataire').onchange = (e) => { chantier().destinataire = e.target.value; sauver(); afficher(); };

    $('#form-point').addEventListener('submit', (e) => { e.preventDefault(); enregistrerPoint(); });
    $('#texte').addEventListener('input', validerFormulaire);
    document.querySelectorAll('[data-qui]').forEach((b) => b.addEventListener('click', () => { enCours.responsable = b.dataset.qui; dessinerFormulaire(); }));
    document.querySelectorAll('[data-modifier]').forEach((b) => b.addEventListener('click', () => { edition[b.dataset.modifier] = !edition[b.dataset.modifier]; dessinerFormulaire(); }));
    $('#photo-camera').onchange = (e) => prendrePhoto(e.target);
    $('#photo-galerie').onchange = (e) => prendrePhoto(e.target);
    $('#photo-retirer').onclick = () => { enCours.photo = ''; dessinerFormulaire(); };
    $('#btn-basculer-regle').onclick = () => { enCours.dateFait = enCours.dateFait ? null : new Date().toISOString(); dessinerFormulaire(); };
    $('#btn-supprimer-point').onclick = async () => {
      if (!confirm('Supprimer ce point ? Pour un point terminé, « Marquer réglé » le garde, daté, dans l\'historique.')) return;
      points = points.filter((p) => p.id !== enCours.id);
      await S.supprimerPoint(enCours.id).catch(erreurStockage);
      $('#dlg-point').close(); afficher();
    };

    $('#inclure-regles').onchange = (e) => {
      const avant = new Set(disponibles());
      etat.inclureRegles = e.target.checked; sauver();
      disponibles().filter((k) => !avant.has(k)).forEach((k) => choisis.add(k));   // nouvelles cases cochées
      dessinerChoix();
    };
    $('#btn-tout').onclick = () => { choisis = new Set(disponibles()); dessinerChoix(); };
    $('#btn-rien').onclick = () => { choisis = new Set(); dessinerChoix(); };
    $('#btn-apercu').onclick = apercu;
    $('#btn-envoyer').onclick = () => envoyer(false);
    $('#btn-partager').onclick = () => partager(false);
    $('#btn-apercu-envoyer').onclick = () => envoyer(true);
    $('#btn-apercu-partager').onclick = () => partager(true);

    $('#fichier-reglages').onchange = (e) => importerReglages(e.target);
    $('#btn-nouveau-chantier').onclick = () => modifierChantier(null);
    $('#btn-ajouter-destinataire').onclick = () => modifierDestinataire(null);
    const ent = (champ, cle) => $(champ).addEventListener('change', (e) => { etat.reglages.entreprise[cle] = e.target.value.trim(); sauver(); afficher(); });
    ent('#ent-nom', 'nom'); ent('#ent-adresse', 'adresse'); ent('#ent-tel', 'telephone');
    $('#signature').addEventListener('change', (e) => { etat.reglages.signature = e.target.value.trim(); sauver(); });
    $('#fichier-logo').onchange = async (e) => {
      const f = e.target.files && e.target.files[0]; e.target.value = '';
      if (!f) return;
      const lu = await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(f); });
      const petit = await D.reduire(lu, 400);
      if (!petit) { toast('Image illisible.'); return; }
      etat.reglages.entreprise.logo = petit.data; sauver(); dessinerReglages();
    };
    $('#btn-retirer-logo').onclick = () => { etat.reglages.entreprise.logo = ''; sauver(); dessinerReglages(); };
    $('#btn-sauvegarder').onclick = sauvegarder;
    $('#fichier-sauvegarde').onchange = (e) => restaurer(e.target);
  }

  // ── Démarrage ──
  async function demarrer() {
    brancher();
    try {
      const lu = await S.lireEtat();
      if (lu) etat = Object.assign(etat, lu);
      points = (await S.lirePoints()) || [];
    } catch (e) { toast('Lecture des données impossible : ' + e.message, 8000); }
    S.persister().catch(() => {});
    afficher();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  demarrer();
})();
