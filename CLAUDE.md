# Tournoi de badminton loisir

Site statique (HTML, CSS, JavaScript sans compilation) publié par GitHub Pages depuis la
branche `main` : https://julienduq59.github.io/badminton-tournoi-loisir/
Projet de Julien Duquesne, avec Grégoire en collaborateur.

## Langue

Toujours répondre en français : messages, questions, réflexion affichée, descriptions des
commandes, commits et textes du site.

## Fonctionnement

- `assets/commun.js` contient toute la logique, sans dépendance au DOM (testable avec Node) :
  calendrier (`paires`, `ordonner`, `genererMatchs`), appel des matchs (`choisir`,
  `remplirTerrains`, `prochains`), scores (`verifierScore`, `enregistrerScore`),
  classement (`classement`) et stockage (`Store`).
- `prochains()` simule l'appel automatique avec la même règle que `remplirTerrains()` :
  l'ordre affiché « à suivre » doit rester identique à l'ordre réel des appels.
- Données : un objet JSON par tournoi dans le `localStorage` (`badminton:t:<id>`), liste dans
  `badminton:tournois`. Les autres onglets se mettent à jour avec l'événement `storage`.
- Pas encore de synchronisation en ligne : le QR code mène à `equipe.html`, qui ne trouve
  le tournoi que sur l'appareil de l'organisateur. C'est la prochaine étape.

## Conventions

- Les pages chargent les fichiers de `assets/` avec `?v=AAAAMMJJ` (suffixe `-2`, `-3`… s'il y a
  plusieurs versions le même jour). À chaque modification, mettre à jour la date dans toutes
  les pages, sinon les navigateurs gardent l'ancienne version en cache.
- Textes du site : tutoiement, pas de point d'exclamation, pas de tiret long.
- Tester un tournoi complet dans Chromium (Playwright) avant chaque envoi : création,
  lancement, saisie de tous les scores, écran d'affichage, page des équipes.
