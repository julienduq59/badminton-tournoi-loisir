# Tournoi de badminton loisir

Site statique (HTML, CSS, JavaScript sans compilation) publié par GitHub Pages depuis la
branche `main` : https://julienduq59.github.io/badminton-tournoi-loisir/
Projet de Julien Duquesne, avec Grégoire en collaborateur.

## Langue

Toujours répondre en français : messages, questions, réflexion affichée, descriptions des
commandes, commits et textes du site.

## Fonctionnement

- `assets/commun.js` contient la logique, sans dépendance au DOM (testable avec Node) :
  calendrier (`paires`, `ordonner`, `genererMatchs`), appel des matchs (`choisir`,
  `remplirTerrains`, `prochains`), scores (`verifierScore`, `enregistrerScore`, `lireSaisie`),
  classement (`classement`) et remise en forme des données lues en ligne (`normaliser`).
- `prochains()` / `planifier()` simulent l'appel automatique avec la même règle que
  `remplirTerrains()` : l'ordre affiché « à suivre » doit rester identique à l'ordre réel des appels.
  Règle d'appel (`choisir`) : match prioritaire, puis équipes qui ne sortent pas du terrain, puis
  équipes qui ont le moins joué, puis ordre de la file.
- Heures estimées : `dureeMatch()` (médiane des 12 derniers matchs, sinon la durée maximum réglée),
  `planifier(t, durée)` et `finEstimee()`. Rien n'est affiché tant qu'aucune durée n'est connue.
- Forfaits : `enregistrerForfait()` (un match, champ `forfait` = équipe perdante) et
  `abandonEquipe()` / `annulerAbandon()` (champ `abandon` sur l'équipe). Un forfait seul ne lance
  pas le tournoi (`demarre()`).
- Classement : victoires, puis confrontation directe si exactement deux équipes sont à égalité,
  puis différence de sets, puis différence de points.
- `assets/donnees.js` (`BT.Donnees`) cache le stockage : mode local (localStorage) quand
  `assets/config.js` vaut null, mode en ligne (Firebase Realtime Database, SDK compat chargé
  depuis gstatic) quand la configuration est remplie. Toute modification du tournoi passe par
  `Donnees.modifier(id, fn)` (transaction en ligne) : `fn` reçoit la version la plus récente.
- Données en ligne : `tournois/<id>/donnees` (le tournoi), `tournois/<id>/propositions/<match>/<équipe>`
  (scores envoyés par les joueurs, rangés dans l'ordre du match), `tournois/<id>/admins/<uid>`.
  Un appareil devient organisateur en prouvant la clé du tournoi (`cles/<id>`, illisible) via
  `preuves/<id>/<uid>` ; la clé circule dans le lien organisateur `tournoi.html?t=<id>#cle=<clé>`.
  Connexion anonyme Firebase pour tous les appareils qui écrivent.
- Règles de sécurité : `database.rules.json` (à recopier dans la console Firebase à chaque changement).
- Base en ligne active depuis le 17/11/2026 : projet Firebase `badminton-tournoi-b3ae1` (compte Google
  de Julien, offre gratuite Spark, limite de 100 appareils connectés en même temps), Realtime Database
  en Belgique (`europe-west1`), connexion anonyme activée avec nettoyage automatique à 30 jours.
  Seul Julien a accès à la console Firebase : les changements de règles passent par lui.

## Tests

- Logique : script Node qui charge `assets/commun.js` et joue des tournois complets.
- Pages : Playwright (Chromium) sur un serveur local, en mode local puis en mode en ligne avec
  l'émulateur Firebase (`firebase emulators:start --only auth,database --project demo-badminton`
  avec `database.rules.json`, lancé sans variables de proxy ; config de test injectée en
  interceptant `assets/config.js`, SDK servi depuis le paquet npm `firebase@10.12.2`).
  Vérifier : envoi de score par un téléphone, validation par un deuxième organisateur,
  saisies simultanées, refus des écritures d'un joueur.

## Conventions

- Les pages chargent les fichiers de `assets/` avec `?v=AAAAMMJJ` (suffixe `-2`, `-3`… s'il y a
  plusieurs versions le même jour). À chaque modification, mettre à jour la date dans toutes
  les pages, sinon les navigateurs gardent l'ancienne version en cache.
- Textes du site : tutoiement, pas de point d'exclamation, pas de tiret long.
- Tester un tournoi complet avant chaque envoi : création, lancement, scores envoyés par les
  téléphones et validés, saisie de tous les scores, écran d'affichage, page des équipes.
