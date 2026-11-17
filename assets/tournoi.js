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
  let filtreEquipe = '';
  let brouillon = null;
  const enTraitement = new Set();

  /* ---------- Outils ---------- */

  const nom = (equipeId) => esc(BT.nomEquipe(t, equipeId));
  const trouver = (tournoi, matchId) => tournoi.matchs.find((m) => m.id === matchId);
  const pluriel = (n, mot, motPluriel) => n + ' ' + (n > 1 ? (motPluriel || mot + 's') : mot);
  const texteSets = (sets) => sets.map(([x, y]) => x + '-' + y).join(' · ');

  // Nom de l'équipe, avec les joueurs en petit s'ils sont renseignés.
  function nomComplet(equipeId) {
    const e = BT.equipe(t, equipeId);
    return esc(e.nom) + (e.joueurs ? '<small class="joueurs-court">' + esc(e.joueurs) + '</small>' : '');
  }

  // Temps écoulé depuis le début du match, ou temps restant avec une durée maximum.
  function texteChrono(debut) {
    const ecoule = Math.max(0, Math.floor((Date.now() - debut) / 60000));
    const limite = t.reglages.dureeLimite;
    if (limite > 0) {
      const reste = limite - ecoule;
      return reste > 0 ? { texte: pluriel(reste, 'minute restante', 'minutes restantes'), alerte: reste <= 2 } : { texte: 'Temps écoulé', alerte: true };
    }
    return { texte: ecoule < 1 ? 'à l\u2019instant' : 'depuis ' + ecoule + ' min', alerte: false };
  }

  function chronoHtml(debut) {
    const c = texteChrono(debut);
    return '<span class="chrono' + (c.alerte ? ' chrono--alerte' : '') + '" data-debut="' + debut + '">' + c.texte + '</span>';
  }

  function majChronos() {
    if (!t) return;
    document.querySelectorAll('.chrono[data-debut]').forEach((el) => {
      const c = texteChrono(Number(el.dataset.debut));
      el.textContent = c.texte;
      el.classList.toggle('chrono--alerte', c.alerte);
    });
  }

  function telecharger(nomFichier, lignes) {
    const csv = '\ufeff' + lignes.map((l) => l.map((v) => {
      const x = String(v == null ? '' : v);
      return /[";\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x;
    }).join(';')).join('\r\n');
    const lien = document.createElement('a');
    lien.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    lien.download = nomFichier;
    document.body.appendChild(lien);
    lien.click();
    setTimeout(() => { URL.revokeObjectURL(lien.href); lien.remove(); }, 1000);
  }

  function nomFichier(suffixe) {
    return (t.nom || 'tournoi').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + suffixe + '.csv';
  }

  function imprimer(panneau) {
    const el = $('#' + panneau);
    el.classList.add('imprimer');
    window.print();
    el.classList.remove('imprimer');
  }

  function lienNote() {
    try { return localStorage.getItem('badminton:lien-note:' + id) === 'oui'; } catch (e) { return true; }
  }

  // Une fiche par équipe avec son propre QR code (à distribuer à l'accueil).
  function imprimerFiches() {
    const el = $('#fiches');
    el.innerHTML = '<div class="fiches-grille">' + t.equipes.map((e) => {
      const url = BT.urlPage('equipe.html', { t: t.id, e: e.id });
      return '<div class="fiche"><div class="fiche-tournoi">' + esc(t.nom) + '</div>'
        + '<div class="fiche-nom">' + esc(e.nom) + '</div>'
        + (e.joueurs ? '<div class="fiche-joueurs">' + esc(e.joueurs) + '</div>' : '')
        + '<div class="qr">' + BT.qrSvg(url) + '</div>'
        + '<div class="fiche-texte">Scanne pour voir ton prochain match, ton terrain, envoyer ton score et suivre le classement.</div></div>';
    }).join('') + '</div>';
    el.hidden = false;
    document.body.classList.add('impression-fiches');
    window.print();
    document.body.classList.remove('impression-fiches');
    el.hidden = true;
  }

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
    const fin = faits < total ? BT.finEstimee(t) : null;
    return '<div class="progression"><div class="progression-barre"><span style="width:' + pct + '%"></span></div>'
      + '<span class="progression-texte">' + faits + ' / ' + total + ' matchs joués'
      + (fin ? '<small>fin estimée vers ' + BT.heure(fin) + '</small>' : '') + '</span></div>';
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
        + '<div class="terrain-tete"><span>Terrain ' + n + '</span><span class="num-match">' + (BT.etiquetteMatch(t, m) ? esc(BT.etiquetteMatch(t, m)) + ' · ' : '') + 'Match ' + m.numero + '</span></div>'
        + '<div class="court"><div class="court-cote">' + nomComplet(m.a) + '</div><div class="court-filet"></div>'
        + '<div class="court-cote">' + nomComplet(m.b) + '</div></div>'
        + '<div class="terrain-depuis">Commencé à ' + BT.heure(m.debut) + ', ' + chronoHtml(m.debut) + '</div>'
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

  // Message pour la salle et pause des appels : rendus une seule fois pour ne pas effacer la saisie.
  function rendreOutils() {
    const el = $('#direct-outils');
    if (!t.matchs.length) { el.innerHTML = ''; return; }
    if (!el.firstChild) {
      el.innerHTML = '<div class="outils-direct">'
        + '<form class="annonce-form" id="form-annonce"><label for="annonce">Message affiché sur l’écran de la salle et les téléphones</label>'
        + '<div class="annonce-ligne"><input type="text" id="annonce" maxlength="140" placeholder="Par exemple : pause repas jusqu’à 13 h">'
        + '<button type="submit" class="bouton petit principal">Afficher</button>'
        + '<button type="button" class="bouton petit" data-action="retirer-annonce" id="retirer-annonce">Retirer</button></div>'
        + '<p class="annonce-actuelle" id="annonce-actuelle"></p></form>'
        + '<button type="button" class="bouton" data-action="pause" id="bouton-pause"></button></div>';
    }
    const champ = $('#annonce');
    const texte = t.annonce && t.annonce.texte ? t.annonce.texte : '';
    if (document.activeElement !== champ && champ.dataset.affiche !== texte) {
      champ.value = texte;
      champ.dataset.affiche = texte;
    }
    $('#retirer-annonce').hidden = !texte;
    $('#annonce-actuelle').textContent = texte ? 'Affiché en ce moment : « ' + texte + ' »' : '';
    const pause = $('#bouton-pause');
    pause.textContent = t.pause ? 'Reprendre les appels' : 'Mettre les appels en pause';
    pause.className = 'bouton' + (t.pause ? ' accent' : '');
  }

  function rendreDirect() {
    rendreOutils();
    const el = $('#direct-contenu');
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

    if (t.pause) {
      h += '<div class="encadre encadre--pause"><p><strong>Appels en pause.</strong> Les terrains qui se libèrent ne sont plus remplis automatiquement. Tu peux toujours appeler un match à la main.</p></div>';
    }
    if (D.enLigne && !lienNote()) {
      h += '<div class="encadre"><p>Garde le lien organisateur de ce tournoi (onglet QR code). Il permet de le retrouver depuis un autre téléphone, ou si ce navigateur est effacé.</p>'
        + '<div class="actions"><button type="button" class="bouton petit" data-action="voir-lien">Voir le lien organisateur</button>'
        + '<button type="button" class="bouton petit discret" data-action="lien-note">C’est noté</button></div></div>';
    }

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
    if (!t.finale && BT.nbQualifies(t) >= 2 && BT.phasePoulesFinie(t)) {
      const q = BT.qualifies(t);
      h += '<div class="carte carte-finale"><h2>' + (BT.avecPoules(t) ? 'Phase de poules terminée' : 'Championnat terminé') + '</h2>'
        + '<p>Voici les équipes qualifiées pour la phase finale, de la tête de série 1 à ' + q.length + '. Vérifie le classement avant de lancer.</p>'
        + '<ol class="liste-qualifies">' + q.map((x) => '<li>' + esc(x.equipe.nom)
          + (x.poule != null ? ' <small>' + BT.nomPoule(x.poule) + ', ' + (x.place === 1 ? '1re' : x.place + 'e') + '</small>' : '') + '</li>').join('') + '</ol>'
        + '<div class="actions"><button type="button" class="bouton accent grand" data-action="lancer-finale">Lancer la phase finale</button>'
        + '<button type="button" class="bouton" data-action="onglet" data-cible="classement">Voir le classement</button></div></div>';
    }
    if (st === 'termine') {
      const cf = BT.classementFinal(t);
      let texte;
      if (cf) {
        const premiers = cf.filter((l) => l.rang === 1).map((l) => esc(l.equipe.nom));
        texte = premiers.length > 1 ? premiers.join(' et ') + ' terminent à égalité à la première place.' : premiers[0] + ' remporte le tournoi.';
      } else {
        texte = 'En tête des poules : ' + BT.listePoules(t).map((p) => esc((BT.classement(t, p.numero)[0] || { equipe: { nom: '' } }).equipe.nom) + ' (' + p.nom + ')').join(', ') + '.';
      }
      h += '<div class="carte"><h2>Tournoi terminé</h2><p>' + texte + '</p>'
        + '<button type="button" class="bouton principal" data-action="onglet" data-cible="classement">Voir le classement</button></div>';
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
    else if (fini && m.forfait) etat = '<span class="etiquette etiquette--N">Forfait (' + nom(m.forfait) + ')</span>';
    else if (fini) etat = '<span class="match-score">' + esc(BT.texteScore(m)) + '</span>' + (r.gagnant ? '' : ' <span class="etiquette etiquette--N">Nul</span>');
    else if (o.suivant) etat = '<span class="etiquette">Prochain appel</span>';
    else etat = '<span class="etiquette">À jouer</span>';
    if (!fini && propositionsDe(m.id).length) etat += ' <span class="etiquette etiquette--recu">Score reçu</span>';
    if (m.statut === 'attente' && m.priorite) etat += ' <span class="etiquette etiquette--priorite">Prioritaire</span>';

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
      actions.push(m.priorite
        ? '<button type="button" class="bouton petit" data-action="priorite" data-id="' + m.id + '" data-valeur="non">Retirer la priorité</button>'
        : '<button type="button" class="bouton petit" data-action="priorite" data-id="' + m.id + '" data-valeur="oui">Faire passer en priorité</button>');
      actions.push('<button type="button" class="bouton petit" data-action="reporter" data-id="' + m.id + '">Reporter</button>');
    } else {
      actions.push('<button type="button" class="bouton petit" data-action="score" data-id="' + m.id + '">Modifier le score</button>');
    }
    return '<li class="match match--' + m.statut + (o.suivant ? ' match--suivant' : '') + '">'
      + '<span class="match-num" title="Match ' + m.numero + '">' + m.numero + '</span>'
      + '<span class="match-equipes">' + (BT.etiquetteMatch(t, m) ? '<span class="match-tour' + (m.phase === 'finale' ? ' match-tour--finale' : '') + '">' + esc(BT.etiquetteMatch(t, m)) + '</span>' : '')
      + '<span' + clsA + '>' + nom(m.a) + '</span><span class="contre">contre</span><span' + clsB + '>' + nom(m.b) + '</span></span>'
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
    const garder = (m) => !filtreEquipe || m.a === filtreEquipe || m.b === filtreEquipe;
    const enCours = BT.matchsEnCours(t).filter(garder);
    const aJouer = BT.prochains(t).filter(garder);
    const termines = t.matchs.filter((m) => m.statut === 'termine' && garder(m)).sort((x, y) => x.numero - y.numero);
    const groupes = [
      { cle: 'en_cours', titre: 'En cours', liste: enCours },
      { cle: 'attente', titre: 'À jouer, dans l’ordre prévu', liste: aJouer },
      { cle: 'termine', titre: 'Terminés', liste: termines },
    ];
    const filtres = [['tous', 'Tous', enCours.length + aJouer.length + termines.length], ['en_cours', 'En cours', enCours.length],
      ['attente', 'À jouer', aJouer.length], ['termine', 'Terminés', termines.length]];
    let h = progression() + '<div class="filtres">'
      + filtres.map(([cle, libelle, n]) => '<button type="button" data-action="filtre" data-valeur="' + cle + '" aria-pressed="' + (filtre === cle) + '">' + libelle + ' (' + n + ')</button>').join('')
      + '<select id="filtre-equipe" aria-label="Filtrer par équipe"><option value="">Toutes les équipes</option>'
      + t.equipes.map((e) => '<option value="' + esc(e.id) + '"' + (e.id === filtreEquipe ? ' selected' : '') + '>' + esc(e.nom) + '</option>').join('')
      + '</select></div>';
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

  function tableClassement(lignes, nuls, qualifies) {
    return '<div class="tableau-conteneur"><table class="tableau"><thead><tr>'
      + '<th>Rang</th><th class="equipe">Équipe</th><th><abbr title="Matchs joués">J</abbr></th><th><abbr title="Victoires">V</abbr></th>'
      + (nuls ? '<th><abbr title="Matchs nuls">N</abbr></th>' : '')
      + '<th><abbr title="Défaites">D</abbr></th><th>Sets</th><th>Points</th></tr></thead><tbody>'
      + lignes.map((l, i) => '<tr' + (i < qualifies ? ' class="qualifie"' : '') + '><td class="rang">' + l.rang + '</td><td class="equipe">' + esc(l.equipe.nom)
        + (l.equipe.abandon ? ' <span class="etiquette etiquette--N">Abandon</span>' : '')
        + (i < qualifies ? ' <span class="etiquette etiquette--qualifie">Qualifiée</span>' : '') + '</td>'
        + '<td>' + l.J + '</td><td class="fort">' + l.V + '</td>' + (nuls ? '<td>' + l.N + '</td>' : '') + '<td>' + l.D + '</td>'
        + '<td>' + BT.signe(l.diffSets) + '</td><td>' + BT.signe(l.diffPts) + '</td></tr>').join('')
      + '</tbody></table></div>';
  }

  function rendreClassement() {
    const el = $('#classement');
    if (!t.matchs.length) {
      el.innerHTML = '<div class="carte"><p>Le classement s’affichera dès les premiers résultats.</p></div>';
      return;
    }
    const nuls = BT.nulsPossibles(t);
    const st = BT.statut(t);
    const r = t.reglages;
    const cf = st === 'termine' ? BT.classementFinal(t) : null;
    let h = '';
    if (cf) {
      h += '<h2>Résultats finaux</h2>' + BT.podiumHtml(cf)
        + '<div class="tableau-conteneur"><table class="tableau"><thead><tr><th>Rang</th><th class="equipe">Équipe</th>'
        + (t.finale ? '<th class="equipe">Parcours</th>' : '<th><abbr title="Victoires">V</abbr></th><th><abbr title="Défaites">D</abbr></th>') + '</tr></thead><tbody>'
        + cf.map((l) => '<tr><td class="rang">' + (l.rang || '') + '</td><td class="equipe">' + esc(l.equipe.nom) + '</td>'
          + (t.finale ? '<td class="equipe">' + esc(l.etape || '') + '</td>' : '<td class="fort">' + l.V + '</td><td>' + l.D + '</td>') + '</tr>').join('')
        + '</tbody></table></div>';
    }
    if (t.finale) {
      const annulable = !t.matchs.some((m) => m.phase === 'finale' && m.statut !== 'attente' && !m.forfait);
      h += '<h2>Phase finale</h2><div class="tableau-defilant">' + BT.tableauHtml(t) + '</div>'
        + (annulable ? '<div class="actions pas-imprimer" style="margin-top:10px"><button type="button" class="bouton petit danger" data-action="annuler-finale">Annuler la phase finale</button></div>' : '');
    }
    if (BT.avecPoules(t)) {
      const q = r.qualifiesParPoule || 0;
      BT.listePoules(t).forEach((p) => {
        h += '<h2>' + p.nom + '</h2>' + tableClassement(BT.classement(t, p.numero), nuls, q);
      });
    } else {
      h += (cf || t.finale ? '<h2>Championnat</h2>' : '') + tableClassement(BT.classement(t), nuls, Number(r.phaseFinale) || 0);
    }
    h += '<p class="note" style="margin-top:12px">Classement au nombre de victoires'
      + (nuls ? ' (un match nul compte pour une demi-victoire)' : '')
      + '. Entre deux équipes à égalité, le match qu’elles ont joué l’une contre l’autre les départage, puis la différence de sets, puis la différence de points.'
      + (BT.nbQualifies(t) >= 2 ? ' Les matchs de phase finale ne comptent pas dans ce classement.' : '') + '</p>'
      + '<div class="actions pas-imprimer" style="margin-top:16px">'
      + '<button type="button" class="bouton" data-action="imprimer-classement">Imprimer le classement</button>'
      + '<button type="button" class="bouton" data-action="export-classement">Télécharger le classement (Excel)</button>'
      + '<button type="button" class="bouton" data-action="export-matchs">Télécharger tous les matchs (Excel)</button>'
      + '</div>';
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
      + '<button type="button" class="bouton" data-action="imprimer">Imprimer le QR code</button>'
      + '<button type="button" class="bouton" data-action="fiches">Imprimer une fiche par équipe</button></div>'
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
      + '<a class="bouton" href="' + urlEcran('classement') + '" target="_blank" rel="noopener">Classement en direct</a>'
      + '<a class="bouton" href="' + urlEcran('alterne') + '" target="_blank" rel="noopener">Terrains et classement en alternance</a>'
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
      + '<h2>Déroulement</h2>'
      + '<div class="grille-champs">'
      + '<div class="champ"><label for="r-equipes">Nombre d’équipes</label>' + nombre('r-equipes', b.equipes.length, 2, 64) + '</div>'
      + '<div class="champ"><label for="r-format">Organisation</label>'
      + '<select id="r-format"><option value="championnat"' + (r.format !== 'poules' ? ' selected' : '') + '>Une seule poule, tous ensemble</option>'
      + '<option value="poules"' + (r.format === 'poules' ? ' selected' : '') + '>Plusieurs poules</option></select></div>'
      + '<div class="champ" id="r-matchs-bloc"><label for="r-matchs">Matchs par équipe</label>' + nombre('r-matchs', r.matchsParEquipe, 1, 63)
      + caseHtml('r-tous', r.tousContreTous, 'Chaque équipe rencontre toutes les autres') + '</div>'
      + '<div class="champ" id="r-poules-bloc"><label for="r-poules">Nombre de poules</label>' + nombre('r-poules', r.nbPoules, 2, 8)
      + '<span class="aide" id="r-poules-aide"></span></div>'
      + '<div class="champ"><label for="r-finale" id="r-finale-label">Phase finale</label>'
      + '<select id="r-finale">'
      + [[0, 'Pas de phase finale'], [2, 'Finale entre les 2 premiers'], [4, 'Demi-finales (4 qualifiés)'], [8, 'Quarts de finale (8 qualifiés)'], [16, 'Huitièmes de finale (16 qualifiés)']]
        .map(([v, l]) => '<option value="' + v + '"' + (Number(r.phaseFinale) === v ? ' selected' : '') + '>' + l + '</option>').join('')
      + '</select>'
      + nombre('r-qualifies', r.qualifiesParPoule, 0, 8)
      + '<span class="aide" id="r-finale-aide"></span>'
      + caseHtml('r-petite', r.petiteFinale, 'Match pour la 3e place') + '</div>'
      + '</div>'
      + '<p class="erreur-champ" id="r-matchs-erreur" hidden></p>'
      + '<h2>Matchs</h2>'
      + '<div class="grille-champs">'
      + '<div class="champ"><label for="r-sets">Sets par match</label>' + nombre('r-sets', r.sets, 1, 5)
      + caseHtml('r-meilleur', r.auMeilleur, '')
      + '<span class="aide" id="r-sets-aide"></span></div>'
      + '<div class="champ"><label for="r-points">Points pour gagner un set</label>' + nombre('r-points', r.points, 1, 99)
      + caseHtml('r-ecart', r.ecart2, '2 points d’écart pour gagner le set')
      + '<div class="champ" id="r-plafond-bloc"><label for="r-plafond">Score maximum d’un set</label>' + nombre('r-plafond', r.plafond, 1, 99) + '</div></div>'
      + '<div class="champ"><label for="r-duree">Durée maximum d’un match</label>' + nombre('r-duree', r.dureeLimite || 0, 0, 90)
      + '<span class="aide">En minutes, 0 si les matchs vont jusqu’au bout. Le temps restant s’affiche sur chaque terrain.</span></div>'
      + '<div class="champ"><label for="r-terrains">Terrains disponibles</label>' + nombre('r-terrains', r.terrains, 1, 30)
      + caseHtml('r-auto', r.appelAuto, 'Appeler automatiquement le match suivant dès qu’un terrain se libère')
      + '</div></div>'
      + '<div id="r-finale-format-bloc" style="margin-top:18px">'
      + caseHtml('r-format-finale', r.formatFinale, 'Format différent pour la phase finale (par exemple des matchs plus longs)')
      + '<div class="grille-champs" id="r-finale-champs" style="margin-top:12px">'
      + '<div class="champ"><label for="r-finale-sets">Sets par match en phase finale</label>' + nombre('r-finale-sets', r.finaleSets, 1, 5)
      + caseHtml('r-finale-meilleur', r.finaleAuMeilleur, '') + '</div>'
      + '<div class="champ"><label for="r-finale-points">Points par set en phase finale</label>' + nombre('r-finale-points', r.finalePoints, 1, 99)
      + '<span class="aide">Même règle d’écart que les poules, sans durée maximum.</span></div>'
      + '</div></div>'
      + '<div class="resume-reglages" id="r-resume" style="margin-top:20px"></div>'
      + '<h2>Scores envoyés par les joueurs</h2>'
      + '<div class="grille-champs"><div class="champ">'
      + caseHtml('r-joueurs', r.scoresJoueurs, 'Les joueurs peuvent envoyer le score de leur match depuis leur téléphone. Un organisateur le valide ensuite.')
      + caseHtml('r-validation', r.validationAuto, 'Valider tout seul quand les deux équipes envoient le même score')
      + '</div></div>'
      + '<div class="titre-actions"><h2>Équipes</h2>'
      + (BT.demarre(t) ? '' : '<button type="button" class="bouton petit" data-action="melanger">Mélanger l’ordre des équipes</button>') + '</div>'
      + '<p class="note">Le nom des joueurs est facultatif, il s’affiche sur les terrains et sur la page de l’équipe. Changer un nom ne touche pas aux matchs.'
      + (t.matchs.length ? ' Si une équipe part avant la fin, « Abandon » lui fait perdre ses matchs restants par forfait.' : '') + '</p>'
      + '<span class="erreur-champ" id="r-equipes-erreur" hidden></span>'
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
    const avecMatchs = t.matchs.length > 0;
    $('#r-liste-equipes').innerHTML = brouillon.equipes.map((e, i) => {
      const actuelle = t.equipes.find((x) => x.id === e.id);
      let action = '';
      if (avecMatchs && actuelle) {
        action = actuelle.abandon
          ? '<button type="button" class="bouton petit" data-action="annuler-abandon" data-equipe="' + esc(e.id) + '">Annuler l’abandon</button>'
          : '<button type="button" class="bouton petit danger" data-action="abandon" data-equipe="' + esc(e.id) + '">Abandon</button>';
      }
      return '<div class="ligne-equipe' + (avecMatchs ? ' ligne-equipe--action' : '') + (actuelle && actuelle.abandon ? ' ligne-equipe--abandon' : '') + '">'
        + '<span class="num">' + (i + 1) + '</span>'
        + '<input type="text" data-index="' + i + '" data-champ="nom" maxlength="40" value="' + esc(e.nom) + '" placeholder="Équipe ' + (i + 1) + '" aria-label="Nom de l’équipe ' + (i + 1) + '">'
        + '<input type="text" class="joueurs" data-index="' + i + '" data-champ="joueurs" maxlength="80" value="' + esc(e.joueurs || '') + '" placeholder="Joueurs (facultatif)" aria-label="Joueurs de l’équipe ' + (i + 1) + '">'
        + action + '</div>';
    }).join('');
  }

  function verifierNoms() {
    const vus = new Map();
    const doublons = new Set();
    brouillon.equipes.forEach((e, i) => {
      const cle = (e.nom || '').trim().toLowerCase() || 'équipe ' + (i + 1);
      if (vus.has(cle)) doublons.add((e.nom || '').trim());
      vus.set(cle, true);
    });
    const el = $('#r-equipes-erreur');
    el.hidden = !doublons.size;
    el.textContent = doublons.size ? 'Plusieurs équipes portent le même nom (' + Array.from(doublons).join(', ') + '). Donne-leur des noms différents pour éviter les erreurs.' : '';
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
    const avant = tournoi.reglages;
    if (!tournoi.matchs.length || brouillon.equipes.length !== tournoi.equipes.length) return true;
    if ((r.format || 'championnat') !== (avant.format || 'championnat')) return true;
    if (r.format === 'poules' ? r.nbPoules !== avant.nbPoules : r.matchsParEquipe !== avant.matchsParEquipe) return true;
    return brouillon.equipes.some((e, i) => e.id !== tournoi.equipes[i].id);
  }

  // Nombre de matchs de la phase de poules (ou du championnat) avec ces réglages.
  function compterMatchsPoules(n, r) {
    if (r.format === 'poules') return BT.taillesPoules(n, r.nbPoules).reduce((s, k) => s + (k * (k - 1)) / 2, 0);
    return (n * r.matchsParEquipe) / 2;
  }

  function texteTailles(tailles) {
    const liste = tailles.map(String);
    return liste.length > 1 ? liste.slice(0, -1).join(', ') + ' et ' + liste[liste.length - 1] : liste[0];
  }

  function majReglages() {
    const b = brouillon;
    const r = b.reglages;
    const n = b.equipes.length;
    const poules = r.format === 'poules';
    if (r.tousContreTous) {
      r.matchsParEquipe = n - 1;
      $('#r-matchs').value = n - 1;
    }
    $('#r-matchs').disabled = r.tousContreTous;
    $('#r-matchs').max = Math.max(1, n - 1);
    $('#r-matchs-bloc').hidden = poules;
    $('#r-poules-bloc').hidden = !poules;
    if (poules && !BT.verifierPoules(n, r.nbPoules)) {
      $('#r-poules-aide').textContent = 'Poules de ' + texteTailles(BT.taillesPoules(n, r.nbPoules)) + ' équipes. Chaque équipe joue contre toutes celles de sa poule.';
    } else {
      $('#r-poules-aide').textContent = '';
    }

    // Phase finale : nombre de qualifiés et forme du tableau
    $('#r-finale').hidden = poules;
    $('#r-qualifies').hidden = !poules;
    $('#r-finale-label').textContent = poules ? 'Qualifiés par poule pour la phase finale' : 'Phase finale';
    $('#r-finale').querySelectorAll('option').forEach((o) => { o.disabled = Number(o.value) > n; });
    const Q = poules ? (r.qualifiesParPoule > 0 ? r.qualifiesParPoule * r.nbPoules : 0) : Number(r.phaseFinale) || 0;
    let aideFinale = poules ? '0 si le classement des poules suffit.' : 'Le classement final est celui du championnat.';
    if (Q >= 2) {
      let S = 2;
      while (S < Q) S *= 2;
      const titre = ['finale', 'demi-finales', 'quarts de finale', 'huitièmes de finale', 'seizièmes de finale'][Math.round(Math.log2(S)) - 1] || 'tableau de ' + S;
      aideFinale = Q + ' équipes qualifiées, ' + titre + '.'
        + (S > Q ? ' Les ' + (S - Q) + ' meilleures passent directement au tour suivant.' : '');
    }
    if (t.finale) aideFinale = 'La phase finale est déjà lancée. Ces réglages ne la modifient plus, sauf le match pour la 3e place.';
    $('#r-finale-aide').textContent = aideFinale;
    $('#r-petite-case').hidden = Q < 4 && !t.finale;
    $('#r-finale-format-bloc').hidden = Q < 2 && !t.finale;
    $('#r-finale-champs').hidden = !r.formatFinale;
    const finaleImpair = r.finaleSets % 2 === 1 && r.finaleSets >= 3;
    $('#r-finale-meilleur-case').hidden = !finaleImpair;
    $('#r-finale-meilleur-texte').textContent = 'Le match s’arrête dès qu’une équipe a gagné ' + ((r.finaleSets + 1) / 2) + ' sets (au meilleur des ' + r.finaleSets + ')';

    const erreur = BT.verifierDeroulement(n, r);
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

    const total = erreur ? null : compterMatchsPoules(n, r);
    const matchsFinale = Q >= 2 ? Q - 1 + (r.petiteFinale && Q >= 4 ? 1 : 0) : 0;
    $('#r-resume').innerHTML = '<span><strong>' + n + '</strong> équipes</span>'
      + (poules && !erreur ? '<span><strong>' + r.nbPoules + '</strong> poules</span>' : '')
      + (total ? '<span><strong>' + total + '</strong> ' + (poules ? 'matchs de poule' : 'matchs') + '</span>'
        + (matchsFinale ? '<span><strong>' + matchsFinale + '</strong> matchs de phase finale</span>' : '')
        + '<span><strong>' + Math.ceil(total / r.terrains) + '</strong> rotations sur ' + pluriel(r.terrains, 'terrain') + '</span>' : '')
      + '<span>' + esc(BT.texteFormat(r)) + '</span>';

    verifierNoms();
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
      if (cible.dataset.champ === 'nom') verifierNoms();
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
      case 'r-format': r.format = v === 'poules' ? 'poules' : 'championnat'; break;
      case 'r-poules': { const p = BT.entier(v, 2, 8, null); if (p) r.nbPoules = p; break; }
      case 'r-finale': r.phaseFinale = BT.entier(v, 0, 16, 0); break;
      case 'r-qualifies': { const q = BT.entier(v, 0, 8, null); if (q !== null) r.qualifiesParPoule = q; break; }
      case 'r-petite': r.petiteFinale = cible.checked; break;
      case 'r-format-finale': r.formatFinale = cible.checked; break;
      case 'r-finale-sets': { const s = BT.entier(v, 1, 5, null); if (s) r.finaleSets = s; break; }
      case 'r-finale-meilleur': r.finaleAuMeilleur = cible.checked; break;
      case 'r-finale-points': { const p = BT.entier(v, 1, 99, null); if (p) r.finalePoints = p; break; }
      case 'r-tous': r.tousContreTous = cible.checked; break;
      case 'r-sets': { const s = BT.entier(v, 1, 5, null); if (s) r.sets = s; break; }
      case 'r-meilleur': r.auMeilleur = cible.checked; break;
      case 'r-points': { const p = BT.entier(v, 1, 99, null); if (p) r.points = p; break; }
      case 'r-ecart': r.ecart2 = cible.checked; break;
      case 'r-plafond': { const p = BT.entier(v, 1, 99, null); if (p) { r.plafond = p; b.plafondManuel = true; } break; }
      case 'r-terrains': { const n = BT.entier(v, 1, 30, null); if (n) r.terrains = n; break; }
      case 'r-duree': { const d = BT.entier(v, 0, 90, null); if (d !== null) r.dureeLimite = d; break; }
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
    const erreur = BT.verifierDeroulement(r.nbEquipes, r);
    if (erreur) {
      majReglages();
      $('#r-matchs-erreur').scrollIntoView({ block: 'center' });
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
    const saisies = b.equipes.map((e, i) => ({ id: e.id, nom: (e.nom || '').trim() || 'Équipe ' + (i + 1), joueurs: (e.joueurs || '').trim() }));
    // Garde les abandons déjà déclarés (ils ne se modifient pas depuis ce formulaire).
    const nouvellesEquipes = (tt) => saisies.map((e) => {
      const ancienne = tt.equipes.find((x) => x.id === e.id);
      return ancienne && ancienne.abandon && !structureChangee(tt) ? Object.assign({}, e, { abandon: true }) : e;
    });
    const nouveauNom = b.nom.trim() || 'Tournoi loisir';
    $('#r-enregistrer').disabled = true;
    const resultat = await agir((tt) => {
      const recreer = structureChangee(tt);
      tt.nom = nouveauNom;
      tt.reglages = nouveauxReglages;
      tt.equipes = nouvellesEquipes(tt);
      if (recreer) BT.genererMatchs(tt);
      else {
        if (tt.finale) BT.avancerTableau(tt);
        if (BT.appelAutoActif(tt) && BT.demarre(tt)) BT.remplirTerrains(tt);
      }
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
    const reg = BT.formatMatch(t, m);
    const n = Math.max(reg.sets, depart.length, ...recus.map((p) => p.sets.length));
    $('#score-titre').textContent = 'Match ' + m.numero + (m.statut === 'en_cours' ? ', terrain ' + m.terrain : '');
    $('#score-format').textContent = (BT.etiquetteMatch(t, m) ? BT.etiquetteMatch(t, m) + '. ' : '') + BT.texteFormat(reg);
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
    remplirChamps(m.forfait ? [] : depart);
    $('#score-forfait').innerHTML = '<span>Forfait d’une équipe ? Touche son nom.</span>'
      + '<button type="button" class="bouton petit danger" data-forfait="' + esc(m.a) + '">' + nom(m.a) + '</button>'
      + '<button type="button" class="bouton petit danger" data-forfait="' + esc(m.b) + '">' + nom(m.b) + '</button>';
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
    const mScore = trouver(t, matchScoreId);
    if (mScore && mScore.phase === 'finale' && !BT.resultat({ sets: lu.sets }).gagnant) {
      messageScore('erreur', 'Un match de phase finale doit avoir un vainqueur.');
      return;
    }
    if (!confirmer) {
      const alertes = BT.verifierScore(lu.sets, BT.formatMatch(t, mScore));
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
      delete x.forfait;
      if (BT.appelAutoActif(tt) && BT.demarre(tt)) BT.remplirTerrains(tt);
      return true;
    });
  });

  $('#score-forfait').addEventListener('click', (e) => {
    const b = e.target.closest('[data-forfait]');
    if (!b) return;
    const m = trouver(t, matchScoreId);
    const perdant = b.dataset.forfait;
    if (!m || !confirm(BT.nomEquipe(t, perdant) + ' déclare forfait pour le match ' + m.numero + ' ? L’autre équipe gagne le match.')) return;
    const matchId = matchScoreId;
    dialogue.close();
    agir((tt) => {
      const x = trouver(tt, matchId);
      if (!x) return false;
      BT.enregistrerForfait(tt, x, perdant);
      return true;
    }).then((resultat) => {
      if (resultat && propositions[matchId]) D.retirerProposition(id, matchId).catch(() => {});
    });
  });

  function exporterClassement() {
    const nuls = BT.nulsPossibles(t);
    const final = BT.statut(t) === 'termine' ? BT.classementFinal(t) : null;
    const source = final || BT.classementPoules(t);
    const avecParcours = !!(t.finale || BT.avecPoules(t));
    const lignes = [['Rang', 'Équipe', 'Joueurs'].concat(avecParcours ? ['Parcours'] : [], ['Joués', 'Victoires'], nuls ? ['Nuls'] : [], ['Défaites', 'Sets gagnés', 'Sets perdus', 'Points marqués', 'Points encaissés'])];
    source.forEach((l, i) => {
      lignes.push([final ? (l.rang || '') : (BT.avecPoules(t) ? i + 1 : l.rang), l.equipe.nom + (l.equipe.abandon ? ' (abandon)' : ''), l.equipe.joueurs || '']
        .concat(avecParcours ? [l.etape || ''] : [], [l.J, l.V], nuls ? [l.N] : [], [l.D, l.setsP, l.setsC, l.ptsP, l.ptsC]));
    });
    telecharger(nomFichier('classement'), lignes);
  }

  function exporterMatchs() {
    const etats = { attente: 'À jouer', en_cours: 'En cours', termine: 'Terminé' };
    const lignes = [['Match', 'Phase', 'Équipe 1', 'Équipe 2', 'État', 'Terrain', 'Score', 'Gagnant', 'Début', 'Fin']];
    t.matchs.slice().sort((x, y) => x.numero - y.numero).forEach((m) => {
      const r = BT.resultat(m);
      const fini = m.statut === 'termine';
      lignes.push([m.numero, BT.etiquetteMatch(t, m), BT.nomEquipe(t, m.a), BT.nomEquipe(t, m.b), etats[m.statut] + (m.forfait ? ' (forfait ' + BT.nomEquipe(t, m.forfait) + ')' : ''),
        m.terrain || '', fini ? BT.texteScore(m).replace(/ · /g, ' / ') : '',
        fini ? (r.gagnant ? BT.nomEquipe(t, r.gagnant === 'a' ? m.a : m.b) : 'Nul') : '',
        m.debut ? BT.heure(m.debut) : '', m.fin && fini ? BT.heure(m.fin) : '']);
    });
    telecharger(nomFichier('matchs'), lignes);
  }

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
      case 'pause':
        agir((tt) => {
          tt.pause = !tt.pause;
          if (!tt.pause && BT.appelAutoActif(tt) && BT.demarre(tt)) BT.remplirTerrains(tt);
          return true;
        });
        break;
      case 'retirer-annonce':
        agir((tt) => { delete tt.annonce; return true; });
        break;
      case 'voir-lien':
        changerOnglet('partager');
        { const d = document.querySelector('#partager details'); if (d) d.open = true; }
        break;
      case 'lien-note':
        try { localStorage.setItem('badminton:lien-note:' + id, 'oui'); } catch (err) { /* stockage indisponible */ }
        rendreDirect();
        break;
      case 'fiches':
        imprimerFiches();
        break;
      case 'lancer-finale':
        el.disabled = true;
        agir((tt) => {
          if (tt.finale || !BT.phasePoulesFinie(tt)) return false;
          BT.lancerPhaseFinale(tt);
          return true;
        });
        break;
      case 'annuler-finale':
        if (confirm('Annuler la phase finale ? Ses matchs seront supprimés. Tu pourras la relancer depuis l’onglet Terrains.')) {
          agir((tt) => BT.annulerPhaseFinale(tt)).then((r) => {
            if (r && r.finale) toast('Impossible : un match de la phase finale a déjà commencé.');
          });
        }
        break;
      case 'priorite': {
        const active = el.dataset.valeur === 'oui';
        agir((tt) => {
          const x = trouver(tt, matchId);
          if (!x || x.statut !== 'attente') return false;
          BT.prioriser(x, active);
          return true;
        });
        break;
      }
      case 'abandon': {
        const equipeId = el.dataset.equipe;
        if (confirm('Abandon de ' + BT.nomEquipe(t, equipeId) + ' ? Tous ses matchs restants seront perdus par forfait.')) {
          agir((tt) => { BT.abandonEquipe(tt, equipeId); return true; }).then(() => { brouillon = null; rendreReglages(); });
        }
        break;
      }
      case 'annuler-abandon': {
        const equipeId = el.dataset.equipe;
        if (confirm('Annuler l’abandon de ' + BT.nomEquipe(t, equipeId) + ' ? Ses matchs perdus par forfait redeviendront à jouer.')) {
          agir((tt) => { BT.annulerAbandon(tt, equipeId); return true; }).then(() => { brouillon = null; rendreReglages(); });
        }
        break;
      }
      case 'melanger': {
        const liste = brouillon.equipes;
        for (let i = liste.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [liste[i], liste[j]] = [liste[j], liste[i]];
        }
        rendreListeEquipes();
        majReglages();
        break;
      }
      case 'imprimer-classement':
        imprimer('classement');
        break;
      case 'export-classement':
        exporterClassement();
        break;
      case 'export-matchs':
        exporterMatchs();
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
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'filtre-equipe') return;
    filtreEquipe = e.target.value;
    rendreMatchs();
  });
  setInterval(majChronos, 15000);
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'form-reglages') {
      e.preventDefault();
      enregistrerReglages();
    }
    if (e.target.id === 'form-annonce') {
      e.preventDefault();
      const texte = $('#annonce').value.trim();
      $('#annonce').blur();
      agir((tt) => {
        if (texte) tt.annonce = { texte, date: Date.now() };
        else delete tt.annonce;
        return true;
      });
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
