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
  Règle d'appel (`choisir`) : match prioritaire, puis match non reporté, puis équipes qui ne sortent
  pas du terrain (`sortiesDuTerrain` quand l'appel ne les donne pas, même règle dans `planifier`), puis
  équipes qui ont le moins joué, puis ordre de la file. Les équipes d'un match prioritaire en attente
  sont gardées pour lui (`equipesReservees`, `bloqueParPriorite`, aussi dans `planifier` et
  `attenteRepos`) : il part dès que ses deux équipes sont libres (sinon l'une rejouait ailleurs pendant
  que l'autre finissait, et il n'était jamais appelé). Poser ou retirer une priorité relance l'appel ;
  la liste dit quelle équipe « joue encore », un terrain libre affiche « En attente du match prioritaire ».
  Mettre en priorité un match reporté efface son report (`prioriser`). `prochains()` et les numéros prévus utilisent
  `planifier(t, dureeMatch(t))` (repos compris). Un match reporté (`reporte`) ne revient qu'à la fin
  d'un match : `planifier` l'écarte au départ et après un repos, la minuterie de repos l'exclut.
  Bouton « Appeler le match suivant » : même choix que l'appel automatique, repos compris (« Jouer »
  force un match). En appel manuel, la liste suppose qu'un terrain libre est rempli tout de suite.
  L'appel repart aussi après un score ou un forfait saisi sur un match en attente et après le report
  d'un match en attente (tournoi commencé), pour qu'aucun terrain ne reste vide (équipes d'un match
  prioritaire libérées). Avec un repos minimum, la minuterie compte aussi les matchs reportés quand plus
  rien n'est en cours (sinon le dernier match reporté n'était jamais rappelé). Si l'organisateur reporte le
  dernier match en cours sans autre match possible, le terrain libre affiche « Match reporté : appelle-le
  quand ses équipes sont prêtes ».
- Numéros des matchs : un match reçoit son numéro quand il est appelé (`lancer`) ou terminé sans
  appel (`numeroter`), donc les numéros suivent l'ordre réel des appels (1, 2, 3…). Un match en
  attente affiche un numéro prévu (`numero(t, m)`, calculé avec `planifier`). Retour en attente
  (report, résultat effacé) : le numéro est retiré et redonné au prochain appel. Un forfait sur un
  match jamais appelé (forfait, abandon) ne prend pas de numéro. Toujours afficher
  `BT.numero(t, m)`, jamais `m.numero`. La page des équipes montre le dernier numéro appelé
  (`numeroActuel`) et le numéro du prochain match de l'équipe.
- Heures estimées : `dureeMatch()` (médiane des 12 derniers matchs, sinon `dureeReglee`),
  `planifier(t, durée)` et `finEstimee()`. Avant le lancement, pas d'heure sans heure de début à venir.
