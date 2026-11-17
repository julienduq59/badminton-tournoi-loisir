# Tournoi de badminton loisir

Site pour organiser les matchs d'un tournoi de badminton loisir.

Adresse du site : https://julienduq59.github.io/badminton-tournoi-loisir/

## Ce que fait le site

- Réglages du tournoi, tous modifiables : nombre d'équipes, matchs par équipe (ou tous contre tous), sets par match, points par set avec ou sans 2 points d'écart et score maximum, nombre de terrains. Exemple de départ : 15 équipes, 7 terrains, 1 set de 15 points avec 2 points d'écart.
- Déroulement : une seule poule (tous contre tous ou un nombre de matchs par équipe) ou plusieurs poules, puis phase finale à élimination directe en option (finale, demi-finales, quarts…, avec match pour la 3e place et format de match propre). Les meilleures têtes de série passent directement au tour suivant quand le nombre de qualifiés n'est pas une puissance de 2, et deux équipes d'une même poule ne se croisent pas au premier tour quand c'est possible.
- Catégories : simple, double et mixte, avec le nombre de matchs que joue chaque équipe dans chaque catégorie, et une case pour compter le mixte comme un double. La catégorie s'affiche sur chaque match (terrains, écran, téléphones).
- Création des matchs : chaque équipe joue le même nombre de matchs (dans sa poule), avec le plus de repos possible entre deux matchs. Les numéros des matchs suivent l'ordre réel des appels.
- Appel automatique du match suivant dès qu'un terrain se libère, report d'un match en fin de liste.
- Scores : les joueurs envoient le score de leur match depuis leur téléphone, un organisateur le valide, le corrige ou le refuse. Les organisateurs peuvent aussi saisir les scores eux-mêmes. Option pour valider tout seul quand les deux équipes envoient le même score.
- Écran d'affichage pour la salle (télé ou vidéoprojecteur) : matchs en cours sur chaque terrain, prochain match, matchs suivants, QR code, puis podium et classement final.
- Page des équipes, ouverte avec le QR code, en quatre onglets. « Mon équipe » : match en cours dans la salle, prochain match et son numéro, terrain, envoi du score, matchs joués et restants. « Classement » : classement en direct (poules, phase finale, classement final). « Récap » : une image à télécharger ou partager avec le bilan de l'équipe (place, victoires, points, plus belle victoire, match le plus serré, temps de jeu…) et le tournoi en chiffres. « Partager » : le QR code du tournoi (ou celui de l'équipe, pour un partenaire) à montrer à un autre joueur, avec l'envoi et la copie du lien.
- Plusieurs organisateurs : le lien organisateur (onglet QR code) permet de gérer le tournoi depuis un autre téléphone.
- Classement au nombre de victoires. Entre deux équipes à égalité, leur match les départage, puis la différence de sets, puis la différence de points. Impression et téléchargement (Excel) du classement et de tous les matchs.
- Pendant le tournoi : temps écoulé ou restant sur chaque terrain (durée maximum d'un match en option), heure de fin estimée, heure de passage estimée pour chaque équipe, match mis en priorité, forfait sur un match, abandon d'une équipe, filtre des matchs par équipe.
- Alertes : l'écran de la salle met en avant chaque nouveau match appelé et peut sonner ; le téléphone d'un joueur sonne et vibre quand le match de son équipe est appelé (page ouverte).
- Message de l'organisateur affiché sur l'écran de la salle et les téléphones, pause des appels automatiques.
- Repos minimum entre deux matchs d'une équipe (option) : un terrain peut attendre quelques minutes, l'écran affiche « reprise dans 3 min ».
- Secours : feuille de matchs à imprimer (onglet Matchs), sauvegarde du tournoi dans un fichier (Réglages) et restauration depuis l'accueil.
- Fiche imprimable avec un QR code par équipe, écran qui alterne terrains et classement (`?vue=alterne`).
- « Recommencer » sur l'accueil crée un nouveau tournoi avec les mêmes équipes et réglages. Le site peut s'ajouter à l'écran d'accueil du téléphone.

## Base en ligne (Firebase)

La base en ligne est active (projet Firebase `badminton-tournoi-b3ae1`, offre gratuite). Sans elle (`assets/config.js` à null), le tournoi reste dans le navigateur de l'organisateur et les téléphones des joueurs ne le voient pas. Pour la recréer dans un autre projet :

1. Créer un projet sur https://console.firebase.google.com (Google Analytics n'est pas utile).
2. Créer une Realtime Database (emplacement Belgique, `europe-west1`, en mode verrouillé), puis coller le contenu de `database.rules.json` dans l'onglet Règles et publier.
3. Dans Authentication, activer la connexion « Anonyme ».
4. Dans les paramètres du projet, ajouter une application Web et recopier sa configuration dans `assets/config.js`.

Les valeurs de configuration ne sont pas secrètes. La sécurité vient des règles : tout le monde peut lire un tournoi, les joueurs peuvent seulement envoyer un score, et seuls les organisateurs (qui ont la clé du tournoi) peuvent le modifier.

## Fichiers

- `index.html` : liste des tournois et création
- `tournoi.html` : gestion du tournoi (terrains, scores envoyés, matchs, classement, réglages, QR code)
- `ecran.html` : écran d'affichage pour la salle (`?vue=terrains`, `?vue=suite`, `?vue=classement` ou `?vue=alterne`)
- `equipe.html` : page des équipes ouverte avec le QR code
- `assets/commun.js` : logique commune (calendrier, appel des matchs, scores, classement)
- `assets/donnees.js` : stockage, dans le navigateur ou dans la base Firebase
- `assets/config.js` : configuration de la base Firebase
- `database.rules.json` : règles de sécurité de la base
- `assets/recap.js` : dessin de l'image du récap (canvas 1080 × 1920)
- `assets/vendor/qrcode.js` : génération des QR codes (bibliothèque qrcode-generator de Kazuhiko Arase, licence MIT)
