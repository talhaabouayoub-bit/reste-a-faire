/* Le PDF « Points en suspens » (jsPDF), même mise en page que celui de JournéePro :
 * en-tête (titre, chantier, adresse, « À l'attention de », date, périmètre, logo à droite),
 * synthèse grisée, sections Bloqués / À notre charge / Réglés, photo à droite de chaque point,
 * mention de clôture, coordonnées de l'entreprise sous le logo, pied de page numéroté.
 * Le mot « réserves » n'y figure jamais : il a une portée juridique (PV de réception).
 */
(function (racine) {
  'use strict';
  const R = racine.Regles;

  const BLEU = [26, 89, 204], ORANGE = [204, 107, 0], VERT = [33, 140, 64];
  const GRIS = [100, 100, 100], GRIS_CLAIR = [170, 170, 170];

  /** Réduit une image (dataURL) pour le PDF : une photo de 1600 px n'a rien à faire dans
   *  un carré de 78 pt, elle alourdirait le mail. Rend { data, w, h }. */
  function reduire(dataURL, maxPx) {
    return new Promise((ok) => {
      const img = new Image();
      img.onload = () => {
        const r = Math.min(1, maxPx / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * r));
        c.height = Math.max(1, Math.round(img.height * r));
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        ok({ data: c.toDataURL('image/jpeg', 0.8), w: c.width, h: c.height });
      };
      img.onerror = () => ok(null);
      img.src = dataURL;
    });
  }

  function longue(d) {
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  /** Fabrique le PDF. Rend un Blob. `points` est DÉJÀ filtré (choix bâtiment × étage). */
  async function fabriquer({ chantier, points, inclureRegles, reglages, destinataire, perimetre, date }) {
    const { jsPDF } = racine.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = 595, H = 842, mL = 50, utile = W - 2 * mL;
    const pied = H - 32, bas = pied - 14, haut = 45;
    const quand = date || new Date();
    const entreprise = (reglages.entreprise.nom || 'notre entreprise');

    const ouverts = R.trier(points.filter((p) => !R.estFait(p)));
    const bloques = ouverts.filter((p) => p.responsable === 'autreLot');
    const nous = ouverts.filter((p) => p.responsable !== 'autreLot');
    const regles = inclureRegles
      ? points.filter(R.estFait).sort((a, b) => (a.dateFait < b.dateFait ? 1 : -1)) : [];

    // Photos et logo réduits d'avance (asynchrone), le dessin reste ensuite synchrone.
    const photos = new Map();
    for (const p of [...bloques, ...nous, ...regles]) {
      if (p.photo) photos.set(p.id, await reduire(p.photo, 500));
    }
    const logo = reglages.entreprise.logo ? await reduire(reglages.entreprise.logo, 300) : null;

    let y = haut, page = 1, numero = 0;
    const couleur = (c) => doc.setTextColor(c[0], c[1], c[2]);
    const police = (taille, style = 'normal') => { doc.setFont('helvetica', style); doc.setFontSize(taille); };
    const lignes = (texte, largeur) => doc.splitTextToSize(String(texte), largeur);
    const hauteur = (n, taille) => n * taille * 1.18;

    function piedDePage() {
      police(8); couleur(GRIS_CLAIR);
      doc.text('Points en suspens — ' + (chantier.nom || 'Chantier') + ' — établi le ' + R.dateCourte(quand) +
        '   ·   Page ' + page, mL, pied);
      police(6);
      doc.text('Application : Air & Eau Montage', W - mL, pied + 10, { align: 'right' });
    }
    function nouvellePage() { piedDePage(); doc.addPage(); page += 1; y = haut; }
    function placer(h) { if (y + h > bas) nouvellePage(); }
    function trait() { doc.setDrawColor(217); doc.setLineWidth(0.5); doc.line(mL, y, W - mL, y); }

    function bandeau(titre, c) {
      placer(26 + 60);
      doc.setFillColor(c[0] + (255 - c[0]) * 0.88, c[1] + (255 - c[1]) * 0.88, c[2] + (255 - c[2]) * 0.88);
      doc.rect(mL, y, utile, 22, 'F');
      doc.setFillColor(c[0], c[1], c[2]);
      doc.rect(mL, y, 4, 22, 'F');
      police(10.5, 'bold'); couleur(c);
      doc.text(titre.toUpperCase(), mL + 12, y + 14.5);
      y += 30;
    }

    function ligne(p, c, regle) {
      numero += 1;
      const ph = photos.get(p.id);
      const colNum = 22, cote = 78;
      const largeur = utile - colNum - (ph ? cote + 10 : 0);
      const x = mL + colNum;
      police(11);
      const tTexte = lignes(p.texte || '—', largeur);
      let meta = regle ? 'Réglé le ' + R.dateCourte(p.dateFait) : R.libelleResponsable(p);
      if (regle && p.responsable === 'autreLot') meta += ' · ' + R.libelleResponsable(p);
      meta += ' · constaté le ' + R.dateCourte(p.dateConstat);
      police(9);
      const tMeta = lignes(meta, largeur);
      police(11, 'bold');
      const tTitre = lignes(R.emplacement(p), largeur);
      const hTitre = hauteur(tTitre.length, 11), hTexte = hauteur(tTexte.length, 11), hMeta = hauteur(tMeta.length, 9);
      const hContenu = Math.max(hTitre + hTexte + 3 + hMeta, ph ? cote : 0);
      placer(hContenu + 14);

      police(11, 'bold'); couleur(c);
      doc.text(numero + '.', mL, y + 10);
      couleur([0, 0, 0]);
      doc.text(tTitre, x, y + 10);
      police(11); couleur(regle ? GRIS : [0, 0, 0]);
      doc.text(tTexte, x, y + 10 + hTitre);
      police(9); couleur(c);
      doc.text(tMeta, x, y + 9 + hTitre + hTexte + 3);
      if (ph) {
        const r = Math.min(cote / ph.w, cote / ph.h);
        const w = ph.w * r, h = ph.h * r;
        const cx = W - mL - cote / 2, cy = y + cote / 2;
        doc.addImage(ph.data, 'JPEG', cx - w / 2, cy - h / 2, w, h);
        doc.setDrawColor(204); doc.setLineWidth(0.5);
        doc.rect(cx - w / 2, cy - h / 2, w, h);
      }
      y += hContenu + 8;
      trait();
      y += 6;
    }

    // ── En-tête ──
    const largeurEntete = utile - 120;
    police(22, 'bold'); couleur(BLEU);
    doc.text('Points en suspens', mL, y + 18);
    let basLogo = y;
    if (logo) {
      const cote = 46, ratio = logo.w / logo.h;
      const w = cote * Math.min(Math.max(ratio, 0.5), 2);
      doc.addImage(logo.data, 'JPEG', W - mL - w, y, w, cote);
      basLogo = y + cote;
    }
    // Coordonnées de l'entreprise, sous le logo, alignées à droite (1re page seulement).
    const coord = [reglages.entreprise.nom, ...String(reglages.entreprise.adresse || '').split('\n'),
      reglages.entreprise.telephone].map((s) => (s || '').trim()).filter(Boolean);
    if (coord.length) {
      const xd = W - mL, largeurCoord = 115;
      let yc = basLogo + (logo ? 12 : 10);
      police(9.5, 'bold'); couleur([0, 0, 0]);
      const tNom = lignes(coord[0], largeurCoord);
      doc.text(tNom, xd, yc, { align: 'right' });
      yc += hauteur(tNom.length, 9.5);
      police(8); couleur(GRIS);
      for (const l of coord.slice(1)) {
        const t = lignes(l, largeurCoord);
        doc.text(t, xd, yc, { align: 'right' });
        yc += hauteur(t.length, 8);
      }
      basLogo = yc - 6;
    }
    y += 30;
    police(14, 'bold'); couleur([0, 0, 0]);
    doc.text(lignes(chantier.nom || 'Chantier', largeurEntete), mL, y + 12);
    y += 20;
    const infos = [];
    if (chantier.adresse) infos.push(chantier.adresse.replace(/\n/g, ', '));
    if (destinataire && destinataire.nom) infos.push("À l'attention de : " + destinataire.nom);
    infos.push('Situation au ' + longue(quand));
    if (perimetre) infos.push('Périmètre : ' + perimetre);
    police(10.5); couleur(GRIS);
    for (const info of infos) {
      const l = lignes(info, largeurEntete);
      doc.text(l, mL, y + 9);
      y += hauteur(l.length, 10.5) + 2;
    }
    y = Math.max(y, basLogo) + 12;

    // ── Synthèse ──
    police(11, 'bold');
    const tSynth = lignes(R.synthese(ouverts, entreprise), utile - 24);
    const hSynth = hauteur(tSynth.length, 11) + 16;
    doc.setFillColor(242, 242, 242);
    doc.rect(mL, y, utile, hSynth, 'F');
    couleur([0, 0, 0]);
    doc.text(tSynth, mL + 12, y + 8 + 10);
    y += hSynth + 16;

    // ── Sections ──
    if (bloques.length) {
      bandeau("En attente — autre corps d'état ou matériel (" + bloques.length + ')', ORANGE);
      bloques.forEach((p) => ligne(p, ORANGE, false)); y += 8;
    }
    if (nous.length) {
      bandeau('Restant à la charge ' + R.de(entreprise) + ' (' + nous.length + ')', BLEU);
      nous.forEach((p) => ligne(p, BLEU, false)); y += 8;
    }
    if (regles.length) {
      bandeau('Points réglés (' + regles.length + ')', VERT);
      regles.forEach((p) => ligne(p, VERT, true)); y += 8;
    }

    // ── Mention de clôture ──
    let mention = 'Constat établi le ' + R.dateCourte(quand) + ' par ' + entreprise + '.';
    if (bloques.length) mention += ' Les points en attente seront traités dès que leur support sera prêt ou le matériel livré.';
    police(9.5, 'italic');
    const tMention = lignes(mention, utile);
    placer(hauteur(tMention.length, 9.5) + 6);
    couleur(GRIS);
    doc.text(tMention, mL, y + 8);
    y += hauteur(tMention.length, 9.5) + 6;

    piedDePage();
    return doc.output('blob');
  }

  function nomFichier(chantier, date) {
    const n = (chantier.nom || 'chantier').replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_-]/gu, '') || 'chantier';
    const d = date || new Date();
    const iso = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return 'Points_en_suspens_' + n + '_' + iso + '.pdf';
  }

  racine.DocumentPDF = { fabriquer, nomFichier, reduire };
})(window);