- Forfaits : `enregistrerForfait()` (un match, champ `forfait` = équipe perdante, passe par
  `enregistrerScore(t, m, sets, perdant)` ; un forfait ne pointe pas l'équipe) et `abandonEquipe()` /
  `annulerAbandon()` (champ `abandon` sur l'équipe = heure de l'abandon, `true` dans les très anciens
  tournois ; les forfaits posés par l'abandon portent `forfaitAbandon` et seuls ceux-là sont rouverts
  (`matchsAbandon`) ; un match contre une équipe toujours partie reste perdu par forfait à son nom ;
  annulation refusée quand la suite du tableau d'un de ces matchs a commencé, `abandonAnnulable`).
  `effacerResultat` refuse un match d'une équipe partie. `genererMatchs` efface les abandons. Un forfait
  seul ne lance pas le tournoi (`demarre()`).
- Classement : victoires, puis confrontation directe si exactement deux équipes sont à égalité,
  puis différence de sets, puis différence de points. `classement(t, poule)` ne compte jamais les
  matchs de phase finale. « Qualifiée » / « Q » d'après `qualifies(t)` (une équipe partie ne l'est pas).
  Podium (`podiumHtml`) : les équipes à égalité sont sur la même marche (deux 3e sans petite finale).
- Catégories : `reglages.cat = { simple, double, mixte }` avec `{ k, max, tous }` : au moins `k` matchs
  par équipe dans la catégorie, au plus `max` (0 ou absent = `k`), ou contre toutes les autres (ou toute
  sa poule). Le site prévoit `k` pour chaque équipe ; avec un nombre impair d'équipes et `k` impair,
  une seule équipe joue `k + 1` (`unMatchDePlus`, `paires(n, k, plus)`, pas la même équipe d'une
  catégorie à l'autre), ce qui demande `max >= k + 1` (`verifierMaximum`). Dans les réglages, le
  maximum suit le minimum tant qu'il n'est pas choisi à la main (`maxManuel` dans le brouillon).
  `mixteEgalDouble` (case « mixte compté comme double ») ignore la catégorie mixte.
  `categoriesJouees(r)`, champ `categorie` sur chaque match, `categorieMatch(t, m)` pour l'afficher.
  Les catégories utilisent les mêmes séries d'adversaires et sont alternées au prorata par
  `ordonner`. Phase finale jouée dans `finaleCategorie`. Les anciens tournois sans `cat` sont
  convertis par `normaliser` (tout en double). Une équipe ne joue qu'un match à la fois.
- Poules (`reglages.format = 'poules'`) : répartition en serpentin (`repartirPoules`), champ `poule`
  sur les équipes et les matchs, tous contre tous dans chaque poule.
- Gagnants contre gagnants (`reglages.format = 'suisse'`, système suisse demandé par Julien) : réglages
  `matchsSuisse` (matchs par équipe, au plus n - 1), `ecartSuisse` (écart de victoires accepté, 1 par
  défaut : avec 0, les terrains restent vides faute d'adversaire environ 7 % du temps, 3 % avec 1) et
  `categorieSuisse`. Pas de tours : `genererMatchs` crée les premiers matchs dans l'ordre de la liste,
  puis `apparierSuisse(t)` crée les suivants au fil des résultats (appelée par `remplirTerrains`,
  `enregistrerScore`, `effacerResultat`, `abandonEquipe`, `annulerAbandon`, `apresPointage` et
  l'enregistrement des réglages). Une équipe libre (ni sur un terrain ni dans un match à jouer, pointée,
  moins de `matchsSuisse` matchs créés) rencontre une équipe libre au même nombre de victoires (nul =
  moitié), sinon dans l'écart accepté, jamais une équipe déjà rencontrée (`meilleurePaire` : plus petit
  écart, puis l'équipe qui a le moins joué, puis celle qui attend depuis le plus longtemps). Garde de
  fin de tournoi : pas de paire qui priverait une équipe en retard de ses derniers adversaires possibles.
  Plus rien en cours ni appelable : les plus proches jouent quand même (`plusProches`, une revanche
  plutôt qu'un match en plus ; pas de revanche tant que des équipes ne sont pas arrivées). À la fin, une
  seule équipe incomplète joue une équipe qui a fini (match en plus, si n × matchs est impair). Pointage :
  `reorganiserArrivees` fait jouer ensemble les équipes arrivées (matchs encore modifiables :
  `apparieModifiable`, jamais appelés ni forcés, prioritaires ou reportés). Correction qui change le
  vainqueur, effacement, abandon : `defaireAppariements` retire les matchs modifiables de ces équipes
  (au moins un match reste toujours). Matchs suisses : `victoires` (bilans à la création, étiquette
  « Équipes à 2 victoires »), `force` (« Lancer quand même » : `paireForcee`, `forcerMatchSuisse`, carte
  « En attente d'un adversaire » et terrain libre de l'onglet Terrains, « (déjà rencontrées) » pour une
  revanche). `matchsSuisseRestants`, `suisseFini` (dans `statut` et `phasePoulesFinie`), `nbMatchsPrevus`
  (progression), `dureeSuisseRestante` (estimations), `matchsSuisseAVenir` (téléphone : « Adversaire
  bientôt choisi »). Phase finale possible ensuite, comme le championnat.
- Choisir un match (demandé par Julien : obliger le site à faire le match voulu) : bouton de la barre
  d'outils de l'onglet Terrains et de la carte « En attente d'un adversaire », fenêtre créée par
  `ouvrirChoixMatch` (deux équipes, catégorie si plusieurs sont jouées). `infosMatchImpose(t, a, b)` dit
  ce que le match change (match déjà prévu, équipe sur un terrain ou pas pointée, déjà rencontrées,
  match en plus, hors programme, autres matchs suisses retirés) ; `imposerMatch(t, a, b, { terrain,
  categorie })` reprend le match prévu entre elles (`matchPrevuEntre`) ou en crée un : en système suisse
  match `force` qui compte dans leurs matchs (leurs matchs modifiables sont défaits), sinon match
  `ajoute` hors programme (« Match ajouté », compte au classement s'ils sont dans la même poule). Il part
  tout de suite sur le terrain libre donné (« Lancer maintenant sur le terrain N », même en pause), sinon
  il passe en priorité. Pas pendant la phase finale.
- Phase finale : `t.finale = { taille, places }` (places dans l'ordre du tableau, '' = case vide /
  exempt), matchs avec `phase: 'finale'`, `tour`, `slot`, `petite` (3e place). `avancerTableau()`
  crée ou corrige les matchs suivants à chaque résultat (un match pas terminé suit toujours le
  tableau, mais un match commencé n'est jamais modifié ni supprimé). `suiteCommencee(t, m)` bloque
  l'effacement ou le changement de vainqueur quand le match suivant du tableau a commencé.
  `classementFinal()` donne les places finales, `formatMatch()` le format propre à la phase finale.
  Un match de phase finale doit avoir un vainqueur : `verifierFormatFinale` refuse un nombre pair de
  sets, ou une durée maximum sans format propre. Petite finale seulement avec 4 qualifiés ou plus.
- Page des équipes : onglets « Mon équipe », « Classement » (en direct), « Récap » et « Partager »
  (adresse `#classement` / `#recap` / `#partager`). « Partager » montre le QR code du tournoi, ou celui de
  l'équipe (`&e=`) pour un partenaire, avec envoi du lien (Web Share) et copie ; la vue n'est pas redessinée
  à chaque mise à jour du tournoi. Le récap est une image dessinée sur canvas par `assets/recap.js`
  (`BT.dessinerRecap(t, equipeId)`, récap du tournoi sans équipe) à partir de `statsEquipe`,
  `statsTournoi` et `placeEquipe` (commun.js) ; elle n'est recréée que sur demande.
- Repos minimum (`reglages.reposMin`, minutes) : `remplirTerrains` n'appelle pas un match dont une
  équipe a fini il y a moins longtemps (sauf « Jouer » sur un match précis), `planifier` en tient
  compte si la durée des matchs est connue, `attenteRepos(t)` donne l'attente. La page de gestion
  relance l'appel toutes les 15 s quand le repos est fini (transaction, sans doublon).
- Heures à la française : `BT.heure(ts)` écrit « 19h05 » partout (pages, écran, récap), `texteHeure('19:00')`
  donne « 19h00 ». Les champs d'heure des réglages sont des champs texte (le champ heure du navigateur
  s'affiche en « 07:00 PM » selon sa langue) : `lireHeure` accepte « 19h00 », « 19h », « 19 h 30 »,
  « 19:00 », « 1900 » ou « 19 », réécrit l'heure en « 19h00 » en quittant le champ, sinon champ en rouge.
- Horaires : `reglages.heureDebut` / `heureFin` (« HH:MM », fin de la salle) et `dureePrevue` (minutes).
  `dureeMatch()` prend la médiane réelle, sinon `dureeReglee(r)` : la durée prévue, sinon
  `dureeSelonFormat(r)` (environ 25 s par point joué, perdant à deux tiers des points du gagnant,
  1 min d'installation, plafonné à la durée maximum ; `dureeFinale` pour un format de phase finale).
  `dureeEstimee(t, D)` simule tout le tournoi (phase finale comprise, durée mise à l'échelle de son
  format), `depassementSalle()` compare à `heureFinSalle()` (première heure de fin après le premier
  match lancé, sinon après l'heure de début). Avant le lancement, `planifier` part de l'heure de début si elle est à venir.
  La durée prévue ne dépasse pas la durée maximum. Dépassement de la salle : `solutionsHoraires(t)`
  calcule des changements qui font finir au moins 10 minutes avant (moins de points, un seul set, durée
  maximum avec phase finale sans limite de temps, moins de matchs par dichotomie, une poule de plus,
  terrains, repos, sinon un format court avec moins de matchs), affichés dans les Réglages avec
  « Appliquer » (`appliquerSolution` remplit le formulaire) et signalés par « Voir les solutions » sur la
  carte « Tout est prêt ». Calcul mis en cache par état des réglages (`solutionsPour`).
- Terrains fermés : `t.fermes` (numéros), `fermerTerrain` / `ouvrirTerrain`, exclus de `terrainsLibres`,
  `planifier` et `finEstimee` comptent `nbTerrainsOuverts(t)`. Un match en cours finit sur un terrain fermé.
- Règles du tournoi : `reglesTournoi(t)` les écrit à partir des réglages seuls (rien d'autre que ce que
  le site applique ; nuls d'après `nulsReglages(r)`, pas d'après les résultats), plus
  `reglages.reglesPerso` (texte des organisateurs). Organisateur : onglet « Règles »
  (`#regles`), affiché juste après la création des matchs, imprimable. Téléphone : vue `#regles`, montrée
  à l'ouverture tant que ce téléphone n'a pas lu la version actuelle (`empreinteRegles`, clé locale
  `badminton:regles:<id>`), bouton « Règles » dans la barre.
- Mots de passe organisateurs (mode en ligne) : un par organisateur, `t.acces = { <id>: { nom, sel, iv, chiffre } }`
  (ancien format `{ sel, iv, chiffre }` encore lu par `listeAcces`) ; chacun chiffre la même clé
  organisateur (PBKDF2 200 000 tours puis AES-GCM, `chiffrerCle`, `poserAcces` remplace à nom égal,
  `retirerAcces`, `ouvrirAcces` essaie chaque mot de passe). Au moins 3 caractères, sans tenir compte des
  majuscules. Jamais écrits dans le dépôt (public). Gérés dans l'onglet QR code ; saisis sur `tournoi.html`
  par un appareil non organisateur (lien « Accès organisateur » en bas de la page des équipes). Aucune
  règle Firebase à changer. Retirés à la restauration d'une sauvegarde (nouvelle clé). Option « mes
  prochains tournois » : liste `[{ nom, mdp }]` retenue sur l'appareil (`badminton:mdp-defaut`) et posée
  sur chaque tournoi qu'il crée (`appliquerMotDePasseRetenu` : création, Recommencer, restauration).
- Sauvegarde : fichier JSON `{ format: 'badminton-tournoi-loisir', version, date, tournoi }`
  (Réglages), restauré depuis l'accueil comme un nouveau tournoi (nouvel identifiant).
- Préavis sur le téléphone : quand le match de l'équipe est le premier de l'ordre prévu (`prochains(t)[0]`,
  tournoi en cours, équipe pas sur un terrain), bandeau « Prépare-toi, ton match est le prochain appelé »
  et, avec l'alerte activée, un bip et une vibration courte, une seule fois par match (`dernierPreavis`) ;
  puis l'alerte d'appel habituelle (deux bips, vibration longue).
- Page des équipes : bandeau rouge « va voir l'organisation » quand l'équipe a abandonné ou que son
  dernier match est perdu par forfait (tant qu'elle n'est pas sur un terrain). Pendant la frappe d'un score, les mises à jour en direct attendent que le champ
  soit quitté (`rendreEnDirect`). Avec l'alerte d'appel, l'écran reste allumé (Wake Lock). Sans réseau
  au chargement, la page et l'écran réessaient toutes les 15 s.
- Connexions : `Donnees.economiserConnexion()` (page des équipes et écran) coupe la connexion Firebase
  après une minute de page cachée (`goOffline`) et la rétablit au retour (`goOnline`), pour rester sous
  la limite de 100 appareils connectés. Pas sur la page de gestion.
- Table de marque (onglet Terrains) : « Son à la table de marque » (clé locale `badminton:son-orga`, un bip à
  chaque nouvel envoi de score par un téléphone et à chaque équipe pointée depuis son téléphone ; un clic
  le réactive après un rechargement), « Tout pointer » dans la carte d'arrivée. Dès que les matchs sont
  créés et jusqu'à la fin (`statut` prêt ou en cours, pointage compris), la page de gestion garde l'écran
  allumé (Wake Lock, `garderEcranAllume`, pastille « Écran gardé allumé »). Écran allumé aussi sur
  l'écran de la salle (toujours) et sur les téléphones avec l'alerte d'appel ; le verrou est redemandé
  quand l'appareil le relâche et au clic suivant.
- Page de gestion : une saisie des réglages pas encore enregistrée est gardée en changeant d'onglet
  (`brouillonModifie`). Réglages en blocs (`.r-bloc`, grille `.r-grille` de 4 colonnes égales, 2 sur
  téléphone, `champ--plein-tel` pour les listes), unité dans le champ (`.avec-unite`), bouton
  Enregistrer collé en bas de l'écran. Lien organisateur : la preuve est toujours écrite (la base vérifie la clé) et
  l'entrée d'avant est remise en cas d'échec. « Coller une liste » (partie Équipes, avant le lancement) :
  `lireListeEquipes` lit une équipe par ligne (« Nom : joueurs », tiret entouré d'espaces, « ; »,
  parenthèses, colonnes d'un tableur, numéros, puces et ligne d'en-tête retirés, « 19:00 » gardé) et
  le nombre d'équipes s'ajuste.
- Écran : 2 rangées de terrains jusqu'à 10, présentation compacte au-delà de 12 ; classement en 2 ou
  3 colonnes avec taille de texte selon le nombre de lignes ; tableau de phase finale réduit pour tenir.
  Annonce vocale (bouton « Annonce vocale », clé locale `badminton:voix-ecran`, synthèse vocale du
  navigateur, voix française installée de préférence) : chaque appel est lu après le bip (« Match 12,
  terrain 3. A contre B. », catégorie lue seulement si le tournoi en mélange plusieurs, nom du tour en
  phase finale), ainsi que le message de l'organisation et la mise en pause quand ils changent. Le
  navigateur ne parle qu'après un clic : après un rechargement, « Cliquer pour réactiver la voix ».
  Boutons de commande (voix, son, plein écran) dans la barre du haut (`commandesHtml`, redessinés avec
  elle, un seul écouteur de clics), affichés quand la souris bouge, au clavier ou qu'un clic est attendu.
  Noms longs : `ajusterCotes` masque les joueurs puis réduit le texte d'un côté de terrain jusqu'à tenir ;
  liste « Ensuite » sur deux lignes (`e-eq--deux`) quand l'adversaire serait coupé, titre retiré si vide.
- Accessibilité (relecture axe-core du 19/11/2026) : boutons d'ajout de fichier en `<button data-fichier>`
  (pas d'étiquette), onglets du téléphone en `aria-current="page"`, messages de score en `role="alert"`
  et focus remis dans le formulaire (`focusEnvoi`), tableaux défilants en `tabindex="0" role="region"`,
  anneau de focus vert foncé (jaune sur les fonds sombres), contrastes revus (titre du match en cours,
  joueurs sur les terrains, pastilles de catégorie de l'écran). Récap : le nom d'équipe rapetisse pour
  tenir en deux lignes.
- Cases de score (téléphone et dialogue organisateur) : `type="text"` + `inputmode="numeric"`,
  2 chiffres au plus (`chiffresScore`), case rouge et phrase au-delà de `maxPointsSet(reg)` (points sans
  écart, sinon score maximum), passage à la case suivante après 2 chiffres tapés.
- `t.pause` suspend l'appel automatique (`appelAutoActif`), `t.annonce` est le message affiché
  sur l'écran et les téléphones.
- Pointage à l'arrivée (`reglages.pointage`, désactivé par défaut) : une équipe ne joue qu'une fois
  pointée (`equipe.arrivee` = heure d'arrivée, `pointer` / `annulerPointage`, `estArrivee`,
  `equipesAttendues`). `matchsAppelables(t)` remplace `matchsEnAttente(t)` dans `remplirTerrains`,
  `planifier` et `attenteRepos` : les matchs d'une équipe pas pointée (`matchsEnAttenteArrivee`) n'ont
  ni numéro ni heure prévus ; dès son pointage, ses matchs reviennent dans la file (elle a moins joué,
  donc passe vite). `lancer` (« Jouer » à la main) et un score saisi sans appel pointent les deux équipes (pas un forfait,
  et recréer les matchs garde l'heure d'arrivée) ;
  activer le pointage en cours de tournoi pointe les équipes qui ont déjà joué (`pointerEquipesVenues`).
  `finEstimee` ajoute les matchs en attente d'arrivée à la fin ; `dureeEstimee` suppose tout le monde là.
  Téléphone : carte « Ton équipe n'est pas encore pointée » et bouton « On est arrivés »
  (`Donnees.signalerArrivee` : en local et sur un appareil organisateur, pointage direct ; sinon dépôt
  dans `arrivees/<équipe>`, que la page de gestion reporte dans le tournoi puis efface,
  `traiterArrivees`, avec un message à la table de marque). Fiches par équipe : « touche On est
  arrivés ». Table de marque : carte « Arrivée des équipes » (onglet Terrains), « Pointer » /
  « Annuler » ; aussi dans la liste des équipes des Réglages, à côté de « Abandon » (« Pointer » ou
  « Pointée à 13:42 », un clic annule ; boutons mis à jour en direct par `majPointagesReglages` sans
  toucher aux saisies) ; onglet Matchs, groupe « En attente de l'arrivée d'une équipe ». Écran : équipes pas
  encore arrivées et QR code « Scanne pour pointer ton équipe ».
- Photos (`reglages.photos`, actives sauf `false` ; `reglages.photosMax` par personne, 0 = sans limite) :
  album du tournoi (onglet « Photos » des téléphones, `#photos`) et photo de chaque équipe (en tête de sa
  page, sur l'écran à côté de son nom et sur le récap). Tout le monde ajoute et voit les photos ; chacun
  retire les siennes (même `uid`), les organisateurs toutes. Pas de Firebase Storage (offre Spark) : JPEG
  en base64 réduits sur le téléphone par `assets/photos.js` (`BT.Photos` : grande 1280 px au plus, vignette
  360 px, équipe carré 320 px, limites dans `LIMITES`, `imageSure` avant tout affichage). En ligne :
  `tournois/<id>/miniatures/<k>` (vignette, date serveur, uid, équipe ; suivie en direct),
  `photos/<k>` (grande, lue à la demande), `equipesPhotos/<équipe>` ; en local : clé `badminton:ph:<id>`.
  Un spectateur ne crée pas de compte (`monIdentifiant()` sans `creer`) ; le compte anonyme n'est créé
  qu'au premier envoi. Les champs de fichier sont dans `equipe.html`, hors du contenu redessiné (sinon un
  choix fait pendant un rafraîchissement se perd) : galerie (`ajout-photos`, plusieurs photos,
  `photo-equipe`) et appareil photo (`prendre-photo` avec `capture="environment"`, `photo-equipe-camera`
  avec `capture="user"`). « Prendre une photo » n'est proposé que sur écran tactile (`pointer: coarse`) ;
  photo d'équipe : « Ajouter une photo » / « Changer la photo » ouvre le choix (`choixPhotoEquipe`). Le maximum par personne n'est vérifié que sur le
  téléphone. Écran : `vue=photos` (diaporama, 7 s par photo, nouvelles photos en premier avec le badge
  « Nouvelle photo » pendant 3 min, photo retirée enlevée tout de suite, grandes images gardées en
  adresses `blob:`), et dans `vue=alterne` quand l'album n'est pas vide. Album du téléphone : vignettes
  gardées d'un affichage à l'autre (`vignettes`, par identifiant), visionneuse suivie par identifiant
  (`ouverte`), jamais par position (une photo qui arrive ne la fait pas changer) ; après un retrait, la
  suivante s'affiche et « Retirer » est bloqué 1,5 s. Photos HEIC illisibles hors Safari : message dédié.
  Organisateurs : « Télécharger toutes les photos » (onglet QR code) crée un .zip sans compression
  (`BT.Photos.creerZip`, grandes photos de la plus ancienne à la plus récente). Les photos ne sont pas
  dans la sauvegarde JSON et sont effacées avec le tournoi (dit dans Sauvegarde et à la suppression).
- `assets/donnees.js` (`BT.Donnees`) cache le stockage : mode local (localStorage) quand
  `assets/config.js` vaut null, mode en ligne (Firebase Realtime Database, SDK compat chargé
  depuis gstatic) quand la configuration est remplie. Toute modification du tournoi passe par
  `Donnees.modifier(id, fn)` (transaction en ligne) : `fn` reçoit la version la plus récente.
- Données en ligne : `tournois/<id>/donnees` (le tournoi), `tournois/<id>/propositions/<match>/<équipe>`
  (scores envoyés par les joueurs, rangés dans l'ordre du match, retirés dès que le match n'est plus en
  cours, par exemple après un report), `tournois/<id>/arrivees/<équipe>`
  (arrivées signalées par les téléphones, en attente de la page de gestion), `tournois/<id>/admins/<uid>`.
  Un appareil devient organisateur en prouvant la clé du tournoi (`cles/<id>`, illisible) via
  `preuves/<id>/<uid>` ; la clé circule dans le lien organisateur `tournoi.html?t=<id>#cle=<clé>`.
  Connexion anonyme Firebase pour tous les appareils qui écrivent.
- Règles de sécurité : `database.rules.json` (à recopier dans la console Firebase à chaque changement).
  Photos : ajout par tout appareil connecté si le tournoi existe et que `reglages/photos` n'est pas
  `false`, au nom de son propre `uid`, JPEG seulement et taille plafonnée ; retrait par son auteur ou un
  organisateur (écriture des organisateurs au niveau `miniatures`, `photos`, `equipesPhotos`).
  Arrivées : création ou mise à jour par tout appareil connecté (au nom de son `uid`, date numérique,
  tournoi existant), effacement par les organisateurs seulement.
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
  saisies simultanées, refus des écritures d'un joueur. Photos : un joueur ne retire ni ne remplace
  celles des autres, un organisateur retire tout, ajouts refusés quand les photos sont désactivées ou
  trop lourdes ; images de test dessinées dans le navigateur (canvas) puis données à `setInputFiles`.
  Pointage : arrivée par le téléphone d'un joueur reportée par la table de marque, aucun match appelé
  avec une équipe pas pointée (test aléatoire avec arrivées échelonnées), droits sur `arrivees`.
  Test aléatoire avec priorités posées et retirées, reports, terrains fermés, abandons : en appel
  automatique sans repos, un match prioritaire prêt est appelé et en tête de l'ordre annoncé, et aucun
  terrain libre ne reste vide alors qu'un match peut y être appelé (sauf celui qu'un report vient de libérer).
  Gagnants contre gagnants : simulation de centaines de tournois (corrections, effacements, abandons,
  arrivées, appel manuel) : jamais bloqué, chaque équipe joue son nombre de matchs, pas de revanche
  évitable ; en ligne, scores envoyés par les téléphones et validés tout seuls, équipes arrivées appariées.

## Conventions

- Les pages chargent les fichiers de `assets/` avec `?v=AAAAMMJJ` (suffixe `-2`, `-3`… s'il y a
  plusieurs versions le même jour). À chaque modification, mettre à jour la date dans toutes
  les pages, sinon les navigateurs gardent l'ancienne version en cache.
- Textes du site : tutoiement, pas de point d'exclamation, pas de tiret long.
- Tester un tournoi complet avant chaque envoi : création, lancement, scores envoyés par les
  téléphones et validés, saisie de tous les scores, écran d'affichage, page des équipes.
