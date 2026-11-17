/* Page des équipes (ouverte avec le QR code) : prochain match, terrain, envoi du score, résultats, classement. */
(function () {
  'use strict';
  const { esc } = BT;
  const D = BT.Donnees;
  const params = new URLSearchParams(location.search);
  const id = params.get('t');
  const cleChoix = 'badminton:equipe:' + id;
  const contenu = document.getElementById('contenu');
  document.getElementById('icone').outerHTML = BT.ICONE;

  let t = null;
  let charge = false;
  let propositions = {};
  let equipeId = params.get('e') || lireChoix();

  // Formulaire d'envoi du score (conservé quand la page se met à jour).
  let envoi = null; // { matchId, saisie: [[a, b], ...], confirmer, message }

  function lireChoix() {
    try { return localStorage.getItem(cleChoix); } catch (e) { return null; }
  }
  function retenirChoix(valeur) {
    try {
      if (valeur) localStorage.setItem(cleChoix, valeur);
      else localStorage.removeItem(cleChoix);
    } catch (e) { /* stockage indisponible */ }
  }

  const nom = (x) => esc(BT.nomEquipe(t, x));
  const rangTexte = (r) => (r === 1 ? '1er' : r + 'e');
  const pluriel = (n, mot) => n + ' ' + mot + (n > 1 ? 's' : '');
  const texteSets = (sets) => sets.map(([x, y]) => x + '-' + y).join(' · ');
  // Les scores sont rangés dans l'ordre du match ; on les montre avec l'équipe du joueur en premier.
  const versMoi = (sets, m, moi) => (m.a === moi ? sets : sets.map(([x, y]) => [y, x]));

  function propositionDe(matchId, equipe) {
    const p = propositions[matchId] && propositions[matchId][equipe];
    if (!p) return null;
    const sets = BT.enTableau(p.sets).map((s) => BT.enTableau(s).map(Number));
    return sets.length ? { sets, date: p.date } : null;
  }

  function message(texte) {
    document.getElementById('titre').textContent = 'Tournoi de badminton';
    contenu.innerHTML = '<div class="carte"><h2>' + esc(texte.titre) + '</h2><p>' + texte.corps + '</p></div>';
  }

  function introuvable() {
    if (!charge) {
      message({ titre: 'Chargement du tournoi', corps: 'Un instant.' });
      return;
    }
    message(D.enLigne
      ? { titre: 'Tournoi introuvable', corps: 'Ce tournoi n’existe plus ou l’adresse est incomplète. Scanne à nouveau le QR code affiché dans la salle.' }
      : { titre: 'Tournoi indisponible sur cet appareil', corps: 'Pour l’instant, le tournoi est enregistré sur l’appareil de l’organisateur. Le suivi sur téléphone arrivera avec la synchronisation en ligne.' });
  }

  function choix() {
    contenu.innerHTML = '<h2 style="margin-top:4px">Choisis ton équipe</h2>'
      + '<div class="choix-equipes">'
      + t.equipes.map((e) => '<a href="equipe.html?t=' + encodeURIComponent(t.id) + '&amp;e=' + encodeURIComponent(e.id) + '">' + esc(e.nom) + '</a>').join('')
      + '</div>';
  }

  /* ---------- Envoi du score ---------- */

  function formulaireEnvoi(m, e) {
    const adversaire = m.a === e.id ? m.b : m.a;
    const n = t.reglages.sets;
    while (envoi.saisie.length < n) envoi.saisie.push(['', '']);
    let h = '<form class="envoi-score" id="form-envoi" novalidate>'
      + '<p class="note" style="margin:0 0 4px">' + esc(BT.texteFormat(t.reglages)) + '</p>'
      + '<div class="score-grille">'
      + '<span></span><span class="score-equipe">' + esc(e.nom) + '</span><span class="score-equipe">' + nom(adversaire) + '</span>';
    for (let i = 0; i < n; i++) {
      const [va, vb] = envoi.saisie[i];
      h += '<span class="score-set">Set ' + (i + 1) + '</span>'
        + '<input type="number" inputmode="numeric" min="0" max="99" data-set="' + i + '" data-cote="0" value="' + esc(va) + '" aria-label="Set ' + (i + 1) + ', ' + esc(e.nom) + '"' + (Number(va) > Number(vb) && vb !== '' ? ' class="gagne"' : '') + '>'
        + '<input type="number" inputmode="numeric" min="0" max="99" data-set="' + i + '" data-cote="1" value="' + esc(vb) + '" aria-label="Set ' + (i + 1) + ', ' + nom(adversaire) + '"' + (Number(vb) > Number(va) && va !== '' ? ' class="gagne"' : '') + '>';
    }
    h += '</div>';
    if (envoi.message) {
      h += '<div class="score-message score-message--' + envoi.message.type + '">' + esc(envoi.message.texte)
        + (envoi.message.liste ? '<ul>' + envoi.message.liste.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '') + '</div>';
    }
    h += '<div class="actions" style="margin-top:14px">'
      + '<button type="submit" class="bouton principal grand">' + (envoi.confirmer ? 'Envoyer quand même' : 'Envoyer le score') + '</button>'
      + '<button type="button" class="bouton discret" data-action="fermer">Annuler</button></div></form>';
    return h;
  }

  function blocEnvoi(m, e) {
    if (!t.reglages.scoresJoueurs) return '';
    if (envoi && envoi.matchId === m.id) return formulaireEnvoi(m, e);
    const adversaire = m.a === e.id ? m.b : m.a;
    const moi = propositionDe(m.id, e.id);
    const autre = propositionDe(m.id, adversaire);
    if (!moi) {
      return '<div class="actions" style="margin-top:14px"><button type="button" class="bouton principal grand" data-action="ouvrir">Envoyer le score</button></div>'
        + (autre ? '<p class="note" style="margin:8px 0 0">' + nom(adversaire) + ' a envoyé ' + esc(texteSets(versMoi(autre.sets, m, e.id))) + '. Envoie le tien pour confirmer.</p>' : '');
    }
    let etat = 'En attente de validation par un organisateur.';
    if (autre) {
      etat = BT.memesSets(autre.sets, moi.sets)
        ? (t.reglages.validationAuto ? 'L’autre équipe a envoyé le même score, il va être validé.' : 'L’autre équipe a envoyé le même score. Un organisateur va le valider.')
        : 'L’autre équipe a envoyé un autre score (' + esc(texteSets(versMoi(autre.sets, m, e.id))) + '). Un organisateur va trancher.';
    }
    return '<div class="envoye"><div class="envoye-score">Score envoyé ' + esc(texteSets(versMoi(moi.sets, m, e.id))) + '</div>'
      + '<p style="margin:4px 0 10px">' + etat + '</p>'
      + '<div class="actions"><button type="button" class="bouton petit" data-action="modifier">Modifier</button>'
      + '<button type="button" class="bouton petit danger" data-action="retirer">Annuler l’envoi</button></div></div>';
  }

  async function envoyer() {
    const m = t.matchs.find((x) => x.id === envoi.matchId);
    if (!m || m.statut !== 'en_cours') {
      envoi = null;
      rendre();
      return;
    }
    const lu = BT.lireSaisie(envoi.saisie);
    if (lu.erreur) {
      envoi.message = { type: 'erreur', texte: lu.erreur };
      rendre();
      return;
    }
    const sets = versMoi(lu.sets, m, equipeId); // remet dans l'ordre du match (opération symétrique)
    if (!envoi.confirmer) {
      const alertes = BT.verifierScore(sets, t.reglages);
      if (alertes.length) {
        envoi.confirmer = true;
        envoi.message = { type: 'alerte', texte: 'Vérifie le score, il ne correspond pas aux règles du tournoi.', liste: alertes };
        rendre();
        return;
      }
    }
    try {
      await D.proposer(t.id, m.id, equipeId, sets);
      envoi = null;
    } catch (e) {
      envoi.message = { type: 'erreur', texte: 'Envoi impossible. Vérifie ta connexion internet et réessaie.' };
    }
    rendre();
  }

  /* ---------- Vue d'une équipe ---------- */

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
    if (envoi && (!enCours || envoi.matchId !== enCours.id)) envoi = null;

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
        + '<p class="note" style="margin:6px 0 0">Match ' + enCours.numero + ', commencé à ' + BT.heure(enCours.debut) + '</p>'
        + blocEnvoi(enCours, e)
        + '</section>';
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
      h += '<h2>Encore à jouer, dans l’ordre prévu</h2><ol class="liste-matchs">'
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
          const issue = !r.gagnant ? ['N', 'Nul'] : r.gagnant === cote ? ['V', 'Gagné'] : ['D', 'Perdu'];
          return '<li class="match match--termine"><span class="match-num" title="Match ' + m.numero + '">' + m.numero + '</span>'
            + '<span class="match-equipes">contre ' + nom(adversaire(m)) + '</span>'
            + '<span class="match-etat"><span class="match-score">' + esc(texteSets(versMoi(m.sets, m, e.id))) + '</span>'
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

    // Garde le curseur dans le formulaire de score pendant les mises à jour.
    const actif = document.activeElement;
    const focus = actif && actif.dataset && actif.dataset.set !== undefined ? [actif.dataset.set, actif.dataset.cote] : null;
    vueEquipe();
    if (focus) {
      const champ = contenu.querySelector('input[data-set="' + focus[0] + '"][data-cote="' + focus[1] + '"]');
      if (champ) champ.focus();
    }
  }

  /* ---------- Événements ---------- */

  contenu.addEventListener('click', (e) => {
    if (e.target.closest('[data-changer]')) { retenirChoix(null); return; }
    const el = e.target.closest('[data-action]');
    if (!el || !t) return;
    const enCours = t.matchs.find((m) => m.statut === 'en_cours' && (m.a === equipeId || m.b === equipeId));
    switch (el.dataset.action) {
      case 'ouvrir':
        if (enCours) envoi = { matchId: enCours.id, saisie: [], confirmer: false, message: null };
        rendre();
        { const champ = contenu.querySelector('#form-envoi input'); if (champ) champ.focus(); }
        break;
      case 'modifier': {
        if (!enCours) break;
        const moi = propositionDe(enCours.id, equipeId);
        envoi = { matchId: enCours.id, saisie: moi ? versMoi(moi.sets, enCours, equipeId).map(([a, b]) => [String(a), String(b)]) : [], confirmer: false, message: null };
        rendre();
        break;
      }
      case 'fermer':
        envoi = null;
        rendre();
        break;
      case 'retirer':
        if (enCours) {
          el.disabled = true;
          D.retirerProposition(t.id, enCours.id, equipeId).catch(() => { el.disabled = false; });
        }
        break;
      default:
        break;
    }
  });

  contenu.addEventListener('input', (e) => {
    const champ = e.target;
    if (!envoi || champ.dataset.set === undefined) return;
    const i = Number(champ.dataset.set);
    while (envoi.saisie.length <= i) envoi.saisie.push(['', '']);
    envoi.saisie[i][Number(champ.dataset.cote)] = champ.value;
    if (envoi.confirmer || envoi.message) {
      envoi.confirmer = false;
      envoi.message = null;
      const bloc = contenu.querySelector('#form-envoi .score-message');
      if (bloc) bloc.remove();
      const bouton = contenu.querySelector('#form-envoi [type="submit"]');
      if (bouton) bouton.textContent = 'Envoyer le score';
    }
    const [a, b] = envoi.saisie[i].map((v) => parseInt(v, 10));
    const paire = contenu.querySelectorAll('#form-envoi input[data-set="' + i + '"]');
    if (paire.length === 2) {
      paire[0].classList.toggle('gagne', a > b);
      paire[1].classList.toggle('gagne', b > a);
    }
  });

  contenu.addEventListener('submit', (e) => {
    if (e.target.id !== 'form-envoi') return;
    e.preventDefault();
    const bouton = e.target.querySelector('[type="submit"]');
    if (bouton) bouton.disabled = true;
    envoyer();
  });

  if (!id) {
    charge = true;
    introuvable();
    return;
  }

  D.suivre(id, (nouveau, info) => {
    if (!nouveau && info && info.erreur && t) return;
    t = nouveau;
    charge = true;
    rendre();
  });
  D.suivrePropositions(id, (p) => {
    propositions = p || {};
    if (t) rendre();
  });
  introuvable();
})();
