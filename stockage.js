/* Stockage sur le téléphone (IndexedDB) : rien ne quitte l'appareil.
 * - magasin « kv »     : réglages, chantiers, choix de l'écran (une entrée « etat »)
 * - magasin « points » : un enregistrement par point, photo comprise
 * IndexedDB plutôt que localStorage : les photos dépasseraient vite ses ~5 Mo.
 */
(function (racine) {
  'use strict';
  const NOM = 'reste-a-faire', VERSION = 1;
  let base = null;

  function ouvrir() {
    if (base) return Promise.resolve(base);
    return new Promise((ok, ko) => {
      const r = indexedDB.open(NOM, VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('points')) db.createObjectStore('points', { keyPath: 'id' });
      };
      r.onsuccess = () => { base = r.result; ok(base); };
      r.onerror = () => ko(r.error);
    });
  }

  function tx(magasin, mode, action) {
    return ouvrir().then((db) => new Promise((ok, ko) => {
      const t = db.transaction(magasin, mode);
      const s = t.objectStore(magasin);
      let resultat;
      const req = action(s);
      if (req) req.onsuccess = () => { resultat = req.result; };
      t.oncomplete = () => ok(resultat);
      t.onerror = () => ko(t.error);
      t.onabort = () => ko(t.error || new Error('Enregistrement interrompu (mémoire du téléphone pleine ?)'));
    }));
  }

  const Stockage = {
    lireEtat: () => tx('kv', 'readonly', (s) => s.get('etat')),
    ecrireEtat: (etat) => tx('kv', 'readwrite', (s) => s.put(etat, 'etat')),
    lirePoints: () => tx('points', 'readonly', (s) => s.getAll()),
    ecrirePoint: (p) => tx('points', 'readwrite', (s) => s.put(p)),
    supprimerPoint: (id) => tx('points', 'readwrite', (s) => s.delete(id)),
    /** Remplace TOUS les points (restauration d'une sauvegarde). */
    remplacerPoints: (points) => tx('points', 'readwrite', (s) => { s.clear(); points.forEach((p) => s.put(p)); }),
    /** Demande au navigateur de ne pas effacer ces données quand la place manque. */
    persister: () => (navigator.storage && navigator.storage.persist ? navigator.storage.persist() : Promise.resolve(false)),
  };
  racine.Stockage = Stockage;
})(window);
