/* Écran d'affichage pour la salle : matchs en cours, prochains matchs, QR code, classement, photos. */
(function () {
  'use strict';
  const { esc } = BT;
  const D = BT.Donnees;
  const id = BT.idDansAdresse();
  const vueDemandee = new URLSearchParams(location.search).get('vue');
  // « alterne » : terrains, classement et photos à tour de rôle, 20 secondes chacun.
  let vue = vueDemandee === 'alterne' ? null : vueDemandee;
  const racine = document.getElementById('ecran');
  const CLE_SON = 'badminton:son-ecran';
  const DUREE_APPEL = 90 * 1000; // un match appelé reste mis en avant 1 min 30
  const DUREE_VUE = 20 * 1000; // alternance : durée de chaque vue
  const DUREE_PHOTO = 7 * 1000; // diaporama : durée de chaque photo
  const avecAlbum = vueDemandee === 'photos' || vueDemandee === 'alterne';
  let t = null;
  let charge = false;
  let connus = null; // matchs en cours déjà vus, pour sonner à chaque nouvel appel

  const nom = (equipeId) => esc(BT.nomEquipe(t, equipeId));
  const heureMaintenant = () => BT.heure(Date.now());

  /* ---------- Photos : photo des équipes et diaporama de l'album ---------- */

  let photosEquipes = {};
  let miniatures = [];
  let photosSuivies = false;
  const photosActives = () => !!t && t.reglages.photos !== false;

  // Les photos venues de la base sont converties une fois en adresses courtes : l'écran se
  // redessine souvent, sans recopier ni redécoder les images à chaque fois.
  function urlObjet(src) {
    try {
      const bin = atob(src.slice(src.indexOf(',') + 1));
      const octets = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) octets[i] = bin.charCodeAt(i);
      return URL.createObjectURL(new Blob([octets], { type: 'image/jpeg' }));
    } catch (e) {
      return src;
    }
  }
  const liberer = (url) => { if (url && url.startsWith('blob:')) URL.revokeObjectURL(url); };

  const avatars = new Map(); // équipe → { src, url }
  function avatar(equipeId) {
    if (!photosActives()) return '';
    const p = photosEquipes[equipeId];
    const src = p ? BT.Photos.imageSure(p.image) : '';
    const deja = avatars.get(equipeId);
    if (deja && deja.src !== src) {
      liberer(deja.url);
      avatars.delete(equipeId);
    }
    if (!src) return '';
    if (!avatars.has(equipeId)) avatars.set(equipeId, { src, url: urlObjet(src) });
    return '<img class="e-avatar" src="' + esc(avatars.get(equipeId).url) + '" alt="">';
  }

  function suivrePhotos() {
    if (photosSuivies || !photosActives()) return;
    photosSuivies = true;
    D.suivrePhotosEquipes(id, (val) => {
      photosEquipes = val || {};
      if (t) rendre();
    });
    if (avecAlbum) D.suivreMiniatures(id, recevoirMiniatures);
  }

  // Diaporama : deux images gardées d'un affichage à l'autre (pas de clignotement quand l'écran
  // se redessine), la photo et son fond flouté qui remplit les bords.
  const imgPhoto = document.createElement('img');
  imgPhoto.className = 'e-diapo-img';
  imgPhoto.alt = '';
  imgPhoto.addEventListener('animationend', () => imgPhoto.classList.remove('e-diapo-img--entree'));
  const imgFond = document.createElement('img');
  imgFond.className = 'e-diapo-fond';
  imgFond.alt = '';
  const diapo = { id: null, curseur: null, depuis: 0, nouvelles: [], chargement: null };
  const grandes = new Map(); // photo → adresse de la grande image (60 au plus, les dernières montrées)
  let miniaturesRecues = false;

  function recevoirMiniatures(liste) {
    const avant = new Set(miniatures.map((p) => p.id));
    const ids = new Set(liste.map((p) => p.id));
    // Une photo qui arrive passe en premier (la liste va de la plus récente à la plus ancienne).
    if (miniaturesRecues) liste.filter((p) => !avant.has(p.id)).reverse().forEach((p) => diapo.nouvelles.push(p.id));
    miniaturesRecues = true;
    miniatures = liste;
    diapo.nouvelles = diapo.nouvelles.filter((x) => ids.has(x));
    Array.from(grandes.keys()).forEach((k) => {
      if (!ids.has(k)) {
        liberer(grandes.get(k));
        grandes.delete(k);
      }
    });
    // Photo retirée par son auteur ou un organisateur : elle quitte l'écran tout de suite.
    if (diapo.id && !ids.has(diapo.id)) {
      diapo.id = null;
      diapo.depuis = 0;
      imgPhoto.removeAttribute('src');
      imgFond.removeAttribute('src');
    }
    if (vue === 'photos' && !diapo.id && liste.length) avancerDiapo();
    if (t) rendre();
  }

  function photoSuivante() {
    while (diapo.nouvelles.length) {
      const p = miniatures.find((x) => x.id === diapo.nouvelles[0]);
      diapo.nouvelles.shift();
      if (p) return p;
    }
    if (!miniatures.length) return null;
    // Sinon toutes les photos, de la plus ancienne à la plus récente, en boucle.
    const ordre = miniatures.slice().reverse();
    const p = ordre[(ordre.findIndex((x) => x.id === diapo.curseur) + 1) % ordre.length];
    diapo.curseur = p.id;
    return p;
  }

  const avecDelai = (promesse, ms) => Promise.race([promesse, new Promise((ok, non) => setTimeout(() => non(new Error('délai dépassé')), ms))]);

  async function grandeImage(p) {
    if (grandes.has(p.id)) {
      const url = grandes.get(p.id);
      grandes.delete(p.id);
      grandes.set(p.id, url);
      return url;
    }
    let src = '';
    try { src = BT.Photos.imageSure(await avecDelai(D.lirePhoto(id, p.id), 10000)); } catch (e) { src = ''; }
    if (!src || !miniatures.some((x) => x.id === p.id)) return '';
    const url = urlObjet(src);
    grandes.set(p.id, url);
    while (grandes.size > 60) {
      const [k, ancienne] = grandes.entries().next().value;
      grandes.delete(k);
      if (k !== diapo.id) liberer(ancienne);
    }
    return url;
  }

  async function montrerPhoto(p) {
    if (!p) return;
    if (p.id === diapo.id && imgPhoto.getAttribute('src')) {
      diapo.depuis = Date.now();
      return;
    }
    const mini = BT.Photos.imageSure(p.image);
    const source = (await grandeImage(p)) || mini;
    if (!source || !miniatures.some((x) => x.id === p.id)) return;
    // Image décodée avant d'être montrée : elle apparaît d'un coup, sans se dessiner par morceaux.
    const pre = new Image();
    pre.src = source;
    try { await pre.decode(); } catch (e) { /* montrée quand même */ }
    if (!miniatures.some((x) => x.id === p.id)) return;
    diapo.id = p.id;
    diapo.depuis = Date.now();
    imgPhoto.src = source;
    imgFond.src = mini || source;
    imgPhoto.classList.remove('e-diapo-img--entree');
    void imgPhoto.offsetWidth; // relance l'apparition en fondu
    imgPhoto.classList.add('e-diapo-img--entree');
    if (vue === 'photos' && t) rendre();
  }

  function avancerDiapo() {
    if (!diapo.chargement) {
      diapo.chargement = montrerPhoto(photoSuivante()).catch(() => {}).finally(() => { diapo.chargement = null; });
    }
    return diapo.chargement;
  }

  // Légende : équipe et heure, avec « Nouvelle photo » pendant 3 minutes après l'envoi.
  function legendePhoto(p) {
    const equipe = p.equipe && t.equipes.some((e) => e.id === p.equipe) ? BT.nomEquipe(t, p.equipe) : '';
    const nouvelle = p.date && Date.now() - p.date < 3 * 60 * 1000;
    return (nouvelle ? '<span class="e-diapo-nouvelle">Nouvelle photo</span>' : '')
      + '<span>' + (equipe ? esc(equipe) : 'Photo du tournoi') + '</span>' + (p.date ? '<small>' + BT.heure(p.date) + '</small>' : '');
  }

  function diaporama() {
    if (!photosActives()) return '<div class="e-message">L’album photo est désactivé dans les réglages du tournoi</div>';
    const url = BT.urlPage('equipe.html', { t: t.id }) + '#photos';
    const qr = (texte) => '<div class="e-qr e-qr--photos"><div class="qr">' + BT.qrSvg(url) + '</div><p>' + texte + '<small>Elles passent sur cet écran</small></p></div>';
    if (!miniatures.length) {
      return '<section class="e-diapo e-diapo--vide"><div class="e-diapo-vide"><p>Pas encore de photos</p>'
        + qr('Scanne pour ajouter les premières') + '</div></section>';
    }
    const p = miniatures.find((x) => x.id === diapo.id);
    return '<section class="e-diapo"><div class="e-diapo-cadre" id="e-diapo-cadre">'
      + (p ? '<div class="e-diapo-legende">' + legendePhoto(p) + '</div>' : '') + '</div>'
      + '<aside class="e-diapo-cote"><h2>Photos du tournoi</h2>'
      + '<p class="e-diapo-compte">' + miniatures.length + '<small>photo' + (miniatures.length > 1 ? 's' : '') + ' dans l’album</small></p>'
      + qr('Scanne pour ajouter tes photos') + '</aside></section>';
  }

  /* ---------- Terrains et prochains matchs ---------- */

  function cote(equipeId, avecPhoto) {
    const e = BT.equipe(t, equipeId);
    const texte = esc(e.nom) + (e.joueurs ? '<small>' + esc(e.joueurs) + '</small>' : '');
    const img = avecPhoto ? avatar(equipeId) : '';
    return img
      ? '<div class="e-court-cote e-court-cote--photo">' + img + '<div class="e-cote-nom">' + texte + '</div></div>'
      : '<div class="e-court-cote">' + texte + '</div>';
  }

  function equipeSuivante(equipeId) {
    const img = avatar(equipeId);
    return '<div class="e-suivant-equipe' + (img ? ' e-suivant-equipe--photo' : '') + '">' + img + '<span>' + nom(equipeId) + '</span></div>';
  }

  function chrono(m) {
    const ecoule = Math.max(0, Math.floor((Date.now() - m.debut) / 60000));
    const limite = BT.formatMatch(t, m).dureeLimite;
    if (limite > 0) {
      const reste = limite - ecoule;
      if (reste <= 0) return '<span class="e-chrono e-chrono--alerte">Temps écoulé</span>';
      return '<span class="e-chrono' + (reste <= 2 ? ' e-chrono--alerte' : '') + '">' + reste + ' min restante' + (reste > 1 ? 's' : '') + '</span>';
    }
    return '<span class="e-chrono">' + (ecoule < 1 ? 'Début' : ecoule + ' min') + '</span>';
  }

  function tete() {
    const total = t.matchs.length;
    const faits = t.matchs.filter((m) => m.statut === 'termine').length;
    const fin = faits < total ? BT.finEstimee(t) : null;
    return '<header class="ecran-tete"><div class="ecran-nom">' + BT.ICONE + '<span>' + esc(t.nom) + '</span></div>'
      + (total ? '<div class="ecran-progres">' + faits + ' / ' + total + ' matchs joués'
        + (fin ? '<small>fin estimée vers ' + BT.heure(fin) + '</small>' : '') + '</div>' : '')
      + '<div class="ecran-heure" id="heure">' + heureMaintenant() + '</div></header>';
  }

  function terrains(st) {
    const enCours = BT.matchsEnCours(t);
    const nums = new Set();
    for (let i = 1; i <= t.reglages.terrains; i++) nums.add(i);
    enCours.forEach((m) => nums.add(m.terrain));
    const liste = Array.from(nums).sort((a, b) => a - b);
    const n = liste.length;
    // Jusqu'à 2 terrains sur une rangée, 2 rangées jusqu'à 10, puis 3 et 4 rangées (présentation compacte).
    const colonnes = n <= 2 ? n : n <= 10 ? Math.ceil(n / 2) : n <= 12 ? Math.ceil(n / 3) : Math.ceil(n / 4);
    return '<section class="zone-terrains"><h2>Sur les terrains</h2>'
      + '<div class="ecran-terrains' + (n > 12 ? ' ecran-terrains--compact' : '') + '" style="--colonnes:' + colonnes + '">'
      + liste.map((num) => {
        const m = enCours.find((x) => x.terrain === num);
        const appel = m && Date.now() - m.debut < DUREE_APPEL;
        const tete = '<div class="e-terrain-tete"><div class="e-terrain-num"><small>Terrain</small>' + num + '</div>'
          + (m ? '<div class="e-terrain-match">Match ' + BT.numero(t, m) + '</div>' : '') + '</div>';
        if (!m) {
          return '<article class="e-terrain' + (BT.terrainFerme(t, num) ? ' e-terrain--ferme' : '') + '">' + tete + '<div class="e-court e-court--libre"><div class="e-court-libre">'
            + (BT.terrainFerme(t, num) ? 'Fermé' : st === 'pret' ? 'Bientôt' : BT.attenteRepos(t) > 0 && BT.appelAutoActif(t) ? 'Repos, reprise dans ' + Math.max(1, Math.ceil(BT.attenteRepos(t) / 60000)) + ' min' : 'Libre') + '</div></div></article>';
        }
        // Photo des équipes à côté de leur nom, sauf dans la présentation compacte.
        return '<article class="e-terrain' + (appel ? ' e-terrain--appel' : '') + '">' + tete + '<div class="e-court">'
          + cote(m.a, n <= 12) + '<div class="e-court-filet"></div>' + cote(m.b, n <= 12) + '</div>'
          + '<div class="e-terrain-pied"><span class="e-pied-gauche">'
          + (BT.categorieMatch(t, m) ? '<span class="e-cat e-cat--' + esc(m.categorie) + '">' + esc(BT.categorieMatch(t, m)) + '</span>' : '')
          + (appel ? '<span class="e-appel">Appel</span>' : '<span class="e-etiquette">' + esc(BT.etiquetteMatch(t, m)) + '</span>') + '</span>'
          + chrono(m) + '</div></article>';
      }).join('')
      + '</div></section>';
  }

  function blocQr() {
    const url = BT.urlPage('equipe.html', { t: t.id });
    const contenus = ['Prochain match', 'terrain'].concat(t.reglages.scoresJoueurs ? ['envoi du score'] : [], ['classement'], photosActives() ? ['photos'] : []);
    // Des équipes à pointer : le QR code sert d'abord à signaler son arrivée.
    const titre = BT.equipesAttendues(t).length ? 'Scanne pour pointer ton équipe' : 'Scanne pour suivre ton équipe';
    return '<div class="e-qr"><div class="qr">' + BT.qrSvg(url) + '</div>'
      + '<p>' + titre + '<small>' + contenus.slice(0, -1).join(', ') + ' et ' + contenus[contenus.length - 1] + '</small></p></div>';
  }

  // Équipes pas encore arrivées (pointage à l'arrivée).
  function blocAttendues() {
    const attendues = BT.equipesAttendues(t);
    if (!attendues.length) return '';
    return '<p class="e-attendues"><span>Pas encore arrivée' + (attendues.length > 1 ? 's' : '') + '</span>'
      + attendues.map((e) => esc(e.nom)).join(', ') + '</p>';
  }

  function suite() {
    const duree = BT.dureeMatch(t);
    const liste = BT.planifier(t, duree);
    const heure = (x) => (x.heure ? '<small class="e-vers">' + BT.heure(x.heure) + '</small>' : '');
    let h = '<aside class="zone-suite">';
    h += '<div><h2>Prochain match</h2>';
    if (!liste.length && !t.finale && BT.nbQualifies(t) >= 2 && BT.phasePoulesFinie(t)) {
      h += '<div class="e-suivant"><div class="e-suivant-num">' + (BT.avecPoules(t) ? 'Poules terminées' : 'Championnat terminé') + '</div>'
        + '<div class="e-suivant-equipe">Phase finale bientôt</div></div>';
    } else if (liste.length) {
      const m = liste[0].m;
      const lbl = BT.etiquetteMatch(t, m);
      h += '<div class="e-suivant"><div class="e-suivant-num">Match ' + BT.numero(t, m) + (BT.categorieMatch(t, m) ? ' · ' + esc(BT.categorieMatch(t, m)) : '') + (lbl ? ' · ' + esc(lbl) : '') + '</div>'
        + equipeSuivante(m.a) + '<div class="e-suivant-contre">contre</div>' + equipeSuivante(m.b) + '</div>';
    } else {
      const texte = BT.matchsEnAttenteArrivee(t).length ? 'En attente de l’arrivée des équipes'
        : BT.finaleAttendue(t) ? 'En attente des résultats pour la suite' : 'Tous les matchs sont lancés';
      h += '<div class="e-suivant"><div class="e-suivant-equipe">' + texte + '</div></div>';
    }
    h += '</div><div class="e-suite-reste">';
    if (liste.length > 1) {
      h += '<h2>Ensuite</h2><ol class="e-liste" id="e-liste">'
        + liste.slice(1, 12).map((x) => '<li><span class="e-num">' + BT.numero(t, x.m) + heure(x) + '</span>'
          + '<span class="e-eq">' + (BT.categorieMatch(t, x.m) ? '<span class="e-cat-liste">' + esc(BT.categorieMatch(t, x.m)) + '</span>' : '') + nom(x.m.a) + '<span class="e-contre">contre</span>' + nom(x.m.b) + '</span></li>').join('')
        + '</ol>';
    }
    h += blocAttendues() + blocQr() + '</div></aside>';
    return h;
  }

  // Plus de 8 équipes : 2 colonnes (3 au-delà de 20 si la place le permet), texte réduit pour tout faire tenir.
  function listeClassement(lignes, avecJoues, simple, maxColonnes) {
    const colonnes = lignes.length > 20 && (maxColonnes || 3) >= 3 ? 3 : 2;
    return '<ol class="e-classement' + (!simple && lignes.length > 8 ? ' e-classement--colonnes" style="--colonnes:' + colonnes + ';--lignes:' + Math.ceil(lignes.length / colonnes) : '') + '">'
      + lignes.map((l) => {
        const parcours = l.etape && t.finale;
        return '<li><span class="rang">' + l.rang + '</span><span class="e-cl-nom' + (parcours ? ' e-cl-nom--parcours' : '') + '">' + esc(l.equipe.nom)
          + (parcours ? '<small>' + esc(l.etape) + '</small>' : '') + '</span>'
          + '<span class="bilan-e">' + (parcours ? '' : (avecJoues ? l.J + ' J, ' : '') + l.V + ' V, ' + l.D + ' D') + '</span></li>';
      }).join('')
      + '</ol>';
  }

  function final() {
    const lignes = BT.classementFinal(t);
    if (!lignes) return '<section class="e-vue-classement"><h2>Résultats finaux</h2>' + classementsPoules() + '</section>';
    return '<div class="e-final"><div><h2>Résultats finaux</h2>' + BT.podiumHtml(lignes) + '</div>'
      + '<div><h2>Classement</h2>' + listeClassement(lignes, false, false, 2) + '</div></div>';
  }

  function classementsPoules() {
    const poules = BT.listePoules(t);
    return '<div class="e-poules" style="--poules:' + Math.min(poules.length, 4) + '">'
      + poules.map((p) => '<div class="e-poule"><h2>' + p.nom + '</h2>' + listeClassement(BT.classement(t, p.numero), true, true) + '</div>').join('')
      + '</div>';
  }

  function classementDirect() {
    if (t.finale) return '<section class="e-vue-classement"><h2>Phase finale</h2><div class="e-tableau">' + BT.tableauHtml(t) + '</div></section>';
    if (BT.avecPoules(t)) return '<section class="e-vue-classement">' + classementsPoules() + '</section>';
    return '<section class="e-vue-classement"><h2>Classement en direct</h2>' + listeClassement(BT.classement(t), true) + '</section>';
  }

  // Réduit le tableau de la phase finale pour qu'il tienne entier dans l'écran.
  function ajusterTableau() {
    const zone = racine.querySelector('.e-tableau');
    const tableau = zone && zone.firstElementChild;
    if (!tableau) return;
    const k = Math.min(1, zone.clientHeight / tableau.scrollHeight, zone.clientWidth / tableau.scrollWidth);
    if (k < 0.99) {
      tableau.style.transformOrigin = 'top left';
      tableau.style.transform = 'scale(' + k.toFixed(3) + ')';
      tableau.style.width = (100 / k).toFixed(1) + '%';
      tableau.style.height = 'auto';
    }
  }

  // Retire les lignes de la liste « Ensuite » qui dépassent de l'écran.
  function ajusterListe() {
    const ol = document.getElementById('e-liste');
    if (!ol) return;
    const bas = ol.getBoundingClientRect().bottom;
    Array.from(ol.children).forEach((li) => {
      if (li.getBoundingClientRect().bottom > bas + 1) li.remove();
    });
  }

  function sonnerSiNouvelAppel() {
    const enCours = BT.matchsEnCours(t);
    const actuels = new Set(enCours.map((m) => m.id));
    if (connus) {
      const nouveaux = enCours.filter((m) => !connus.has(m.id));
      if (nouveaux.length && lireSon()) BT.bip();
      // Annonce vocale après le bip : un appel par match, dans l'ordre des terrains.
      if (nouveaux.length && voixPrete()) setTimeout(() => nouveaux.forEach((m) => parler(texteAppel(m))), lireSon() && BT.sonActif() ? 900 : 0);
    }
    connus = actuels;
    annoncerMessage();
  }

  /* ---------- Annonce vocale (synthèse vocale du navigateur) ---------- */

  const CLE_VOIX = 'badminton:voix-ecran';
  const synthese = window.speechSynthesis || null;
  let voixDebloquee = false; // le navigateur ne parle qu'après un clic sur la page
  let voixFr = null;
  function choisirVoix() {
    const francaises = (synthese.getVoices() || []).filter((v) => /^fr/i.test(v.lang));
    // Une voix française installée sur l'appareil d'abord (elle marche aussi sans bon réseau).
    voixFr = francaises.sort((x, y) => (y.localService ? 1 : 0) - (x.localService ? 1 : 0)
      || (/fr.FR/i.test(y.lang) ? 1 : 0) - (/fr.FR/i.test(x.lang) ? 1 : 0))[0] || null;
  }
  if (synthese) {
    choisirVoix();
    if (synthese.addEventListener) synthese.addEventListener('voiceschanged', choisirVoix);
  }
  function lireVoix() {
    try { return localStorage.getItem(CLE_VOIX) === 'oui'; } catch (e) { return false; }
  }
  const voixPrete = () => !!synthese && lireVoix() && voixDebloquee;
  let derniereFin = Date.now();
  function parler(texte) {
    if (!synthese || !texte) return;
    // Synthèse restée bloquée (cela arrive avec certaines voix en ligne) : on la relance.
    if (synthese.speaking && Date.now() - derniereFin > 60000) synthese.cancel();
    const phrase = new SpeechSynthesisUtterance(texte);
    phrase.lang = 'fr-FR';
    if (voixFr) phrase.voice = voixFr;
    phrase.rate = 0.95;
    phrase.onend = () => { derniereFin = Date.now(); };
    phrase.onerror = phrase.onend;
    synthese.speak(phrase);
  }
  // « Match 12, terrain 3. Les Volants contre Les Smashs. », avec la catégorie si le tournoi en mélange
  // plusieurs (« Match 12, en simple, … ») ; en phase finale, le nom du tour.
  function texteAppel(m) {
    const categorie = m.phase === 'finale' || BT.categoriesJouees(t.reglages).length < 2 ? '' : BT.categorieMatch(t, m);
    return (m.phase === 'finale' ? BT.etiquetteMatch(t, m) : 'Match ' + BT.numero(t, m))
      + (categorie ? ', en ' + categorie.toLowerCase() : '')
      + ', terrain ' + m.terrain + '. ' + BT.nomEquipe(t, m.a) + ' contre ' + BT.nomEquipe(t, m.b) + '.';
  }
  // Message de l'organisation et mise en pause : lus quand ils changent (pas à l'ouverture de l'écran).
  let dernierMessage = null;
  let dernierePause = null;
  function annoncerMessage() {
    const message = t.annonce && t.annonce.texte ? t.annonce.texte : '';
    const pause = !!t.pause;
    if (dernierMessage !== null && voixPrete()) {
      if (message && message !== dernierMessage) parler('Annonce. ' + message);
      else if (pause && !dernierePause && !message) parler('Les appels sont en pause, les matchs reprennent bientôt.');
    }
    dernierMessage = message;
    dernierePause = pause;
  }

  function bandeau() {
    const texte = t.annonce && t.annonce.texte ? t.annonce.texte : (t.pause ? 'Pause, les matchs reprennent bientôt' : '');
    return texte ? '<div class="e-annonce' + (t.pause ? ' e-annonce--pause' : '') + '">' + esc(texte) + '</div>' : '';
  }

  function rendre() {
    const classes = { terrains: ' ecran--terrains', suite: ' ecran--suite', classement: ' ecran--classement', photos: ' ecran--photos' };
    racine.className = 'ecran' + (classes[vue] || '') + (t && bandeau() ? ' ecran--annonce' : '');
    if (!t) {
      racine.innerHTML = '<div class="e-message">' + (erreurConnexion ? 'Connexion impossible, nouvel essai dans un instant' : charge ? 'Tournoi introuvable' : 'Chargement du tournoi') + '</div>';
      return;
    }
    document.title = t.nom + ' · Écran d’affichage';
    const st = BT.statut(t);
    let h = tete() + bandeau();
    if (vue === 'photos') h += diaporama();
    else if (st === 'preparation') h += '<div class="e-message">Les matchs ne sont pas encore prêts</div>';
    else if (st === 'termine') h += final();
    else if (vue === 'classement') h += classementDirect();
    else h += terrains(st) + suite();
    racine.innerHTML = h;
    const cadre = document.getElementById('e-diapo-cadre');
    if (cadre && imgPhoto.getAttribute('src')) cadre.prepend(imgFond, imgPhoto);
    ajusterListe();
    ajusterTableau();
  }

  // Sans réseau au chargement (Wi-Fi de la salle), on réessaie toutes les 15 secondes.
  let erreurConnexion = false;
  let arreterSuivi = null;
  function suivreTournoi() {
    if (arreterSuivi) arreterSuivi();
    arreterSuivi = D.suivre(id, (nouveau, info) => {
      if (!nouveau && info && info.erreur) {
        if (t) return;
        erreurConnexion = true;
        rendre();
        setTimeout(suivreTournoi, 15000);
        return;
      }
      erreurConnexion = false;
      t = nouveau;
      charge = true;
      if (t) {
        sonnerSiNouvelAppel();
        suivrePhotos();
      }
      rendre();
    });
  }
  suivreTournoi();
  D.economiserConnexion();

  // Alternance : terrains, classement (sauf une fois le tournoi fini, déjà affiché) puis photos
  // s'il y en a. La première photo est prête avant que le diaporama s'affiche.
  if (vueDemandee === 'alterne') {
    setInterval(async () => {
      if (!t) return;
      const cycle = BT.statut(t) === 'termine' ? [null] : [null, 'classement'];
      if (photosActives() && miniatures.length) cycle.push('photos');
      const suivante = cycle[(cycle.indexOf(vue) + 1) % cycle.length];
      if (suivante === 'photos') await avancerDiapo();
      vue = suivante;
      rendre();
    }, DUREE_VUE);
  }

  // Diaporama : une nouvelle photo toutes les 7 secondes.
  setInterval(() => {
    if (vue === 'photos' && t && photosActives() && miniatures.length && Date.now() - diapo.depuis >= DUREE_PHOTO) avancerDiapo();
  }, 1000);

  // Heure, chronos et mise en avant des appels.
  setInterval(() => { if (t) rendre(); }, 15000);
  setInterval(() => {
    const h = document.getElementById('heure');
    if (h) h.textContent = heureMaintenant();
  }, 5000);

  window.addEventListener('resize', rendre);

  /* ---------- Commandes (visibles quand la souris bouge) ---------- */

  let minuterie = null;
  document.addEventListener('mousemove', () => {
    document.body.classList.add('souris');
    clearTimeout(minuterie);
    minuterie = setTimeout(() => document.body.classList.remove('souris'), 2500);
  });
  document.getElementById('plein-ecran').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
  });

  function lireSon() {
    try { return localStorage.getItem(CLE_SON) === 'oui'; } catch (e) { return false; }
  }
  // Les commandes restent visibles tant que le son ou la voix attendent un clic pour repartir.
  function majCommandes() {
    document.body.classList.toggle('son-a-activer', (lireSon() && !BT.sonActif()) || (!!synthese && lireVoix() && !voixDebloquee));
  }
  function majBoutonSon() {
    const actif = lireSon() && BT.sonActif();
    const bouton = document.getElementById('son');
    bouton.textContent = actif ? 'Son activé' : lireSon() ? 'Cliquer pour réactiver le son' : 'Activer le son';
    bouton.setAttribute('aria-pressed', String(actif));
    majCommandes();
  }
  function majBoutonVoix() {
    const bouton = document.getElementById('voix');
    bouton.hidden = !synthese;
    const actif = voixPrete();
    bouton.textContent = actif ? 'Annonce vocale activée' : lireVoix() ? 'Cliquer pour réactiver la voix' : 'Annonce vocale';
    bouton.setAttribute('aria-pressed', String(actif));
    majCommandes();
  }
  document.getElementById('voix').addEventListener('click', () => {
    const activer = !voixPrete();
    try { localStorage.setItem(CLE_VOIX, activer ? 'oui' : 'non'); } catch (e) { /* stockage indisponible */ }
    if (activer) {
      voixDebloquee = true;
      parler('Annonce vocale activée.');
    } else if (synthese) {
      synthese.cancel();
    }
    majBoutonVoix();
  });
  document.getElementById('son').addEventListener('click', () => {
    const activer = !(lireSon() && BT.sonActif());
    try { localStorage.setItem(CLE_SON, activer ? 'oui' : 'non'); } catch (e) { /* stockage indisponible */ }
    if (activer) {
      BT.activerSon();
      setTimeout(() => { BT.bip(); majBoutonSon(); }, 50);
    }
    majBoutonSon();
  });
  // Après un rechargement, le navigateur demande un clic pour réactiver le son et la voix.
  document.addEventListener('click', (e) => {
    if (e.target.id !== 'son' && lireSon() && !BT.sonActif()) {
      BT.activerSon();
      setTimeout(majBoutonSon, 50);
    }
    if (e.target.id !== 'voix' && synthese && lireVoix() && !voixDebloquee) {
      voixDebloquee = true;
      parler('Annonce vocale prête.');
      majBoutonVoix();
    }
  });
  majBoutonSon();
  majBoutonVoix();

  // Empêche la mise en veille de l'écran quand c'est possible.
  async function garderEveille() {
    try {
      if (navigator.wakeLock && document.visibilityState === 'visible') await navigator.wakeLock.request('screen');
    } catch (e) { /* non disponible */ }
  }
  document.addEventListener('visibilitychange', garderEveille);
  garderEveille();

  rendre();
})();
