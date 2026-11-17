# Reste à faire

Petite application web (installable sur Android : Chrome → « Ajouter à l'écran d'accueil ») pour
noter sur un chantier ce qui reste à faire — bâtiment, étage, précision, texte dicté, qui doit agir,
photo — et l'envoyer en PDF.

- **Tout reste sur le téléphone** (IndexedDB) : aucun serveur, aucun compte. Fonctionne sans réseau.
- L'entreprise (nom, logo, adresse) et les personnes à qui envoyer se chargent depuis un **fichier
  de réglages** transmis à part — ce dépôt n'en contient aucun.
- Sauvegarde / restauration dans Réglages : les points n'existent que sur le téléphone.

## Développement

- `regles.js` : règles pures, testées — `node --test tests/regles.test.js`
- `document.js` : le PDF (jsPDF) · `stockage.js` : IndexedDB · `app.js` : l'écran
- `lib/` : jsPDF 2.5.1 et pdf.js 3.11.174 (copies de cdnjs, pour fonctionner hors réseau)
- `sw.js` : changer `VERSION` à chaque mise en ligne.
