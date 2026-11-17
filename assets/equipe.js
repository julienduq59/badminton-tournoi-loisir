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

  // Alerte quand le match de l'équipe est appelé (page ouverte).
  const cleAlerte = 'badminton:alerte:' + id;
  let dernierAppel; // match en cours de l'équipe lors de la dernière mise à jour

  function alerteVoulue() {
    try { return localStorage.getItem(cleAlerte) === 'oui'; } catch (e) { return false; }
  }
  function choisirAlerte(oui) {
    try { localStorage.setItem(cleAlerte, oui ? 'oui' : 'non'); } catch (e) { /* stockage indisponible */ }
  }

  function blocAlerte() {
    if (alerteVoulue() && BT.sonActif()) {
      return '<div class="alerte-appel alerte-appel--on"><p>Alerte activée. Garde cette page ouverte, écran allumé : ton téléphone sonne et vibre quand ton match est appelé.</p>'
        + '<button type="button" class="bouton petit" data-action="alerte-off">Désactiver l’alerte</button></div>';
    }
    return '<div class="alerte-appel"><button type="button" class="bouton principal" data-action="alerte-on">Me prévenir quand mon match est appelé</button>'
      + (alerteVoulue() ? '<p class="note">Touche le bouton pour réactiver l’alerte après avoir rouvert la page.</p>' : '') + '</div>';
  }

  function verifierAppel() {
    if (!t || !equipeId) return;
    const m = t.matchs.find((x) => x.statut === 'en_cours' && (x.a === equipeId || x.b === equipeId));
    const actuel = m ? m.id : null;
    if (dernierAppel !== undefined && actuel && actuel !== dernierAppel && alerteVoulue()) {
      BT.bip();
      setTimeout(BT.bip, 1300);
      if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]);
    }
    dernierAppel = actuel;
  }

  // Vue affichée : l'équipe, le classement en direct ou le récap à télécharger.
  const VUES = ['equipe', 'classement', 'recap', 'partager'];
  let vue = VUES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'equipe';
  let recap = null; // { url, blob, nom } de la dernière image créée
  let partageEquipe = false; // QR code de l'équipe (pour un partenaire) plutôt que celui du tournoi

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
    const reg = BT.formatMatch(t, m);
    const n = reg.sets;
    while (envoi.saisie.length < n) envoi.saisie.push(['', '']);
    let h = '<form class="envoi-score" id="form-envoi" novalidate>'
      + '<p class="note" style="margin:0 0 4px">' + esc(BT.texteFormat(reg)) + '</p>'
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
    if (m.phase === 'finale' && !BT.resultat({ sets }).gagnant) {
      envoi.message = { type: 'erreur', texte: 'Un match de phase finale doit avoir un vainqueur.' };
      rendre();
      return;
    }
    if (!envoi.confirmer) {
      const alertes = BT.verifierScore(sets, BT.formatMatch(t, m));
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
    const pouleMoi = BT.avecPoules(t) ? e.poule : null;
    const lignes = BT.classement(t, pouleMoi);
    const moi = lignes.find((l) => l.equipe.id === e.id);
    const etiquette = (m) => (BT.categorieMatch(t, m) ? '<span class="match-cat match-cat--' + esc(m.categorie) + '">' + esc(BT.categorieMatch(t, m)) + '</span>' : '')
      + (m.phase === 'finale' ? '<span class="match-tour match-tour--finale">' + esc(BT.etiquetteMatch(t, m)) + '</span>' : '');
    const categorie = (m) => (BT.categorieMatch(t, m) ? ' · ' + esc(BT.categorieMatch(t, m).toLowerCase()) : '');
    const nuls = BT.nulsPossibles(t);
    const st = BT.statut(t);
    const plan = BT.planifier(t, BT.dureeMatch(t));
    const ordre = plan.map((x) => x.m);
    const heurePrevue = (m) => {
      const x = plan.find((p) => p.m === m);
      return x && x.heure ? BT.heure(x.heure) : null;
    };
    const aJouer = ordre.filter((m) => m.a === e.id || m.b === e.id);
    const enCours = mes.find((m) => m.statut === 'en_cours');
    const joues = mes.filter((m) => m.statut === 'termine').sort((x, y) => (y.fin || 0) - (x.fin || 0));
    if (envoi && (!enCours || envoi.matchId !== enCours.id)) envoi = null;

    // Parcours en phase finale
    let parcours = '';
    let rangFinal = null;
    if (t.finale) {
      const cf = BT.classementFinal(t) || [];
      const ligne = cf.find((l) => l.equipe.id === e.id);
      if (st === 'termine' && ligne) rangFinal = ligne.rang;
      if (!t.finale.places.includes(e.id)) parcours = 'Non qualifiée pour la phase finale';
      else if (ligne) {
        const etape = ligne.etape || '';
        if (etape === 'Vainqueur') parcours = 'Vainqueur du tournoi';
        else if (etape === 'Finaliste') parcours = 'Finaliste';
        else if (/3e place/.test(etape)) parcours = '3e place';
        else if (/4e place/.test(etape)) parcours = '4e place';
        else if (etape === 'Encore en lice') parcours = 'Qualifiée pour la phase finale';
        else parcours = 'Éliminée en ' + etape.toLowerCase();
      }
    } else if (BT.nbQualifies(t) >= 2 && BT.phasePoulesFinie(t)) {
      parcours = BT.qualifies(t).some((x) => x.equipe.id === e.id) ? 'Qualifiée pour la phase finale' : 'Non qualifiée pour la phase finale';
    }

    let h = '';
    const annonce = t.annonce && t.annonce.texte ? t.annonce.texte : '';
    if (annonce || t.pause) {
      h += '<div class="annonce-equipe' + (t.pause ? ' annonce-equipe--pause' : '') + '">'
        + esc(annonce || 'Pause, les matchs reprennent bientôt') + '</div>';
    }
    h += '<section class="entete-equipe"><h1>' + esc(e.nom) + '</h1>'
      + (e.joueurs ? '<p class="joueurs">' + esc(e.joueurs) + '</p>' : '')
      + (e.abandon ? '<p class="joueurs">L’équipe a abandonné, ses matchs restants sont perdus par forfait.</p>' : '')
      + (parcours ? '<p class="statut-finale">' + esc(parcours) + '</p>' : '')
      + '<div class="bilan">'
      + (pouleMoi != null ? '<span>' + BT.nomPoule(pouleMoi) + '</span>' : '')
      + (moi && moi.J ? '<span>' + rangTexte(moi.rang) + ' sur ' + lignes.length + '</span>' : '')
      + '<span>' + pluriel(moi ? moi.V : 0, 'victoire') + '</span>'
      + (nuls && moi && moi.N ? '<span>' + pluriel(moi.N, 'nul') + '</span>' : '')
      + '<span>' + pluriel(moi ? moi.D : 0, 'défaite') + '</span>'
      + '</div></section>';

    // Bandeau « dans la salle » : dernier numéro appelé et numéro du prochain match de l'équipe.
    const actuel = BT.numeroActuel(t);
    const prochain = aJouer[0] || null;
    const avantProchain = prochain ? ordre.indexOf(prochain) : -1;
    const numProchain = prochain ? BT.numero(t, prochain) : null;
    if (st !== 'termine' && t.matchs.length) {
      let ecart = '';
      if (prochain && enCours) {
        ecart = 'Ton match suivant est le n° ' + numProchain + (avantProchain === 0 ? ', appelé juste après.' : ', avec encore ' + pluriel(avantProchain, 'match') + ' à appeler avant.');
      } else if (prochain) {
        const vers = heurePrevue(prochain);
        if (avantProchain === 0) ecart = st === 'pret' ? 'Ton équipe joue dès le début du tournoi.' : 'Ton prochain match est le prochain appelé.';
        else ecart = 'Encore ' + pluriel(avantProchain, 'match') + ' à appeler avant le tien' + (vers ? ', vers ' + vers + ' (estimation)' : '') + '.';
      } else if (enCours) {
        ecart = 'C’est ton dernier match.';
      }
      h += '<section class="salle">'
        + '<div class="salle-bloc"><span class="salle-label">' + (actuel ? 'En cours dans la salle' : 'Pas encore commencé') + '</span>'
        + '<span class="salle-num">' + (actuel ? 'n° ' + actuel : '–') + '</span></div>'
        + '<div class="salle-bloc salle-bloc--moi"><span class="salle-label">' + (enCours ? 'Ton match' : 'Ton prochain match') + '</span>'
        + '<span class="salle-num">' + (enCours ? 'n° ' + BT.numero(t, enCours) : numProchain ? 'n° ' + numProchain : '–') + '</span>'
        + ((enCours || prochain) && BT.categorieMatch(t, enCours || prochain) ? '<span class="salle-cat">' + esc(BT.categorieMatch(t, enCours || prochain)) + '</span>' : '') + '</div>'
        + (ecart ? '<p class="salle-ecart">' + ecart + '</p>' : '')
        + '</section>';
    }

    if (enCours) {
      h += '<section class="prochain prochain--en_cours"><div class="prochain-titre"><span class="point-direct"></span>'
        + (enCours.phase === 'finale' ? esc(BT.etiquetteMatch(t, enCours)) + ' en cours' : 'Ton match en cours') + ', n° ' + BT.numero(t, enCours) + categorie(enCours) + '</div>'
        + '<div class="prochain-adversaire">contre ' + nom(adversaire(enCours)) + '</div>'
        + '<div class="prochain-terrain">Terrain ' + enCours.terrain + '</div>'
        + '<p class="note" style="margin:6px 0 0">Commencé à ' + BT.heure(enCours.debut) + '</p>'
        + blocEnvoi(enCours, e)
        + '</section>';
    }
    if (prochain) {
      const vers = heurePrevue(prochain);
      h += '<section class="prochain' + (enCours ? ' prochain--suivant' : '') + '"><div class="prochain-titre">Ton prochain match'
        + (prochain.phase === 'finale' ? ', ' + esc(BT.etiquetteMatch(t, prochain).toLowerCase()) : '') + ', n° ' + numProchain + categorie(prochain) + '</div>'
        + '<div class="prochain-adversaire">contre ' + nom(adversaire(prochain)) + '</div>'
        + (vers ? '<div class="prochain-terrain">Vers ' + vers + '<small> (estimation)</small></div>' : '')
        + '<p class="note" style="margin:6px 0 0">Le numéro du terrain s’affiche ici dès que le match est appelé.</p>'
        + (enCours ? '' : blocAlerte())
        + '</section>';
    }
    if (!enCours && !prochain) {
      if (mes.length) {
        h += '<section class="prochain"><div class="prochain-titre">Tes matchs</div>'
          + '<div class="prochain-adversaire">Tous tes matchs sont joués</div>'
          + (st === 'termine' && (rangFinal || (moi && !BT.avecPoules(t)))
            ? '<p style="margin:0">Ton équipe termine ' + rangTexte(rangFinal || moi.rang) + ' sur ' + t.equipes.length + '.</p>' : '')
          + '</section>';
      } else {
        h += '<section class="prochain"><div class="prochain-titre">Tes matchs</div>'
          + '<p style="margin:0">Les matchs ne sont pas encore prêts.</p></section>';
      }
    }

    if (aJouer.length > 1) {
      h += '<h2>Ensuite, dans l’ordre prévu</h2><ol class="liste-matchs">'
        + aJouer.slice(1).map((m) => {
          const vers = heurePrevue(m);
          const avant = ordre.indexOf(m);
          return '<li class="match"><span class="match-num" title="Match ' + BT.numero(t, m) + '">' + BT.numero(t, m) + '</span>'
            + '<span class="match-equipes">' + etiquette(m) + 'contre ' + nom(adversaire(m)) + '</span>'
            + '<span class="match-etat"><span class="etiquette">' + (vers ? 'Vers ' + vers : 'Dans ' + pluriel(avant, 'match')) + '</span></span></li>';
        }).join('')
        + '</ol>';
    }

    if (joues.length) {
      h += '<h2>Matchs joués</h2><ol class="liste-matchs">'
        + joues.map((m) => {
          const r = BT.resultat(m);
          const cote = m.a === e.id ? 'a' : 'b';
          const issue = !r.gagnant ? ['N', 'Nul'] : r.gagnant === cote ? ['V', 'Gagné'] : ['D', 'Perdu'];
          const score = m.forfait ? (m.forfait === e.id ? 'Forfait' : 'Forfait adverse') : esc(texteSets(versMoi(m.sets, m, e.id)));
          return '<li class="match match--termine"><span class="match-num" title="Match ' + BT.numero(t, m) + '">' + BT.numero(t, m) + '</span>'
            + '<span class="match-equipes">' + etiquette(m) + 'contre ' + nom(adversaire(m)) + '</span>'
            + '<span class="match-etat"><span class="match-score">' + score + '</span>'
            + '<span class="etiquette etiquette--' + issue[0] + '">' + issue[1] + '</span></span></li>';
        }).join('')
        + '</ol>';
    }

    const surTerrains = BT.matchsEnCours(t);
    if (surTerrains.length) {
      h += '<h2>En ce moment sur les terrains</h2><ol class="liste-terrains">'
        + surTerrains.map((m) => '<li' + (m.a === e.id || m.b === e.id ? ' class="moi"' : '') + '><span class="t-num">Terrain ' + m.terrain + ' · n° ' + BT.numero(t, m) + '</span>'
          + '<span>' + nom(m.a) + ' <span class="contre">contre</span> ' + nom(m.b) + '</span></li>').join('')
        + '</ol>';
    }

    if (t.finale) {
      h += '<h2>Phase finale</h2><div class="tableau-defilant">' + BT.tableauHtml(t, e.id) + '</div>';
    }

    if (t.matchs.length) {
      h += '<div class="titre-actions"><h2>Classement' + (pouleMoi != null ? ', ' + BT.nomPoule(pouleMoi).toLowerCase() : '') + '</h2>'
        + '<button type="button" class="bouton petit" data-vue="classement">Tout le classement</button></div><div class="tableau-conteneur"><table class="tableau"><thead><tr>'
        + '<th>Rang</th><th class="equipe">Équipe</th><th><abbr title="Matchs joués">J</abbr></th><th><abbr title="Victoires">V</abbr></th>'
        + (nuls ? '<th><abbr title="Matchs nuls">N</abbr></th>' : '')
        + '<th><abbr title="Défaites">D</abbr></th><th>Sets</th></tr></thead><tbody>'
        + lignes.map((l) => '<tr' + (l.equipe.id === e.id ? ' class="moi"' : '') + '><td class="rang">' + l.rang + '</td>'
          + '<td class="equipe">' + esc(l.equipe.nom) + '</td><td>' + l.J + '</td><td class="fort">' + l.V + '</td>'
          + (nuls ? '<td>' + l.N + '</td>' : '') + '<td>' + l.D + '</td><td>' + BT.signe(l.diffSets) + '</td></tr>').join('')
        + '</tbody></table></div>';
    }

    h += '<div class="actions" style="margin-top:24px"><a class="bouton" href="equipe.html?t=' + encodeURIComponent(t.id) + '" data-changer>Changer d’équipe</a>'
      + '<button type="button" class="bouton" data-vue="partager">Partager le QR code</button></div>'
      + '<p class="note">' + esc(BT.texteFormat(t.reglages)) + '. Mis à jour à ' + BT.heure(t.maj) + '.</p>';
    contenu.innerHTML = h;
  }

  /* ---------- Classement en direct ---------- */

  function tableClassement(lignes, qualifies) {
    const nuls = BT.nulsPossibles(t);
    return '<div class="tableau-conteneur"><table class="tableau"><thead><tr>'
      + '<th>Rang</th><th class="equipe">Équipe</th><th><abbr title="Matchs joués">J</abbr></th><th><abbr title="Victoires">V</abbr></th>'
      + (nuls ? '<th><abbr title="Matchs nuls">N</abbr></th>' : '')
      + '<th><abbr title="Défaites">D</abbr></th><th><abbr title="Différence de points">Pts</abbr></th></tr></thead><tbody>'
      + lignes.map((l, i) => '<tr class="' + (l.equipe.id === equipeId ? 'moi' : '') + (i < qualifies ? ' qualifie' : '') + '"><td class="rang">' + l.rang + '</td>'
        + '<td class="equipe">' + esc(l.equipe.nom) + (i < qualifies ? ' <span class="etiquette etiquette--qualifie">Q</span>' : '') + '</td>'
        + '<td>' + l.J + '</td><td class="fort">' + l.V + '</td>' + (nuls ? '<td>' + l.N + '</td>' : '') + '<td>' + l.D + '</td>'
        + '<td>' + BT.signe(l.diffPts) + '</td></tr>').join('')
      + '</tbody></table></div>';
  }

  function vueClassement() {
    const st = BT.statut(t);
    const r = t.reglages;
    const final = st === 'termine' ? BT.classementFinal(t) : null;
    let h = '<p class="en-direct"><span class="point-direct"></span>' + (st === 'termine' ? 'Classement final' : 'En direct, mis à jour à ' + BT.heure(t.maj)) + '</p>';
    if (final) {
      h += BT.podiumHtml(final) + '<div class="tableau-conteneur"><table class="tableau"><thead><tr><th>Rang</th><th class="equipe">Équipe</th>'
        + '<th class="equipe">' + (t.finale ? 'Parcours' : 'Bilan') + '</th></tr></thead><tbody>'
        + final.map((l) => '<tr' + (l.equipe.id === equipeId ? ' class="moi"' : '') + '><td class="rang">' + (l.rang || '') + '</td><td class="equipe">' + esc(l.equipe.nom) + '</td>'
          + '<td class="equipe">' + esc(t.finale ? l.etape || '' : l.V + ' V, ' + l.D + ' D') + '</td></tr>').join('')
        + '</tbody></table></div>';
    }
    if (t.finale) h += '<h2>Phase finale</h2><div class="tableau-defilant">' + BT.tableauHtml(t, equipeId) + '</div>';
    if (BT.avecPoules(t)) {
      BT.listePoules(t).forEach((p) => { h += '<h2>' + p.nom + '</h2>' + tableClassement(BT.classement(t, p.numero), r.qualifiesParPoule || 0); });
    } else if (!final || t.finale) {
      h += (t.finale ? '<h2>Championnat</h2>' : '') + tableClassement(BT.classement(t), Number(r.phaseFinale) || 0);
    }
    h += '<p class="note" style="margin-top:12px">Classement au nombre de victoires, puis au match entre les deux équipes à égalité, puis à la différence de sets et de points.'
      + (BT.nbQualifies(t) >= 2 ? ' Q : qualifiée pour la phase finale si le classement reste le même.' : '') + '</p>';
    contenu.innerHTML = h;
  }

  /* ---------- Récap à télécharger ---------- */

  function texteScore(sets) {
    return sets.map(([x, y]) => x + '-' + y).join(' · ');
  }

  function chiffresHtml() {
    const st = BT.statsTournoi(t);
    let h = '';
    if (equipeId) {
      const s = BT.statsEquipe(t, equipeId);
      const lignes = [
        ['Bilan', s.V + ' victoire' + (s.V > 1 ? 's' : '') + ', ' + s.D + ' défaite' + (s.D > 1 ? 's' : '') + (s.N ? ', ' + s.N + ' nul' + (s.N > 1 ? 's' : '') : '')],
        ['Points', s.ptsP + ' marqués, ' + s.ptsC + ' encaissés (' + BT.signe(s.ptsP - s.ptsC) + ')'],
        ['Meilleure série', s.serie + ' victoire' + (s.serie > 1 ? 's' : '') + ' d’affilée'],
      ];
      if (s.meilleureVictoire) lignes.push(['Plus belle victoire', texteScore(s.meilleureVictoire.score) + ' contre ' + BT.nomEquipe(t, s.meilleureVictoire.adversaire)]);
      if (s.plusSerre) lignes.push(['Match le plus serré', texteScore(s.plusSerre.score) + ' contre ' + BT.nomEquipe(t, s.plusSerre.adversaire)]);
      if (s.minutes) lignes.push(['Temps de jeu', s.minutes + ' minutes' + (s.plusLong ? ', plus long match ' + s.plusLong.duree + ' min' : '')]);
      const cats = Object.keys(s.parCategorie).filter(Boolean);
      if (cats.length > 1) lignes.push(['Par catégorie', cats.map((c) => BT.nomCategorie(c) + ' ' + s.parCategorie[c].V + ' V, ' + s.parCategorie[c].D + ' D').join(' · ')]);
      h += '<h2>Tes chiffres</h2><dl class="chiffres-liste">' + lignes.map(([a, b]) => '<dt>' + a + '</dt><dd>' + esc(b) + '</dd>').join('') + '</dl>';
    }
    const lt = [['Matchs joués', st.matchs + ' sur ' + st.total], ['Points marqués', st.points.toLocaleString('fr-FR')]];
    const affiche = (f) => BT.nomEquipe(t, f.m.a) + ' ' + BT.texteScore(f.m) + ' ' + BT.nomEquipe(t, f.m.b);
    if (st.plusGrandEcart) lt.push(['Plus grand écart', affiche(st.plusGrandEcart)]);
    if (st.plusSerre) lt.push(['Match le plus serré', affiche(st.plusSerre)]);
    if (st.plusLong) lt.push(['Plus long match', st.plusLong.duree + ' min, ' + BT.nomEquipe(t, st.plusLong.m.a) + ' contre ' + BT.nomEquipe(t, st.plusLong.m.b)]);
    if (st.champion) lt.push(['Vainqueur', st.champion.nom]);
    h += '<h2>Le tournoi en chiffres</h2><dl class="chiffres-liste">' + lt.map(([a, b]) => '<dt>' + a + '</dt><dd>' + esc(b) + '</dd>').join('') + '</dl>';
    return h;
  }

  async function genererRecap() {
    const zone = document.getElementById('recap-image');
    if (!zone) return;
    zone.innerHTML = '<p class="note">Création de l’image…</p>';
    try {
      const canvas = await BT.dessinerRecap(t, equipeId);
      const blob = await new Promise((ok) => canvas.toBlob(ok, 'image/png'));
      if (recap && recap.url) URL.revokeObjectURL(recap.url);
      const base = (equipeId ? BT.nomEquipe(t, equipeId) : t.nom).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      recap = { blob, url: URL.createObjectURL(blob), nom: 'recap-' + (base || 'tournoi') + '.png' };
      zone.innerHTML = '<img src="' + recap.url + '" alt="Récapitulatif ' + esc(equipeId ? 'de l’équipe ' + BT.nomEquipe(t, equipeId) : 'du tournoi') + '">';
      const lien = document.getElementById('recap-telecharger');
      lien.href = recap.url;
      lien.download = recap.nom;
      lien.hidden = false;
      const fichier = new File([blob], recap.nom, { type: 'image/png' });
      document.getElementById('recap-partager').hidden = !(navigator.canShare && navigator.canShare({ files: [fichier] }));
      document.getElementById('recap-maj').classList.remove('accent');
    } catch (e) {
      zone.innerHTML = '<p class="erreur-champ">Impossible de créer l’image sur cet appareil.</p>';
    }
  }

  function vueRecap() {
    contenu.innerHTML = '<section class="recap">'
      + '<p class="note" style="margin-top:4px">' + (equipeId ? 'Le bilan de ton équipe et le tournoi en chiffres, en une image à garder ou à partager.' : 'Le tournoi en chiffres, en une image à garder ou à partager. Choisis ton équipe pour avoir ton propre récap.') + '</p>'
      + '<div class="recap-image" id="recap-image"></div>'
      + '<div class="actions recap-actions">'
      + '<a class="bouton principal grand" id="recap-telecharger" hidden>Télécharger l’image</a>'
      + '<button type="button" class="bouton grand" id="recap-partager" data-action="partager" hidden>Partager</button>'
      + '<button type="button" class="bouton" id="recap-maj" data-action="recap-maj">Mettre à jour avec les derniers résultats</button>'
      + '</div>'
      + chiffresHtml()
      + '</section>';
    genererRecap();
  }

  /* ---------- Partager le QR code ---------- */

  function lienPartage() {
    const p = { t: t.id };
    if (partageEquipe && equipeId) p.e = equipeId;
    return BT.urlPage('equipe.html', p);
  }

  function vuePartager() {
    if (!equipeId) partageEquipe = false;
    const url = lienPartage();
    const e = equipeId ? BT.equipe(t, equipeId) : null;
    let h = '<section class="partage">';
    if (e) {
      h += '<div class="filtres partage-choix" role="group" aria-label="QR code à partager">'
        + '<button type="button" data-action="qr-tournoi" aria-pressed="' + !partageEquipe + '">Tout le tournoi</button>'
        + '<button type="button" data-action="qr-equipe" aria-pressed="' + partageEquipe + '">Mon équipe</button></div>';
    }
    h += '<p class="partage-texte">' + (partageEquipe
      ? 'Pour quelqu’un de ton équipe. En scannant ce QR code, il arrive directement sur la page de l’équipe ' + esc(e.nom) + '.'
      : 'Montre ce QR code à un autre joueur. Il le scanne avec l’appareil photo de son téléphone, puis choisit son équipe.') + '</p>'
      + '<div class="qr qr-partage">' + BT.qrSvg(url) + '</div>'
      + '<div class="actions partage-actions">'
      + (navigator.share ? '<button type="button" class="bouton principal grand" data-action="partager-lien">Envoyer le lien</button>' : '')
      + '<button type="button" class="bouton grand" data-action="copier-lien">Copier le lien</button></div>'
      + '<p class="lien-texte">' + esc(url) + '</p>'
      + '<p class="note">Si le QR code ne passe pas, monte la luminosité de ton écran.</p>'
      + '</section>';
    contenu.innerHTML = h;
  }

  function copier(texte, bouton) {
    const fait = () => {
      const avant = bouton.textContent;
      bouton.textContent = 'Lien copié';
      setTimeout(() => { if (bouton.isConnected) bouton.textContent = avant; }, 2000);
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(texte).then(fait, () => copierAncien(texte) && fait());
    } else if (copierAncien(texte)) fait();
  }

  function copierAncien(texte) {
    const zone = document.createElement('textarea');
    zone.value = texte;
    zone.setAttribute('readonly', '');
    zone.style.position = 'fixed';
    zone.style.opacity = '0';
    document.body.appendChild(zone);
    zone.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    zone.remove();
    return ok;
  }

  function afficherOnglets() {
    const nav = document.getElementById('onglets-tel');
    nav.hidden = false;
    document.getElementById('onglet-equipe').textContent = equipeId ? 'Mon équipe' : 'Équipes';
    nav.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.vue === vue)));
  }

  function changerVue(nouvelle) {
    vue = nouvelle;
    history.replaceState(null, '', location.pathname + location.search + (vue === 'equipe' ? '' : '#' + vue));
    window.scrollTo(0, 0);
    rendre(true);
  }

  function rendre(force) {
    if (!t) { introuvable(); return; }
    document.getElementById('titre').textContent = t.nom;
    document.title = t.nom + ' · Mon équipe';
    if (equipeId && !t.equipes.some((e) => e.id === equipeId)) equipeId = null;
    afficherOnglets();
    if (vue === 'classement') { vueClassement(); return; }
    if (vue === 'partager') {
      // Le QR code ne change pas avec les résultats : pas besoin de le redessiner à chaque mise à jour.
      if (force || !contenu.querySelector('.partage')) vuePartager();
      return;
    }
    if (vue === 'recap') {
      // L'image n'est pas recréée à chaque résultat : le bouton signale qu'il y a du nouveau.
      if (force || !document.getElementById('recap-image')) vueRecap();
      else { const b = document.getElementById('recap-maj'); if (b) b.classList.add('accent'); }
      return;
    }
    if (!equipeId) { choix(); return; }
    retenirChoix(equipeId);
    const enJeu = t.matchs.find((x) => x.statut === 'en_cours' && (x.a === equipeId || x.b === equipeId));
    if (enJeu) document.title = 'Terrain ' + enJeu.terrain + ' · ' + BT.nomEquipe(t, equipeId);

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

  document.getElementById('onglets-tel').addEventListener('click', (e) => {
    const b = e.target.closest('[data-vue]');
    if (b) changerVue(b.dataset.vue);
  });

  contenu.addEventListener('click', (e) => {
    if (e.target.closest('[data-changer]')) { retenirChoix(null); return; }
    const versVue = e.target.closest('[data-vue]');
    if (versVue) { changerVue(versVue.dataset.vue); return; }
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
      case 'alerte-on':
        choisirAlerte(true);
        BT.activerSon();
        if (navigator.vibrate) navigator.vibrate(200);
        setTimeout(() => { BT.bip(); rendre(); }, 150);
        break;
      case 'alerte-off':
        choisirAlerte(false);
        rendre();
        break;
      case 'recap-maj':
        vueRecap();
        break;
      case 'partager':
        if (recap) {
          const fichier = new File([recap.blob], recap.nom, { type: 'image/png' });
          navigator.share({ files: [fichier], title: t.nom, text: 'Mon récap du tournoi ' + t.nom }).catch(() => {});
        }
        break;
      case 'qr-tournoi':
      case 'qr-equipe':
        partageEquipe = el.dataset.action === 'qr-equipe';
        vuePartager();
        break;
      case 'partager-lien':
        navigator.share({
          title: t.nom,
          text: (partageEquipe && equipeId ? 'Suis notre équipe ' + BT.nomEquipe(t, equipeId) : 'Suis « ' + t.nom + ' »') + ' sur ton téléphone',
          url: lienPartage(),
        }).catch(() => {});
        break;
      case 'copier-lien':
        copier(lienPartage(), el);
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
    verifierAppel();
    rendre();
  });
  D.suivrePropositions(id, (p) => {
    propositions = p || {};
    if (t) rendre();
  });
  introuvable();
})();
