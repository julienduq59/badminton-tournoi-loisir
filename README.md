# Tournoi de badminton loisir

Site pour organiser les matchs d'un tournoi de badminton loisir.

Adresse du site : https://julienduq59.github.io/badminton-tournoi-loisir/

## Ce que fait le site

- Réglages du tournoi, tous modifiables : nombre d'équipes, matchs par équipe (ou tous contre tous), sets par match, points par set avec ou sans 2 points d'écart et score maximum, nombre de terrains. Exemple de départ : 15 équipes, 7 terrains, 1 set de 15 points avec 2 points d'écart.
- Création des matchs : chaque équipe joue le même nombre de matchs, avec le plus de repos possible entre deux matchs.
- Appel automatique du match suivant dès qu'un terrain se libère, report d'un match en fin de liste.
- Scores : les joueurs envoient le score de leur match depuis leur téléphone, un organisateur le valide, le corrige ou le refuse. Les organisateurs peuvent aussi saisir les scores eux-mêmes. Option pour valider tout seul quand les deux équipes envoient le même score.
- Écran d'affichage pour la salle (télé ou vidéoprojecteur) : matchs en cours sur chaque terrain, prochain match, matchs suivants, QR code, puis podium et classement final.
- Page des équipes, ouverte avec le QR code : prochain match et numéro du terrain, envoi du score, matchs joués avec les scores, matchs restants, classement.
- Plusieurs organisateurs : le lien organisateur (onglet QR code) permet de gérer le tournoi depuis un autre téléphone.
- Classement au nombre de victoires, puis à la différence de sets, puis à la différence de points.

## Base en ligne (Firebase)

Sans base en ligne, le tournoi reste dans le navigateur de l'organisateur et les téléphones des joueurs ne le voient pas. Pour l'activer :

1. Créer un projet sur https://console.firebase.google.com (Google Analytics n'est pas utile).
2. Créer une Realtime Database (emplacement Belgique, `europe-west1`, en mode verrouillé), puis coller le contenu de `database.rules.json` dans l'onglet Règles et publier.
3. Dans Authentication, activer la connexion « Anonyme ».
4. Dans les paramètres du projet, ajouter une application Web et recopier sa configuration dans `assets/config.js`.

Les valeurs de configuration ne sont pas secrètes. La sécurité vient des règles : tout le monde peut lire un tournoi, les joueurs peuvent seulement envoyer un score, et seuls les organisateurs (qui ont la clé du tournoi) peuvent le modifier.

## Fichiers

- `index.html` : liste des tournois et création
- `tournoi.html` : gestion du tournoi (terrains, scores envoyés, matchs, classement, réglages, QR code)
- `ecran.html` : écran d'affichage pour la salle (`?vue=terrains` ou `?vue=suite` pour n'afficher qu'une partie)
- `equipe.html` : page des équipes ouverte avec le QR code
- `assets/commun.js` : logique commune (calendrier, appel des matchs, scores, classement)
- `assets/donnees.js` : stockage, dans le navigateur ou dans la base Firebase
- `assets/config.js` : configuration de la base Firebase
- `database.rules.json` : règles de sécurité de la base
- `assets/vendor/qrcode.js` : génération des QR codes (bibliothèque qrcode-generator de Kazuhiko Arase, licence MIT)
