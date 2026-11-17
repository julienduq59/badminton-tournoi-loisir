/* Écran d'affichage pour la salle : matchs en cours, prochains matchs, QR code, classement. */
(function () {
  'use strict';
  const { esc } = BT;
  const D = BT.Donnees;
  const id = BT.idDansAdresse();
  const vue = new URLSearchParams(location.search).get('vue');
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
    const limite = t.reglages.dureeLimite;
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
    const colonnes = n <= 4 ? n : n <= 10 ? Math.ceil(n / 2) : Math.ceil(n / 3);
    return '<section class="zone-terrains"><h2>Sur les terrains</h2>'
      + '<div class="ecran-terrains" style="--colonnes:' + colonnes + '">'
      + liste.map((num) => {
        const m = enCours.find((x) => x.terrain === num);
        const appel = m && Date.now() - m.debut < DUREE_APPEL;
        const tete = '<div class="e-terrain-tete"><div class="e-terrain-num"><small>Terrain</small>' + num + '</div>'
          + (m ? '<div class="e-terrain-match">Match ' + m.numero + '</div>' : '') + '</div>';
        if (!m) {
          return '<article class="e-terrain">' + tete + '<div class="e-court e-court--libre"><div class="e-court-libre">'
            + (st === 'pret' ? 'Bientôt' : 'Libre') + '</div></div></article>';
        }
        return '<article class="e-terrain' + (appel ? ' e-terrain--appel' : '') + '">' + tete + '<div class="e-court">'
          + '<div class="e-court-cote">' + nomComplet(m.a) + '</div><div class="e-court-filet"></div>'
          + '<div class="e-court-cote">' + nomComplet(m.b) + '</div></div>'
          + '<div class="e-terrain-pied">' + (appel ? '<span class="e-appel">Appel</span>' : '<span></span>') + chrono(m) + '</div></article>';
      }).join('')
      + '</div></section>';
  }

  function blocQr() {
    const url = BT.urlPage('equipe.html', { t: t.id });
    return '<div class="e-qr"><div class="qr">' + BT.qrSvg(url) + '</div>'
      + '<p>Scanne pour suivre ton équipe<small>Prochain match, terrain, envoi du score et classement</small></p></div>';
  }

  function suite() {
    const duree = BT.dureeMatch(t);
    const liste = BT.planifier(t, duree);
    const heure = (x) => (x.heure ? '<small class="e-vers">' + BT.heure(x.heure) + '</small>' : '');
    let h = '<aside class="zone-suite">';
    h += '<div><h2>Prochain match</h2>';
    if (liste.length) {
      const m = liste[0].m;
      h += '<div class="e-suivant"><div class="e-suivant-num">Match ' + m.numero + '</div>'
        + '<div class="e-suivant-equipe">' + nom(m.a) + '</div><div class="e-suivant-contre">contre</div>'
        + '<div class="e-suivant-equipe">' + nom(m.b) + '</div></div>';
    } else {
      h += '<div class="e-suivant"><div class="e-suivant-equipe">Tous les matchs sont lancés</div></div>';
    }
    h += '</div><div class="e-suite-reste">';
    if (liste.length > 1) {
      h += '<h2>Ensuite</h2><ol class="e-liste" id="e-liste">'
        + liste.slice(1, 12).map((x) => '<li><span class="e-num">' + x.m.numero + heure(x) + '</span>'
          + '<span class="e-eq">' + nom(x.m.a) + '<span class="e-contre">contre</span>' + nom(x.m.b) + '</span></li>').join('')
        + '</ol>';
    }
    h += blocQr() + '</div></aside>';
    return h;
  }

  function listeClassement(lignes, avecJoues) {
    return '<ol class="e-classement' + (lignes.length > 8 ? ' e-classement--colonnes" style="--lignes:' + Math.ceil(lignes.length / 2) : '') + '">'
      + lignes.map((l) => '<li><span class="rang">' + l.rang + '</span><span class="e-cl-nom">' + esc(l.equipe.nom) + '</span>'
        + '<span class="bilan-e">' + (avecJoues ? l.J + ' J, ' : '') + l.V + ' V, ' + l.D + ' D</span></li>').join('')
      + '</ol>';
  }

  function final() {
    const lignes = BT.classement(t);
    return '<div class="e-final"><div><h2>Résultats finaux</h2>' + BT.podiumHtml(lignes) + '</div>'
      + '<div><h2>Classement</h2>' + listeClassement(lignes, false) + '</div></div>';
  }

  function classementDirect() {
    return '<section class="e-vue-classement"><h2>Classement en direct</h2>' + listeClassement(BT.classement(t), true) + '</section>';
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

  function rendre() {
    racine.className = 'ecran' + (vue === 'terrains' ? ' ecran--terrains' : vue === 'suite' ? ' ecran--suite' : vue === 'classement' ? ' ecran--classement' : '');
    if (!t) {
      racine.innerHTML = '<div class="e-message">' + (charge ? 'Tournoi introuvable' : 'Chargement du tournoi') + '</div>';
      return;
    }
    document.title = t.nom + ' · Écran d’affichage';
    const st = BT.statut(t);
    let h = tete();
    if (st === 'preparation') h += '<div class="e-message">Les matchs ne sont pas encore prêts</div>';
    else if (st === 'termine') h += final();
    else if (vue === 'classement') h += classementDirect();
    else h += terrains(st) + suite();
    racine.innerHTML = h;
    ajusterListe();
  }

  D.suivre(id, (nouveau, info) => {
    if (!nouveau && info && info.erreur && t) return;
    t = nouveau;
    charge = true;
    if (t) sonnerSiNouvelAppel();
    rendre();
  });

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
