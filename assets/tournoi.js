/* Page de gestion d'un tournoi (organisateurs). */
(function () {
  'use strict';
  const { esc } = BT;
  const D = BT.Donnees;
  const $ = (s, racine) => (racine || document).querySelector(s);
  const ONGLETS = ['direct', 'matchs', 'classement', 'reglages', 'partager'];

  $('#icone').outerHTML = BT.ICONE;

  const id = BT.idDansAdresse();
  let t = null;
  let propositions = {};
  let onglet = null;
  let filtre = 'tous';
  let brouillon = null;
  const enTraitement = new Set();

  /* ---------- Outils ---------- */

  const nom = (equipeId) => esc(BT.nomEquipe(t, equipeId));
  const trouver = (tournoi, matchId) => tournoi.matchs.find((m) => m.id === matchId);
  const pluriel = (n, mot, motPluriel) => n + ' ' + (n > 1 ? (motPluriel || mot + 's') : mot);
  const texteSets = (sets) => sets.map(([x, y]) => x + '-' + y).join(' · ');

  function equipesOccupees() {
    const s = new Set();
    BT.matchsEnCours(t).forEach((m) => { s.add(m.a); s.add(m.b); });
    return s;
  }

  let minuterieToast = null;
  function toast(texte) {
    const el = $('#toast');
    el.textContent = texte;
    el.hidden = false;
    clearTimeout(minuterieToast);
    minuterieToast = setTimeout(() => { el.hidden = true; }, 5000);
  }

  // Toute modification passe par ici : elle est appliquée sur la version la plus récente du tournoi.
  async function agir(fn) {
    try {
      return await D.modifier(id, fn);
    } catch (e) {
      toast('Enregistrement impossible. ' + (e && e.message ? e.message : ''));
      return null;
    }
  }

  /* ---------- Scores envoyés par les joueurs ---------- */

  function propositionsDe(matchId) {
    const brut = propositions[matchId] || {};
    return Object.keys(brut).map((equipeId) => ({
      equipeId,
      date: brut[equipeId] && brut[equipeId].date,
      sets: BT.enTableau(brut[equipeId] && brut[equipeId].sets).map((s) => BT.enTableau(s).map(Number)),
    })).filter((p) => p.sets.length);
  }

  function aValider() {
    return Object.keys(propositions).map((matchId) => {
      const m = trouver(t, matchId);
      if (!m || m.statut === 'termine') return null;
      const liste = propositionsDe(matchId);
      if (!liste.length) return null;
      const accord = liste.every((p) => BT.memesSets(p.sets, liste[0].sets));
      return { m, liste, accord };
    }).filter(Boolean).sort((x, y) => (x.m.terrain || 99) - (y.m.terrain || 99) || x.m.numero - y.m.numero);
  }

  async function validerScore(matchId, sets) {
    const resultat = await agir((tt) => {
      const m = trouver(tt, matchId);
      if (!m || m.statut === 'termine') return false;
      BT.enregistrerScore(tt, m, sets);
      return true;
    });
    if (resultat && propositions[matchId]) {
      try { await D.retirerProposition(id, matchId); } catch (e) { /* sera retiré au prochain passage */ }
    }
  }

  // Nettoie les envois devenus inutiles et valide seul quand les deux équipes sont d'accord (si activé).
  function traiterPropositions() {
    if (!t) return;
    Object.keys(propositions).forEach((matchId) => {
      if (enTraitement.has(matchId)) return;
      const m = trouver(t, matchId);
      if (!m || m.statut === 'termine') {
        enTraitement.add(matchId);
        D.retirerProposition(id, matchId).catch(() => {}).then(() => enTraitement.delete(matchId));
        return;
      }
      if (!t.reglages.validationAuto) return;
      const liste = propositionsDe(matchId);
      const deuxEquipes = liste.some((p) => p.equipeId === m.a) && liste.some((p) => p.equipeId === m.b);
      if (deuxEquipes && liste.every((p) => BT.memesSets(p.sets, liste[0].sets))) {
        enTraitement.add(matchId);
        validerScore(matchId, liste[0].sets).then(() => enTraitement.delete(matchId));
      }
    });
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
    history.replaceState(null, '', location.pathname + location.search + '#' + nouveau);
    if (nouveau === 'reglages') {
      brouillon = null;
      rendreReglages();
    }
    afficherOnglet();
    window.scrollTo(0, 0);
  }

  /* ---------- Rendu général ---------- */

  function rendre() {
    if (!t) return;
    const st = BT.statut(t);
    const nbAValider = aValider().length;
    $('#titre').textContent = t.nom;
    document.title = (nbAValider ? '(' + nbAValider + ') ' : '') + t.nom + ' · Gestion du tournoi';
    const pastille = $('#statut');
    pastille.textContent = BT.LIBELLES_STATUT[st];
    pastille.className = 'pastille pastille--' + st;
    $('#lien-ecran').href = 'ecran.html?t=' + encodeURIComponent(t.id);
    const badge = $('#badge-scores');
    badge.textContent = nbAValider;
    badge.hidden = !nbAValider;
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

  function boutonsProposition(m, liste, accord, petit) {
    const cls = 'bouton' + (petit ? ' petit' : '');
    let h = '';
    if (accord) {
      h += '<button type="button" class="' + cls + ' principal" data-action="valider" data-id="' + m.id + '" data-equipe="' + esc(liste[0].equipeId) + '">Valider ' + esc(texteSets(liste[0].sets)) + '</button>';
    } else {
      liste.forEach((p) => {
        h += '<button type="button" class="' + cls + ' principal" data-action="valider" data-id="' + m.id + '" data-equipe="' + esc(p.equipeId) + '">Valider ' + esc(texteSets(p.sets)) + '</button>';
      });
    }
    h += '<button type="button" class="' + cls + '" data-action="score" data-id="' + m.id + '">Corriger</button>';
    h += '<button type="button" class="' + cls + ' danger" data-action="refuser" data-id="' + m.id + '">Refuser</button>';
    return h;
  }

  function carteTerrain(n, m, st, appelPossible) {
    if (m) {
      const liste = propositionsDe(m.id);
      const accord = liste.every((p) => BT.memesSets(p.sets, liste[0].sets));
      let recu = '';
      let pied;
      if (liste.length) {
        recu = '<div class="terrain-recu">' + (accord
          ? 'Score reçu ' + esc(texteSets(liste[0].sets)) + (liste.length > 1 ? ', les deux équipes sont d’accord' : ', envoyé par ' + nom(liste[0].equipeId))
          : 'Les deux équipes ont envoyé des scores différents') + '</div>';
        pied = boutonsProposition(m, liste, accord, false);
      } else {
        pied = '<button type="button" class="bouton principal" data-action="score" data-id="' + m.id + '">Saisir le score</button>'
          + '<button type="button" class="bouton" data-action="reporter" data-id="' + m.id + '">Reporter</button>';
      }
      return '<article class="terrain' + (liste.length ? ' terrain--recu' : '') + '">'
        + '<div class="terrain-tete"><span>Terrain ' + n + '</span><span class="num-match">Match ' + m.numero + '</span></div>'
        + '<div class="court"><div class="court-cote">' + nom(m.a) + '</div><div class="court-filet"></div>'
        + '<div class="court-cote">' + nom(m.b) + '</div></div>'
        + '<div class="terrain-depuis">Commencé à ' + BT.heure(m.debut) + '</div>'
        + recu
        + '<div class="terrain-pied">' + pied + '</div></article>';
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

  function ligneProposition(p) {
    const { m, liste, accord } = p;
    const details = liste.map((x) => '<span class="proposition"><span class="match-score">' + esc(texteSets(x.sets)) + '</span>'
      + '<span class="par">envoyé par ' + nom(x.equipeId) + (x.date ? ' à ' + BT.heure(x.date) : '') + '</span></span>').join('');
    let accordTexte = '';
    if (liste.length > 1) {
      accordTexte = accord
        ? '<span class="etiquette etiquette--V">Les deux équipes sont d’accord</span>'
        : '<span class="etiquette etiquette--D">Scores différents</span>';
    }
    return '<li class="match match--proposition">'
      + '<span class="match-num" title="Match ' + m.numero + '">' + m.numero + '</span>'
      + '<span class="match-equipes">' + nom(m.a) + '<span class="contre">contre</span>' + nom(m.b)
      + (m.statut === 'en_cours' ? ' <span class="etiquette etiquette--en_cours">Terrain ' + m.terrain + '</span>' : '') + '</span>'
      + '<span class="match-etat propositions">' + details + accordTexte + '</span>'
      + '<div class="match-actions">' + boutonsProposition(m, liste, accord, true) + '</div></li>';
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
    const recus = aValider();
    let h = progression();

    if (recus.length) {
      h += '<section class="a-valider"><h2>Scores envoyés par les joueurs <span class="compteur">' + recus.length + '</span></h2>'
        + '<ol class="liste-matchs">' + recus.map(ligneProposition).join('') + '</ol></section>';
    }
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
    if (!fini && propositionsDe(m.id).length) etat += ' <span class="etiquette etiquette--recu">Score reçu</span>';

    const libres = o.libres || BT.terrainsLibres(t);
    const occupees = o.occupees || equipesOccupees();
    const jouable = m.statut === 'attente' && libres.length && !occupees.has(m.a) && !occupees.has(m.b);
    const actions = [];
    if (o.compact) {
      if (jouable) actions.push('<button type="button" class="bouton petit principal" data-action="jouer" data-id="' + m.id + '">Jouer sur le terrain ' + libres[0] + '</button>');
    } else if (m.statut === 'en_cours') {
      actions.push('<button type="button" class="bouton petit principal" data-action="score" data-id="' + m.id + '">Saisir le score</button>');
      actions.push('<button type="button" class="bouton petit" data-action="reporter" data-id="' + m.id + '">Reporter</button>');
    } else if (m.statut === 'attente') {
      if (jouable) actions.push('<button type="button" class="bouton petit principal" data-action="jouer" data-id="' + m.id + '">Jouer sur le terrain ' + libres[0] + '</button>');
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
    if (el.querySelector('details[open]')) return;
    const urlEquipes = BT.urlPage('equipe.html', { t: t.id });
    const urlEcran = (vue) => 'ecran.html?t=' + encodeURIComponent(t.id) + (vue ? '&vue=' + vue : '');
    let h = '<div class="carte"><div class="qr-carte"><div class="qr">' + BT.qrSvg(urlEquipes) + '</div><div>'
      + '<h2>Page des équipes</h2>'
      + '<p>Les joueurs scannent ce QR code et choisissent leur équipe. Ils voient leur prochain match et son terrain, les matchs déjà joués avec les scores, ceux qui restent et le classement.'
      + (t.reglages.scoresJoueurs ? ' Ils peuvent aussi envoyer le score de leur match, que tu valides ensuite.' : '') + '</p>'
      + '<p class="lien-texte">' + esc(urlEquipes) + '</p>'
      + '<div class="actions"><button type="button" class="bouton" data-action="copier" data-texte="' + esc(urlEquipes) + '">Copier le lien</button>'
      + '<a class="bouton" href="' + esc(urlEquipes) + '" target="_blank" rel="noopener">Ouvrir la page</a>'
      + '<button type="button" class="bouton" data-action="imprimer">Imprimer le QR code</button></div>'
      + '</div></div></div>';
    if (D.enLigne) {
      const cle = D.cleOrganisateur(t.id);
      const urlOrga = BT.urlPage('tournoi.html', { t: t.id }) + '#cle=' + encodeURIComponent(cle || '');
      h += '<div class="carte pas-imprimer" style="margin-top:16px"><h2>Lien organisateur</h2>'
        + '<p>Ce lien permet de gérer le tournoi depuis un autre téléphone ou ordinateur : valider les scores, lancer les matchs, changer les réglages. Ne le donne qu’aux organisateurs.</p>'
        + '<details><summary class="bouton">Afficher le lien organisateur</summary>'
        + '<div class="qr-carte" style="margin-top:16px"><div class="qr">' + BT.qrSvg(urlOrga) + '</div><div>'
        + '<p class="lien-texte">' + esc(urlOrga) + '</p>'
        + '<div class="actions"><button type="button" class="bouton" data-action="copier" data-texte="' + esc(urlOrga) + '">Copier le lien organisateur</button></div>'
        + '</div></div></details></div>';
    } else {
      h += '<div class="encadre" style="margin-top:16px"><p>La synchronisation en ligne n’est pas encore activée : le tournoi est enregistré dans ce navigateur. '
        + 'L’écran d’affichage et la page des équipes fonctionnent sur cet ordinateur, par exemple dans une deuxième fenêtre envoyée sur une télé en HDMI. '
        + 'Les téléphones des joueurs ne verront le tournoi qu’une fois la base en ligne branchée.</p></div>';
    }
    h += '<div class="carte pas-imprimer" style="margin-top:16px"><h2>Écrans d’affichage</h2>'
      + '<p>À ouvrir sur la télé ou le vidéoprojecteur de la salle, en plein écran. L’affichage se met à jour à chaque score validé.</p>'
      + '<div class="actions">'
      + '<a class="bouton principal" href="' + urlEcran('') + '" target="_blank" rel="noopener">Terrains et prochains matchs</a>'
      + '<a class="bouton" href="' + urlEcran('terrains') + '" target="_blank" rel="noopener">Matchs en cours seulement</a>'
      + '<a class="bouton" href="' + urlEcran('suite') + '" target="_blank" rel="noopener">Prochains matchs seulement</a>'
      + '</div></div>';
    el.innerHTML = h;
  }

  /* ---------- Onglet Réglages ---------- */

  function copieReglages() {
    const r = Object.assign({}, BT.REGLAGES_DEFAUT, t.reglages);
    return {
      nom: t.nom,
      reglages: r,
      equipes: t.equipes.map((e) => Object.assign({}, e)),
      reserve: [],
      plafondManuel: r.plafond !== BT.plafondAuto(r.points),
    };
  }

  function caseHtml(idCase, coche, texte) {
    return '<label class="case" id="' + idCase + '-case"><input type="checkbox" id="' + idCase + '"' + (coche ? ' checked' : '') + '><span id="' + idCase + '-texte">' + texte + '</span></label>';
  }

  function rendreReglages() {
    if (!t) return;
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
      + '<h2>Scores envoyés par les joueurs</h2>'
      + '<div class="grille-champs"><div class="champ">'
      + caseHtml('r-joueurs', r.scoresJoueurs, 'Les joueurs peuvent envoyer le score de leur match depuis leur téléphone. Un organisateur le valide ensuite.')
      + caseHtml('r-validation', r.validationAuto, 'Valider tout seul quand les deux équipes envoient le même score')
      + '</div></div>'
      + '<h2>Équipes</h2>'
      + '<p class="note">Le nom des joueurs est facultatif, il s’affiche sur la page de l’équipe. Changer un nom ne touche pas aux matchs.</p>'
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

  function structureChangee(tournoi) {
    const r = brouillon.reglages;
    return !tournoi.matchs.length || brouillon.equipes.length !== tournoi.equipes.length
      || r.matchsParEquipe !== tournoi.reglages.matchsParEquipe
      || brouillon.equipes.some((e, i) => e.id !== tournoi.equipes[i].id);
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
      r.plafond = BT.plafondAuto(r.points);
      $('#r-plafond').value = r.plafond;
    }
    $('#r-plafond-bloc').hidden = !r.ecart2;
    $('#r-validation-case').hidden = !r.scoresJoueurs;

    const total = erreur ? null : (n * r.matchsParEquipe) / 2;
    $('#r-resume').innerHTML = '<span><strong>' + n + '</strong> équipes</span>'
      + (total ? '<span><strong>' + total + '</strong> matchs au total</span>'
        + '<span><strong>' + Math.ceil(total / r.terrains) + '</strong> rotations sur ' + pluriel(r.terrains, 'terrain') + '</span>' : '')
      + '<span>' + esc(BT.texteFormat(r)) + '</span>';

    let libelle = 'Enregistrer les réglages';
    if (!t.matchs.length) libelle = 'Enregistrer et créer les matchs';
    else if (structureChangee(t)) libelle = 'Enregistrer et recréer les matchs';
    $('#r-enregistrer').textContent = libelle;
  }

  function surSaisieReglages(e) {
    const cible = e.target;
    const b = brouillon;
    if (!b || !cible.closest || !cible.closest('#form-reglages')) return;
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
      case 'r-joueurs': r.scoresJoueurs = cible.checked; break;
      case 'r-validation': r.validationAuto = cible.checked; break;
      default: return;
    }
    majReglages();
  }

  async function enregistrerReglages() {
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
    const structure = structureChangee(t);
    if (t.matchs.length && structure) {
      const commences = t.matchs.filter((m) => m.statut !== 'attente').length;
      const message = commences
        ? 'Les matchs vont être recréés et les ' + pluriel(commences, 'match commencé ou terminé', 'matchs commencés ou terminés') + ' seront effacés. Continuer ?'
        : 'Les matchs vont être recréés. Continuer ?';
      if (!confirm(message)) return;
    }
    const nouveauxReglages = Object.assign({}, r);
    const nouvellesEquipes = b.equipes.map((e, i) => ({ id: e.id, nom: (e.nom || '').trim() || 'Équipe ' + (i + 1), joueurs: (e.joueurs || '').trim() }));
    const nouveauNom = b.nom.trim() || 'Tournoi loisir';
    $('#r-enregistrer').disabled = true;
    const resultat = await agir((tt) => {
      const recreer = structureChangee(tt);
      tt.nom = nouveauNom;
      tt.reglages = nouveauxReglages;
      tt.equipes = nouvellesEquipes;
      if (recreer) BT.genererMatchs(tt);
      else if (tt.reglages.appelAuto && BT.demarre(tt)) BT.remplirTerrains(tt);
      return true;
    });
    $('#r-enregistrer').disabled = false;
    if (!resultat) return;
    brouillon = null;
    if (structure) {
      changerOnglet('direct');
    } else {
      rendreReglages();
      $('#r-info').textContent = 'Réglages enregistrés.';
    }
  }

  /* ---------- Saisie des scores (organisateur) ---------- */

  const dialogue = $('#dialogue-score');
  let matchScoreId = null;
  let confirmer = false;

  function messageScore(type, texte, liste) {
    const el = $('#score-message');
    if (!type) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.className = 'score-message score-message--' + type;
    el.innerHTML = esc(texte) + (liste && liste.length ? '<ul>' + liste.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '');
  }

  function remplirChamps(sets) {
    const champs = Array.from(document.querySelectorAll('#score-grille input'));
    champs.forEach((c, i) => {
      const s = sets[Math.floor(i / 2)];
      c.value = s ? s[i % 2] : '';
    });
    colorerSets();
  }

  function ouvrirScore(m) {
    matchScoreId = m.id;
    confirmer = false;
    const recus = propositionsDe(m.id);
    const depart = (m.sets && m.sets.length) ? m.sets : (recus[0] ? recus[0].sets : []);
    const n = Math.max(t.reglages.sets, depart.length, ...recus.map((p) => p.sets.length));
    $('#score-titre').textContent = 'Match ' + m.numero + (m.statut === 'en_cours' ? ', terrain ' + m.terrain : '');
    $('#score-format').textContent = BT.texteFormat(t.reglages);
    $('#score-recus').innerHTML = recus.map((p, i) => '<div class="score-recu"><span>Score envoyé par ' + nom(p.equipeId) + ' : <strong>' + esc(texteSets(p.sets)) + '</strong></span>'
      + '<button type="button" class="bouton petit" data-reprendre="' + i + '">Reprendre</button></div>').join('');
    $('#score-recus').hidden = !recus.length;
    let h = '<span></span><span class="score-equipe">' + nom(m.a) + '</span><span class="score-equipe">' + nom(m.b) + '</span>';
    for (let i = 0; i < n; i++) {
      h += '<span class="score-set">Set ' + (i + 1) + '</span>'
        + '<input type="number" inputmode="numeric" min="0" max="99" aria-label="Set ' + (i + 1) + ', ' + nom(m.a) + '">'
        + '<input type="number" inputmode="numeric" min="0" max="99" aria-label="Set ' + (i + 1) + ', ' + nom(m.b) + '">';
    }
    $('#score-grille').innerHTML = h;
    remplirChamps(depart);
    $('#score-effacer').hidden = m.statut !== 'termine';
    $('#score-valider').textContent = 'Valider le score';
    messageScore(null);
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

  function lireDialogue() {
    const champs = Array.from(document.querySelectorAll('#score-grille input'));
    const paires = [];
    for (let i = 0; i < champs.length; i += 2) paires.push([champs[i].value, champs[i + 1].value]);
    return BT.lireSaisie(paires);
  }

  $('#score-grille').addEventListener('input', () => {
    colorerSets();
    if (confirmer) {
      confirmer = false;
      $('#score-valider').textContent = 'Valider le score';
    }
    messageScore(null);
  });

  $('#score-recus').addEventListener('click', (e) => {
    const b = e.target.closest('[data-reprendre]');
    if (!b) return;
    const p = propositionsDe(matchScoreId)[Number(b.dataset.reprendre)];
    if (p) remplirChamps(p.sets);
  });

  $('#form-score').addEventListener('submit', (e) => {
    e.preventDefault();
    const lu = lireDialogue();
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
    const matchId = matchScoreId;
    dialogue.close();
    // Un score déjà validé peut être corrigé : on le remplace sans relancer d'appel.
    agir((tt) => {
      const m = trouver(tt, matchId);
      if (!m) return false;
      BT.enregistrerScore(tt, m, lu.sets);
      return true;
    }).then((resultat) => {
      if (resultat && propositions[matchId]) D.retirerProposition(id, matchId).catch(() => {});
    });
  });

  $('#score-annuler').addEventListener('click', () => dialogue.close());

  $('#score-effacer').addEventListener('click', () => {
    const m = trouver(t, matchScoreId);
    if (!m || !confirm('Effacer le résultat du match ' + m.numero + ' ? Il repassera dans les matchs à jouer.')) return;
    const matchId = matchScoreId;
    dialogue.close();
    agir((tt) => {
      const x = trouver(tt, matchId);
      if (!x) return false;
      x.statut = 'attente';
      x.sets = [];
      x.fin = null;
      x.debut = null;
      x.terrain = null;
      if (tt.reglages.appelAuto && BT.demarre(tt)) BT.remplirTerrains(tt);
      return true;
    });
  });

  /* ---------- Actions ---------- */

  document.addEventListener('click', (e) => {
    const ongletBouton = e.target.closest('.onglets button');
    if (ongletBouton) { changerOnglet(ongletBouton.dataset.onglet); return; }
    const el = e.target.closest('[data-action]');
    if (!el || !t) return;
    const matchId = el.dataset.id;
    const m = matchId ? trouver(t, matchId) : null;
    switch (el.dataset.action) {
      case 'onglet':
        changerOnglet(el.dataset.cible);
        break;
      case 'lancer':
        agir((tt) => { BT.remplirTerrains(tt); return true; });
        break;
      case 'score':
        if (m) ouvrirScore(m);
        break;
      case 'valider': {
        const p = propositionsDe(matchId).find((x) => x.equipeId === el.dataset.equipe);
        if (p) {
          el.disabled = true;
          validerScore(matchId, p.sets);
        }
        break;
      }
      case 'refuser':
        if (m && confirm('Refuser le score envoyé pour le match ' + m.numero + ' ? Les joueurs pourront en envoyer un autre.')) {
          D.retirerProposition(id, matchId).catch((err) => toast('Impossible de refuser. ' + err.message));
        }
        break;
      case 'reporter':
        if (m && confirm('Reporter le match ' + m.numero + ' (' + BT.nomEquipe(t, m.a) + ' contre ' + BT.nomEquipe(t, m.b) + ') ? Il passe à la fin de la liste des matchs à jouer.')) {
          agir((tt) => {
            const x = trouver(tt, matchId);
            if (!x || x.statut === 'termine') return false;
            BT.reporter(tt, x);
            return true;
          });
        }
        break;
      case 'appeler': {
        const terrain = Number(el.dataset.terrain);
        agir((tt) => BT.remplirTerrains(tt, null, [terrain]).length > 0);
        break;
      }
      case 'jouer':
        agir((tt) => {
          const x = trouver(tt, matchId);
          const occupees = new Set();
          BT.matchsEnCours(tt).forEach((y) => { occupees.add(y.a); occupees.add(y.b); });
          const libres = BT.terrainsLibres(tt);
          if (!x || x.statut !== 'attente' || !libres.length || occupees.has(x.a) || occupees.has(x.b)) return false;
          BT.lancer(x, libres[0]);
          return true;
        });
        break;
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
          agir((tt) => { BT.genererMatchs(tt); return true; }).then((r) => { if (r) changerOnglet('direct'); });
        }
        break;
      case 'supprimer':
        if (confirm('Supprimer « ' + t.nom + ' » ? Les équipes, les matchs et les scores seront effacés.')) {
          D.supprimer(t.id).then(() => { location.href = './'; }).catch((err) => toast('Suppression impossible. ' + err.message));
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

  /* ---------- Démarrage ---------- */

  function messagePlein(titre, texte, liens) {
    document.querySelector('.onglets').hidden = true;
    document.querySelector('.barre-actions').hidden = true;
    $('#titre').textContent = titre;
    $('.contenu').innerHTML = '<div class="carte"><h2>' + esc(titre) + '</h2><p>' + texte + '</p>'
      + '<div class="actions">' + (liens || '<a class="bouton principal" href="./">Voir mes tournois</a>') + '</div></div>';
  }

  let dejaConnecte = false;
  function afficherConnexion(etat) {
    const el = $('#connexion');
    if (etat === null) { el.hidden = true; return; }
    if (etat) dejaConnecte = true;
    el.hidden = false;
    if (!etat && !dejaConnecte) {
      el.className = 'connexion connexion--attente';
      el.textContent = 'Connexion';
      el.title = 'Connexion à la base en cours.';
      return;
    }
    el.className = 'connexion connexion--' + (etat ? 'oui' : 'non');
    el.textContent = etat ? 'En ligne' : 'Hors ligne';
    el.title = etat ? 'Les changements sont partagés en direct.' : 'Les changements partiront dès le retour du réseau.';
  }

  async function demarrer() {
    if (!id) {
      messagePlein('Tournoi introuvable', 'L’adresse ne contient pas de tournoi.');
      return;
    }
    const hash = new URLSearchParams(location.hash.slice(1));
    const cle = hash.get('cle');
    const ongletDemande = ONGLETS.includes(location.hash.slice(1)) ? location.hash.slice(1) : null;
    if (cle) {
      history.replaceState(null, '', location.pathname + location.search);
      try {
        await D.rejoindre(id, cle);
      } catch (e) {
        messagePlein('Lien organisateur refusé', 'Ce lien organisateur n’est pas valide pour ce tournoi.');
        return;
      }
    }
    if (!D.estOrganisateur(id)) {
      const lienEquipes = 'equipe.html?t=' + encodeURIComponent(id);
      messagePlein(D.enLigne ? 'Page réservée aux organisateurs' : 'Ce tournoi n’est pas sur cet appareil',
        D.enLigne
          ? 'Pour gérer ce tournoi, ouvre le lien organisateur envoyé par la personne qui l’a créé. Pour suivre ton équipe, va sur la page des équipes.'
          : 'Les tournois sont enregistrés dans le navigateur où ils ont été créés.',
        D.enLigne ? '<a class="bouton principal" href="' + lienEquipes + '">Page des équipes</a>' : null);
      return;
    }
    D.assurerOrganisateur(id).catch((e) => toast('Connexion à la base impossible. ' + (e.message || '')));
    D.suivreConnexion(afficherConnexion);

    D.suivre(id, (nouveau, info) => {
      if (!nouveau) {
        if (info && info.erreur) toast('Connexion à la base impossible. ' + (info.erreur.message || ''));
        else if (!t) messagePlein('Tournoi introuvable', 'Ce tournoi n’existe plus.');
        return;
      }
      const premier = !t;
      t = nouveau;
      if (premier) {
        onglet = ongletDemande || (t.matchs.length ? 'direct' : 'reglages');
        if (onglet === 'reglages') rendreReglages();
      }
      if (matchScoreId && dialogue.open && !trouver(t, matchScoreId)) dialogue.close();
      rendre();
      traiterPropositions();
    });

    D.suivrePropositions(id, (p) => {
      propositions = p || {};
      if (!t) return;
      rendre();
      traiterPropositions();
    });
  }

  demarrer();
})();
