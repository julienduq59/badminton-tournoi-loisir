/* Écran d'affichage pour la salle : matchs en cours, prochains matchs, QR code, classement final. */
(function () {
  'use strict';
  const { esc, Store } = BT;
  const id = BT.idDansAdresse();
  const vue = new URLSearchParams(location.search).get('vue');
  const racine = document.getElementById('ecran');
  let t = Store.charger(id);
  let derniereMaj = t ? t.maj : 0;

  const nom = (equipeId) => esc(BT.nomEquipe(t, equipeId));
  const heureMaintenant = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  function tete() {
    const total = t.matchs.length;
    const faits = t.matchs.filter((m) => m.statut === 'termine').length;
    return '<header class="ecran-tete"><div class="ecran-nom">' + BT.ICONE + '<span>' + esc(t.nom) + '</span></div>'
      + (total ? '<div class="ecran-progres">' + faits + ' / ' + total + ' matchs joués</div>' : '')
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
        const tete = '<div class="e-terrain-tete"><div class="e-terrain-num"><small>Terrain</small>' + num + '</div>'
          + (m ? '<div class="e-terrain-match">Match ' + m.numero + '</div>' : '') + '</div>';
        if (!m) {
          return '<article class="e-terrain">' + tete + '<div class="e-court e-court--libre"><div class="e-court-libre">'
            + (st === 'pret' ? 'Bientôt' : 'Libre') + '</div></div></article>';
        }
        return '<article class="e-terrain">' + tete + '<div class="e-court">'
          + '<div class="e-court-cote">' + nom(m.a) + '</div><div class="e-court-filet"></div>'
          + '<div class="e-court-cote">' + nom(m.b) + '</div></div></article>';
      }).join('')
      + '</div></section>';
  }

  function blocQr() {
    const url = BT.urlPage('equipe.html', { t: t.id });
    return '<div class="e-qr"><div class="qr">' + BT.qrSvg(url) + '</div>'
      + '<p>Scanne pour suivre ton équipe<small>Prochain match, terrain, scores et classement</small></p></div>';
  }

  function suite() {
    const liste = BT.prochains(t);
    let h = '<aside class="zone-suite">';
    h += '<div><h2>Prochain match</h2>';
    if (liste.length) {
      const m = liste[0];
      h += '<div class="e-suivant"><div class="e-suivant-num">Match ' + m.numero + '</div>'
        + '<div class="e-suivant-equipe">' + nom(m.a) + '</div><div class="e-suivant-contre">contre</div>'
        + '<div class="e-suivant-equipe">' + nom(m.b) + '</div></div>';
    } else {
      h += '<div class="e-suivant"><div class="e-suivant-equipe">Tous les matchs sont lancés</div></div>';
    }
    h += '</div><div class="e-suite-reste">';
    if (liste.length > 1) {
      h += '<h2>Ensuite</h2><ol class="e-liste" id="e-liste">'
        + liste.slice(1, 12).map((m) => '<li><span class="e-num">' + m.numero + '</span>'
          + '<span class="e-eq">' + nom(m.a) + '<span class="e-contre">contre</span>' + nom(m.b) + '</span></li>').join('')
        + '</ol>';
    }
    h += blocQr() + '</div></aside>';
    return h;
  }

  function final() {
    const lignes = BT.classement(t);
    return '<div class="e-final"><div><h2>Résultats finaux</h2>' + BT.podiumHtml(lignes) + '</div>'
      + '<div><h2>Classement</h2><ol class="e-classement">'
      + lignes.slice(0, 12).map((l) => '<li><span class="rang">' + l.rang + '</span><span>' + esc(l.equipe.nom) + '</span>'
        + '<span class="bilan-e">' + l.V + ' V, ' + l.D + ' D</span></li>').join('')
      + '</ol></div></div>';
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

  function rendre() {
    racine.className = 'ecran' + (vue === 'terrains' ? ' ecran--terrains' : vue === 'suite' ? ' ecran--suite' : '');
    if (!t) {
      racine.innerHTML = '<div class="e-message">Ce tournoi n’est pas enregistré sur cet appareil</div>';
      return;
    }
    document.title = t.nom + ' · Écran d’affichage';
    const st = BT.statut(t);
    let h = tete();
    if (st === 'preparation') h += '<div class="e-message">Les matchs ne sont pas encore prêts</div>';
    else if (st === 'termine') h += final();
    else h += terrains(st) + suite();
    racine.innerHTML = h;
    ajusterListe();
  }

  Store.ecouter(id, (nouveau) => {
    t = nouveau;
    derniereMaj = t ? t.maj : 0;
    rendre();
  });

  // Filet de sécurité : relit le tournoi toutes les 3 secondes.
  setInterval(() => {
    const frais = Store.charger(id);
    if (frais && frais.maj !== derniereMaj) {
      t = frais;
      derniereMaj = frais.maj;
      rendre();
    }
    const h = document.getElementById('heure');
    if (h) h.textContent = heureMaintenant();
  }, 3000);

  window.addEventListener('resize', rendre);

  // Bouton plein écran, visible quand la souris bouge.
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
