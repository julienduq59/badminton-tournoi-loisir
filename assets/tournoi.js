/* Page de gestion d'un tournoi (organisateur). */
(function () {
  'use strict';
  const { esc, Store } = BT;
  const $ = (s, racine) => (racine || document).querySelector(s);
  const ONGLETS = ['direct', 'matchs', 'classement', 'reglages', 'partager'];

  $('#icone').outerHTML = BT.ICONE;

  const id = BT.idDansAdresse();
  let t = Store.charger(id);

  if (!t) {
    document.querySelector('.onglets').hidden = true;
    document.querySelector('.barre-actions').hidden = true;
    $('#titre').textContent = 'Tournoi introuvable';
    $('.contenu').innerHTML = '<div class="carte"><h2>Ce tournoi n’est pas sur cet appareil</h2>'
      + '<p>Les tournois sont enregistrés dans le navigateur où ils ont été créés.</p>'
      + '<a class="bouton principal" href="./">Voir mes tournois</a></div>';
    return;
  }

  const ongletDemande = location.hash.slice(1);
  let onglet = ONGLETS.includes(ongletDemande) ? ongletDemande : (t.matchs.length ? 'direct' : 'reglages');
  let filtre = 'tous';
  let brouillon = null;

  /* ---------- Outils ---------- */

  const nom = (equipeId) => esc(BT.nomEquipe(t, equipeId));
  const match = (matchId) => t.matchs.find((m) => m.id === matchId);
  const pluriel = (n, mot, motPluriel) => n + ' ' + (n > 1 ? (motPluriel || mot + 's') : mot);

  function equipesOccupees() {
    const s = new Set();
    BT.matchsEnCours(t).forEach((m) => { s.add(m.a); s.add(m.b); });
    return s;
  }

  function sauver() {
    Store.enregistrer(t);
    rendre();
  }

  /* ---------- Onglets ---------- */

  function afficherOnglet() {
    document.querySelectorAll('.onglets button').forEach((b) => {
      b.setAttribute('aria-selected', String(b.dataset.onglet === onglet));
    });
    ONGLETS.forEach((o) => { $('#' + o).hidden = o !== onglet; });
    const actif = document.querySelector('.onglets button[aria-selected="true"]');
    if (actif && actif.scrollIntoView) actif.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function changerOnglet(nouveau) {
    onglet = nouveau;
    history.replaceState(null, '', '#' + nouveau);
    if (nouveau === 'reglages') rendreReglages();
    afficherOnglet();
    window.scrollTo(0, 0);
  }

  /* ---------- Rendu général ---------- */

  function rendre() {
    const st = BT.statut(t);
    $('#titre').textContent = t.nom;
    document.title = t.nom + ' · Gestion du tournoi';
    const pastille = $('#statut');
    pastille.textContent = BT.LIBELLES_STATUT[st];
    pastille.className = 'pastille pastille--' + st;
    $('#lien-ecran').href = 'ecran.html?t=' + encodeURIComponent(t.id);
    rendreDirect();
    rendreMatchs();
    rendreClassement();
    rendrePartager();
    afficherOnglet();
  }

  function progression() {
    const total = t.matchs.length;
    const faits = t.matchs.filter((m) => m.statut === 'termine').length;
    const pct = total ? Math.round((faits / total) * 100) : 0;
    return '<div class="progression"><div class="progression-barre"><span style="width:' + pct + '%"></span></div>'
      + '<span class="progression-texte">' + faits + ' / ' + total + ' matchs joués</span></div>';
  }

  /* ---------- Onglet Terrains ---------- */

  function numerosTerrains() {
    const nums = new Set();
    for (let i = 1; i <= t.reglages.terrains; i++) nums.add(i);
    BT.matchsEnCours(t).forEach((m) => nums.add(m.terrain));
    return Array.from(nums).sort((a, b) => a - b);
  }

  function carteTerrain(n, m, st, appelPossible) {
    if (m) {
      return '<article class="terrain">'
        + '<div class="terrain-tete"><span>Terrain ' + n + '</span><span class="num-match">Match ' + m.numero + '</span></div>'
        + '<div class="court"><div class="court-cote">' + nom(m.a) + '</div><div class="court-filet"></div>'
        + '<div class="court-cote">' + nom(m.b) + '</div></div>'
        + '<div class="terrain-depuis">Commencé à ' + BT.heure(m.debut) + '</div>'
        + '<div class="terrain-pied">'
        + '<button type="button" class="bouton principal" data-action="score" data-id="' + m.id + '">Saisir le score</button>'
        + '<button type="button" class="bouton" data-action="reporter" data-id="' + m.id + '">Reporter</button>'
        + '</div></article>';
    }
    let texte = 'Terrain libre';
    if (st === 'pret') texte = 'En attente du lancement';
    else if (n > t.reglages.terrains) texte = 'Terrain retiré';
    else if (!BT.matchsEnAttente(t).length) texte = 'Plus de match à appeler';
    else if (!appelPossible) texte = 'Les équipes restantes jouent déjà';
    const bouton = st === 'en_cours' && appelPossible && n <= t.reglages.terrains
      ? '<button type="button" class="bouton" data-action="appeler" data-terrain="' + n + '">Appeler le match suivant</button>'
      : '';
    return '<article class="terrain">'
      + '<div class="terrain-tete"><span>Terrain ' + n + '</span></div>'
      + '<div class="court court--libre"><div class="court-libre-texte">' + texte + '</div><div class="court-filet"></div></div>'
      + '<div class="terrain-pied">' + bouton + '</div></article>';
  }

  function rendreDirect() {
    const el = $('#direct');
    const st = BT.statut(t);
    if (st === 'preparation') {
      el.innerHTML = '<div class="carte"><h2>Pas encore de matchs</h2>'
        + '<p>Indique le nombre d’équipes, de matchs et de terrains dans les réglages, puis crée les matchs.</p>'
        + '<button type="button" class="bouton principal" data-action="onglet" data-cible="reglages">Ouvrir les réglages</button></div>';
      return;
    }
    const occupees = equipesOccupees();
    const attente = BT.matchsEnAttente(t);
    const appelPossible = attente.some((m) => !occupees.has(m.a) && !occupees.has(m.b));
    const libres = BT.terrainsLibres(t);
    const suite = BT.prochains(t);
    const T = t.reglages.terrains;
    let h = progression();

    if (st === 'pret') {
      h += '<div class="carte"><h2>Tout est prêt</h2>'
        + '<p>' + pluriel(t.matchs.length, 'match', 'matchs') + ' à jouer sur ' + pluriel(T, 'terrain') + '. '
        + 'Au lancement, ' + (Math.min(T, attente.length) > 1 ? 'les ' + Math.min(T, attente.length) + ' premiers matchs sont appelés' : 'le premier match est appelé')
        + ' sur les terrains.</p>'
        + '<button type="button" class="bouton accent grand" data-action="lancer">Lancer le tournoi</button></div>';
    }
    if (st === 'termine') {
      const premiers = BT.classement(t).filter((l) => l.rang === 1).map((l) => esc(l.equipe.nom));
      h += '<div class="carte"><h2>Tournoi terminé</h2><p>'
        + (premiers.length > 1
          ? premiers.join(' et ') + ' terminent à égalité à la première place.'
          : premiers[0] + ' termine à la première place.')
        + '</p><button type="button" class="bouton principal" data-action="onglet" data-cible="classement">Voir le classement</button></div>';
    } else {
      h += '<h2>Sur les terrains</h2><div class="grille-terrains">'
        + numerosTerrains().map((n) => carteTerrain(n, BT.matchsEnCours(t).find((m) => m.terrain === n), st, appelPossible)).join('')
        + '</div>';
    }
    if (suite.length) {
      h += '<h2>À suivre</h2><ol class="liste-matchs">'
        + suite.slice(0, 8).map((m, i) => ligneMatch(m, { suivant: i === 0, libres, occupees, compact: true })).join('')
        + '</ol>';
      if (suite.length > 8) {
        h += '<p class="note" style="margin-top:10px">Et ' + pluriel(suite.length - 8, 'autre match', 'autres matchs')
          + ' dans l’onglet Matchs.</p>';
      }
    }
    const recents = t.matchs.filter((m) => m.statut === 'termine').sort((x, y) => (y.fin || 0) - (x.fin || 0)).slice(0, 5);
    if (recents.length && st !== 'termine') {
      h += '<h2>Derniers résultats</h2><ol class="liste-matchs">' + recents.map((m) => ligneMatch(m, { compact: true })).join('') + '</ol>';
    }
    el.innerHTML = h;
  }

  /* ---------- Ligne de match (listes) ---------- */

  function ligneMatch(m, o) {
    o = o || {};
    const r = BT.resultat(m);
    const fini = m.statut === 'termine';
    const clsA = fini && r.gagnant === 'a' ? ' class="gagnant"' : '';
    const clsB = fini && r.gagnant === 'b' ? ' class="gagnant"' : '';
    let etat;
    if (m.statut === 'en_cours') etat = '<span class="etiquette etiquette--en_cours">Terrain ' + m.terrain + '</span>';
    else if (fini) etat = '<span class="match-score">' + esc(BT.texteScore(m)) + '</span>' + (r.gagnant ? '' : ' <span class="etiquette etiquette--N">Nul</span>');
    else if (o.suivant) etat = '<span class="etiquette">Prochain appel</span>';
    else etat = '<span class="etiquette">À jouer</span>';

    const actions = [];
    if (o.compact) {
      const libres = o.libres || BT.terrainsLibres(t);
      const occupees = o.occupees || equipesOccupees();
      if (m.statut === 'attente' && libres.length && !occupees.has(m.a) && !occupees.has(m.b)) {
        actions.push('<button type="button" class="bouton petit principal" data-action="jouer" data-id="' + m.id + '">Jouer sur le terrain ' + libres[0] + '</button>');
      }
    } else if (m.statut === 'en_cours') {
      actions.push('<button type="button" class="bouton petit principal" data-action="score" data-id="' + m.id + '">Saisir le score</button>');
      actions.push('<button type="button" class="bouton petit" data-action="reporter" data-id="' + m.id + '">Reporter</button>');
    } else if (m.statut === 'attente') {
      const libres = o.libres || BT.terrainsLibres(t);
      const occupees = o.occupees || equipesOccupees();
      if (libres.length && !occupees.has(m.a) && !occupees.has(m.b)) {
        actions.push('<button type="button" class="bouton petit principal" data-action="jouer" data-id="' + m.id + '">Jouer sur le terrain ' + libres[0] + '</button>');
      }
      actions.push('<button type="button" class="bouton petit" data-action="score" data-id="' + m.id + '">Saisir le score</button>');
      actions.push('<button type="button" class="bouton petit" data-action="reporter" data-id="' + m.id + '">Reporter</button>');
    } else {
      actions.push('<button type="button" class="bouton petit" data-action="score" data-id="' + m.id + '">Modifier le score</button>');
    }
    return '<li class="match match--' + m.statut + (o.suivant ? ' match--suivant' : '') + '">'
      + '<span class="match-num" title="Match ' + m.numero + '">' + m.numero + '</span>'
      + '<span class="match-equipes"><span' + clsA + '>' + nom(m.a) + '</span><span class="contre">contre</span><span' + clsB + '>' + nom(m.b) + '</span></span>'
      + '<span class="match-etat">' + etat + '</span>'
      + '<div class="match-actions">' + actions.join('') + '</div></li>';
  }

  /* ---------- Onglet Matchs ---------- */

  function rendreMatchs() {
    const el = $('#matchs');
    if (!t.matchs.length) {
      el.innerHTML = '<div class="carte"><p>Les matchs apparaîtront ici une fois créés dans les réglages.</p></div>';
      return;
    }
    const enCours = BT.matchsEnCours(t);
    const aJouer = BT.prochains(t);
    const termines = t.matchs.filter((m) => m.statut === 'termine').sort((x, y) => x.numero - y.numero);
    const groupes = [
      { cle: 'en_cours', titre: 'En cours', liste: enCours },
      { cle: 'attente', titre: 'À jouer, dans l’ordre prévu', liste: aJouer },
      { cle: 'termine', titre: 'Terminés', liste: termines },
    ];
    const filtres = [['tous', 'Tous', t.matchs.length], ['en_cours', 'En cours', enCours.length],
      ['attente', 'À jouer', aJouer.length], ['termine', 'Terminés', termines.length]];
    let h = progression() + '<div class="filtres">'
      + filtres.map(([cle, libelle, n]) => '<button type="button" data-action="filtre" data-valeur="' + cle + '" aria-pressed="' + (filtre === cle) + '">' + libelle + ' (' + n + ')</button>').join('')
      + '</div>';
    const libres = BT.terrainsLibres(t);
    const occupees = equipesOccupees();
    groupes.forEach((g) => {
      if ((filtre !== 'tous' && filtre !== g.cle) || !g.liste.length) return;
      h += '<h2>' + g.titre + '</h2><ol class="liste-matchs">'
        + g.liste.map((m, i) => ligneMatch(m, { suivant: g.cle === 'attente' && i === 0, libres, occupees })).join('') + '</ol>';
    });
    el.innerHTML = h;
  }

  /* ---------- Onglet Classement ---------- */

  function rendreClassement() {
    const el = $('#classement');
    if (!t.matchs.length) {
      el.innerHTML = '<div class="carte"><p>Le classement s’affichera dès les premiers résultats.</p></div>';
      return;
    }
    const lignes = BT.classement(t);
    const nuls = BT.nulsPossibles(t);
    let h = '';
    if (BT.statut(t) === 'termine') h += '<h2>Résultats finaux</h2>' + BT.podiumHtml(lignes);
    h += '<div class="tableau-conteneur"><table class="tableau"><thead><tr>'
      + '<th>Rang</th><th class="equipe">Équipe</th><th><abbr title="Matchs joués">J</abbr></th><th><abbr title="Victoires">V</abbr></th>'
      + (nuls ? '<th><abbr title="Matchs nuls">N</abbr></th>' : '')
      + '<th><abbr title="Défaites">D</abbr></th><th>Sets</th><th>Points</th></tr></thead><tbody>'
      + lignes.map((l) => '<tr><td class="rang">' + l.rang + '</td><td class="equipe">' + esc(l.equipe.nom) + '</td>'
        + '<td>' + l.J + '</td><td class="fort">' + l.V + '</td>' + (nuls ? '<td>' + l.N + '</td>' : '') + '<td>' + l.D + '</td>'
        + '<td>' + BT.signe(l.diffSets) + '</td><td>' + BT.signe(l.diffPts) + '</td></tr>').join('')
      + '</tbody></table></div>'
      + '<p class="note" style="margin-top:12px">Classement au nombre de victoires'
      + (nuls ? ' (un match nul compte pour une demi-victoire)' : '')
      + ', puis à la différence de sets, puis à la différence de points.</p>';
    el.innerHTML = h;
  }

  /* ---------- Onglet QR code ---------- */

  function rendrePartager() {
    const el = $('#partager');
    const urlEquipes = BT.urlPage('equipe.html', { t: t.id });
    const urlEcran = (vue) => 'ecran.html?t=' + encodeURIComponent(t.id) + (vue ? '&vue=' + vue : '');
    el.innerHTML = '<div class="carte"><div class="qr-carte"><div class="qr">' + BT.qrSvg(urlEquipes) + '</div><div>'
      + '<h2>Page des équipes</h2>'
      + '<p>Les joueurs scannent ce QR code et choisissent leur équipe. Ils voient leur prochain match et son terrain, les matchs déjà joués avec les scores, ceux qui restent et le classement.</p>'
      + '<p class="lien-texte">' + esc(urlEquipes) + '</p>'
      + '<div class="actions"><button type="button" class="bouton" data-action="copier" data-texte="' + esc(urlEquipes) + '">Copier le lien</button>'
      + '<a class="bouton" href="' + esc(urlEquipes) + '" target="_blank" rel="noopener">Ouvrir la page</a>'
      + '<button type="button" class="bouton" data-action="imprimer">Imprimer le QR code</button></div>'
      + '</div></div></div>'
      + '<div class="encadre" style="margin-top:16px"><p>Pour l’instant, le tournoi est enregistré dans ce navigateur. '
      + 'L’écran d’affichage et la page des équipes fonctionnent sur cet ordinateur, par exemple dans une deuxième fenêtre envoyée sur une télé en HDMI. '
      + 'Pour que les joueurs suivent leur équipe sur leur téléphone, il faudra ajouter la synchronisation en ligne.</p></div>'
      + '<div class="carte pas-imprimer" style="margin-top:16px"><h2>Écrans d’affichage</h2>'
      + '<p>À ouvrir sur la télé ou le vidéoprojecteur de la salle, en plein écran. L’affichage se met à jour à chaque score saisi.</p>'
      + '<div class="actions">'
      + '<a class="bouton principal" href="' + urlEcran('') + '" target="_blank" rel="noopener">Terrains et prochains matchs</a>'
      + '<a class="bouton" href="' + urlEcran('terrains') + '" target="_blank" rel="noopener">Matchs en cours seulement</a>'
      + '<a class="bouton" href="' + urlEcran('suite') + '" target="_blank" rel="noopener">Prochains matchs seulement</a>'
      + '</div></div>';
  }

  /* ---------- Onglet Réglages ---------- */

  function copieReglages() {
    const r = Object.assign({}, BT.REGLAGES_DEFAUT, t.reglages);
    return {
      nom: t.nom,
      reglages: r,
      equipes: t.equipes.map((e) => Object.assign({}, e)),
      reserve: [],
      plafondManuel: r.plafond !== r.points + 9,
    };
  }

  function caseHtml(idCase, coche, texte) {
    return '<label class="case" id="' + idCase + '-case"><input type="checkbox" id="' + idCase + '"' + (coche ? ' checked' : '') + '><span id="' + idCase + '-texte">' + texte + '</span></label>';
  }

  function rendreReglages() {
    if (!brouillon) brouillon = copieReglages();
    const b = brouillon;
    const r = b.reglages;
    const nombre = (idChamp, valeur, min, max) => '<input type="number" id="' + idChamp + '" value="' + valeur + '" min="' + min + '" max="' + max + '" inputmode="numeric">';
    $('#reglages').innerHTML = '<form id="form-reglages" class="carte" novalidate>'
      + '<h2>Le tournoi</h2>'
      + '<div class="grille-champs"><div class="champ"><label for="r-nom">Nom du tournoi</label>'
      + '<input type="text" id="r-nom" maxlength="60" value="' + esc(b.nom) + '"></div></div>'
      + '<h2>Format</h2>'
      + '<div class="grille-champs">'
      + '<div class="champ"><label for="r-equipes">Nombre d’équipes</label>' + nombre('r-equipes', b.equipes.length, 2, 64) + '</div>'
      + '<div class="champ"><label for="r-matchs">Matchs par équipe</label>' + nombre('r-matchs', r.matchsParEquipe, 1, 63)
      + caseHtml('r-tous', r.tousContreTous, 'Chaque équipe rencontre toutes les autres')
      + '<span class="erreur-champ" id="r-matchs-erreur" hidden></span></div>'
      + '<div class="champ"><label for="r-sets">Sets par match</label>' + nombre('r-sets', r.sets, 1, 5)
      + caseHtml('r-meilleur', r.auMeilleur, '')
      + '<span class="aide" id="r-sets-aide"></span></div>'
      + '<div class="champ"><label for="r-points">Points pour gagner un set</label>' + nombre('r-points', r.points, 1, 99)
      + caseHtml('r-ecart', r.ecart2, '2 points d’écart pour gagner le set')
      + '<div class="champ" id="r-plafond-bloc"><label for="r-plafond">Score maximum d’un set</label>' + nombre('r-plafond', r.plafond, 1, 99) + '</div></div>'
      + '<div class="champ"><label for="r-terrains">Terrains disponibles</label>' + nombre('r-terrains', r.terrains, 1, 30)
      + caseHtml('r-auto', r.appelAuto, 'Appeler automatiquement le match suivant dès qu’un terrain se libère')
      + '</div></div>'
      + '<div class="resume-reglages" id="r-resume" style="margin-top:20px"></div>'
      + '<h2>Équipes</h2>'
      + '<p class="note">Le nom des joueurs est facultatif, il s’affiche sur la page de l’équipe.</p>'
      + '<div class="liste-equipes" id="r-liste-equipes"></div>'
      + '<div class="actions" style="margin-top:22px"><button type="submit" class="bouton principal grand" id="r-enregistrer">Enregistrer</button>'
      + '<span class="note" id="r-info" role="status"></span></div>'
      + '</form>'
      + (t.matchs.length ? '<div class="carte" style="margin-top:16px"><h2>Remise à zéro</h2>'
        + '<p class="note">Effacer les scores remet tous les matchs à jouer, dans l’ordre de départ.</p>'
        + '<div class="actions"><button type="button" class="bouton danger" data-action="recreer">Effacer tous les scores</button>'
        + '<button type="button" class="bouton danger" data-action="supprimer">Supprimer le tournoi</button></div></div>'
        : '<div class="carte" style="margin-top:16px"><div class="actions"><button type="button" class="bouton danger" data-action="supprimer">Supprimer le tournoi</button></div></div>');
    rendreListeEquipes();
    majReglages();
  }

  function rendreListeEquipes() {
    $('#r-liste-equipes').innerHTML = brouillon.equipes.map((e, i) => '<div class="ligne-equipe">'
      + '<span class="num">' + (i + 1) + '</span>'
      + '<input type="text" data-index="' + i + '" data-champ="nom" maxlength="40" value="' + esc(e.nom) + '" placeholder="Équipe ' + (i + 1) + '" aria-label="Nom de l’équipe ' + (i + 1) + '">'
      + '<input type="text" class="joueurs" data-index="' + i + '" data-champ="joueurs" maxlength="80" value="' + esc(e.joueurs || '') + '" placeholder="Joueurs (facultatif)" aria-label="Joueurs de l’équipe ' + (i + 1) + '">'
      + '</div>').join('');
  }

  function changerNbEquipes(n) {
    const b = brouillon;
    while (b.equipes.length > n) b.reserve.unshift(b.equipes.pop());
    while (b.equipes.length < n) {
      b.equipes.push(b.reserve.shift() || { id: 'e' + BT.uid(6), nom: 'Équipe ' + (b.equipes.length + 1), joueurs: '' });
    }
    b.reglages.nbEquipes = n;
    rendreListeEquipes();
  }

  function structureChangee() {
    const r = brouillon.reglages;
    return !t.matchs.length || brouillon.equipes.length !== t.equipes.length || r.matchsParEquipe !== t.reglages.matchsParEquipe;
  }

  function majReglages() {
    const b = brouillon;
    const r = b.reglages;
    const n = b.equipes.length;
    if (r.tousContreTous) {
      r.matchsParEquipe = n - 1;
      $('#r-matchs').value = n - 1;
    }
    $('#r-matchs').disabled = r.tousContreTous;
    $('#r-matchs').max = Math.max(1, n - 1);

    const erreur = BT.verifierFormat(n, r.matchsParEquipe);
    $('#r-matchs-erreur').hidden = !erreur;
    $('#r-matchs-erreur').textContent = erreur || '';

    const impair = r.sets % 2 === 1 && r.sets >= 3;
    $('#r-meilleur-case').hidden = !impair;
    $('#r-meilleur-texte').textContent = 'Le match s’arrête dès qu’une équipe a gagné ' + ((r.sets + 1) / 2) + ' sets (au meilleur des ' + r.sets + ')';
    let aide = '';
    if (r.sets > 1 && r.sets % 2 === 0) aide = 'Avec un nombre pair de sets, un match peut se terminer sur une égalité.';
    else if (impair && !r.auMeilleur) aide = 'Tous les sets sont joués, même si le match est déjà gagné.';
    $('#r-sets-aide').textContent = aide;
    $('#r-sets-aide').hidden = !aide;

    if (!b.plafondManuel) {
      r.plafond = r.points + 9;
      $('#r-plafond').value = r.plafond;
    }
    $('#r-plafond-bloc').hidden = !r.ecart2;

    const total = erreur ? null : (n * r.matchsParEquipe) / 2;
    $('#r-resume').innerHTML = '<span><strong>' + n + '</strong> équipes</span>'
      + (total ? '<span><strong>' + total + '</strong> matchs au total</span>'
        + '<span><strong>' + Math.ceil(total / r.terrains) + '</strong> rotations sur ' + pluriel(r.terrains, 'terrain') + '</span>' : '')
      + '<span>' + esc(BT.texteFormat(r)) + '</span>';

    let libelle = 'Enregistrer les réglages';
    if (!t.matchs.length) libelle = 'Enregistrer et créer les matchs';
    else if (structureChangee()) libelle = 'Enregistrer et recréer les matchs';
    $('#r-enregistrer').textContent = libelle;
  }

  function surSaisieReglages(e) {
    const cible = e.target;
    const b = brouillon;
    if (!b || !cible.closest('#form-reglages')) return;
    const r = b.reglages;
    $('#r-info').textContent = '';
    if (cible.dataset.index !== undefined) {
      b.equipes[Number(cible.dataset.index)][cible.dataset.champ] = cible.value;
      return;
    }
    const v = cible.value;
    switch (cible.id) {
      case 'r-nom': b.nom = v; break;
      case 'r-equipes': {
        const n = BT.entier(v, 2, 64, null);
        if (n && n !== b.equipes.length) changerNbEquipes(n);
        break;
      }
      case 'r-matchs': { const k = BT.entier(v, 1, 63, null); if (k) r.matchsParEquipe = k; break; }
      case 'r-tous': r.tousContreTous = cible.checked; break;
      case 'r-sets': { const s = BT.entier(v, 1, 5, null); if (s) r.sets = s; break; }
      case 'r-meilleur': r.auMeilleur = cible.checked; break;
      case 'r-points': { const p = BT.entier(v, 1, 99, null); if (p) r.points = p; break; }
      case 'r-ecart': r.ecart2 = cible.checked; break;
      case 'r-plafond': { const p = BT.entier(v, 1, 99, null); if (p) { r.plafond = p; b.plafondManuel = true; } break; }
      case 'r-terrains': { const n = BT.entier(v, 1, 30, null); if (n) r.terrains = n; break; }
      case 'r-auto': r.appelAuto = cible.checked; break;
      default: return;
    }
    majReglages();
  }

  function enregistrerReglages() {
    const b = brouillon;
    const r = b.reglages;
    r.nbEquipes = b.equipes.length;
    if (r.tousContreTous) r.matchsParEquipe = r.nbEquipes - 1;
    const erreur = BT.verifierFormat(r.nbEquipes, r.matchsParEquipe);
    if (erreur) {
      majReglages();
      $('#r-matchs').focus();
      return;
    }
    if (r.ecart2 && r.plafond < r.points) r.plafond = r.points;
    const structure = structureChangee();
    if (t.matchs.length && structure) {
      const commences = t.matchs.filter((m) => m.statut !== 'attente').length;
      const message = commences
        ? 'Les matchs vont être recréés et les ' + pluriel(commences, 'match commencé ou terminé', 'matchs commencés ou terminés') + ' seront effacés. Continuer ?'
        : 'Les matchs vont être recréés. Continuer ?';
      if (!confirm(message)) return;
    }
    t.nom = b.nom.trim() || 'Tournoi loisir';
    t.reglages = Object.assign({}, r);
    t.equipes = b.equipes.map((e, i) => ({ id: e.id, nom: (e.nom || '').trim() || 'Équipe ' + (i + 1), joueurs: (e.joueurs || '').trim() }));
    if (structure) BT.genererMatchs(t);
    else if (t.reglages.appelAuto && BT.demarre(t)) BT.remplirTerrains(t);
    brouillon = null;
    sauver();
    if (structure) {
      changerOnglet('direct');
    } else {
      rendreReglages();
      $('#r-info').textContent = 'Réglages enregistrés.';
    }
  }

  /* ---------- Saisie des scores ---------- */

  const dialogue = $('#dialogue-score');
  let matchScore = null;
  let confirmer = false;

  function messageScore(type, texte, liste) {
    const el = $('#score-message');
    if (!type) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.className = 'score-message score-message--' + type;
    el.innerHTML = esc(texte) + (liste && liste.length ? '<ul>' + liste.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '');
  }

  function ouvrirScore(m) {
    matchScore = m;
    confirmer = false;
    const n = Math.max(t.reglages.sets, (m.sets || []).length);
    $('#score-titre').textContent = 'Match ' + m.numero + (m.statut === 'en_cours' ? ', terrain ' + m.terrain : '');
    $('#score-format').textContent = BT.texteFormat(t.reglages);
    let h = '<span></span><span class="score-equipe">' + nom(m.a) + '</span><span class="score-equipe">' + nom(m.b) + '</span>';
    for (let i = 0; i < n; i++) {
      const s = (m.sets || [])[i] || ['', ''];
      h += '<span class="score-set">Set ' + (i + 1) + '</span>'
        + '<input type="number" inputmode="numeric" min="0" max="99" data-set="' + i + '" data-cote="0" value="' + s[0] + '" aria-label="Set ' + (i + 1) + ', ' + nom(m.a) + '">'
        + '<input type="number" inputmode="numeric" min="0" max="99" data-set="' + i + '" data-cote="1" value="' + s[1] + '" aria-label="Set ' + (i + 1) + ', ' + nom(m.b) + '">';
    }
    $('#score-grille').innerHTML = h;
    $('#score-effacer').hidden = m.statut !== 'termine';
    $('#score-valider').textContent = 'Valider le score';
    messageScore(null);
    colorerSets();
    dialogue.showModal();
    const premier = $('#score-grille input');
    if (premier) premier.focus();
  }

  function colorerSets() {
    const champs = Array.from(document.querySelectorAll('#score-grille input'));
    for (let i = 0; i < champs.length; i += 2) {
      const a = parseInt(champs[i].value, 10);
      const b = parseInt(champs[i + 1].value, 10);
      champs[i].classList.toggle('gagne', a > b);
      champs[i + 1].classList.toggle('gagne', b > a);
    }
  }

  function lireSets() {
    const champs = Array.from(document.querySelectorAll('#score-grille input'));
    const sets = [];
    for (let i = 0; i < champs.length; i += 2) {
      const va = champs[i].value.trim();
      const vb = champs[i + 1].value.trim();
      if (va === '' && vb === '') continue;
      const num = Math.floor(i / 2) + 1;
      if (va === '' || vb === '') return { erreur: 'Il manque un score au set ' + num + '.' };
      const a = Number(va);
      const b = Number(vb);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > 99 || b > 99) {
        return { erreur: 'Le score du set ' + num + ' doit être un nombre entre 0 et 99.' };
      }
      sets.push([a, b]);
    }
    if (!sets.length) return { erreur: 'Saisis au moins un set.' };
    return { sets };
  }

  $('#score-grille').addEventListener('input', () => {
    colorerSets();
    if (confirmer) {
      confirmer = false;
      $('#score-valider').textContent = 'Valider le score';
    }
    messageScore(null);
  });

  $('#form-score').addEventListener('submit', (e) => {
    e.preventDefault();
    const lu = lireSets();
    if (lu.erreur) { messageScore('erreur', lu.erreur); return; }
    if (!confirmer) {
      const alertes = BT.verifierScore(lu.sets, t.reglages);
      if (alertes.length) {
        confirmer = true;
        messageScore('alerte', 'Ce score ne correspond pas aux réglages du tournoi.', alertes);
        $('#score-valider').textContent = 'Enregistrer quand même';
        return;
      }
    }
    BT.enregistrerScore(t, matchScore, lu.sets);
    dialogue.close();
    sauver();
  });

  $('#score-annuler').addEventListener('click', () => dialogue.close());

  $('#score-effacer').addEventListener('click', () => {
    if (!confirm('Effacer le résultat du match ' + matchScore.numero + ' ? Il repassera dans les matchs à jouer.')) return;
    matchScore.statut = 'attente';
    matchScore.sets = [];
    matchScore.fin = null;
    matchScore.debut = null;
    matchScore.terrain = null;
    if (t.reglages.appelAuto && BT.demarre(t)) BT.remplirTerrains(t);
    dialogue.close();
    sauver();
  });

  /* ---------- Actions ---------- */

  document.addEventListener('click', (e) => {
    const ongletBouton = e.target.closest('.onglets button');
    if (ongletBouton) { changerOnglet(ongletBouton.dataset.onglet); return; }
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const m = el.dataset.id ? match(el.dataset.id) : null;
    switch (el.dataset.action) {
      case 'onglet':
        changerOnglet(el.dataset.cible);
        break;
      case 'lancer':
        BT.remplirTerrains(t);
        sauver();
        break;
      case 'score':
        if (m) ouvrirScore(m);
        break;
      case 'reporter':
        if (m && confirm('Reporter le match ' + m.numero + ' (' + BT.nomEquipe(t, m.a) + ' contre ' + BT.nomEquipe(t, m.b) + ') ? Il passe à la fin de la liste des matchs à jouer.')) {
          BT.reporter(t, m);
          sauver();
        }
        break;
      case 'appeler':
        BT.remplirTerrains(t, null, [Number(el.dataset.terrain)]);
        sauver();
        break;
      case 'jouer': {
        const libres = BT.terrainsLibres(t);
        const occupees = equipesOccupees();
        if (m && libres.length && !occupees.has(m.a) && !occupees.has(m.b)) {
          BT.lancer(m, libres[0]);
          sauver();
        }
        break;
      }
      case 'filtre':
        filtre = el.dataset.valeur;
        rendreMatchs();
        break;
      case 'copier':
        if (navigator.clipboard) {
          navigator.clipboard.writeText(el.dataset.texte).then(() => { el.textContent = 'Lien copié'; });
        }
        break;
      case 'imprimer':
        $('#partager').classList.add('imprimer');
        window.print();
        $('#partager').classList.remove('imprimer');
        break;
      case 'recreer':
        if (confirm('Effacer tous les scores et remettre tous les matchs à jouer ?')) {
          BT.genererMatchs(t);
          sauver();
          changerOnglet('direct');
        }
        break;
      case 'supprimer':
        if (confirm('Supprimer « ' + t.nom + ' » ? Les équipes, les matchs et les scores seront effacés de cet appareil.')) {
          Store.supprimer(t.id);
          location.href = './';
        }
        break;
      default:
        break;
    }
  });

  document.addEventListener('input', surSaisieReglages);
  document.addEventListener('change', surSaisieReglages);
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'form-reglages') {
      e.preventDefault();
      enregistrerReglages();
    }
  });

  // Mise à jour quand le tournoi est modifié dans un autre onglet.
  Store.ecouter(t.id, (nouveau) => {
    if (!nouveau) return;
    t = nouveau;
    if (matchScore) matchScore = match(matchScore.id) || matchScore;
    rendre();
  });

  rendre();
  if (onglet === 'reglages') rendreReglages();
  afficherOnglet();
})();
