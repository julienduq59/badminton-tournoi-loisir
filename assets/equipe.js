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
  let dernierPreavis = null; // match pour lequel ce téléphone a déjà été prévenu « tu es le prochain »

  function alerteVoulue() {
    try { return localStorage.getItem(cleAlerte) === 'oui'; } catch (e) { return false; }
  }
  function choisirAlerte(oui) {
    try { localStorage.setItem(cleAlerte, oui ? 'oui' : 'non'); } catch (e) { /* stockage indisponible */ }
  }

  function blocAlerte() {
    if (alerteVoulue() && BT.sonActif()) {
      return '<div class="alerte-appel alerte-appel--on"><p>Alerte activée. ' + ('wakeLock' in navigator
        ? 'Garde cette page ouverte, l’écran reste allumé.' : 'Garde cette page ouverte, écran allumé.')
        + ' Ton téléphone vibre quand ton match devient le prochain appelé, puis sonne et vibre quand il est appelé.</p>'
        + '<button type="button" class="bouton petit" data-action="alerte-off">Désactiver l’alerte</button></div>';
    }
    return '<div class="alerte-appel"><button type="button" class="bouton principal" data-action="alerte-on">Me prévenir quand mon match est appelé</button>'
      + (alerteVoulue() ? '<p class="note">Touche le bouton pour réactiver l’alerte après avoir rouvert la page.</p>' : '') + '</div>';
  }

  // Avec l'alerte, l'écran reste allumé tant que la page est affichée (si le navigateur le permet).
  let verrouEcran = null;
  async function garderEcranAllume() {
    if (!('wakeLock' in navigator) || !alerteVoulue() || document.hidden || verrouEcran) return;
    try {
      verrouEcran = await navigator.wakeLock.request('screen');
      verrouEcran.addEventListener('release', () => { verrouEcran = null; });
    } catch (e) { verrouEcran = null; }
  }
  function libererEcran() {
    if (verrouEcran) verrouEcran.release().catch(() => {});
    verrouEcran = null;
  }

  // Match de l'équipe qui sera appelé juste après (le premier de l'ordre prévu), s'il ne joue pas déjà.
  function matchSuivantAppele() {
    if (!t || !equipeId || BT.statut(t) !== 'en_cours') return null;
    if (t.matchs.some((x) => x.statut === 'en_cours' && (x.a === equipeId || x.b === equipeId))) return null;
    const premier = BT.prochains(t)[0];
    return premier && (premier.a === equipeId || premier.b === equipeId) ? premier : null;
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
    // Préavis : le match de l'équipe devient le prochain appelé (une seule fois par match, plus court que l'appel).
    const suivant = matchSuivantAppele();
    if (suivant && suivant.id !== dernierPreavis && dernierAppel !== undefined && alerteVoulue()) {
      BT.bip();
      if (navigator.vibrate) navigator.vibrate([250, 120, 250]);
    }
    if (suivant) dernierPreavis = suivant.id;
    dernierAppel = actuel;
  }

  // Vue affichée : l'équipe, le classement en direct ou le récap à télécharger.
  const VUES = ['equipe', 'classement', 'photos', 'recap', 'partager', 'regles'];
  let vue = VUES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'equipe';
  let recap = null; // { url, blob, nom } de la dernière image créée
  let partageEquipe = false; // QR code de l'équipe (pour un partenaire) plutôt que celui du tournoi
  // Photos : vignettes de l'album (suivies à la première ouverture de l'onglet), photos des équipes.
  let miniatures = null;
  let suiviAlbum = null;
  let monUid = null;          // identifiant de ce téléphone dans la base (connu après un premier envoi)
  let envoiPhotos = null;     // { total, faits, erreurs, message } pendant un envoi
  let messageAlbum = '';
  let photosEquipes = {};
  let suiviPhotosEquipes = null;
  let ouverte = null;         // identifiant de la photo affichée dans la visionneuse
  const vignettes = new Map(); // vignettes déjà dessinées, gardées d'un affichage à l'autre
  const grandes = new Map();   // dernières grandes photos ouvertes (8 au plus)
  const photosActives = () => !!t && t.reglages.photos !== false;
  // Téléphone ou tablette : on propose de prendre la photo sur le moment (appareil photo), en plus de la galerie.
  const appareilPhoto = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
  let choixPhotoEquipe = false; // choix « Prendre une photo / Depuis la galerie / Retirer » ouvert
  const photoDe = (equipe) => (photosActives() && photosEquipes[equipe] ? BT.Photos.imageSure(photosEquipes[equipe].image) : '');
  // Règles : affichées d'abord tant que ce téléphone n'a pas lu leur version actuelle.
  const cleRegles = 'badminton:regles:' + id;
  let reglesAuto = !location.hash; // seulement à l'ouverture, sans vue demandée dans l'adresse
  let reglesChangees = false;
  function reglesLues() {
    try { return localStorage.getItem(cleRegles); } catch (e) { return null; }
  }
  function marquerReglesLues() {
    try { localStorage.setItem(cleRegles, BT.empreinteRegles(t)); } catch (e) { /* stockage indisponible */ }
  }

  // Formulaire d'envoi du score (conservé quand la page se met à jour).
  let envoi = null; // { matchId, saisie: [[a, b], ...], confirmer, message }
  let arriveeEnvoi = null; // { equipe, etat: 'envoi' | 'erreur', message } pendant le pointage depuis ce téléphone
  const listeEt = (l) => (l.length > 1 ? l.slice(0, -1).join(', ') + ' et ' + l[l.length - 1] : l[0] || '');
  // Pendant la frappe d'un score, les mises à jour en direct attendent que le champ soit quitté
  // (sinon le curseur saute et « 10 » peut devenir « 01 »).
  let renduDiffere = false;
  const saisieEnCours = () => {
    const a = document.activeElement;
    return !!(a && a.closest && a.closest('#form-envoi'));
  };
  function rendreEnDirect() {
    if (saisieEnCours()) { renduDiffere = true; return; }
    rendre();
  }
  // Pas de réseau au chargement : message et nouvel essai.
  let erreurConnexion = false;

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
    if (erreurConnexion) {
      message({ titre: 'Connexion impossible', corps: 'Vérifie le réseau de ton téléphone. Nouvel essai dans un instant.' });
      return;
    }
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
      + '</div>' + lienOrganisateur();
  }

  // Lien discret vers la gestion du tournoi, quand les organisateurs ont mis un mot de passe.
  function lienOrganisateur() {
    return D.enLigne && BT.listeAcces(t).length
      ? '<p class="note acces-orga"><a href="tournoi.html?t=' + encodeURIComponent(t.id) + '">Accès organisateur</a></p>'
      : '';
  }

  /* ---------- Envoi du score ---------- */

  function formulaireEnvoi(m, e) {
    const adversaire = m.a === e.id ? m.b : m.a;
    const reg = BT.formatMatch(t, m);
    const n = reg.sets;
    while (envoi.saisie.length < n) envoi.saisie.push(['', '']);
    const max = BT.maxPointsSet(reg);
    const attr = (v) => ' maxlength="2" autocomplete="off" data-max="' + (max || '') + '"'
      + (max && Number(v) > max ? ' data-trop=""' : '');
    let h = '<form class="envoi-score" id="form-envoi" novalidate>'
      + '<p class="note" style="margin:0 0 4px">' + esc(BT.texteFormat(reg)) + '</p>'
      + '<div class="score-grille">'
      + '<span></span><span class="score-equipe">' + esc(e.nom) + '</span><span class="score-equipe">' + nom(adversaire) + '</span>';
    for (let i = 0; i < n; i++) {
      const [va, vb] = envoi.saisie[i];
      h += '<span class="score-set">Set ' + (i + 1) + '</span>'
        + '<input type="text" inputmode="numeric" pattern="[0-9]*"' + attr(va) + ' data-set="' + i + '" data-cote="0" value="' + esc(va) + '" aria-label="Set ' + (i + 1) + ', ' + esc(e.nom) + '"' + (Number(va) > Number(vb) && vb !== '' ? ' class="gagne"' : '') + '>'
        + '<input type="text" inputmode="numeric" pattern="[0-9]*"' + attr(vb) + ' data-set="' + i + '" data-cote="1" value="' + esc(vb) + '" aria-label="Set ' + (i + 1) + ', ' + nom(adversaire) + '"' + (Number(vb) > Number(va) && va !== '' ? ' class="gagne"' : '') + '>';
    }
    h += '</div>'
      + '<p class="score-max" id="envoi-max"' + (max && envoi.saisie.some((x) => Number(x[0]) > max || Number(x[1]) > max) ? '' : ' hidden') + '>'
      + (max ? 'Le score maximum d’un set est ' + max + ' points.' : '') + '</p>';
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
    // Pointage à l'arrivée : l'équipe (ou un adversaire) pas encore pointée bloque ses matchs.
    const pointage = BT.pointageActif(t);
    const absente = pointage && !e.arrivee && !e.abandon;
    const bloquesMoi = BT.matchsEnAttenteArrivee(t).filter((m) => m.a === e.id || m.b === e.id);
    // Adversaires pas encore arrivés, dans l'ordre des équipes : « ton adversaire suivant, X, n'est pas encore arrivé ».
    const attendus = new Set(bloquesMoi.map(adversaire).filter((x) => !BT.estArrivee(t, x)));
    const nomsAttendus = t.equipes.filter((x) => attendus.has(x.id)).map((x) => nom(x.id));
    const phraseAttente = nomsAttendus.length > 1
      ? 'tes adversaires suivants ne sont pas encore arrivés : ' + listeEt(nomsAttendus) + '.'
      : 'ton adversaire suivant, ' + (nomsAttendus[0] || '') + ', n’est pas encore arrivé.';
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
    // Préavis : le match de l'équipe est le prochain appelé.
    const suivantAppele = matchSuivantAppele();
    if (suivantAppele) {
      h += '<div class="annonce-equipe annonce-equipe--preavis">Prépare-toi, ton match est le prochain appelé'
        + '<small>Contre ' + nom(adversaire(suivantAppele)) + '. Le numéro du terrain s’affiche dès l’appel.</small></div>';
    }
    // Forfait : l'équipe doit aller voir l'organisation (abandon, ou son dernier match perdu par forfait,
    // tant qu'elle n'est pas de nouveau sur un terrain).
    const dernierFini = mes.filter((m) => m.statut === 'termine').sort((x, y) => (y.fin || 0) - (x.fin || 0))[0];
    if (e.abandon) {
      h += '<div class="annonce-equipe annonce-equipe--forfait">Ton équipe est forfait pour la suite du tournoi. Va voir l’organisation.</div>';
    } else if (dernierFini && dernierFini.forfait === e.id && !enCours) {
      const num = BT.numero(t, dernierFini);
      h += '<div class="annonce-equipe annonce-equipe--forfait">Ton équipe a été déclarée forfait pour le match ' + (num ? 'n° ' + num + ' ' : '')
        + 'contre ' + nom(adversaire(dernierFini)) + '. Va voir l’organisation.</div>';
    }
    h += '<section class="entete-equipe' + (photosActives() ? ' entete-equipe--photo' : '') + '">' + blocPhotoEquipe(e)
      + '<div class="entete-texte"><h1>' + esc(e.nom) + '</h1>'
      + (e.joueurs ? '<p class="joueurs">' + esc(e.joueurs) + '</p>' : '')
      + (e.abandon ? '<p class="joueurs">L’équipe a abandonné, ses matchs restants sont perdus par forfait.</p>' : '')
      + (parcours ? '<p class="statut-finale">' + esc(parcours) + '</p>' : '')
      + '<div class="bilan">'
      + (pouleMoi != null ? '<span>' + BT.nomPoule(pouleMoi) + '</span>' : '')
      + (moi && moi.J ? '<span>' + rangTexte(moi.rang) + ' sur ' + lignes.length + '</span>' : '')
      + '<span>' + pluriel(moi ? moi.V : 0, 'victoire') + '</span>'
      + (nuls && moi && moi.N ? '<span>' + pluriel(moi.N, 'nul') + '</span>' : '')
      + '<span>' + pluriel(moi ? moi.D : 0, 'défaite') + '</span>'
      + '</div></div>' + choixPhotoHtml(e) + '</section>';
    if (absente && st !== 'termine') h += blocPointage(e);
    else if (pointage && e.arrivee && !e.abandon && st !== 'termine' && Date.now() - e.arrivee < 5 * 60000) {
      h += '<p class="pointage-ok">Ton équipe est pointée, arrivée à ' + BT.heure(e.arrivee) + '.</p>';
    }

    // L'équipe peut-elle encore jouer des matchs pas encore créés (phase finale) ?
    const finalePrevue = BT.finaleAttendue(t);
    let suiteFinale = '';
    if (finalePrevue && !e.abandon) {
      if (t.finale) {
        const ligne = (BT.classementFinal(t) || []).find((l) => l.equipe.id === e.id);
        if (t.finale.places.includes(e.id) && ligne && ligne.etape === 'Encore en lice') suiteFinale = 'tour';
      } else if (BT.phasePoulesFinie(t)) {
        if (BT.qualifies(t).some((x) => x.equipe.id === e.id)) suiteFinale = 'qualifiee';
      } else {
        suiteFinale = 'poules';
      }
    }

    // Bandeau « dans la salle » : match en cours le plus récent et numéro du prochain match de l'équipe.
    const appelesEnCours = t.matchs.filter((m) => m.statut === 'en_cours').map((m) => Number(BT.numero(t, m)) || 0);
    const actuel = appelesEnCours.length ? Math.max(...appelesEnCours) : 0;
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
        const derniereEtape = enCours.phase === 'finale' && (enCours.petite || enCours.tour === BT.nbTours(t) - 1);
        if (bloquesMoi.length) ecart = 'Ensuite, ' + phraseAttente;
        else if (enCours.phase === 'finale' && !derniereEtape) ecart = 'En cas de victoire, ton équipe joue le tour suivant.';
        else if (suiteFinale === 'poules') ecart = BT.avecPoules(t) ? 'C’est ton dernier match de poule.' : 'C’est ton dernier match de championnat.';
        else ecart = 'C’est ton dernier match.';
      } else if (absente) {
        ecart = 'Tes matchs commencent une fois ton équipe pointée.';
      } else if (bloquesMoi.length) {
        ecart = phraseAttente.charAt(0).toUpperCase() + phraseAttente.slice(1);
      }
      h += '<section class="salle">'
        + '<div class="salle-bloc"><span class="salle-label">' + (actuel ? 'En cours dans la salle' : BT.numeroActuel(t) ? 'Dernier match appelé' : 'Pas encore commencé') + '</span>'
        + '<span class="salle-num">' + (actuel ? 'n° ' + actuel : BT.numeroActuel(t) ? 'n° ' + BT.numeroActuel(t) : 'Bientôt') + '</span></div>'
        + '<div class="salle-bloc salle-bloc--moi"><span class="salle-label">' + (enCours ? 'Ton match' : 'Ton prochain match') + '</span>'
        + '<span class="salle-num">' + (enCours ? 'n° ' + BT.numero(t, enCours) : numProchain ? 'n° ' + numProchain : absente || bloquesMoi.length ? 'En attente' : suiteFinale ? 'À venir' : 'Aucun') + '</span>'
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
    if (!enCours && !prochain && !absente) {
      if (bloquesMoi.length) {
        const m = bloquesMoi[0];
        h += '<section class="prochain"><div class="prochain-titre">Ton prochain match' + categorie(m) + '</div>'
          + '<div class="prochain-adversaire">contre ' + nom(adversaire(m)) + '</div>'
          + '<p style="margin:0">Ton adversaire n’est pas encore arrivé. Le match sera appelé dès qu’il sera pointé.</p>'
          + blocAlerte()
          + '</section>';
      } else if (mes.length && suiteFinale) {
        h += '<section class="prochain"><div class="prochain-titre">Tes matchs</div>'
          + '<div class="prochain-adversaire">' + (suiteFinale === 'tour' ? 'Qualifiée pour le tour suivant' : suiteFinale === 'qualifiee' ? 'Qualifiée pour la phase finale' : 'Matchs de poule joués') + '</div>'
          + '<p style="margin:0">' + (suiteFinale === 'tour' ? 'Ton adversaire sera connu à la fin de l’autre match. Reste dans la salle.'
            : suiteFinale === 'qualifiee' ? 'La phase finale commence bientôt. Reste dans la salle.'
              : 'Les qualifiés pour la phase finale seront connus à la fin de tous les matchs ' + (BT.avecPoules(t) ? 'de poule' : 'du championnat') + '.') + '</p>'
          + blocAlerte()
          + '</section>';
      } else if (mes.length) {
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

    const autresBloques = absente || prochain || enCours ? bloquesMoi : bloquesMoi.slice(1);
    if (aJouer.length > 1 || autresBloques.length) {
      h += '<h2>' + (absente ? 'Tes matchs à jouer' : aJouer.length > 1 ? 'Ensuite, dans l’ordre prévu' : 'Ensuite') + '</h2><ol class="liste-matchs">'
        + aJouer.slice(1).map((m) => {
          const vers = heurePrevue(m);
          const avant = ordre.indexOf(m);
          return '<li class="match"><span class="match-num" title="Match ' + BT.numero(t, m) + '">' + BT.numero(t, m) + '</span>'
            + '<span class="match-equipes">' + etiquette(m) + 'contre ' + nom(adversaire(m)) + '</span>'
            + '<span class="match-etat"><span class="etiquette">' + (vers ? 'Vers ' + vers : 'Dans ' + pluriel(avant, 'match')) + '</span></span></li>';
        }).join('')
        + autresBloques.map((m) => '<li class="match"><span class="match-num"></span>'
          + '<span class="match-equipes">' + etiquette(m) + 'contre ' + nom(adversaire(m)) + '</span>'
          + '<span class="match-etat"><span class="etiquette etiquette--arrivee">' + (absente ? 'Après ton arrivée' : 'Attend ' + nom(adversaire(m))) + '</span></span></li>').join('')
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
      h += '<div class="titre-actions"><h2>Classement' + (pouleMoi != null ? ' de la ' + BT.nomPoule(pouleMoi).replace(/^Poule/, 'poule') : '') + '</h2>'
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
      + '<p class="note">' + esc(BT.texteFormat(t.reglages)) + '. Mis à jour à ' + BT.heure(t.maj) + '.</p>'
      + lienOrganisateur();
    contenu.innerHTML = h;
  }

  /* ---------- Pointage à l'arrivée ---------- */

  const cleArrivee = (equipe) => 'badminton:arrivee:' + id + ':' + equipe;

  function blocPointage(e) {
    let signalee = 0;
    try { signalee = Number(localStorage.getItem(cleArrivee(e.id))) || 0; } catch (err) { /* stockage indisponible */ }
    const envoiEnCours = arriveeEnvoi && arriveeEnvoi.equipe === e.id ? arriveeEnvoi : null;
    let h = '<section class="pointage-tel"><h2>Ton équipe n’est pas encore pointée</h2>';
    if (envoiEnCours && envoiEnCours.etat === 'envoi') {
      h += '<p>Envoi de ton arrivée…</p>';
    } else if (signalee && Date.now() - signalee < 3 * 60000) {
      h += '<p>Arrivée signalée à ' + BT.heure(signalee) + '. La table de marque la reçoit dans un instant, tes matchs seront ensuite appelés.</p>';
    } else {
      h += '<p>Tes matchs ne sont appelés qu’une fois ton équipe arrivée. Dans la salle, touche le bouton ou passe à la table de marque.</p>'
        + '<button type="button" class="bouton accent grand" data-action="arrivee">On est arrivés</button>';
      if (envoiEnCours && envoiEnCours.etat === 'erreur') h += '<p class="erreur-champ">' + esc(envoiEnCours.message) + '</p>';
    }
    return h + '</section>';
  }

  async function signalerArrivee() {
    if (!equipeId || (arriveeEnvoi && arriveeEnvoi.etat === 'envoi')) return;
    const equipe = equipeId;
    arriveeEnvoi = { equipe, etat: 'envoi' };
    rendre();
    try {
      await D.signalerArrivee(id, equipe);
      try { localStorage.setItem(cleArrivee(equipe), String(Date.now())); } catch (err) { /* stockage indisponible */ }
      arriveeEnvoi = null;
    } catch (err) {
      const refus = /permission/i.test(String((err && (err.code || err.message)) || ''));
      arriveeEnvoi = {
        equipe,
        etat: 'erreur',
        message: refus
          ? 'Le pointage par téléphone n’est pas encore possible pour ce tournoi. Passe à la table de marque.'
          : 'L’envoi n’a pas abouti. Vérifie ta connexion et réessaie, ou passe à la table de marque.',
      };
    }
    rendre();
  }

  /* ---------- Classement en direct ---------- */

  function tableClassement(lignes, qualifiees) {
    const nuls = BT.nulsPossibles(t);
    return '<div class="tableau-conteneur"><table class="tableau"><thead><tr>'
      + '<th>Rang</th><th class="equipe">Équipe</th><th><abbr title="Matchs joués">J</abbr></th><th><abbr title="Victoires">V</abbr></th>'
      + (nuls ? '<th><abbr title="Matchs nuls">N</abbr></th>' : '')
      + '<th><abbr title="Défaites">D</abbr></th><th><abbr title="Différence de points">Pts</abbr></th></tr></thead><tbody>'
      + lignes.map((l) => '<tr class="' + (l.equipe.id === equipeId ? 'moi' : '') + (qualifiees.has(l.equipe.id) ? ' qualifie' : '') + '"><td class="rang">' + l.rang + '</td>'
        + '<td class="equipe">' + esc(l.equipe.nom) + (qualifiees.has(l.equipe.id) ? ' <span class="etiquette etiquette--qualifie">Q</span>' : '') + '</td>'
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
    // « Q » d'après les équipes vraiment qualifiées : une équipe qui a abandonné ne l'est pas.
    const qualifiees = new Set(BT.nbQualifies(t) >= 2 ? BT.qualifies(t).map((x) => x.equipe.id) : []);
    if (BT.avecPoules(t)) {
      BT.listePoules(t).forEach((p) => { h += '<h2>' + p.nom + '</h2>' + tableClassement(BT.classement(t, p.numero), qualifiees); });
    } else if (!final || t.finale) {
      h += (t.finale ? '<h2>Championnat</h2>' : '') + tableClassement(BT.classement(t), qualifiees);
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
      if (s.minutes) lignes.push(['Temps de jeu', pluriel(s.minutes, 'minute') + (s.plusLong ? ', plus long match ' + s.plusLong.duree + ' min' : '')]);
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
      const canvas = await BT.dessinerRecap(t, equipeId, equipeId ? photoDe(equipeId) : '');
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

  /* ---------- Photos ---------- */

  // Photo de l'équipe en tête de sa page : ajout tant qu'il n'y en a pas, changement ou retrait
  // par le téléphone qui l'a mise ou par un organisateur.
  function peutChangerPhoto(e) {
    const p = photosEquipes[e.id];
    return !p || D.estOrganisateur(id) || (monUid && p.uid === monUid);
  }

  function blocPhotoEquipe(e) {
    if (!photosActives()) return '';
    const src = photoDe(e.id);
    const initiales = e.nom.split(/\s+/).filter(Boolean).slice(0, 2).map((x) => x[0]).join('').toUpperCase();
    return '<div class="photo-equipe">'
      + (src ? '<img class="avatar-equipe" src="' + esc(src) + '" alt="Photo de l’équipe">' : '<span class="avatar-equipe avatar-vide" aria-hidden="true">' + esc(initiales) + '</span>')
      + (peutChangerPhoto(e)
        ? '<button type="button" class="photo-equipe-bouton" data-action="photo-equipe-choix" aria-expanded="' + choixPhotoEquipe + '">' + (src ? 'Changer la photo' : 'Ajouter une photo') + '</button>'
        : '')
      + '</div>';
  }

  // Choix pour la photo de l'équipe : la prendre sur le moment, la choisir dans la galerie, ou la retirer.
  function choixPhotoHtml(e) {
    if (!choixPhotoEquipe || !photosActives() || !peutChangerPhoto(e)) return '';
    const src = photoDe(e.id);
    return '<div class="photo-equipe-choix">'
      + (appareilPhoto ? '<label class="bouton petit principal" for="photo-equipe-camera">Prendre une photo</label>' : '')
      + '<label class="bouton petit' + (appareilPhoto ? '' : ' principal') + '" for="photo-equipe">' + (appareilPhoto ? 'Depuis la galerie' : 'Choisir une photo') + '</label>'
      + (src ? '<button type="button" class="bouton petit" data-action="photo-equipe-retirer">Retirer la photo</button>' : '')
      + '<button type="button" class="bouton petit discret" data-action="photo-equipe-choix">Annuler</button></div>';
  }

  async function poserPhotoEquipe(fichier) {
    if (!fichier || !equipeId) return;
    try {
      const image = await BT.Photos.preparerPhotoEquipe(fichier);
      // Identifiant connu avant l'envoi : la page redessinée propose tout de suite Changer et Retirer.
      monUid = await D.monIdentifiant(true);
      await D.poserPhotoEquipe(id, equipeId, image);
    } catch (err) {
      alert(BT.Photos.messageErreur(err));
    }
  }

  function suivreAlbum() {
    if (suiviAlbum) return;
    suiviAlbum = D.suivreMiniatures(id, (liste) => {
      const avant = miniatures;
      miniatures = liste;
      if (!t) return; // tournoi supprimé : la page affiche déjà « introuvable »
      if (vue === 'photos') vuePhotos();
      if (!ouverte || !visionneuse.open) return;
      // La visionneuse suit la photo, pas sa place : une photo qui arrive ne la fait pas changer.
      if (liste.some((p) => p.id === ouverte)) {
        majVisionneuse();
        return;
      }
      // Photo retirée pendant qu'elle était ouverte : la suivante prend sa place, et « Retirer »
      // attend un instant pour ne pas retirer celle-ci par erreur.
      const ancienne = avant ? avant.findIndex((p) => p.id === ouverte) : -1;
      const suivante = liste[Math.min(Math.max(ancienne, 0), liste.length - 1)];
      const retirer = document.getElementById('vis-supprimer');
      retirer.disabled = true;
      setTimeout(() => { retirer.disabled = false; }, 1500);
      if (suivante) ouvrirPhoto(suivante.id);
      else fermerPhoto();
    });
  }

  function photosRestantes() {
    const max = Number(t.reglages.photosMax) || 0;
    if (!max) return Infinity;
    const miennes = miniatures && monUid ? miniatures.filter((p) => p.uid === monUid).length : 0;
    return Math.max(0, max - miennes);
  }

  function vuePhotos() {
    suivreAlbum();
    const admin = D.estOrganisateur(id);
    const max = Number(t.reglages.photosMax) || 0;
    const reste = photosRestantes();
    let h = '<section class="album"><div class="album-tete"><h2>Photos du tournoi</h2>'
      + (miniatures ? '<span class="album-compte">' + pluriel(miniatures.length, 'photo') + '</span>' : '') + '</div>';
    if (envoiPhotos) {
      h += '<p class="album-envoi">Envoi de la photo ' + Math.min(envoiPhotos.total, envoiPhotos.faits + envoiPhotos.erreurs + 1) + ' sur ' + envoiPhotos.total + '…</p>';
    } else if (reste > 0) {
      h += '<div class="album-ajouts">'
        + (appareilPhoto ? '<label class="bouton principal grand" for="prendre-photo">Prendre une photo</label>' : '')
        + '<label class="bouton grand' + (appareilPhoto ? '' : ' principal') + '" for="ajout-photos">' + (appareilPhoto ? 'Depuis la galerie' : 'Ajouter des photos') + '</label>'
        + '</div>';
      if (max) h += '<p class="note album-reste">Encore ' + reste + ' photo' + (reste > 1 ? 's' : '') + ' possible' + (reste > 1 ? 's' : '') + ' pour toi, ' + max + ' au plus par personne.</p>';
    } else {
      h += '<p class="album-envoi">Tu as ajouté tes ' + max + ' photos, le maximum par personne.</p>';
    }
    if (messageAlbum) h += '<p class="album-message">' + esc(messageAlbum) + '</p>';
    h += '<p class="note">Tout le monde voit les photos de l’album, elles passent aussi sur l’écran de la salle. '
      + (admin ? 'Tu es organisateur : tu peux retirer n’importe quelle photo en l’ouvrant.' : 'Tu peux retirer celles que tu as ajoutées en les ouvrant.') + '</p>';
    if (!miniatures) {
      h += '<p class="note">Chargement des photos…</p>';
    } else if (!miniatures.length) {
      h += '<div class="album-vide">Pas encore de photo. Ajoute la première.</div>';
    } else {
      h += '<div class="album-grille" id="album-grille"></div>';
    }
    h += '</section>';
    contenu.innerHTML = h;
    contenu.dataset.album = String(max);
    // Les vignettes déjà affichées sont reprises telles quelles : seules les nouvelles se chargent.
    if (miniatures) {
      const grille = document.getElementById('album-grille');
      if (grille) grille.append(...miniatures.map(vignette).filter(Boolean));
      const ids = new Set(miniatures.map((p) => p.id));
      Array.from(vignettes.keys()).forEach((k) => { if (!ids.has(k)) vignettes.delete(k); });
    }
  }

  function vignette(p, i) {
    let bouton = vignettes.get(p.id);
    if (!bouton) {
      const src = BT.Photos.imageSure(p.image);
      if (!src) return null;
      bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.className = 'vignette';
      bouton.dataset.photo = p.id;
      const img = document.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.src = src;
      bouton.appendChild(img);
      vignettes.set(p.id, bouton);
    }
    const legende = legendePhoto(p);
    bouton.setAttribute('aria-label', 'Ouvrir la photo ' + (miniatures.length - i) + (legende ? ', ' + legende : ''));
    return bouton;
  }

  async function ajouterPhotos(fichiers) {
    let liste = Array.from(fichiers || []);
    const reste = photosRestantes();
    const enTrop = Number.isFinite(reste) && liste.length > reste;
    liste = liste.slice(0, Math.min(Number.isFinite(reste) ? reste : 20, 20));
    if (!liste.length) return;
    envoiPhotos = { total: liste.length, faits: 0, erreurs: 0, message: '' };
    messageAlbum = '';
    if (vue === 'photos') vuePhotos();
    for (const f of liste) {
      try {
        const p = await BT.Photos.preparerPhoto(f);
        if (!monUid) monUid = await D.monIdentifiant(true);
        await D.ajouterPhoto(id, Object.assign(p, { equipe: equipeId || '' }));
        envoiPhotos.faits++;
      } catch (err) {
        envoiPhotos.erreurs++;
        envoiPhotos.message = BT.Photos.messageErreur(err);
      }
      if (vue === 'photos') vuePhotos();
    }
    const fin = envoiPhotos;
    envoiPhotos = null;
    messageAlbum = (fin.faits ? fin.faits + (fin.faits > 1 ? ' photos ajoutées.' : ' photo ajoutée.') : '')
      + (enTrop ? ' Les autres dépassaient le maximum par personne.' : '')
      + (fin.erreurs ? ' ' + fin.message : '');
    if (vue === 'photos') vuePhotos();
  }

  // Visionneuse : la vignette s'affiche tout de suite, la grande photo arrive ensuite.
  const visionneuse = document.getElementById('visionneuse');
  function legendePhoto(p) {
    return [p.equipe && t.equipes.some((e) => e.id === p.equipe) ? BT.nomEquipe(t, p.equipe) : '', p.date ? BT.heure(p.date) : ''].filter(Boolean).join(' · ');
  }
  const indexOuverte = () => (miniatures && ouverte ? miniatures.findIndex((p) => p.id === ouverte) : -1);

  async function ouvrirPhoto(photoId) {
    const p = miniatures && miniatures.find((x) => x.id === photoId);
    if (!p) { fermerPhoto(); return; }
    if (ouverte === p.id && visionneuse.open) { majVisionneuse(); return; }
    ouverte = p.id;
    const img = document.getElementById('vis-img');
    const lien = document.getElementById('vis-telecharger');
    img.src = grandes.get(p.id) || BT.Photos.imageSure(p.image);
    lien.hidden = true;
    majVisionneuse();
    if (!visionneuse.open) visionneuse.showModal();
    try {
      let grande = grandes.get(p.id);
      if (!grande) {
        grande = BT.Photos.imageSure(await D.lirePhoto(id, p.id));
        if (grande) {
          grandes.set(p.id, grande);
          if (grandes.size > 8) grandes.delete(grandes.keys().next().value);
        }
      }
      if (ouverte === p.id && grande) {
        img.src = grande;
        lien.href = grande;
        lien.download = 'photo-' + (t.nom || 'tournoi').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + (miniatures.length - indexOuverte()) + '.jpg';
        lien.hidden = false;
      }
    } catch (err) { /* la vignette reste affichée */ }
  }
  // Légende, numéro et boutons de la photo ouverte (l'album peut changer pendant qu'elle est affichée).
  function majVisionneuse() {
    const i = indexOuverte();
    if (i < 0) return;
    const p = miniatures[i];
    const numero = miniatures.length - i; // dans l'ordre d'arrivée
    document.getElementById('vis-img').alt = 'Photo ' + numero + ' sur ' + miniatures.length;
    document.getElementById('vis-legende').textContent = legendePhoto(p) || 'Photo ' + numero;
    document.getElementById('vis-supprimer').hidden = !(D.estOrganisateur(id) || (monUid && p.uid === monUid));
    document.getElementById('vis-prec').disabled = i <= 0;
    document.getElementById('vis-suiv').disabled = i >= miniatures.length - 1;
  }
  function voisine(sens) {
    const i = indexOuverte();
    if (i >= 0 && miniatures[i + sens]) ouvrirPhoto(miniatures[i + sens].id);
  }
  function fermerPhoto() {
    ouverte = null;
    if (visionneuse.open) visionneuse.close();
  }
  document.getElementById('vis-fermer').addEventListener('click', fermerPhoto);
  document.getElementById('vis-prec').addEventListener('click', () => voisine(-1));
  document.getElementById('vis-suiv').addEventListener('click', () => voisine(1));
  visionneuse.addEventListener('close', () => { ouverte = null; });
  visionneuse.addEventListener('click', (e) => { if (e.target === visionneuse) fermerPhoto(); });
  // Flèches du clavier (écoutées sur toute la page : un bouton désactivé perd le focus).
  document.addEventListener('keydown', (e) => {
    if (!visionneuse.open) return;
    if (e.key === 'ArrowLeft') voisine(-1);
    if (e.key === 'ArrowRight') voisine(1);
  });
  // Glisser le doigt vers la gauche ou la droite pour changer de photo.
  let departGlisse = null;
  document.getElementById('vis-zone').addEventListener('touchstart', (e) => { departGlisse = e.touches[0].clientX; }, { passive: true });
  document.getElementById('vis-zone').addEventListener('touchend', (e) => {
    if (departGlisse === null) return;
    const dx = e.changedTouches[0].clientX - departGlisse;
    departGlisse = null;
    if (dx > 50) voisine(-1);
    if (dx < -50) voisine(1);
  });
  // Après un retrait, la photo suivante s'affiche (pratique pour trier l'album).
  document.getElementById('vis-supprimer').addEventListener('click', async () => {
    const i = indexOuverte();
    const p = i >= 0 ? miniatures[i] : null;
    if (!p || !confirm('Retirer cette photo de l’album ? Elle disparaît pour tout le monde.')) return;
    try {
      await D.supprimerPhoto(id, p.id);
    } catch (err) {
      alert(BT.Photos.messageErreur(err));
    }
  });

  /* ---------- Règles du tournoi ---------- */

  function vueRegles() {
    contenu.dataset.regles = BT.empreinteRegles(t);
    contenu.innerHTML = '<section class="regles">'
      + '<h2 style="margin-top:4px">Règles du tournoi</h2>'
      + (reglesChangees ? '<p class="encadre">Les règles ont changé depuis ta dernière visite.</p>' : '')
      + BT.reglesHtml(t)
      + '<div class="actions" style="margin-top:18px"><button type="button" class="bouton principal grand" data-action="regles-lues">'
      + (equipeId ? 'C’est noté, voir mon équipe' : 'C’est noté, choisir mon équipe') + '</button></div>'
      + '</section>';
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
    document.getElementById('onglet-photos').hidden = !photosActives();
    if (vue === 'photos' && !photosActives()) vue = 'equipe';
    nav.querySelectorAll('button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.vue === vue)));
  }

  function changerVue(nouvelle) {
    vue = nouvelle;
    history.replaceState(null, '', location.pathname + location.search + (vue === 'equipe' ? '' : '#' + vue));
    window.scrollTo(0, 0);
    rendre(true);
  }

  function rendre(force) {
    // Tournoi supprimé ou photos coupées : la visionneuse se ferme.
    if (visionneuse.open && (!t || !photosActives())) fermerPhoto();
    if (!t) { introuvable(); return; }
    document.getElementById('titre').textContent = t.nom;
    document.title = t.nom + ' · Mon équipe';
    if (equipeId && !t.equipes.some((e) => e.id === equipeId)) equipeId = null;
    document.getElementById('bouton-regles').hidden = !t.matchs.length;
    // À l'ouverture : les règles d'abord si ce téléphone ne les a pas encore lues.
    if (reglesAuto && t.matchs.length) {
      reglesAuto = false;
      const lues = reglesLues();
      if (lues !== BT.empreinteRegles(t)) {
        reglesChangees = !!lues;
        vue = 'regles';
      }
    }
    if (vue === 'regles' && !t.matchs.length) vue = 'equipe';
    afficherOnglets();
    if (vue === 'regles') {
      if (force || contenu.dataset.regles !== BT.empreinteRegles(t) || !contenu.querySelector('.regles')) vueRegles();
      return;
    }
    delete contenu.dataset.regles;
    if (vue === 'classement') { vueClassement(); return; }
    if (vue === 'photos') {
      // L'album se redessine quand ses photos ou le maximum par personne changent, pas à chaque résultat.
      if (force || !contenu.querySelector('.album') || contenu.dataset.album !== String(Number(t.reglages.photosMax) || 0)) vuePhotos();
      return;
    }
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

  document.getElementById('bouton-regles').addEventListener('click', () => {
    reglesChangees = false;
    changerVue('regles');
  });

  document.getElementById('onglets-tel').addEventListener('click', (e) => {
    const b = e.target.closest('[data-vue]');
    if (b) changerVue(b.dataset.vue);
  });

  // Champs vidés après chaque choix : la même photo peut être choisie à nouveau.
  ['ajout-photos', 'prendre-photo'].forEach((idChamp) => document.getElementById(idChamp).addEventListener('change', (e) => {
    const fichiers = Array.from(e.target.files || []);
    e.target.value = '';
    ajouterPhotos(fichiers);
  }));
  ['photo-equipe', 'photo-equipe-camera'].forEach((idChamp) => document.getElementById(idChamp).addEventListener('change', (e) => {
    const fichier = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!fichier) return;
    choixPhotoEquipe = false;
    rendre();
    poserPhotoEquipe(fichier);
  }));

  contenu.addEventListener('click', (e) => {
    const vignette = e.target.closest('[data-photo]');
    if (vignette) { ouvrirPhoto(vignette.dataset.photo); return; }
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
        garderEcranAllume();
        setTimeout(() => { BT.bip(); rendre(); }, 150);
        break;
      case 'alerte-off':
        choisirAlerte(false);
        libererEcran();
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
      case 'photo-equipe-choix':
        choixPhotoEquipe = !choixPhotoEquipe;
        rendre();
        break;
      case 'photo-equipe-retirer':
        if (confirm('Retirer la photo de l’équipe ?')) {
          choixPhotoEquipe = false;
          D.retirerPhotoEquipe(id, equipeId).catch((err) => alert(BT.Photos.messageErreur(err)));
          rendre();
        }
        break;
      case 'arrivee':
        signalerArrivee();
        break;
      case 'regles-lues':
        marquerReglesLues();
        reglesChangees = false;
        changerVue('equipe');
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
    // 2 chiffres au plus ; au-delà du score maximum du set, la case passe en rouge.
    const propre = BT.chiffresScore(champ.value);
    if (propre !== champ.value) champ.value = propre;
    const max = Number(champ.dataset.max) || 0;
    champ.toggleAttribute('data-trop', !!max && Number(propre) > max);
    const aideMax = contenu.querySelector('#envoi-max');
    if (aideMax) aideMax.hidden = !contenu.querySelector('#form-envoi input[data-trop]');
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
    // Deux chiffres tapés : on passe à la case suivante.
    if (propre.length === 2 && e.inputType && e.inputType.indexOf('insert') === 0) {
      const cases = Array.from(contenu.querySelectorAll('#form-envoi input[data-set]'));
      const suivante = cases[cases.indexOf(champ) + 1];
      if (suivante) { suivante.focus(); suivante.select(); }
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

  let arreterSuivi = null;
  function suivreTournoi() {
    if (arreterSuivi) arreterSuivi();
    arreterSuivi = D.suivre(id, (nouveau, info) => {
      if (!nouveau && info && info.erreur) {
        if (t) return;
        erreurConnexion = true;
        introuvable();
        setTimeout(suivreTournoi, 15000);
        return;
      }
      erreurConnexion = false;
      t = nouveau;
      charge = true;
      if (t && photosActives() && !suiviPhotosEquipes) {
        suiviPhotosEquipes = D.suivrePhotosEquipes(id, (x) => {
          photosEquipes = x || {};
          if (vue === 'equipe') rendreEnDirect();
        });
        // Téléphone qui a déjà envoyé des photos : ses boutons Changer et Retirer, son nombre de photos restantes.
        D.monIdentifiant().then((u) => {
          if (!u || monUid) return;
          monUid = u;
          if (vue === 'equipe') rendreEnDirect();
          if (vue === 'photos') vuePhotos();
        }).catch(() => {});
      }
      verifierAppel();
      rendreEnDirect();
    });
  }
  suivreTournoi();
  D.suivrePropositions(id, (p) => {
    propositions = p || {};
    if (t) rendreEnDirect();
  });
  contenu.addEventListener('focusout', () => {
    setTimeout(() => {
      if (renduDiffere && !saisieEnCours()) { renduDiffere = false; rendre(); }
    }, 0);
  });
  D.economiserConnexion();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) garderEcranAllume(); });
  introuvable();
})();
