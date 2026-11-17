/* Écran d'affichage pour la salle : matchs en cours, prochains matchs, QR code, classement. */
(function () {
  'use strict';
  const { esc } = BT;
  const D = BT.Donnees;
  const id = BT.idDansAdresse();
  const vueDemandee = new URLSearchParams(location.search).get('vue');
  // « alterne » : terrains et classement à tour de rôle, 20 secondes chacun.
  let vue = vueDemandee === 'alterne' ? null : vueDemandee;
  const racine = document.getElementById('ecran');
  const CLE_SON = 'badminton:son-ecran';
  const DUREE_APPEL = 90 * 1000; // un match appelé reste mis en avant 1 min 30
  let t = null;
  let charge = false;
  let connus = null; // matchs en cours déjà vus, pour sonner à chaque nouvel appel

  const nom = (equipeId) => esc(BT.nomEquipe(t, equipeId));
  const heureMaintenant = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  function nomComplet(equipeId) {
    const e = BT.equipe(t, equipeId);
    return esc(e.nom) + (e.joueurs ? '<small>' + esc(e.joueurs) + '</small>' : '');
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
        return '<article class="e-terrain' + (appel ? ' e-terrain--appel' : '') + '">' + tete + '<div class="e-court">'
          + '<div class="e-court-cote">' + nomComplet(m.a) + '</div><div class="e-court-filet"></div>'
          + '<div class="e-court-cote">' + nomComplet(m.b) + '</div></div>'
          + '<div class="e-terrain-pied"><span class="e-pied-gauche">'
          + (BT.categorieMatch(t, m) ? '<span class="e-cat e-cat--' + esc(m.categorie) + '">' + esc(BT.categorieMatch(t, m)) + '</span>' : '')
          + (appel ? '<span class="e-appel">Appel</span>' : '<span class="e-etiquette">' + esc(BT.etiquetteMatch(t, m)) + '</span>') + '</span>'
          + chrono(m) + '</div></article>';
      }).join('')
      + '</div></section>';
  }

  function blocQr() {
    const url = BT.urlPage('equipe.html', { t: t.id });
    return '<div class="e-qr"><div class="qr">' + BT.qrSvg(url) + '</div>'
      + '<p>Scanne pour suivre ton équipe<small>Prochain match, terrain' + (t.reglages.scoresJoueurs ? ', envoi du score' : '') + ' et classement</small></p></div>';
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
        + '<div class="e-suivant-equipe">' + nom(m.a) + '</div><div class="e-suivant-contre">contre</div>'
        + '<div class="e-suivant-equipe">' + nom(m.b) + '</div></div>';
    } else {
      h += '<div class="e-suivant"><div class="e-suivant-equipe">' + (BT.finaleAttendue(t) ? 'En attente des résultats pour la suite' : 'Tous les matchs sont lancés') + '</div></div>';
    }
    h += '</div><div class="e-suite-reste">';
    if (liste.length > 1) {
      h += '<h2>Ensuite</h2><ol class="e-liste" id="e-liste">'
        + liste.slice(1, 12).map((x) => '<li><span class="e-num">' + BT.numero(t, x.m) + heure(x) + '</span>'
          + '<span class="e-eq">' + (BT.categorieMatch(t, x.m) ? '<span class="e-cat-liste">' + esc(BT.categorieMatch(t, x.m)) + '</span>' : '') + nom(x.m.a) + '<span class="e-contre">contre</span>' + nom(x.m.b) + '</span></li>').join('')
        + '</ol>';
    }
    h += blocQr() + '</div></aside>';
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
    const actuels = new Set(BT.matchsEnCours(t).map((m) => m.id));
    if (connus) {
      const nouveau = Array.from(actuels).some((x) => !connus.has(x));
      if (nouveau && lireSon()) BT.bip();
    }
    connus = actuels;
  }

  function bandeau() {
    const texte = t.annonce && t.annonce.texte ? t.annonce.texte : (t.pause ? 'Pause, les matchs reprennent bientôt' : '');
    return texte ? '<div class="e-annonce' + (t.pause ? ' e-annonce--pause' : '') + '">' + esc(texte) + '</div>' : '';
  }

  function rendre() {
    racine.className = 'ecran' + (vue === 'terrains' ? ' ecran--terrains' : vue === 'suite' ? ' ecran--suite' : vue === 'classement' ? ' ecran--classement' : '')
      + (t && bandeau() ? ' ecran--annonce' : '');
    if (!t) {
      racine.innerHTML = '<div class="e-message">' + (erreurConnexion ? 'Connexion impossible, nouvel essai dans un instant' : charge ? 'Tournoi introuvable' : 'Chargement du tournoi') + '</div>';
      return;
    }
    document.title = t.nom + ' · Écran d’affichage';
    const st = BT.statut(t);
    let h = tete() + bandeau();
    if (st === 'preparation') h += '<div class="e-message">Les matchs ne sont pas encore prêts</div>';
    else if (st === 'termine') h += final();
    else if (vue === 'classement') h += classementDirect();
    else h += terrains(st) + suite();
    racine.innerHTML = h;
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
      if (t) sonnerSiNouvelAppel();
      rendre();
    });
  }
  suivreTournoi();
  D.economiserConnexion();

  if (vueDemandee === 'alterne') {
    setInterval(() => {
      vue = vue === 'classement' ? null : 'classement';
      if (t) rendre();
    }, 20000);
  }

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
  function majBoutonSon() {
    const actif = lireSon() && BT.sonActif();
    const bouton = document.getElementById('son');
    bouton.textContent = actif ? 'Son activé' : lireSon() ? 'Cliquer pour réactiver le son' : 'Activer le son';
    bouton.setAttribute('aria-pressed', String(actif));
    document.body.classList.toggle('son-a-activer', lireSon() && !BT.sonActif());
  }
  document.getElementById('son').addEventListener('click', () => {
    const activer = !(lireSon() && BT.sonActif());
    try { localStorage.setItem(CLE_SON, activer ? 'oui' : 'non'); } catch (e) { /* stockage indisponible */ }
    if (activer) {
      BT.activerSon();
      setTimeout(() => { BT.bip(); majBoutonSon(); }, 50);
    }
    majBoutonSon();
  });
  // Après un rechargement, le navigateur demande un clic pour réactiver le son.
  document.addEventListener('click', (e) => {
    if (e.target.id !== 'son' && lireSon() && !BT.sonActif()) {
      BT.activerSon();
      setTimeout(majBoutonSon, 50);
    }
  });
  majBoutonSon();

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
