/* Page des équipes (ouverte avec le QR code) : prochain match, terrain, scores, classement. */
(function () {
  'use strict';
  const { esc, Store } = BT;
  const params = new URLSearchParams(location.search);
  const id = params.get('t');
  const cleChoix = 'badminton:equipe:' + id;
  const contenu = document.getElementById('contenu');
  document.getElementById('icone').outerHTML = BT.ICONE;

  let t = Store.charger(id);
  let derniereMaj = t ? t.maj : 0;
  let equipeId = params.get('e') || lireChoix();

  function lireChoix() {
    try { return localStorage.getItem(cleChoix); } catch (e) { return null; }
  }
  function retenirChoix(valeur) {
    try {
      if (valeur) localStorage.setItem(cleChoix, valeur);
      else localStorage.removeItem(cleChoix);
    } catch (e) { /* stockage indisponible */ }
  }

  const nom = (equipeIdx) => esc(BT.nomEquipe(t, equipeIdx));
  const rangTexte = (r) => (r === 1 ? '1er' : r + 'e');
  const pluriel = (n, mot) => n + ' ' + mot + (n > 1 ? 's' : '');

  function introuvable() {
    document.getElementById('titre').textContent = 'Tournoi de badminton';
    contenu.innerHTML = '<div class="carte"><h2>Tournoi indisponible sur cet appareil</h2>'
      + '<p>Pour l’instant, le tournoi est enregistré sur l’appareil de l’organisateur. '
      + 'Le suivi des équipes sur téléphone arrivera avec la synchronisation en ligne.</p></div>';
  }

  function choix() {
    contenu.innerHTML = '<h2 style="margin-top:4px">Choisis ton équipe</h2>'
      + '<div class="choix-equipes">'
      + t.equipes.map((e) => '<a href="equipe.html?t=' + encodeURIComponent(t.id) + '&amp;e=' + encodeURIComponent(e.id) + '">' + esc(e.nom) + '</a>').join('')
      + '</div>';
  }

  function vueEquipe() {
    const e = BT.equipe(t, equipeId);
    const adversaire = (m) => (m.a === e.id ? m.b : m.a);
    const mes = t.matchs.filter((m) => m.a === e.id || m.b === e.id);
    const lignes = BT.classement(t);
    const moi = lignes.find((l) => l.equipe.id === e.id);
    const nuls = BT.nulsPossibles(t);
    const st = BT.statut(t);
    const ordre = BT.prochains(t);
    const aJouer = ordre.filter((m) => m.a === e.id || m.b === e.id);
    const enCours = mes.find((m) => m.statut === 'en_cours');
    const joues = mes.filter((m) => m.statut === 'termine').sort((x, y) => (y.fin || 0) - (x.fin || 0));

    let h = '<section class="entete-equipe"><h1>' + esc(e.nom) + '</h1>'
      + (e.joueurs ? '<p class="joueurs">' + esc(e.joueurs) + '</p>' : '')
      + '<div class="bilan">'
      + (moi && moi.J ? '<span>' + rangTexte(moi.rang) + ' sur ' + t.equipes.length + '</span>' : '')
      + '<span>' + pluriel(moi ? moi.V : 0, 'victoire') + '</span>'
      + (nuls && moi && moi.N ? '<span>' + pluriel(moi.N, 'nul') + '</span>' : '')
      + '<span>' + pluriel(moi ? moi.D : 0, 'défaite') + '</span>'
      + '</div></section>';

    if (enCours) {
      h += '<section class="prochain prochain--en_cours"><div class="prochain-titre"><span class="point-direct"></span>Match en cours</div>'
        + '<div class="prochain-adversaire">contre ' + nom(adversaire(enCours)) + '</div>'
        + '<div class="prochain-terrain">Terrain ' + enCours.terrain + '</div>'
        + '<p class="note" style="margin:6px 0 0">Match ' + enCours.numero + ', commencé à ' + BT.heure(enCours.debut) + '</p></section>';
    } else if (aJouer.length) {
      const m = aJouer[0];
      const avant = ordre.indexOf(m);
      let attente;
      if (st === 'pret') attente = avant === 0 ? 'Ce sera l’un des premiers matchs du tournoi.' : pluriel(avant, 'match') + ' passeront avant le tien.';
      else attente = avant === 0 ? 'C’est le prochain match appelé.' : pluriel(avant, 'match') + ' seront appelés avant le tien.';
      h += '<section class="prochain"><div class="prochain-titre">Ton prochain match</div>'
        + '<div class="prochain-adversaire">contre ' + nom(adversaire(m)) + '</div>'
        + '<p style="margin:0 0 6px">Match ' + m.numero + '. ' + attente + '</p>'
        + '<p class="note" style="margin:0">Le numéro du terrain s’affiche ici dès que le match est appelé.</p></section>';
    } else if (mes.length) {
      h += '<section class="prochain"><div class="prochain-titre">Tes matchs</div>'
        + '<div class="prochain-adversaire">Tous tes matchs sont joués</div>'
        + (st === 'termine' && moi ? '<p style="margin:0">Ton équipe termine ' + rangTexte(moi.rang) + ' sur ' + t.equipes.length + '.</p>' : '')
        + '</section>';
    } else {
      h += '<section class="prochain"><div class="prochain-titre">Tes matchs</div>'
        + '<p style="margin:0">Les matchs ne sont pas encore prêts.</p></section>';
    }

    if (aJouer.length > (enCours ? 0 : 1)) {
      const reste = enCours ? aJouer : aJouer.slice(1);
      h += '<h2>Encore à jouer, dans l\u2019ordre prévu</h2><ol class="liste-matchs">'
        + reste.map((m) => '<li class="match"><span class="match-num" title="Match ' + m.numero + '">' + m.numero + '</span>'
          + '<span class="match-equipes">contre ' + nom(adversaire(m)) + '</span>'
          + '<span class="match-etat"><span class="etiquette">À jouer</span></span></li>').join('')
        + '</ol>';
    }

    if (joues.length) {
      h += '<h2>Matchs joués</h2><ol class="liste-matchs">'
        + joues.map((m) => {
          const r = BT.resultat(m);
          const cote = m.a === e.id ? 'a' : 'b';
          const score = (m.sets || []).map(([x, y]) => (cote === 'a' ? x + '-' + y : y + '-' + x)).join(' · ');
          const issue = !r.gagnant ? ['N', 'Nul'] : r.gagnant === cote ? ['V', 'Gagné'] : ['D', 'Perdu'];
          return '<li class="match match--termine"><span class="match-num" title="Match ' + m.numero + '">' + m.numero + '</span>'
            + '<span class="match-equipes">contre ' + nom(adversaire(m)) + '</span>'
            + '<span class="match-etat"><span class="match-score">' + esc(score) + '</span>'
            + '<span class="etiquette etiquette--' + issue[0] + '">' + issue[1] + '</span></span></li>';
        }).join('')
        + '</ol>';
    }

    if (t.matchs.length) {
      h += '<h2>Classement</h2><div class="tableau-conteneur"><table class="tableau"><thead><tr>'
        + '<th>Rang</th><th class="equipe">Équipe</th><th><abbr title="Matchs joués">J</abbr></th><th><abbr title="Victoires">V</abbr></th>'
        + (nuls ? '<th><abbr title="Matchs nuls">N</abbr></th>' : '')
        + '<th><abbr title="Défaites">D</abbr></th><th>Sets</th></tr></thead><tbody>'
        + lignes.map((l) => '<tr' + (l.equipe.id === e.id ? ' class="moi"' : '') + '><td class="rang">' + l.rang + '</td>'
          + '<td class="equipe">' + esc(l.equipe.nom) + '</td><td>' + l.J + '</td><td class="fort">' + l.V + '</td>'
          + (nuls ? '<td>' + l.N + '</td>' : '') + '<td>' + l.D + '</td><td>' + BT.signe(l.diffSets) + '</td></tr>').join('')
        + '</tbody></table></div>';
    }

    h += '<p style="margin-top:24px"><a class="bouton" href="equipe.html?t=' + encodeURIComponent(t.id) + '" data-changer>Changer d’équipe</a></p>'
      + '<p class="note">' + esc(BT.texteFormat(t.reglages)) + '. Mis à jour à ' + BT.heure(t.maj) + '.</p>';
    contenu.innerHTML = h;
  }

  function rendre() {
    if (!t) { introuvable(); return; }
    document.getElementById('titre').textContent = t.nom;
    document.title = t.nom + ' · Mon équipe';
    if (equipeId && !t.equipes.some((e) => e.id === equipeId)) equipeId = null;
    if (!equipeId) { choix(); return; }
    retenirChoix(equipeId);
    vueEquipe();
  }

  contenu.addEventListener('click', (e) => {
    if (e.target.closest('[data-changer]')) retenirChoix(null);
  });

  Store.ecouter(id, (nouveau) => {
    t = nouveau;
    derniereMaj = t ? t.maj : 0;
    rendre();
  });
  setInterval(() => {
    const frais = Store.charger(id);
    if (frais && frais.maj !== derniereMaj) {
      t = frais;
      derniereMaj = frais.maj;
      rendre();
    }
  }, 5000);

  rendre();
})();
