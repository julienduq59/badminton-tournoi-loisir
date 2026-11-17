# Tournoi de badminton loisir

Site pour organiser les matchs d'un tournoi de badminton loisir.

Adresse du site : https://julienduq59.github.io/badminton-tournoi-loisir/

## Ce que fait le site

- Réglages du tournoi : nombre d'équipes, matchs par équipe (ou tous contre tous), sets par match, points par set avec ou sans 2 points d'écart, nombre de terrains disponibles.
- Création des matchs : chaque équipe joue le même nombre de matchs, avec le plus de repos possible entre deux matchs.
- Appel automatique du match suivant dès qu'un terrain se libère, saisie des scores, report d'un match en fin de liste.
- Écran d'affichage pour la salle (télé ou vidéoprojecteur) : matchs en cours sur chaque terrain, prochain match, matchs suivants, QR code, puis podium et classement final.
- Page des équipes, ouverte avec le QR code : prochain match et numéro du terrain, matchs joués avec les scores, matchs restants, classement.
- Classement au nombre de victoires, puis à la différence de sets, puis à la différence de points.

## Limite actuelle

Les tournois sont enregistrés dans le navigateur de l'organisateur. L'écran d'affichage marche sur le même ordinateur (deuxième fenêtre envoyée sur la télé). Pour suivre son équipe sur son téléphone avec le QR code, il faut encore ajouter une synchronisation en ligne.

## Fichiers

- `index.html` : liste des tournois et création
- `tournoi.html` : gestion du tournoi (terrains, matchs, classement, réglages, QR code)
- `ecran.html` : écran d'affichage pour la salle (`?vue=terrains` ou `?vue=suite` pour n'afficher qu'une partie)
- `equipe.html` : page des équipes ouverte avec le QR code
- `assets/commun.js` : logique commune (calendrier, appel des matchs, scores, classement, stockage)
- `assets/vendor/qrcode.js` : génération des QR codes (bibliothèque qrcode-generator de Kazuhiko Arase, licence MIT)
