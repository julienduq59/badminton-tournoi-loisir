/* Page de gestion d'un tournoi (organisateurs). */
(function () {
  'use strict';
  const { esc } = BT;
  const D = BT.Donnees;
  const $ = (s, racine) => (racine || document).querySelector(s);
  const ONGLETS = ['direct', 'matchs', 'classement', 'reglages', 'regles', 'partager'];

  $('#icone').outerHTML = BT.ICONE;

  const id = BT.idDansAdresse();
  let t = null;
  let propositions = {};
  let onglet = null;
  let filtre = 'tous';
  let filtreEquipe = '';
  let brouillon = null;
  let brouillonModifie = false; // saisie des réglages pas encore enregistrée
  const enTraitement = new Set();
  let arriveesRecues = {};          // arrivées signalées par les téléphones, pas encore reportées
  const arriveesEnCours = new Set();
  let pointeesOuvert = false;       // liste des équipes pointées dépliée
  // Son à la table de marque : un bip à chaque score envoyé par un téléphone et à chaque équipe
  // pointée depuis son téléphone (le navigateur demande un clic pour réactiver le son après un rechargement).
  const CLE_SON_ORGA = 'badminton:son-orga';
  function sonOrgaVoulu() {
    try { return localStorage.getItem(CLE_SON_ORGA) === 'oui'; } catch (e) { return false; }
  }
  function bipOrga() {
    if (sonOrgaVoulu() && BT.sonActif()) BT.bip();
  }
  let clesPropositions = null; // envois de score déjà vus, pour sonner seulement aux nouveaux

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
  function texteChrono(debut, limite) {
    const ecoule = Math.max(0, Math.floor((Date.now() - debut) / 60000));
    if (limite > 0) {
      const reste = limite - ecoule;
      return reste > 0 ? { texte: pluriel(reste, 'minute restante', 'minutes restantes'), alerte: reste <= 2 } : { texte: 'Temps écoulé', alerte: true };
    }
    return { texte: ecoule < 1 ? 'à l\u2019instant' : 'depuis ' + ecoule + ' min', alerte: false };
  }

  // limite : durée maximum du match (la phase finale peut ne pas en avoir).
  function chronoHtml(debut, limite) {
    const c = texteChrono(debut, limite);
    return '<span class="chrono' + (c.alerte ? ' chrono--alerte' : '') + '" data-debut="' + debut + '" data-limite="' + (limite || 0) + '">' + c.texte + '</span>';
  }

  function majChronos() {
    if (!t) return;
    document.querySelectorAll('.chrono[data-debut]').forEach((el) => {
      const c = texteChrono(Number(el.dataset.debut), Number(el.dataset.limite) || 0);
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
  // Feuille de matchs à imprimer (secours papier) : tous les matchs dans l'ordre des numéros.
  function imprimerFeuille() {
    const reg = t.reglages;
    const num = (m) => Number(BT.numero(t, m)) || Infinity; // pas de numéro : équipe pas encore arrivée
    const lignes = t.matchs.slice().sort((x, y) => num(x) - num(y) || x.ordre - y.ordre);
    const avecTour = lignes.some((m) => BT.etiquetteMatch(t, m));
    const caseScore = (m) => {
      if (m.statut === 'termine') return esc(m.forfait ? 'Forfait ' + BT.nomEquipe(t, m.forfait) : BT.texteScore(m));
      const n = BT.formatMatch(t, m).sets;
      return Array.from({ length: n }, () => '<span class="case-score"></span>-<span class="case-score"></span>').join(' ');
    };
    $('#fiches').innerHTML = '<div class="feuille"><h1>' + esc(t.nom) + ', feuille de matchs</h1>'
      + '<p>' + esc(BT.texteFormat(reg)) + '. Imprimée le ' + new Date().toLocaleDateString('fr-FR') + ' à ' + BT.heure(Date.now()) + '. '
      + 'Les numéros des matchs pas encore appelés sont prévus et peuvent changer un peu.</p>'
      + '<table class="feuille-table"><thead><tr><th>N°</th><th>Catégorie</th>' + (avecTour ? '<th>Poule ou tour</th>' : '') + '<th>Équipe 1</th><th>Équipe 2</th><th>Terrain</th><th>Score</th><th>OK</th></tr></thead><tbody>'
      + lignes.map((m) => '<tr><td>' + BT.numero(t, m) + '</td><td>' + esc(BT.categorieMatch(t, m)) + '</td>' + (avecTour ? '<td>' + esc(BT.etiquetteMatch(t, m)) + '</td>' : '')
        + '<td>' + nom(m.a) + '</td><td>' + nom(m.b) + '</td><td>' + (m.statut !== 'attente' && m.terrain ? m.terrain : '') + '</td>'
        + '<td class="score">' + caseScore(m) + '</td><td>' + (m.statut === 'termine' ? '✓' : '<span class="case-ok"></span>') + '</td></tr>').join('')
      + '</tbody></table></div>';
    $('#fiches').hidden = false;
    document.body.classList.add('impression-fiches');
    window.print();
    document.body.classList.remove('impression-fiches');
    $('#fiches').hidden = true;
  }

  function imprimerFiches() {
    const el = $('#fiches');
    el.innerHTML = '<div class="fiches-grille">' + t.equipes.map((e) => {
      const url = BT.urlPage('equipe.html', { t: t.id, e: e.id });
      return '<div class="fiche"><div class="fiche-tournoi">' + esc(t.nom) + '</div>'
        + '<div class="fiche-nom">' + esc(e.nom) + '</div>'
        + (e.joueurs ? '<div class="fiche-joueurs">' + esc(e.joueurs) + '</div>' : '')
        + '<div class="qr">' + BT.qrSvg(url) + '</div>'
        + '<div class="fiche-texte">' + (BT.pointageActif(t) ? 'À ton arrivée, scanne ce QR code et touche « On est arrivés ». Tu suis ensuite tes matchs, ton terrain et le classement, et tu envoies ton score.'
          : 'Scanne pour voir ton prochain match, ton terrain, envoyer ton score et suivre le classement.') + '</div></div>';
    }).join('') + '</div>';
    el.hidden = false;
    document.body.classList.add('impression-fiches');
    window.print();
    document.body.classList.remove('impression-fiches');
    el.hidden = true;
  }

  // « Double · Poule A · » devant le numéro d'un match.
  function libelles(m) {
    const x = [BT.categorieMatch(t, m), BT.etiquetteMatch(t, m)].filter(Boolean).map(esc).join(' · ');
    return x ? x + ' · ' : '';
  }

  function pastilleCategorie(m) {
    const c = BT.categorieMatch(t, m);
    return c ? '<span class="match-cat match-cat--' + esc(m.categorie) + '">' + esc(c) + '</span>' : '';
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
      if (!m || m.statut !== 'en_cours') return null;
      const liste = propositionsDe(matchId);
      if (!liste.length) return null;
      const accord = liste.every((p) => BT.memesSets(p.sets, liste[0].sets));
      return { m, liste, accord };
    }).filter(Boolean).sort((x, y) => (x.m.terrain || 99) - (y.m.terrain || 99) || BT.numero(t, x.m) - BT.numero(t, y.m));
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
      // Match terminé, reporté ou remis à jouer : le score envoyé ne vaut plus.
      if (!m || m.statut !== 'en_cours') {
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

  /* ---------- Pointage à l'arrivée ---------- */

  // Arrivées signalées depuis les téléphones : reportées dans le tournoi, puis effacées.
  function traiterArrivees() {
    if (!t) return;
    Object.keys(arriveesRecues).forEach((equipeId) => {
      if (arriveesEnCours.has(equipeId)) return;
      arriveesEnCours.add(equipeId);
      const brut = arriveesRecues[equipeId] || {};
      const fini = () => D.retirerArrivee(id, equipeId).catch(() => {}).then(() => arriveesEnCours.delete(equipeId));
      const e = t.equipes.find((x) => x.id === equipeId);
      if (!e || e.arrivee || !BT.pointageActif(t)) { fini(); return; }
      // La table de marque est prévenue de chaque arrivée signalée par un téléphone.
      let pointee = false;
      agir((tt) => { pointee = pointerEquipe(tt, equipeId, Number(brut.date) || Date.now()); return pointee; }).then(() => {
        if (pointee) {
          toast(BT.nomEquipe(t, equipeId) + ' est arrivée, pointée depuis son téléphone.');
          bipOrga();
        }
        fini();
      });
    });
  }

  // Pointe une équipe, puis remplit les terrains libres si l'appel automatique tourne.
  function pointerEquipe(tt, equipeId, quand) {
    if (!BT.pointer(tt, equipeId, quand)) return false;
    BT.apresPointage(tt);
    return true;
  }

  // Carte de la table de marque : équipes à pointer, et celles déjà pointées (avec annulation).
  function cartePointage(st) {
    if (!BT.pointageActif(t) || st === 'termine' || st === 'preparation') return '';
    const equipes = t.equipes.filter((e) => !e.abandon);
    const attendues = BT.equipesAttendues(t);
    const pointees = equipes.filter((e) => e.arrivee).sort((x, y) => x.arrivee - y.arrivee);
    if (!attendues.length && st !== 'pret') return '';
    let h = '<section class="carte carte-pointage"><div class="titre-actions"><h2>Arrivée des équipes</h2>'
      + '<div class="pointage-tete"><span class="pointage-compte">' + pointees.length + ' / ' + equipes.length + ' pointées</span>'
      + (attendues.length >= 2 ? '<button type="button" class="bouton petit" data-action="tout-pointer">Tout pointer</button>' : '')
      + '</div></div>';
    if (attendues.length) {
      h += '<p class="note">Chaque équipe se signale sur son téléphone, sur la page de son équipe, ou tu la pointes ici à son arrivée. Ses matchs ne sont appelés qu’ensuite.</p>'
        + '<ul class="liste-pointage">' + attendues.map((e) => '<li><span class="pointage-nom">' + esc(e.nom)
          + (e.joueurs ? '<small>' + esc(e.joueurs) + '</small>' : '') + '</span>'
          + '<button type="button" class="bouton petit principal" data-action="pointer" data-equipe="' + esc(e.id) + '">Pointer</button></li>').join('')
        + '</ul>';
    } else {
      h += '<p class="note">Toutes les équipes sont pointées.</p>';
    }
    if (pointees.length) {
      h += '<details class="pointees"' + (pointeesOuvert ? ' open' : '') + '><summary>Équipes pointées (' + pointees.length + ')</summary><ul class="liste-pointage">'
        + pointees.map((e) => '<li><span class="pointage-nom">' + esc(e.nom) + '<small>Arrivée à ' + BT.heure(e.arrivee) + '</small></span>'
          + '<button type="button" class="bouton petit discret" data-action="depointer" data-equipe="' + esc(e.id) + '">Annuler</button></li>').join('')
        + '</ul></details>';
    }
    return h + '</section>';
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
      // Une saisie pas encore enregistrée est gardée ; sinon on repart de la dernière version.
      if (!brouillonModifie) brouillon = null;
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
    rendreRegles();
    rendrePartager();
    majPointagesReglages();
    afficherOnglet();
    garderEcranAllume();
    // Fenêtre « Choisir un match » ouverte : ses informations suivent le tournoi.
    if (dialogueMatch && dialogueMatch.open) majChoixMatch();
  }

  function progression() {
    const total = BT.nbMatchsPrevus(t);
    const faits = t.matchs.filter((m) => m.statut === 'termine').length;
    const pct = total ? Math.round((faits / total) * 100) : 0;
    const fin = faits < total ? BT.finEstimee(t) : null;
    const retard = fin ? BT.depassementSalle(t, fin) : null;
    return '<div class="progression"><div class="progression-barre"><span style="width:' + pct + '%"></span></div>'
      + '<span class="progression-texte">' + faits + ' / ' + total + ' matchs joués'
      + (fin ? '<small' + (retard ? ' class="fin-retard"' : '') + '>fin estimée vers ' + BT.heure(fin)
        + (retard ? ', ' + dureeTexte(retard * 60000) + ' après la fin de la salle (' + BT.texteHeure(t.reglages.heureFin) + ')' : '') + '</small>' : '')
      + '</span></div>';
  }

  // 150 minutes → « 2 h 30 », 45 minutes → « 45 min ».
  function dureeTexte(ms) {
    const m = Math.max(1, Math.round(ms / 60000));
    if (m < 60) return m + ' min';
    return Math.floor(m / 60) + ' h' + (m % 60 ? ' ' + String(m % 60).padStart(2, '0') : '');
  }

  // Gagnants contre gagnants : les deux équipes libres que l'organisateur peut faire jouer quand même.
  let paireSuisse = null;
  const texteVictoires = (v) => String(v).replace('.', ',') + ' victoire' + (v > 1 ? 's' : '');
  // « Lancer quand même A contre B », en signalant une revanche (sur deux lignes dans la carte d'un terrain).
  function boutonForcer(terrain, carte) {
    const [a, b] = paireSuisse;
    const revanche = t.matchs.some((m) => m.phase !== 'finale' && ((m.a === a && m.b === b) || (m.a === b && m.b === a)));
    const paire = esc(BT.nomEquipe(t, a)) + ' contre ' + esc(BT.nomEquipe(t, b)) + (revanche ? ' (déjà rencontrées)' : '');
    return carte
      ? '<button type="button" class="bouton bouton--deux-lignes" data-action="forcer-suisse" data-terrain="' + terrain + '">Lancer quand même<small>' + paire + '</small></button>'
      : '<button type="button" class="bouton" data-action="forcer-suisse" data-terrain="' + terrain + '">Lancer quand même ' + paire + '</button>';
  }

  // Solutions pour finir avant la fin de la salle : calculées une fois par état des réglages, car le
  // calcul rejoue le tournoi plusieurs fois.
  let memoSolutions = { cle: null, liste: [] };
  let solutionsAffichees = [];
  function solutionsPour(tt) {
    const cle = JSON.stringify([tt.reglages, tt.equipes.map((e) => e.id), tt.matchs.length]);
    if (memoSolutions.cle !== cle) {
      let liste = [];
      try { liste = BT.solutionsHoraires(tt); } catch (err) { liste = []; }
      memoSolutions = { cle, liste };
    }
    return memoSolutions.liste;
  }

  // Estimation des horaires d'un tournoi pas encore commencé (réglages et carte « Tout est prêt »).
  // dansReglages : les solutions s'affichent avec un bouton pour les appliquer au formulaire.
  function texteHoraires(tt, dansReglages) {
    const r = tt.reglages;
    const D = BT.dureeReglee(r);
    const auto = !(Number(r.dureePrevue) > 0);
    const duree = BT.dureeEstimee(tt, D);
    if (!duree) return '';
    const T = BT.nbTerrainsOuverts(tt);
    const repos = r.reposMin ? ' et ' + r.reposMin + ' min de repos' : '';
    let h = '<p>' + (auto
      ? 'D’après tes réglages, un match dure environ ' + Math.round(D / 60000) + ' min. Sur ' + pluriel(T, 'terrain') + repos
      : 'Avec des matchs de ' + Math.round(D / 60000) + ' min sur ' + pluriel(T, 'terrain') + repos)
      + ', compte environ <strong>' + dureeTexte(duree) + '</strong> de jeu';
    const debut = BT.heureDuJour(r.heureDebut);
    if (debut === null) {
      h += '.</p>';
      if (r.heureFin) h += '<p>Indique l’heure de début pour savoir si le tournoi tient avant la fin de la salle.</p>';
      if (auto) h += '<p class="note">Si tu connais la durée habituelle de vos matchs, indique-la dans « Durée prévue d’un match » pour affiner.</p>';
      return h;
    }
    const fin = debut + duree;
    h += ', de ' + BT.texteHeure(r.heureDebut) + ' à ' + BT.heure(fin) + ' environ.</p>';
    const retard = BT.depassementSalle(tt, fin, debut);
    if (retard) {
      const solutions = solutionsPour(tt);
      h += '<p class="horaires-alerte">Ça dépasse la fin de la salle (' + BT.texteHeure(r.heureFin) + ') de ' + dureeTexte(retard * 60000) + '.'
        + (solutions.length ? '' : ' Pour gagner du temps, baisse le nombre de matchs par équipe ou de points par set, fixe une durée maximum par match, ou ajoute des terrains.') + '</p>';
      if (solutions.length && dansReglages) {
        solutionsAffichees = solutions;
        h += '<p class="solutions-titre">Pour finir au moins 10 minutes avant, ' + (solutions.length > 1 ? 'au choix :' : 'tu peux choisir :') + '</p>'
          + '<ul class="solutions-horaires">' + solutions.map((x, i) => '<li><span>' + esc(x.texte) + ' : fin vers <strong>' + BT.heure(x.fin) + '</strong></span>'
            + '<button type="button" class="bouton petit" data-action="solution" data-index="' + i + '">Appliquer</button></li>').join('') + '</ul>';
      } else if (solutions.length) {
        h += '<p>' + pluriel(solutions.length, 'solution est proposée', 'solutions sont proposées') + ' dans les Réglages pour finir à temps.</p>'
          + '<div class="actions"><button type="button" class="bouton petit" data-action="voir-solutions">Voir les solutions</button></div>';
      }
    } else if (retard === 0) {
      const marge = Math.floor((BT.heureFinSalle(tt, debut) - fin) / 60000);
      h += '<p class="horaires-ok">Ça tient avant la fin de la salle (' + BT.texteHeure(r.heureFin) + ')' + (marge >= 1 ? ', avec ' + dureeTexte(marge * 60000) + ' de marge' : '') + '.</p>';
    }
    if (auto) h += '<p class="note">Si tu connais la durée habituelle de vos matchs, indique-la dans « Durée prévue d’un match » pour affiner.</p>';
    return h;
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

  function carteTerrain(n, m, st, appelPossible, attendArrivee, attendPriorite, seulementReportes) {
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
        + '<div class="terrain-tete"><span>Terrain ' + n + '</span><span class="num-match">' + (BT.estSuisse(t) && m.phase !== 'finale' ? (BT.categorieMatch(t, m) ? esc(BT.categorieMatch(t, m)) + ' · ' : '') : libelles(m)) + 'Match ' + BT.numero(t, m) + '</span></div>'
        + '<div class="court"><div class="court-cote">' + nomComplet(m.a) + '</div><div class="court-filet"></div>'
        + '<div class="court-cote">' + nomComplet(m.b) + '</div></div>'
        + (BT.estSuisse(t) && m.phase !== 'finale' && BT.etiquetteMatch(t, m) ? '<div class="terrain-niveau">' + esc(BT.etiquetteMatch(t, m)) + '</div>' : '')
        + '<div class="terrain-depuis">Commencé à ' + BT.heure(m.debut) + ', ' + chronoHtml(m.debut, BT.formatMatch(t, m).dureeLimite) + '</div>'
        + (BT.terrainFerme(t, n) ? '<div class="terrain-ferme-info">Terrain fermé après ce match</div>' : '')
        + recu
        + '<div class="terrain-pied">' + pied + '</div></article>';
    }
    if (BT.terrainFerme(t, n)) {
      return '<article class="terrain terrain--ferme">'
        + '<div class="terrain-tete"><span>Terrain ' + n + '</span></div>'
        + '<div class="court court--libre"><div class="court-libre-texte">Terrain fermé</div><div class="court-filet"></div></div>'
        + '<div class="terrain-pied"><button type="button" class="bouton" data-action="ouvrir-terrain" data-terrain="' + n + '">Rouvrir le terrain</button></div></article>';
    }
    let texte = 'Terrain libre';
    // Gagnants contre gagnants : pas de match prêt, des équipes attendent encore leurs matchs.
    const suisseEnAttente = BT.estSuisse(t) && !t.finale && !BT.matchsEnAttente(t).length && !BT.suisseFini(t);
    if (st === 'pret') texte = 'En attente du lancement';
    else if (n > t.reglages.terrains) texte = 'Terrain retiré';
    else if (suisseEnAttente) {
      texte = !paireSuisse ? 'Les équipes qui restent jouent encore'
        : Number(t.reglages.ecartSuisse) ? 'Pas d’adversaire assez proche en victoires pour l’instant' : 'Pas d’adversaire au même nombre de victoires pour l’instant';
    }
    else if (!BT.matchsEnAttente(t).length) texte = 'Plus de match à appeler';
    else if (!appelPossible) texte = attendPriorite ? 'En attente du match prioritaire' : attendArrivee ? 'Équipes pas encore arrivées' : 'Les équipes restantes jouent déjà';
    else if (seulementReportes) texte = 'Match reporté : appelle-le quand ses équipes sont prêtes';
    else if (BT.attenteRepos(t) > 0 && BT.appelAutoActif(t)) texte = 'Repos des équipes, appel dans ' + Math.max(1, Math.ceil(BT.attenteRepos(t) / 60000)) + ' min';
    let bouton = st === 'en_cours' && appelPossible && n <= t.reglages.terrains
      ? '<button type="button" class="bouton" data-action="appeler" data-terrain="' + n + '">Appeler le match suivant</button>'
      : '';
    if (!bouton && suisseEnAttente && paireSuisse && st === 'en_cours' && n <= t.reglages.terrains) bouton = boutonForcer(n, true);
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
      + '<span class="match-num" title="Match ' + BT.numero(t, m) + '">' + BT.numero(t, m) + '</span>'
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
        + '<div class="outils-boutons"><button type="button" class="bouton" data-action="choisir-match" id="bouton-choisir-match">Choisir un match</button>'
        + '<button type="button" class="bouton" data-action="pause" id="bouton-pause"></button>'
        + '<button type="button" class="bouton" data-action="son-orga" id="bouton-son-orga" aria-pressed="false"></button>'
        + '<span class="ecran-allume" id="ecran-allume" hidden>Écran gardé allumé</span></div></div>';
    }
    const champ = $('#annonce');
    const texte = t.annonce && t.annonce.texte ? t.annonce.texte : '';
    if (document.activeElement !== champ && champ.dataset.affiche !== texte) {
      champ.value = texte;
      champ.dataset.affiche = texte;
    }
    $('#retirer-annonce').hidden = !texte;
    $('#annonce-actuelle').textContent = texte ? 'Affiché en ce moment : « ' + texte + ' »' : '';
    $('#bouton-choisir-match').hidden = !!t.finale || BT.statut(t) === 'termine';
    const pause = $('#bouton-pause');
    pause.textContent = t.pause ? 'Reprendre les appels' : 'Mettre les appels en pause';
    pause.className = 'bouton' + (t.pause ? ' accent' : '');
    const son = $('#bouton-son-orga');
    const actif = sonOrgaVoulu() && BT.sonActif();
    son.textContent = actif ? 'Son activé' : sonOrgaVoulu() ? 'Cliquer pour réactiver le son' : 'Son à la table de marque';
    son.setAttribute('aria-pressed', String(actif));
    majIndicateurEcran();
  }

  // Nombre de matchs appelés au lancement (une équipe ne joue qu'un match à la fois).
  function premiersAppels() {
    const copie = JSON.parse(JSON.stringify(t));
    return BT.remplirTerrains(copie, null, null, null, true).length;
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
    const libresDeJouer = (m) => !occupees.has(m.a) && !occupees.has(m.b);
    const appelables = BT.matchsAppelables(t);
    const reservees = BT.equipesReservees(appelables);
    const appelPossible = appelables.some((m) => libresDeJouer(m) && !BT.bloqueParPriorite(m, reservees));
    // Terrain libre parce que les équipes libres attendent leur match prioritaire, ou une équipe pas arrivée.
    const attendPriorite = !appelPossible && appelables.some((m) => libresDeJouer(m) && BT.bloqueParPriorite(m, reservees));
    const attendArrivee = !appelPossible && !attendPriorite && BT.matchsEnAttenteArrivee(t).some(libresDeJouer);
    // Plus rien sur les terrains et seuls des matchs reportés peuvent jouer : ils attendent l'organisateur.
    const seulementReportes = appelPossible && !BT.matchsEnCours(t).length
      && appelables.filter((m) => libresDeJouer(m) && !BT.bloqueParPriorite(m, reservees)).every((m) => m.reporte);
    const libres = BT.terrainsLibres(t);
    const suite = BT.prochains(t);
    const T = BT.nbTerrainsOuverts(t);
    const recus = aValider();
    paireSuisse = BT.estSuisse(t) && st === 'en_cours' ? BT.paireForcee(t) : null;
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
    h += cartePointage(st);
    if (st === 'pret') {
      const premiers = premiersAppels();
      const pointage = BT.pointageActif(t);
      h += '<div class="carte"><h2>Tout est prêt</h2>'
        + '<p>' + pluriel(BT.nbMatchsPrevus(t), 'match', 'matchs') + ' à jouer sur ' + pluriel(T, 'terrain') + '. '
        + (BT.estSuisse(t) ? 'Les gagnants jouent contre les gagnants : les premiers matchs suivent l’ordre de la liste, les suivants se créent au fil des résultats. ' : '')
        + (pointage && !premiers
          ? 'Aucun match ne peut encore être appelé : pointe d’abord les équipes arrivées.'
          : 'Au lancement, ' + (premiers > 1 ? 'les ' + premiers + ' premiers matchs sont appelés' : 'le premier match est appelé')
            + ' sur les terrains' + (pointage && BT.equipesAttendues(t).length ? ', entre équipes déjà pointées. Les autres jouent dès leur arrivée.' : '.'))
        + '</p>'
        + '<div class="horaires-estimation">' + texteHoraires(t) + '</div>'
        + '<button type="button" class="bouton accent grand" data-action="lancer"' + (pointage && !premiers ? ' disabled' : '') + '>Lancer le tournoi</button></div>';
    }
    if (!t.finale && BT.nbQualifies(t) >= 2 && BT.phasePoulesFinie(t)) {
      const q = BT.qualifies(t);
      h += '<div class="carte carte-finale"><h2>' + (BT.avecPoules(t) ? 'Phase de poules terminée' : BT.estSuisse(t) ? 'Tous les matchs sont joués' : 'Championnat terminé') + '</h2>'
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
      h += '<div class="titre-actions"><h2>Sur les terrains</h2>'
        + '<div class="terrains-ouverts"><span>Terrains ouverts</span><div class="filtres" role="group" aria-label="Ouvrir ou fermer un terrain">'
        + Array.from({ length: t.reglages.terrains }, (_, i) => i + 1).map((n) => '<button type="button" data-action="basculer-terrain" data-terrain="' + n + '" aria-pressed="' + !BT.terrainFerme(t, n) + '" title="' + (BT.terrainFerme(t, n) ? 'Rouvrir' : 'Fermer') + ' le terrain ' + n + '">' + n + '</button>').join('')
        + '</div></div></div>'
        + '<div class="grille-terrains">'
        + numerosTerrains().map((n) => carteTerrain(n, BT.matchsEnCours(t).find((m) => m.terrain === n), st, appelPossible, attendArrivee, attendPriorite, seulementReportes)).join('')
        + '</div>';
    }
    const sansAdversaire = BT.estSuisse(t) && st !== 'termine' ? BT.equipesSansAdversaire(t) : [];
    if (sansAdversaire.length && BT.demarre(t)) {
      h += '<div class="carte carte-suisse"><h2>En attente d’un adversaire</h2>'
        + '<p>' + sansAdversaire.map((x) => nom(x.equipe) + ' <small>(' + texteVictoires(x.victoires) + ')</small>').join(', ') + '.</p>'
        + '<p class="note">Chaque équipe libre attend une équipe libre ' + (Number(t.reglages.ecartSuisse) ? 'à ' + (Number(t.reglages.ecartSuisse) === 1 ? 'une victoire' : t.reglages.ecartSuisse + ' victoires') + ' d’écart au plus' : 'au même nombre de victoires')
        + ', qu’elle n’a pas encore rencontrée. Les matchs se créent dès qu’une équipe se libère.</p>'
        + '<div class="actions">' + (paireSuisse && libres.length ? boutonForcer(libres[0]) : '')
        + '<button type="button" class="bouton" data-action="choisir-match" data-equipe="' + esc(sansAdversaire[0].equipe) + '">Choisir un match</button></div>'
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
    else if (!BT.matchPointe(t, m)) etat = '<span class="etiquette etiquette--arrivee">Attend ' + [m.a, m.b].filter((x) => !BT.estArrivee(t, x)).map(nom).join(' et ') + '</span>';
    else if (o.suivant) etat = '<span class="etiquette">Prochain appel</span>';
    else etat = '<span class="etiquette">À jouer</span>';
    if (!fini && propositionsDe(m.id).length) etat += ' <span class="etiquette etiquette--recu">Score reçu</span>';
    if (m.statut === 'attente' && m.priorite) {
      etat += ' <span class="etiquette etiquette--priorite">Prioritaire</span>';
      // Il part dès que ses deux équipes sont libres : on dit laquelle joue encore.
      const enJeu = [m.a, m.b].filter((x) => (o.occupees || equipesOccupees()).has(x));
      if (enJeu.length) etat += ' <span class="etiquette">' + enJeu.map(nom).join(' et ') + (enJeu.length > 1 ? ' jouent' : ' joue') + ' encore</span>';
    }
    else if (m.statut === 'attente' && m.reporte) etat += ' <span class="etiquette">Reporté</span>';

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
      + '<span class="match-num" title="Match ' + BT.numero(t, m) + '">' + BT.numero(t, m) + '</span>'
      + '<span class="match-equipes">' + pastilleCategorie(m) + (BT.etiquetteMatch(t, m) ? '<span class="match-tour' + (m.phase === 'finale' ? ' match-tour--finale' : '') + '">' + esc(BT.etiquetteMatch(t, m)) + '</span>' : '')
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
    const bloques = BT.matchsEnAttenteArrivee(t).filter(garder);
    const termines = t.matchs.filter((m) => m.statut === 'termine' && garder(m)).sort((x, y) => BT.numero(t, x) - BT.numero(t, y));
    const groupes = [
      { cle: 'en_cours', titre: 'En cours', liste: enCours },
      { cle: 'attente', titre: 'À jouer, dans l’ordre prévu', liste: aJouer },
      { cle: 'arrivee', titre: 'En attente de l’arrivée d’une équipe', liste: bloques },
      { cle: 'termine', titre: 'Terminés', liste: termines },
    ];
    const filtres = [['tous', 'Tous', enCours.length + aJouer.length + bloques.length + termines.length], ['en_cours', 'En cours', enCours.length],
      ['attente', 'À jouer', aJouer.length + bloques.length], ['termine', 'Terminés', termines.length]];
    let h = progression() + '<div class="filtres">'
      + filtres.map(([cle, libelle, n]) => '<button type="button" data-action="filtre" data-valeur="' + cle + '" aria-pressed="' + (filtre === cle) + '">' + libelle + ' (' + n + ')</button>').join('')
      + '<button type="button" data-action="feuille" class="bouton-feuille">Imprimer la feuille de matchs</button>'
      + '<select id="filtre-equipe" aria-label="Filtrer par équipe"><option value="">Toutes les équipes</option>'
      + t.equipes.map((e) => '<option value="' + esc(e.id) + '"' + (e.id === filtreEquipe ? ' selected' : '') + '>' + esc(e.nom) + '</option>').join('')
      + '</select></div>';
    // Gagnants contre gagnants : les matchs suivants n'existent pas encore.
    const aCreer = BT.matchsSuisseRestants(t);
    if (aCreer) {
      h += '<p class="note note-suisse">' + pluriel(aCreer, 'match sera créé', 'matchs seront créés') + ' au fil des résultats : chaque équipe libre joue une équipe libre qui a '
        + esc(BT.texteEcartSuisse(t.reglages)) + ', et qu’elle n’a pas encore rencontrée.</p>';
    }
    const libres = BT.terrainsLibres(t);
    const occupees = equipesOccupees();
    groupes.forEach((g) => {
      if ((filtre !== 'tous' && filtre !== g.cle && !(filtre === 'attente' && g.cle === 'arrivee')) || !g.liste.length) return;
      h += '<h2>' + g.titre + '</h2><ol class="liste-matchs">'
        + g.liste.map((m, i) => ligneMatch(m, { suivant: g.cle === 'attente' && i === 0, libres, occupees })).join('') + '</ol>';
    });
    el.innerHTML = h;
  }

  /* ---------- Onglet Classement ---------- */

  function tableClassement(lignes, nuls, qualifiees) {
    return '<div class="tableau-conteneur" tabindex="0" role="region" aria-label="Classement"><table class="tableau"><thead><tr>'
      + '<th>Rang</th><th class="equipe">Équipe</th><th><abbr title="Matchs joués">J</abbr></th><th><abbr title="Victoires">V</abbr></th>'
      + (nuls ? '<th><abbr title="Matchs nuls">N</abbr></th>' : '')
      + '<th><abbr title="Défaites">D</abbr></th><th>Sets</th><th>Points</th></tr></thead><tbody>'
      + lignes.map((l) => '<tr' + (qualifiees.has(l.equipe.id) ? ' class="qualifie"' : '') + '><td class="rang">' + l.rang + '</td><td class="equipe">' + esc(l.equipe.nom)
        + (l.equipe.abandon ? ' <span class="etiquette etiquette--N">Abandon</span>' : '')
        + (qualifiees.has(l.equipe.id) ? ' <span class="etiquette etiquette--qualifie">Qualifiée</span>' : '') + '</td>'
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
        + '<div class="tableau-conteneur" tabindex="0" role="region" aria-label="Classement"><table class="tableau"><thead><tr><th>Rang</th><th class="equipe">Équipe</th>'
        + (t.finale ? '<th class="equipe">Parcours</th>' : '<th><abbr title="Victoires">V</abbr></th><th><abbr title="Défaites">D</abbr></th>') + '</tr></thead><tbody>'
        + cf.map((l) => '<tr><td class="rang">' + (l.rang || '') + '</td><td class="equipe">' + esc(l.equipe.nom) + '</td>'
          + (t.finale ? '<td class="equipe">' + esc(l.etape || '') + '</td>' : '<td class="fort">' + l.V + '</td><td>' + l.D + '</td>') + '</tr>').join('')
        + '</tbody></table></div>';
    }
    if (t.finale) {
      const annulable = !t.matchs.some((m) => m.phase === 'finale' && m.statut !== 'attente' && !m.forfait);
      h += '<h2>Phase finale</h2><div class="tableau-defilant" tabindex="0" role="region" aria-label="Tableau de la phase finale">' + BT.tableauHtml(t) + '</div>'
        + (annulable ? '<div class="actions pas-imprimer" style="margin-top:10px"><button type="button" class="bouton petit danger" data-action="annuler-finale">Annuler la phase finale</button></div>' : '');
    }
    const qualifiees = new Set(BT.nbQualifies(t) >= 2 ? BT.qualifies(t).map((x) => x.equipe.id) : []);
    if (BT.avecPoules(t)) {
      BT.listePoules(t).forEach((p) => {
        h += '<h2>' + p.nom + '</h2>' + tableClassement(BT.classement(t, p.numero), nuls, qualifiees);
      });
    } else {
      h += (cf || t.finale ? '<h2>' + (BT.estSuisse(t) ? 'Avant la phase finale' : 'Championnat') + '</h2>' : '') + tableClassement(BT.classement(t), nuls, qualifiees);
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

  async function enregistrerMotDePasse(form) {
    const champ = $('#mdp-nouveau');
    const champNom = $('#mdp-nom');
    const msg = $('#mdp-message');
    const bouton = form.querySelector('[type="submit"]');
    const motDePasse = champ.value.trim();
    const nomAcces = champNom.value.trim().slice(0, 30);
    msg.hidden = true;
    if (motDePasse.length < 3) {
      msg.textContent = 'Choisis au moins 3 caractères.';
      msg.hidden = false;
      return;
    }
    const cle = D.cleOrganisateur(t.id);
    if (!cle) {
      msg.textContent = 'Cet appareil n’a pas la clé organisateur. Ouvre le lien organisateur, puis réessaie.';
      msg.hidden = false;
      return;
    }
    bouton.disabled = true;
    try {
      const chiffre = await BT.chiffrerCle(cle, motDePasse);
      const ok = await agir((tt) => { BT.poserAcces(tt, nomAcces, chiffre); return true; });
      champ.value = '';
      champNom.value = '';
      if (ok) {
        if ($('#mdp-retenir') && $('#mdp-retenir').checked) D.retenirMotDePasse(nomAcces, motDePasse);
        toast('Mot de passe enregistré' + (nomAcces ? ' pour ' + nomAcces : '') + '. Donne-le seulement aux organisateurs.');
      }
    } catch (e) {
      msg.textContent = 'Enregistrement impossible sur ce navigateur.';
      msg.hidden = false;
    }
    bouton.disabled = false;
    rendrePartager();
  }

  // Page réservée aux organisateurs : entrée par mot de passe si le tournoi en a un.
  function formulaireAcces(acces) {
    const zone = $('#acces-mdp');
    if (!zone || zone.dataset.pret) return;
    zone.dataset.pret = '1';
    zone.innerHTML = '<form id="form-acces" class="acces-mdp" novalidate>'
      + '<label for="mdp-acces">Mot de passe organisateur</label>'
      + '<div class="annonce-ligne"><input type="password" id="mdp-acces" maxlength="64" autocomplete="current-password" autocapitalize="none">'
      + '<button type="submit" class="bouton principal">Entrer</button></div>'
      + '<p class="erreur-champ" id="mdp-erreur" hidden></p></form>';
    zone.querySelector('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const bouton = e.target.querySelector('[type="submit"]');
      const erreur = $('#mdp-erreur');
      erreur.hidden = true;
      bouton.disabled = true;
      bouton.textContent = 'Vérification';
      const ouvert = await BT.ouvrirAcces({ acces: zone.acces || acces }, $('#mdp-acces').value.trim());
      const cle = ouvert && ouvert.cle;
      if (!cle) {
        erreur.textContent = 'Mot de passe incorrect.';
        erreur.hidden = false;
        setTimeout(() => { bouton.disabled = false; bouton.textContent = 'Entrer'; }, 1500);
        return;
      }
      try {
        await D.rejoindre(id, cle);
        location.reload();
      } catch (err) {
        erreur.textContent = 'Accès refusé par la base. Réessaie dans un instant.';
        erreur.hidden = false;
        bouton.disabled = false;
        bouton.textContent = 'Entrer';
      }
    });
  }

  /* ---------- Onglet Règles ---------- */

  function rendreRegles() {
    const el = $('#regles');
    if (!t.matchs.length) {
      el.innerHTML = '<div class="carte"><h2>Règles du tournoi</h2>'
        + '<p>Les règles s’écrivent toutes seules à partir des réglages. Enregistre d’abord les réglages du tournoi.</p>'
        + '<button type="button" class="bouton principal" data-action="onglet" data-cible="reglages">Ouvrir les réglages</button></div>';
      return;
    }
    el.innerHTML = '<div class="carte regles">'
      + '<h2>Règles du tournoi</h2>'
      + '<p class="note pas-imprimer">Elles sont écrites à partir de tes réglages. Les joueurs les voient en ouvrant la page des équipes, puis peuvent y revenir avec le bouton Règles. '
      + 'Pour ajouter tes propres règles, utilise le champ « Règles en plus » des réglages.</p>'
      + '<p class="regles-tournoi">' + esc(t.nom) + '</p>'
      + BT.reglesHtml(t)
      + '<div class="actions" style="margin-top:18px">'
      + '<button type="button" class="bouton principal grand" data-action="onglet" data-cible="direct">Aller aux terrains</button>'
      + '<button type="button" class="bouton" data-action="imprimer-regles">Imprimer les règles</button>'
      + '<button type="button" class="bouton" data-action="onglet" data-cible="reglages">Modifier les réglages</button>'
      + '</div></div>';
  }

  /* ---------- Onglet QR code ---------- */

  // Toutes les photos de l'album dans un fichier .zip, de la plus ancienne à la plus récente.
  let zipPhotos = null; // { faits, total } pendant la préparation
  let messageZip = '';
  const enNomDeFichier = (x) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  function texteZip() {
    if (!zipPhotos) return messageZip;
    return zipPhotos.total ? 'Préparation du fichier : photo ' + Math.min(zipPhotos.faits + 1, zipPhotos.total) + ' sur ' + zipPhotos.total + '…' : 'Préparation du fichier…';
  }
  function majZip() {
    const info = $('#photos-zip-info');
    if (info) info.textContent = texteZip();
    const bouton = document.querySelector('[data-action="photos-zip"]');
    if (bouton) bouton.disabled = !!zipPhotos;
  }
  async function telechargerPhotos() {
    if (zipPhotos) return;
    zipPhotos = { faits: 0, total: 0 };
    messageZip = '';
    majZip();
    try {
      const liste = await new Promise((ok) => {
        let arreter = null;
        let recue = false;
        arreter = D.suivreMiniatures(t.id, (l) => {
          if (recue) return;
          recue = true;
          setTimeout(() => { if (arreter) arreter(); }, 0);
          ok(l);
        });
      });
      const ordre = liste.slice().reverse();
      if (!ordre.length) {
        messageZip = 'Pas encore de photo dans l’album.';
        return;
      }
      zipPhotos.total = ordre.length;
      majZip();
      const fichiers = [];
      let petites = 0;
      for (const p of ordre) {
        let src = '';
        try { src = BT.Photos.imageSure(await D.lirePhoto(t.id, p.id)); } catch (err) { src = ''; }
        if (!src) {
          src = BT.Photos.imageSure(p.image); // la vignette, si la grande photo ne se lit pas
          if (src) petites++;
        }
        if (src) {
          const equipe = p.equipe && t.equipes.some((e) => e.id === p.equipe) ? '-' + enNomDeFichier(BT.nomEquipe(t, p.equipe)) : '';
          fichiers.push({ nom: String(fichiers.length + 1).padStart(3, '0') + equipe + '.jpg', octets: BT.Photos.octets(src), date: p.date });
        }
        zipPhotos.faits++;
        majZip();
      }
      const lien = document.createElement('a');
      lien.href = URL.createObjectURL(BT.Photos.creerZip(fichiers));
      lien.download = nomFichier('photos').replace(/\.csv$/, '.zip');
      document.body.appendChild(lien);
      lien.click();
      setTimeout(() => { URL.revokeObjectURL(lien.href); lien.remove(); }, 60000);
      messageZip = pluriel(fichiers.length, 'photo') + ' dans le fichier ' + lien.download + '.'
        + (petites ? ' ' + pluriel(petites, 'photo est', 'photos sont') + ' en petite taille, la grande n’a pas pu être lue.' : '');
    } catch (err) {
      messageZip = 'Le téléchargement n’a pas abouti. Vérifie la connexion et réessaie.';
    } finally {
      zipPhotos = null;
      majZip();
    }
  }

  function rendrePartager() {
    const el = $('#partager');
    const lienOuvert = !!el.querySelector('details[open]');
    const enSaisie = ['#mdp-nouveau', '#mdp-nom'].map((x) => $(x)).some((c) => c && (document.activeElement === c || c.value));
    if (enSaisie) return;
    const urlEquipes = BT.urlPage('equipe.html', { t: t.id });
    const urlEcran = (vue) => 'ecran.html?t=' + encodeURIComponent(t.id) + (vue ? '&vue=' + vue : '');
    const photos = t.reglages.photos !== false;
    let h = '<div class="carte"><div class="qr-carte"><div class="qr">' + BT.qrSvg(urlEquipes) + '</div><div>'
      + '<h2>Page des équipes</h2>'
      + '<p>Les joueurs scannent ce QR code et choisissent leur équipe. Ils voient leur prochain match et son terrain, les matchs déjà joués avec les scores, ceux qui restent et le classement.'
      + (t.reglages.scoresJoueurs ? ' Ils peuvent aussi envoyer le score de leur match, que tu valides ensuite.' : '')
      + ' Une fois connectés, ils peuvent montrer ce QR code à d’autres joueurs depuis leur téléphone (onglet Partager).</p>'
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
      const accesListe = BT.listeAcces(t).sort((x, y) => (x.nom || '').localeCompare(y.nom || '', 'fr'));
      const retenus = D.motsDePasseRetenus();
      h += '<div class="carte pas-imprimer" style="margin-top:16px" id="carte-mdp"><h2>Mots de passe organisateurs</h2>'
        + '<p>Chaque organisateur peut avoir son mot de passe pour gérer le tournoi depuis son téléphone, sans le lien organisateur. '
        + 'Il ouvre la page des équipes, touche « Accès organisateur » en bas de page, puis entre son mot de passe. Les majuscules ne comptent pas.</p>'
        + (accesListe.length
          ? '<ul class="liste-mdp">' + accesListe.map((a) => '<li><span>' + esc(a.nom || 'Sans nom') + '</span>'
            + '<button type="button" class="bouton petit danger" data-action="mdp-supprimer" data-id="' + esc(a.id) + '" data-nom="' + esc(a.nom || '') + '">Supprimer</button></li>').join('') + '</ul>'
          : '<p class="note">Aucun mot de passe pour l’instant.</p>')
        + '<form id="form-mdp" novalidate>'
        + '<div class="grille-mdp"><input type="text" id="mdp-nom" maxlength="30" autocomplete="off" placeholder="Pour qui, par exemple Grégoire" aria-label="Nom de l’organisateur">'
        + '<input type="password" id="mdp-nouveau" maxlength="64" autocomplete="new-password" autocapitalize="none" placeholder="Mot de passe, 3 caractères ou plus" aria-label="Mot de passe">'
        + '<button type="submit" class="bouton principal">Ajouter</button></div>'
        + caseHtml('mdp-retenir', retenirMdp, 'Le mettre aussi sur mes prochains tournois créés depuis cet appareil') + '</form>'
        + '<p class="erreur-champ" id="mdp-message" hidden></p>'
        + (retenus.length
          ? '<p class="note" style="margin:8px 0 0">Retenus sur cet appareil pour tes prochains tournois : ' + esc(retenus.map((x) => x.nom || 'sans nom').join(', ')) + '. '
            + '<button type="button" class="lien-bouton" data-action="mdp-oublier">Ne plus les retenir</button></p>'
          : '')
        + '</div>';
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
      + '<a class="bouton" href="' + urlEcran('alterne') + '" target="_blank" rel="noopener">' + (photos ? 'Terrains, classement et photos en alternance' : 'Terrains et classement en alternance') + '</a>'
      + (photos ? '<a class="bouton" href="' + urlEcran('photos') + '" target="_blank" rel="noopener">Photos en diaporama</a>' : '')
      + '</div>'
      + (photos ? '<p class="note">Sur les terrains, la photo de chaque équipe s’affiche à côté de son nom. En alternance, les photos passent seulement quand l’album en contient.</p>' : '')
      + '</div>';
    if (photos) {
      const urlAlbum = urlEquipes + '#photos';
      h += '<div class="carte pas-imprimer" style="margin-top:16px"><h2>Album photo</h2>'
        + '<p>Tout le monde peut ajouter des photos depuis la page des équipes, onglet Photos'
        + (Number(t.reglages.photosMax) ? ', ' + Number(t.reglages.photosMax) + ' au plus par personne' : '')
        + '. Chacun peut retirer les siennes. Les organisateurs peuvent retirer n’importe quelle photo : ouvre l’album, touche la photo puis « Retirer ».</p>'
        + '<div class="actions"><a class="bouton" href="' + esc(urlAlbum) + '" target="_blank" rel="noopener">Ouvrir l’album</a>'
        + '<button type="button" class="bouton" data-action="photos-zip"' + (zipPhotos ? ' disabled' : '') + '>Télécharger toutes les photos</button></div>'
        + '<p class="note" id="photos-zip-info" role="status">' + esc(texteZip()) + '</p>'
        + '<p class="note">Les photos ne sont pas dans la sauvegarde du tournoi et partent avec lui quand tu le supprimes. Télécharge-les avant pour les garder.</p></div>';
    }
    el.innerHTML = h;
    if (lienOuvert && el.querySelector('details')) el.querySelector('details').open = true;
  }

  /* ---------- Onglet Réglages ---------- */

  function copieReglages() {
    const r = JSON.parse(JSON.stringify(Object.assign({}, BT.REGLAGES_DEFAUT, t.reglages)));
    const tailles = r.format === 'poules' ? BT.taillesPoules(t.equipes.length, r.nbPoules) : [t.equipes.length];
    const maxManuel = {};
    BT.CATEGORIES.forEach((c) => {
      const x = r.cat[c.cle] || {};
      if (Number(x.max) > BT.maximumNecessaire(tailles, Number(x.k) || 0)) maxManuel[c.cle] = true;
    });
    return {
      nom: t.nom,
      reglages: r,
      equipes: t.equipes.map((e) => Object.assign({}, e)),
      reserve: [],
      plafondManuel: r.plafond !== BT.plafondAuto(r.points),
      maxManuel,
    };
  }

  // Champ d'heure à la française (« 19h00 ») : le champ heure du navigateur peut s'afficher en
  // « 07:00 PM » selon sa langue. On accepte aussi « 19h », « 19:00 » ou « 1900 ».
  function champHeure(idChamp, hhmm, exemple) {
    return '<input type="text" id="' + idChamp + '" class="champ-heure" inputmode="numeric" autocomplete="off" maxlength="8" placeholder="' + exemple + '" value="' + esc(BT.texteHeure(hhmm)) + '">';
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
    const avecUnite = (html, unite) => '<div class="avec-unite">' + html + '<span>' + unite + '</span></div>';
    $('#reglages').innerHTML = '<form id="form-reglages" class="carte reglages" novalidate>'
      // Le tournoi
      + '<section class="r-bloc"><h2>Le tournoi</h2><div class="r-grille">'
      + '<div class="champ champ--large"><label for="r-nom">Nom du tournoi</label><input type="text" id="r-nom" maxlength="60" value="' + esc(b.nom) + '"></div>'
      + '<div class="champ champ--large"><label for="r-format">Organisation</label>'
      + '<select id="r-format"><option value="championnat"' + (r.format !== 'poules' && r.format !== 'suisse' ? ' selected' : '') + '>Une seule poule</option>'
      + '<option value="poules"' + (r.format === 'poules' ? ' selected' : '') + '>Plusieurs poules</option>'
      + '<option value="suisse"' + (r.format === 'suisse' ? ' selected' : '') + '>Gagnants contre gagnants</option></select>'
      + '<span class="aide" id="r-format-aide"></span></div>'
      + '<div class="champ"><label for="r-equipes">Nombre d’équipes</label>' + nombre('r-equipes', b.equipes.length, 2, 64) + '</div>'
      + '<div class="champ" id="r-poules-bloc"><label for="r-poules">Nombre de poules</label>' + nombre('r-poules', r.nbPoules, 2, 8)
      + '<span class="aide" id="r-poules-aide"></span></div>'
      + '</div></section>'
      // Matchs de chaque équipe
      + '<section class="r-bloc"><h2>Matchs de chaque équipe</h2>'
      // Gagnants contre gagnants (système suisse)
      + '<div id="r-suisse" class="r-suisse"><div class="r-grille">'
      + '<div class="champ"><label for="r-suisse-matchs">Matchs par équipe</label>' + nombre('r-suisse-matchs', Number(r.matchsSuisse) || 5, 1, 63) + '</div>'
      + '<div class="champ"><label for="r-suisse-cat">Type de matchs</label><select id="r-suisse-cat">'
      + BT.CATEGORIES.map((c) => '<option value="' + c.cle + '"' + ((r.categorieSuisse || 'double') === c.cle ? ' selected' : '') + '>' + c.pluriel.charAt(0).toUpperCase() + c.pluriel.slice(1) + '</option>').join('')
      + '</select></div>'
      + '<div class="champ champ--plein-tel"><label for="r-suisse-ecart">Écart de victoires accepté</label>'
      + avecUnite(nombre('r-suisse-ecart', Number(r.ecartSuisse) || 0, 0, 5), 'victoire' + ((Number(r.ecartSuisse) || 0) > 1 ? 's' : '')) + '</div>'
      + '</div><p class="note r-note" id="r-suisse-aide"></p></div>'
      + '<div id="r-classique">'
      + caseHtml('r-mixte-double', r.mixteEgalDouble, 'Mixte compté comme double (pas de différence entre mixte et double)')
      + '<div class="r-categories">'
      + BT.CATEGORIES.map((c) => {
        const x = r.cat[c.cle] || { k: 0, tous: false };
        return '<div class="r-cat" id="r-cat-' + c.cle + '-bloc" role="group" aria-labelledby="r-cat-' + c.cle + '-label"><span class="r-cat-nom" id="r-cat-' + c.cle + '-label">' + c.pluriel.charAt(0).toUpperCase() + c.pluriel.slice(1) + '</span>'
          + '<label class="r-mini"><span>Au moins</span>' + nombre('r-cat-' + c.cle, x.k || 0, 0, 63) + '</label>'
          + '<label class="r-mini"><span>Au plus</span>' + nombre('r-cat-' + c.cle + '-max', Math.max(Number(x.max) || 0, x.k || 0), 0, 63) + '</label>'
          + caseHtml('r-cat-' + c.cle + '-tous', x.tous, '') + '</div>';
      }).join('')
      + '</div>'
      + '<p class="note r-note">Le site prévoit le minimum pour chaque équipe. Avec un nombre impair d’équipes, une équipe joue un match de plus, sans dépasser le maximum.</p>'
      + '</div>'
      + '<p class="erreur-champ" id="r-matchs-erreur" hidden></p>'
      + '</section>'
      // Format des matchs
      + '<section class="r-bloc"><h2>Format des matchs</h2><div class="r-grille">'
      + '<div class="champ"><label for="r-sets">Sets par match</label>' + nombre('r-sets', r.sets, 1, 5)
      + caseHtml('r-meilleur', r.auMeilleur, '')
      + '<span class="aide" id="r-sets-aide"></span></div>'
      + '<div class="champ"><label for="r-points">Points par set</label>' + nombre('r-points', r.points, 1, 99)
      + caseHtml('r-ecart', r.ecart2, '2 points d’écart') + '</div>'
      + '<div class="champ" id="r-plafond-bloc"><label for="r-plafond">Score maximum</label>' + nombre('r-plafond', r.plafond, 1, 99)
      + '<span class="aide">Avec 2 points d’écart, le set s’arrête à ce score.</span></div>'
      + '<div class="champ"><label for="r-duree">Durée maximum</label>' + avecUnite(nombre('r-duree', r.dureeLimite || 0, 0, 90), 'min')
      + '<span class="aide">0 si les matchs vont jusqu’au bout.</span></div>'
      + '</div></section>'
      // Phase finale
      + '<section class="r-bloc"><h2>Phase finale</h2><div class="r-grille">'
      + '<div class="champ champ--plein-tel"><label for="r-finale" id="r-finale-label">Qualifiés</label>'
      + '<select id="r-finale">'
      + [[0, 'Pas de phase finale'], [2, 'Finale entre les 2 premiers'], [4, 'Demi-finales (4 qualifiés)'], [8, 'Quarts de finale (8 qualifiés)'], [16, 'Huitièmes de finale (16 qualifiés)']]
        .map(([v, l]) => '<option value="' + v + '"' + (Number(r.phaseFinale) === v ? ' selected' : '') + '>' + l + '</option>').join('')
      + '</select>'
      + nombre('r-qualifies', r.qualifiesParPoule, 0, 8)
      + '<span class="aide" id="r-finale-aide"></span>'
      + caseHtml('r-petite', r.petiteFinale, 'Match pour la 3e place') + '</div>'
      + '<div class="champ champ--plein-tel" id="r-finale-cat-bloc"><label for="r-finale-cat">Catégorie des matchs</label>'
      + '<select id="r-finale-cat">' + BT.CATEGORIES.map((c) => '<option value="' + c.cle + '"' + (r.finaleCategorie === c.cle ? ' selected' : '') + '>' + c.nom + '</option>').join('') + '</select></div>'
      + '</div>'
      + '<div id="r-finale-format-bloc" class="r-sous-bloc">'
      + caseHtml('r-format-finale', r.formatFinale, 'Format différent pour la phase finale (par exemple des matchs plus longs)')
      + '<div class="r-grille" id="r-finale-champs">'
      + '<div class="champ"><label for="r-finale-sets">Sets par match</label>' + nombre('r-finale-sets', r.finaleSets, 1, 5)
      + caseHtml('r-finale-meilleur', r.finaleAuMeilleur, '') + '</div>'
      + '<div class="champ"><label for="r-finale-points">Points par set</label>' + nombre('r-finale-points', r.finalePoints, 1, 99)
      + '<span class="aide">Même règle d’écart, sans durée maximum.</span></div>'
      + '</div></div></section>'
      // Terrains
      + '<section class="r-bloc"><h2>Terrains</h2><div class="r-grille">'
      + '<div class="champ"><label for="r-terrains">Nombre de terrains</label>' + nombre('r-terrains', r.terrains, 1, 30)
      + caseHtml('r-auto', r.appelAuto, 'Appel automatique')
      + '<span class="aide">Le match suivant est appelé dès qu’un terrain se libère.</span></div>'
      + '<div class="champ"><label for="r-repos">Repos minimum</label>' + avecUnite(nombre('r-repos', r.reposMin || 0, 0, 30), 'min')
      + '<span class="aide">Entre deux matchs d’une équipe, 0 pour enchaîner.</span></div>'
      + '</div></section>'
      // Horaires
      + '<section class="r-bloc"><h2>Horaires</h2><div class="r-grille">'
      + '<div class="champ"><label for="r-debut">Heure de début</label>' + champHeure('r-debut', r.heureDebut, '14h00')
      + '<span class="aide">Facultatif.</span><span class="erreur-champ" id="r-debut-erreur" hidden>Heure non reconnue, écris par exemple 14h00.</span></div>'
      + '<div class="champ"><label for="r-fin">Fin de la salle</label>' + champHeure('r-fin', r.heureFin, '19h00')
      + '<span class="aide">Facultatif. Le site te prévient si ça déborde.</span><span class="erreur-champ" id="r-fin-erreur" hidden>Heure non reconnue, écris par exemple 19h00.</span></div>'
      + '<div class="champ champ--plein-tel"><label for="r-prevue">Durée prévue d’un match</label>' + avecUnite(nombre('r-prevue', r.dureePrevue || 0, 0, 90), 'min')
      + '<span class="aide" id="r-prevue-aide"></span></div>'
      + '</div></section>'
      // Résumé
      + '<section class="r-bloc"><h2>En résumé</h2>'
      + '<div class="resume-reglages" id="r-resume"></div>'
      + '<div class="horaires-estimation" id="r-horaires" aria-live="polite"></div>'
      + '</section>'
      + '<section class="r-bloc"><h2>Arrivée des équipes</h2><div class="r-cases">'
      + caseHtml('r-pointage', r.pointage, 'Pointage à l’arrivée : une équipe ne joue qu’une fois pointée. Elle se signale sur son téléphone, ou l’organisation la pointe à la table de marque.')
      + '</div><p class="note r-note" id="r-pointage-aide">Pointe les équipes dans l’onglet Terrains, ou ici dans la liste des équipes, en bas.</p></section>'
      + '<section class="r-bloc"><h2>Scores envoyés par les joueurs</h2><div class="r-cases">'
      + caseHtml('r-joueurs', r.scoresJoueurs, 'Les joueurs peuvent envoyer le score de leur match depuis leur téléphone. Un organisateur le valide ensuite.')
      + caseHtml('r-validation', r.validationAuto, 'Valider tout seul quand les deux équipes envoient le même score')
      + '</div></section>'
      + '<section class="r-bloc"><h2>Photos</h2><div class="r-cases">'
      + caseHtml('r-photos', r.photos !== false, 'Album photo du tournoi et photo de chaque équipe. Tout le monde ajoute ses photos depuis son téléphone et voit celles des autres.')
      + '</div><div class="r-grille" id="r-photos-bloc">'
      + '<div class="champ"><label for="r-photos-max">Photos par personne</label>' + nombre('r-photos-max', Number(r.photosMax) || 0, 0, 99)
      + '<span class="aide">0 pour ne pas limiter.</span></div></div></section>'
      + '<section class="r-bloc"><h2>Règles en plus</h2>'
      + '<div class="champ"><label for="r-regles">Tes propres règles, une par ligne</label>'
      + '<textarea id="r-regles" rows="4" maxlength="1500" placeholder="Par exemple, échauffement de 2 minutes avant chaque match">' + esc(r.reglesPerso || '') + '</textarea>'
      + '<span class="aide">Elles s’ajoutent aux règles écrites à partir des réglages, sur la page des équipes et dans l’onglet Règles.</span></div></section>'
      + '<section class="r-bloc"><div class="titre-actions"><h2>Équipes</h2>'
      + (BT.demarre(t) ? '' : '<div class="titre-boutons"><button type="button" class="bouton petit" data-action="coller-liste" aria-expanded="false" aria-controls="r-coller">Coller une liste</button>'
        + '<button type="button" class="bouton petit" data-action="melanger">Mélanger l’ordre des équipes</button></div>') + '</div>'
      + (BT.demarre(t) ? '' : '<div class="champ coller-liste" id="r-coller" hidden>'
        + '<label for="r-coller-texte">Colle ta liste, une équipe par ligne</label>'
        + '<textarea id="r-coller-texte" rows="6" spellcheck="false" placeholder="Les Volants : Julien et Grégoire&#10;Les Smashs : Paul et Marie&#10;Les Amortis"></textarea>'
        + '<span class="aide">Écris le nom de l’équipe, puis ses joueurs après « : » si tu les as. Une liste copiée d’un tableur marche aussi (nom dans la première colonne, joueurs dans les suivantes). Le nombre d’équipes s’ajuste à ta liste.</span>'
        + '<div class="actions"><button type="button" class="bouton principal petit" data-action="coller-remplir">Remplir les équipes</button>'
        + '<button type="button" class="bouton petit" data-action="coller-fermer">Annuler</button></div>'
        + '<span class="erreur-champ" id="r-coller-erreur" role="alert" hidden></span></div>')
      + '<p class="note">Le nom des joueurs est facultatif, il s’affiche sur les terrains et sur la page de l’équipe. Changer un nom ne touche pas aux matchs.'
      + (t.matchs.length ? ' Si une équipe part avant la fin, « Abandon » lui fait perdre ses matchs restants par forfait.' : '') + '</p>'
      + '<span class="erreur-champ" id="r-equipes-erreur" hidden></span>'
      + '<div class="liste-equipes" id="r-liste-equipes"></div></section>'
      + '<div class="actions r-enregistrer"><button type="submit" class="bouton principal grand" id="r-enregistrer">Enregistrer</button>'
      + '<span class="note" id="r-info" role="status"></span></div>'
      + '</form>'
      + '<div class="carte" style="margin-top:16px"><h2>Sauvegarde</h2>'
      + '<p class="note">Un fichier qui contient tout le tournoi (équipes, réglages, matchs et scores). Il se restaure depuis la page d’accueil, sur n’importe quel appareil.'
      + (r.photos !== false ? ' Les photos n’y sont pas : télécharge-les depuis l’onglet QR code.' : '') + '</p>'
      + '<div class="actions"><button type="button" class="bouton" data-action="sauvegarde">Télécharger une sauvegarde</button></div></div>'
      + (t.matchs.length ? '<div class="carte" style="margin-top:16px"><h2>Remise à zéro</h2>'
        + '<p class="note">Effacer les scores remet tous les matchs à jouer, dans l’ordre de départ.</p>'
        + '<div class="actions"><button type="button" class="bouton danger" data-action="recreer">Effacer tous les scores</button>'
        + '<button type="button" class="bouton danger" data-action="supprimer">Supprimer le tournoi</button></div></div>'
        : '<div class="carte" style="margin-top:16px"><div class="actions"><button type="button" class="bouton danger" data-action="supprimer">Supprimer le tournoi</button></div></div>');
    rendreListeEquipes();
    majReglages();
  }

  // Pointage dans la liste des équipes des réglages : « Pointer », ou « Pointée à 13:42 » (un clic annule).
  function boutonPointageReglage(e) {
    if (!e || e.abandon || !BT.pointageActif(t)) return '';
    const cle = e.arrivee ? 'p' + e.arrivee : 'n';
    return e.arrivee
      ? '<button type="button" class="bouton petit bouton-pointee" data-action="depointer" data-equipe="' + esc(e.id) + '" data-pointage="' + cle + '" title="Annuler le pointage">Pointée à ' + BT.heure(e.arrivee) + '</button>'
      : '<button type="button" class="bouton petit principal" data-action="pointer" data-equipe="' + esc(e.id) + '" data-pointage="' + cle + '">Pointer</button>';
  }

  // Mise à jour des boutons de pointage des réglages sans toucher aux noms en cours de saisie.
  function majPointagesReglages() {
    document.querySelectorAll('#r-liste-equipes [data-pointage]').forEach((b) => {
      const e = t.equipes.find((x) => x.id === b.dataset.equipe);
      const cle = e && !e.abandon && BT.pointageActif(t) ? (e.arrivee ? 'p' + e.arrivee : 'n') : '';
      if (b.dataset.pointage !== cle) b.outerHTML = boutonPointageReglage(e);
    });
  }

  function rendreListeEquipes() {
    const avecMatchs = t.matchs.length > 0;
    const pointage = avecMatchs && BT.pointageActif(t);
    $('#r-liste-equipes').innerHTML = brouillon.equipes.map((e, i) => {
      const actuelle = t.equipes.find((x) => x.id === e.id);
      let action = '';
      if (avecMatchs && actuelle) {
        action = '<div class="ligne-actions">' + (pointage ? boutonPointageReglage(actuelle) : '')
          + (actuelle.abandon
            ? '<button type="button" class="bouton petit" data-action="annuler-abandon" data-equipe="' + esc(e.id) + '">Annuler l’abandon</button>'
            : '<button type="button" class="bouton petit danger" data-action="abandon" data-equipe="' + esc(e.id) + '">Abandon</button>')
          + '</div>';
      }
      return '<div class="ligne-equipe' + (avecMatchs ? ' ligne-equipe--action' : '') + (pointage ? ' ligne-equipe--pointage' : '') + (actuelle && actuelle.abandon ? ' ligne-equipe--abandon' : '') + '">'
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
    if (r.format === 'poules' && r.nbPoules !== avant.nbPoules) return true;
    // Gagnants contre gagnants : le nombre de matchs et l'écart s'appliquent aux matchs suivants.
    if (r.format === 'suisse') {
      if ((r.categorieSuisse || 'double') !== (avant.categorieSuisse || 'double')) return true;
      return brouillon.equipes.some((e, i) => e.id !== tournoi.equipes[i].id);
    }
    if (JSON.stringify(BT.categoriesJouees(r)) !== JSON.stringify(BT.categoriesJouees(avant))) return true;
    return brouillon.equipes.some((e, i) => e.id !== tournoi.equipes[i].id);
  }

  // Nombre de matchs de la phase de poules (ou du championnat) avec ces réglages.
  function compterMatchsPoules(n, r) {
    const tailles = r.format === 'poules' ? BT.taillesPoules(n, r.nbPoules) : [n];
    return BT.categoriesJouees(r).reduce((total, c) => total
      + tailles.reduce((s, taille) => s + Math.ceil((taille * (c.tous ? taille - 1 : c.k)) / 2), 0), 0);
  }

  // « Chaque équipe joue 14 doubles et 4 simples » (en poules : pour la plus grande poule).
  function texteParEquipe(n, r) {
    const tailles = r.format === 'poules' ? BT.taillesPoules(n, r.nbPoules) : [n];
    const taille = Math.max(...tailles);
    const cats = BT.categoriesJouees(r);
    const morceaux = cats.map((c) => {
      const k = c.tous ? taille - 1 : c.k;
      // Nombre impair d'équipes et de matchs : une équipe joue un match de plus.
      const plus = !c.tous && tailles.some((x) => BT.unMatchDePlus(x, c.k));
      return k + ' ' + (k > 1 ? c.pluriel : c.nom.toLowerCase()) + (plus ? ' (' + (k + 1) + ' pour une équipe' + (r.format === 'poules' ? ' dans chaque poule impaire' : '') + ')' : '');
    });
    if (!morceaux.length) return '';
    const liste = morceaux.length > 1 ? morceaux.slice(0, -1).join(', ') + ' et ' + morceaux[morceaux.length - 1] : morceaux[0];
    return (r.format === 'poules' ? 'Dans sa poule, chaque équipe joue ' + (cats.some((c) => c.tous) ? 'jusqu’à ' : '') : 'Chaque équipe joue ') + liste + '.';
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
    const suisse = r.format === 'suisse';
    // Gagnants contre gagnants : matchs créés au fil des résultats
    $('#r-suisse').hidden = !suisse;
    $('#r-classique').hidden = suisse;
    $('#r-suisse-matchs').max = Math.max(1, n - 1);
    const ecart = Number(r.ecartSuisse) || 0;
    const uniteEcart = $('#r-suisse-ecart') && $('#r-suisse-ecart').nextElementSibling;
    if (uniteEcart) uniteEcart.textContent = ecart > 1 ? 'victoires' : 'victoire';
    $('#r-suisse-aide').textContent = 'Dès qu’une équipe est libre, elle joue une équipe libre qui a '
      + (ecart ? 'le même nombre de victoires, ou ' + (ecart === 1 ? 'une victoire' : ecart + ' victoires') + ' d’écart au plus' : 'exactement le même nombre de victoires')
      + ', et qu’elle n’a pas encore rencontrée. Au départ, les équipes jouent dans l’ordre de la liste'
      + (r.pointage ? ', ou dans l’ordre d’arrivée avec le pointage' : '') + '. Si aucune équipe ne convient, tu peux lancer un match quand même dans l’onglet Terrains.'
      + (ecart === 0 ? ' Sans écart, les terrains attendent plus souvent.' : '');
    $('#r-format-aide').textContent = suisse ? 'Les gagnants jouent contre les gagnants, les matchs se créent au fil des résultats.' : '';
    $('#r-format-aide').hidden = !suisse;
    // Catégories : nombre de matchs par équipe, ou contre toutes les autres
    BT.CATEGORIES.forEach((c) => {
      const x = r.cat[c.cle];
      const champ = $('#r-cat-' + c.cle);
      const champMax = $('#r-cat-' + c.cle + '-max');
      $('#r-cat-' + c.cle + '-bloc').hidden = c.cle === 'mixte' && r.mixteEgalDouble;
      $('#r-cat-' + c.cle + '-label').textContent = c.cle === 'double' && r.mixteEgalDouble ? 'Doubles (mixtes compris)' : c.pluriel.charAt(0).toUpperCase() + c.pluriel.slice(1);
      $('#r-cat-' + c.cle + '-tous-texte').textContent = poules ? 'Contre toute sa poule' : 'Contre toutes les autres';
      champ.disabled = x.tous;
      champMax.disabled = x.tous;
      champ.max = Math.max(1, n - 1);
      champMax.max = Math.max(1, n - 1);
      if (x.tous && !poules) { champ.value = n - 1; champMax.value = n - 1; x.k = n - 1; x.max = n - 1; }
      else if (!x.tous && !b.maxManuel[c.cle]) {
        // Le maximum suit le minimum, avec le match en plus si le nombre d'équipes est impair.
        const besoin = BT.maximumNecessaire(poules ? BT.taillesPoules(n, r.nbPoules) : [n], Number(x.k) || 0);
        x.max = besoin;
        if (document.activeElement !== champMax) champMax.value = besoin;
      }
    });
    $('#r-poules-bloc').hidden = !poules;
    if (poules && !BT.verifierPoules(n, r.nbPoules)) {
      $('#r-poules-aide').textContent = 'Poules de ' + texteTailles(BT.taillesPoules(n, r.nbPoules)) + ' équipes. Chaque équipe joue contre toutes celles de sa poule.';
    } else {
      $('#r-poules-aide').textContent = '';
    }

    // Phase finale : nombre de qualifiés et forme du tableau
    $('#r-finale').hidden = poules;
    $('#r-qualifies').hidden = !poules;
    $('#r-finale-label').textContent = poules ? 'Qualifiés par poule' : 'Qualifiés';
    $('#r-finale-label').htmlFor = poules ? 'r-qualifies' : 'r-finale';
    $('#r-finale').querySelectorAll('option').forEach((o) => { o.disabled = Number(o.value) > n; });
    const Q = poules ? (r.qualifiesParPoule > 0 ? r.qualifiesParPoule * r.nbPoules : 0) : Number(r.phaseFinale) || 0;
    let aideFinale = poules ? '0 si le classement des poules suffit.' : suisse ? 'Sans phase finale, le classement après tous les matchs est le classement final.' : 'Le classement final est celui du championnat.';
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
    const jouees = BT.categoriesJouees(r).map((c) => c.cle);
    $('#r-finale-cat-bloc').hidden = Q < 2 || jouees.length < 2 || !!t.finale;
    $('#r-finale-cat').querySelectorAll('option').forEach((o) => { o.disabled = !jouees.includes(o.value); });
    $('#r-finale-cat').value = BT.categorieFinale(r);
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
    $('#r-photos-bloc').hidden = r.photos === false;
    $('#r-pointage-aide').hidden = !r.pointage;

    const total = erreur ? null : compterMatchsPoules(n, r);
    const matchsFinale = Q >= 2 ? Q - 1 + (r.petiteFinale && Q >= 4 ? 1 : 0) : 0;
    $('#r-resume').innerHTML = '<span><strong>' + n + '</strong> équipes</span>'
      + (poules && !erreur ? '<span><strong>' + r.nbPoules + '</strong> poules</span>' : '')
      + (!erreur ? '<span>' + esc(texteParEquipe(n, r)) + '</span>' : '')
      + (total ? '<span><strong>' + total + '</strong> ' + (poules ? 'matchs de poule' : 'matchs') + '</span>'
        + (matchsFinale ? '<span><strong>' + matchsFinale + '</strong> matchs de phase finale</span>' : '')
        + '<span>' + pluriel(Math.ceil(total / Math.max(1, Math.min(r.terrains, Math.floor(n / 2)))), 'rotation') + ' sur ' + pluriel(r.terrains, 'terrain')
        + (Math.floor(n / 2) < r.terrains ? ' (' + pluriel(Math.floor(n / 2), 'match', 'matchs') + ' en même temps au plus)' : '') + '</span>' : '')
      + '<span>' + esc(BT.texteFormat(r)) + '</span>';

    $('#r-prevue-aide').textContent = 'À 0, le site compte environ ' + Math.round(BT.dureeSelonFormat(r) / 60000)
      + ' min d’après le format (25 secondes par point joué), puis la durée réelle des matchs.';
    clearTimeout(minuteurHoraires);
    minuteurHoraires = setTimeout(estimerHoraires, 200);

    verifierNoms();
    let libelle = 'Enregistrer les réglages';
    if (!t.matchs.length) libelle = 'Enregistrer et créer les matchs';
    else if (structureChangee(t)) libelle = 'Enregistrer et recréer les matchs';
    $('#r-enregistrer').textContent = libelle;
  }

  let minuteurHoraires = null;
  let retenirMdp = true; // case « Le mettre aussi sur mes prochains tournois »

  // Horaires estimés avec les réglages en cours de saisie (matchs recréés à blanc si besoin).
  function estimerHoraires() {
    const zone = $('#r-horaires');
    if (!zone || !brouillon || !t) return;
    const b = brouillon;
    const r = b.reglages;
    let h = '';
    try {
      if (BT.demarre(t)) {
        const tt = Object.assign({}, t, { reglages: r });
        const fin = BT.statut(t) !== 'termine' ? BT.finEstimee(tt) : null;
        const retard = fin ? BT.depassementSalle(tt, fin) : null;
        if (fin) {
          h = '<p>Fin estimée vers <strong>' + BT.heure(fin) + '</strong>, d’après la durée des matchs déjà joués.</p>'
            + (retard ? '<p class="horaires-alerte">C’est ' + dureeTexte(retard * 60000) + ' après la fin de la salle (' + BT.texteHeure(r.heureFin) + ').</p>' : '');
        }
      } else if (!BT.verifierDeroulement(b.equipes.length, r)) {
        let tt;
        if (t.matchs.length && !structureChangee(t)) tt = Object.assign({}, t, { reglages: r });
        else {
          tt = { id: 'estimation', nom: '', reglages: JSON.parse(JSON.stringify(r)), matchs: [],
            equipes: b.equipes.map((e, i) => ({ id: e.id || 'x' + i, nom: e.nom || '', joueurs: '' })) };
          BT.genererMatchs(tt);
        }
        h = texteHoraires(tt, true);
      }
    } catch (err) {
      h = '';
    }
    zone.innerHTML = h;
    zone.hidden = !h;
  }

  function surSaisieReglages(e) {
    const cible = e.target;
    const b = brouillon;
    if (!b || !cible.closest || !cible.closest('#form-reglages')) return;
    const r = b.reglages;
    brouillonModifie = true;
    $('#r-info').textContent = '';
    if (cible.dataset.index !== undefined) {
      b.equipes[Number(cible.dataset.index)][cible.dataset.champ] = cible.value;
      if (cible.dataset.champ === 'nom') verifierNoms();
      return;
    }
    const v = cible.value;
    switch (cible.id) {
      case 'r-coller-texte': $('#r-coller-erreur').hidden = true; return;
      case 'r-nom': b.nom = v; break;
      case 'r-equipes': {
        const n = BT.entier(v, 2, 64, null);
        if (n && n !== b.equipes.length) changerNbEquipes(n);
        break;
      }
      case 'r-mixte-double': r.mixteEgalDouble = cible.checked; break;
      case 'r-finale-cat': r.finaleCategorie = v; break;
      case 'r-format': r.format = v === 'poules' || v === 'suisse' ? v : 'championnat'; break;
      case 'r-suisse-matchs': { const k = BT.entier(v, 1, 63, null); if (k) r.matchsSuisse = k; break; }
      case 'r-suisse-cat': r.categorieSuisse = BT.CATEGORIES.some((c) => c.cle === v) ? v : 'double'; break;
      case 'r-suisse-ecart': { const d = BT.entier(v, 0, 5, null); if (d !== null) r.ecartSuisse = d; break; }
      case 'r-poules': { const p = BT.entier(v, 2, 8, null); if (p) r.nbPoules = p; break; }
      case 'r-finale': r.phaseFinale = BT.entier(v, 0, 16, 0); break;
      case 'r-qualifies': { const q = BT.entier(v, 0, 8, null); if (q !== null) r.qualifiesParPoule = q; break; }
      case 'r-petite': r.petiteFinale = cible.checked; break;
      case 'r-format-finale': r.formatFinale = cible.checked; break;
      case 'r-finale-sets': { const s = BT.entier(v, 1, 5, null); if (s) r.finaleSets = s; break; }
      case 'r-finale-meilleur': r.finaleAuMeilleur = cible.checked; break;
      case 'r-finale-points': { const p = BT.entier(v, 1, 99, null); if (p) r.finalePoints = p; break; }
      default: {
        const cat = /^r-cat-(simple|double|mixte)(-tous|-max)?$/.exec(cible.id);
        if (!cat) return;
        const x = r.cat[cat[1]];
        if (cat[2] === '-tous') x.tous = cible.checked;
        else if (cat[2] === '-max') { const m = BT.entier(v, 0, 63, null); if (m !== null) { x.max = m; b.maxManuel[cat[1]] = true; } }
        else { const k = BT.entier(v, 0, 63, null); if (k !== null) x.k = k; }
        break;
      }
      case 'r-sets': { const s = BT.entier(v, 1, 5, null); if (s) r.sets = s; break; }
      case 'r-meilleur': r.auMeilleur = cible.checked; break;
      case 'r-points': { const p = BT.entier(v, 1, 99, null); if (p) r.points = p; break; }
      case 'r-ecart': r.ecart2 = cible.checked; break;
      case 'r-plafond': { const p = BT.entier(v, 1, 99, null); if (p) { r.plafond = p; b.plafondManuel = true; } break; }
      case 'r-terrains': { const n = BT.entier(v, 1, 30, null); if (n) r.terrains = n; break; }
      case 'r-duree': { const d = BT.entier(v, 0, 90, null); if (d !== null) r.dureeLimite = d; break; }
      case 'r-repos': { const d = BT.entier(v, 0, 30, null); if (d !== null) r.reposMin = d; break; }
      case 'r-prevue': { const d = BT.entier(v, 0, 90, null); if (d !== null) r.dureePrevue = d; break; }
      case 'r-regles': r.reglesPerso = v.slice(0, 1500); break;
      case 'r-debut':
      case 'r-fin': {
        const lu = BT.lireHeure(v);
        r[cible.id === 'r-debut' ? 'heureDebut' : 'heureFin'] = lu || '';
        // Erreur montrée en quittant le champ ; l'heure reconnue est réécrite à la française.
        const erreur = $('#' + cible.id + '-erreur');
        if (lu !== null) erreur.hidden = true;
        if (e.type === 'change') {
          erreur.hidden = lu !== null;
          if (lu) cible.value = BT.texteHeure(lu);
        }
        cible.classList.toggle('champ-invalide', e.type === 'change' && lu === null);
        break;
      }
      case 'r-auto': r.appelAuto = cible.checked; break;
      case 'r-joueurs': r.scoresJoueurs = cible.checked; break;
      case 'r-validation': r.validationAuto = cible.checked; break;
      case 'r-photos': r.photos = cible.checked; break;
      case 'r-pointage': r.pointage = cible.checked; break;
      case 'r-photos-max': { const m = BT.entier(v, 0, 99, null); if (m !== null) r.photosMax = m; break; }
    }
    majReglages();
  }

  // Applique une solution horaire au formulaire des réglages, comme si l'organisateur avait tapé les valeurs.
  function appliquerSolution(solution) {
    const b = brouillon;
    const ch = solution.changements;
    const poser = (selecteur, valeur) => {
      const champ = $(selecteur);
      if (!champ) return;
      if (champ.type === 'checkbox') {
        if (champ.checked === !!valeur) return;
        champ.checked = !!valeur;
        champ.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        champ.value = valeur;
        champ.dispatchEvent(new Event('input', { bubbles: true }));
      }
      const bloc = champ.closest('.champ, .r-cat') || champ;
      bloc.classList.remove('champ-applique');
      void bloc.offsetWidth; // relance l'animation
      bloc.classList.add('champ-applique');
    };
    if ('points' in ch) { b.plafondManuel = false; poser('#r-points', ch.points); }
    if ('sets' in ch) poser('#r-sets', ch.sets);
    if ('formatFinale' in ch) {
      poser('#r-format-finale', true);
      poser('#r-finale-sets', ch.finaleSets);
      poser('#r-finale-points', ch.finalePoints);
      poser('#r-finale-meilleur', ch.finaleAuMeilleur);
    }
    if ('dureeLimite' in ch) poser('#r-duree', ch.dureeLimite);
    if (ch.cat) {
      b.maxManuel[ch.cat.cle] = false;
      poser('#r-cat-' + ch.cat.cle + '-tous', false);
      poser('#r-cat-' + ch.cat.cle, ch.cat.k);
    }
    if ('nbPoules' in ch) poser('#r-poules', ch.nbPoules);
    if ('terrains' in ch) poser('#r-terrains', ch.terrains);
    if ('reposMin' in ch) poser('#r-repos', ch.reposMin);
    $('#r-info').textContent = 'Changement appliqué : ' + solution.texte.charAt(0).toLowerCase() + solution.texte.slice(1) + '. Enregistre pour le garder.';
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
    // Sans recréation des matchs, chaque équipe garde sa poule et son abandon (seuls le nom et les
    // joueurs changent). Avec recréation, tout repart de zéro.
    const nouvellesEquipes = (tt, recreer) => saisies.map((e) => {
      const ancienne = tt.equipes.find((x) => x.id === e.id);
      if (ancienne && !recreer) return Object.assign({}, ancienne, e);
      // Matchs recréés : l'heure d'arrivée (pointage) est gardée, c'est un fait.
      return ancienne && ancienne.arrivee ? Object.assign({}, e, { arrivee: ancienne.arrivee }) : e;
    });
    const nouveauNom = b.nom.trim() || 'Tournoi loisir';
    $('#r-enregistrer').disabled = true;
    const resultat = await agir((tt) => {
      const recreer = structureChangee(tt);
      const pointageAvant = BT.pointageActif(tt);
      tt.nom = nouveauNom;
      tt.reglages = nouveauxReglages;
      if (BT.pointageActif(tt) && !pointageAvant) BT.pointerEquipesVenues(tt);
      if (tt.fermes) { tt.fermes = BT.terrainsFermes(tt); if (!tt.fermes.length) delete tt.fermes; }
      tt.equipes = nouvellesEquipes(tt, recreer);
      if (recreer) BT.genererMatchs(tt);
      else {
        if (tt.finale) BT.avancerTableau(tt);
        // Gagnants contre gagnants : un nouvel écart ou un autre nombre de matchs peut créer des matchs.
        if (BT.estSuisse(tt)) BT.apparierSuisse(tt);
        if (BT.appelAutoActif(tt) && BT.demarre(tt)) BT.remplirTerrains(tt);
      }
      return true;
    });
    $('#r-enregistrer').disabled = false;
    if (!resultat) return;
    brouillon = null;
    brouillonModifie = false;
    if (structure) {
      changerOnglet('regles');
      window.scrollTo(0, 0);
    } else {
      rendreReglages();
      $('#r-info').textContent = 'Réglages enregistrés.';
    }
  }

  /* ---------- Choisir un match (match imposé par l'organisateur) ---------- */

  let dialogueMatch = null;
  function ouvrirChoixMatch(premiere) {
    if (!t || t.finale) return;
    if (!dialogueMatch) {
      dialogueMatch = document.createElement('dialog');
      dialogueMatch.className = 'dialogue';
      dialogueMatch.id = 'dialogue-match';
      dialogueMatch.setAttribute('aria-labelledby', 'match-titre');
      dialogueMatch.innerHTML = '<form id="form-match" novalidate><h2 id="match-titre">Choisir un match</h2>'
        + '<p class="note">Choisis deux équipes : le site les fait jouer ensemble, même si ce n’est pas le match qu’il aurait appelé.</p>'
        + '<div class="grille-match">'
        + '<div class="champ"><label for="match-a">Première équipe</label><select id="match-a"></select></div>'
        + '<div class="champ"><label for="match-b">Deuxième équipe</label><select id="match-b"></select></div>'
        + '<div class="champ" id="match-cat-bloc" hidden><label for="match-cat">Catégorie</label><select id="match-cat"></select></div>'
        + '</div>'
        + '<div class="match-infos" id="match-infos" aria-live="polite"></div>'
        + '<div class="dialogue-actions">'
        + '<button type="button" class="bouton discret" id="match-annuler">Annuler</button>'
        + '<button type="button" class="bouton" id="match-priorite">Le faire passer en premier</button>'
        + '<button type="button" class="bouton principal" id="match-lancer">Lancer maintenant</button>'
        + '</div></form>';
      document.body.appendChild(dialogueMatch);
      dialogueMatch.addEventListener('change', majChoixMatch);
      $('#match-annuler').addEventListener('click', () => dialogueMatch.close());
      $('#match-priorite').addEventListener('click', () => validerChoixMatch(false));
      $('#match-lancer').addEventListener('click', () => validerChoixMatch(true));
    }
    const suisse = BT.estSuisse(t);
    const victoires = suisse ? new Map(BT.classement(t).map((l) => [l.equipe.id, l.V + l.N / 2])) : null;
    const actives = t.equipes.filter((e) => !e.abandon);
    const libelle = (e) => esc(e.nom) + (suisse ? ' (' + texteVictoires(victoires.get(e.id) || 0) + ')' : BT.avecPoules(t) ? ' (' + BT.nomPoule(e.poule) + ')' : '');
    const options = actives.map((e) => '<option value="' + esc(e.id) + '">' + libelle(e) + '</option>').join('');
    $('#match-a').innerHTML = options;
    $('#match-b').innerHTML = options;
    const a = actives.find((e) => e.id === premiere) || actives[0];
    if (a) $('#match-a').value = a.id;
    const b = actives.find((e) => e.id !== (a && a.id));
    if (b) $('#match-b').value = b.id;
    const cats = suisse ? [] : BT.categoriesJouees(t.reglages);
    $('#match-cat-bloc').hidden = cats.length < 2;
    $('#match-cat').innerHTML = cats.map((c) => '<option value="' + c.cle + '">' + esc(c.nom) + '</option>').join('');
    majChoixMatch();
    dialogueMatch.showModal();
  }

  function lireChoixMatch() {
    return { a: $('#match-a').value, b: $('#match-b').value, categorie: $('#match-cat-bloc').hidden ? null : $('#match-cat').value };
  }

  function majChoixMatch() {
    if (!dialogueMatch || !t) return;
    const { a, b, categorie } = lireChoixMatch();
    const info = BT.infosMatchImpose(t, a, b, categorie);
    const nA = esc(BT.nomEquipe(t, a));
    const nB = esc(BT.nomEquipe(t, b));
    const lignes = [];
    if (a === b) lignes.push('<p class="match-alerte">Choisis deux équipes différentes.</p>');
    else {
      const ensemble = info.enCoursA && info.enCoursA === info.enCoursB;
      if (ensemble) lignes.push('<p>Elles jouent ensemble en ce moment sur le terrain ' + info.enCoursA.terrain + ' : le nouveau match partira après celui-ci.</p>');
      else [[info.enCoursA, nA], [info.enCoursB, nB]].forEach(([m, n]) => { if (m) lignes.push('<p>' + n + ' joue en ce moment sur le terrain ' + m.terrain + '. Le match partira à la fin de son match.</p>'); });
      [[info.pointeeA, nA], [info.pointeeB, nB]].forEach(([ok, n]) => { if (!ok) lignes.push('<p>' + n + ' n’est pas encore pointée.</p>'); });
      if (info.prevu) {
        const num = BT.numero(t, info.prevu);
        lignes.push('<p>Leur match' + (num ? ' n° ' + num : '') + (BT.categorieMatch(t, info.prevu) && BT.categoriesJouees(t.reglages).length > 1 ? ' en ' + esc(BT.categorieMatch(t, info.prevu).toLowerCase()) : '') + ' est déjà prévu' + (info.prevu.priorite ? ' et passe déjà en premier' : '') + '.</p>');
      } else if (info.suisse) {
        lignes.push('<p>' + nA + ' a ' + texteVictoires(info.victoiresA) + ', ' + nB + ' en a ' + String(info.victoiresB).replace('.', ',') + '.</p>');
      } else {
        lignes.push('<p class="match-alerte">' + (info.memePoule ? 'Ce match n’est pas prévu : il s’ajoute au tournoi et compte au classement.'
          : 'Ce match n’est pas prévu et les deux équipes ne sont pas dans la même poule : il s’ajoute au tournoi sans compter dans le classement des poules.') + '</p>');
      }
      // Revanche : permise, le site le dit simplement (ce n'est pas un refus).
      if (info.joues.length) {
        lignes.push('<p>Elles se sont déjà rencontrées (' + info.joues.map((m) => esc(BT.texteScore(m))).join(', ') + ') : elles rejoueront quand même ensemble.</p>');
      }
      info.enPlus.forEach((x) => lignes.push('<p class="match-alerte">' + esc(BT.nomEquipe(t, x)) + ' a déjà tous ses matchs : ce sera un match en plus.</p>'));
      if (info.defaits.length) lignes.push('<p>Leurs autres matchs pas encore appelés sont retirés, leurs adversaires en retrouvent un autre.</p>');
      if (BT.statut(t) === 'pret') lignes.push('<p>Le tournoi n’est pas encore lancé. « Lancer maintenant » le lance avec ce match.</p>');
      else if (!info.terrain && !info.enCoursA && !info.enCoursB) lignes.push('<p>Aucun terrain libre pour l’instant : le match partira dès qu’un terrain se libère.</p>');
    }
    $('#match-infos').innerHTML = lignes.join('');
    const lancer = $('#match-lancer');
    lancer.disabled = !info.possible || !info.terrain;
    lancer.textContent = info.terrain ? 'Lancer maintenant sur le terrain ' + info.terrain : 'Lancer maintenant';
    $('#match-priorite').disabled = !info.possible || !!(info.prevu && info.prevu.priorite);
  }

  async function validerChoixMatch(maintenant) {
    const { a, b, categorie } = lireChoixMatch();
    const info = BT.infosMatchImpose(t, a, b, categorie);
    if (!info.possible || (maintenant && !info.terrain)) return;
    const terrain = maintenant ? info.terrain : null;
    dialogueMatch.close();
    let fait = false;
    await agir((tt) => {
      fait = !!BT.imposerMatch(tt, a, b, { terrain, categorie });
      return fait;
    });
    if (!fait) toast('Ce match n’a pas pu être créé, réessaie.');
    else toast(terrain ? 'Match lancé sur le terrain ' + terrain + '.' : 'Match placé en premier : il part dès que les deux équipes sont libres.');
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
    $('#score-titre').textContent = 'Match ' + BT.numero(t, m) + (m.statut === 'en_cours' ? ', terrain ' + m.terrain : '');
    $('#score-format').textContent = [BT.categorieMatch(t, m), BT.etiquetteMatch(t, m)].filter(Boolean).join(', ') + (BT.categorieMatch(t, m) || BT.etiquetteMatch(t, m) ? '. ' : '') + BT.texteFormat(reg);
    $('#score-recus').innerHTML = recus.map((p, i) => '<div class="score-recu"><span>Score envoyé par ' + nom(p.equipeId) + ' : <strong>' + esc(texteSets(p.sets)) + '</strong></span>'
      + '<button type="button" class="bouton petit" data-reprendre="' + i + '">Reprendre</button></div>').join('');
    $('#score-recus').hidden = !recus.length;
    const max = BT.maxPointsSet(reg);
    const attr = ' inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" data-max="' + (max || '') + '"';
    let h = '<span></span><span class="score-equipe">' + nom(m.a) + '</span><span class="score-equipe">' + nom(m.b) + '</span>';
    for (let i = 0; i < n; i++) {
      h += '<span class="score-set">Set ' + (i + 1) + '</span>'
        + '<input type="text"' + attr + ' aria-label="Set ' + (i + 1) + ', ' + nom(m.a) + '">'
        + '<input type="text"' + attr + ' aria-label="Set ' + (i + 1) + ', ' + nom(m.b) + '">';
    }
    $('#score-grille').innerHTML = h;
    $('#score-max').textContent = max ? 'Le score maximum d’un set est ' + max + ' points.' : '';
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
    // Au-delà du score maximum du set, la case passe en rouge.
    champs.forEach((c) => {
      const max = Number(c.dataset.max) || 0;
      c.toggleAttribute('data-trop', !!max && Number(c.value) > max);
    });
    $('#score-max').hidden = !document.querySelector('#score-grille input[data-trop]');
  }

  function lireDialogue() {
    const champs = Array.from(document.querySelectorAll('#score-grille input'));
    const paires = [];
    for (let i = 0; i < champs.length; i += 2) paires.push([champs[i].value, champs[i + 1].value]);
    return BT.lireSaisie(paires);
  }

  $('#score-grille').addEventListener('input', (e) => {
    // 2 chiffres au plus ; deux chiffres tapés, on passe à la case suivante.
    const champ = e.target;
    const propre = BT.chiffresScore(champ.value);
    if (propre !== champ.value) champ.value = propre;
    if (propre.length === 2 && e.inputType && e.inputType.indexOf('insert') === 0) {
      const cases = Array.from(document.querySelectorAll('#score-grille input'));
      const suivante = cases[cases.indexOf(champ) + 1];
      if (suivante) { suivante.focus(); suivante.select(); }
    }
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
    if (mScore && mScore.statut === 'termine' && BT.suiteCommencee(t, mScore)
      && BT.resultat({ sets: lu.sets }).gagnant !== BT.resultat(mScore).gagnant) {
      messageScore('erreur', 'Le match suivant du tableau a déjà commencé : le vainqueur ne peut plus changer. Reporte ce match suivant ou efface son résultat d’abord.');
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
      const avant = BT.demarre(tt);
      BT.enregistrerScore(tt, m, lu.sets);
      if (!avant && BT.demarre(tt) && BT.appelAutoActif(tt)) BT.remplirTerrains(tt);
      return true;
    }).then((resultat) => {
      if (resultat && propositions[matchId]) D.retirerProposition(id, matchId).catch(() => {});
    });
  });

  $('#score-annuler').addEventListener('click', () => dialogue.close());

  $('#score-effacer').addEventListener('click', () => {
    const m = trouver(t, matchScoreId);
    if (m && BT.suiteCommencee(t, m)) {
      messageScore('erreur', 'Le match suivant du tableau a déjà commencé. Reporte-le ou efface son résultat d’abord.');
      return;
    }
    const partie = m && [m.a, m.b].find((x) => BT.equipe(t, x).abandon);
    if (partie) {
      messageScore('erreur', BT.nomEquipe(t, partie) + ' a abandonné. Pour remettre ce match à jouer, annule d’abord son abandon (Réglages, liste des équipes).');
      return;
    }
    if (!m || !confirm('Effacer le résultat du match ' + BT.numero(t, m) + ' ? Il repassera dans les matchs à jouer.')) return;
    const matchId = matchScoreId;
    dialogue.close();
    agir((tt) => {
      const x = trouver(tt, matchId);
      return !!x && BT.effacerResultat(tt, x);
    });
  });

  $('#score-forfait').addEventListener('click', (e) => {
    const b = e.target.closest('[data-forfait]');
    if (!b) return;
    const m = trouver(t, matchScoreId);
    const perdant = b.dataset.forfait;
    if (m && m.statut === 'termine' && BT.suiteCommencee(t, m)) {
      messageScore('erreur', 'Le match suivant du tableau a déjà commencé. Reporte-le ou efface son résultat d’abord.');
      return;
    }
    if (!m || !confirm(BT.nomEquipe(t, perdant) + ' déclare forfait pour le match ' + BT.numero(t, m) + ' ? L’autre équipe gagne le match.')) return;
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
    const lignes = [['Match', 'Catégorie', 'Phase', 'Équipe 1', 'Équipe 2', 'État', 'Terrain', 'Score', 'Gagnant', 'Début', 'Fin']];
    t.matchs.slice().sort((x, y) => BT.numero(t, x) - BT.numero(t, y)).forEach((m) => {
      const r = BT.resultat(m);
      const fini = m.statut === 'termine';
      lignes.push([BT.numero(t, m), BT.categorieMatch(t, m), BT.etiquetteMatch(t, m), BT.nomEquipe(t, m.a), BT.nomEquipe(t, m.b), etats[m.statut] + (m.forfait ? ' (forfait ' + BT.nomEquipe(t, m.forfait) + ')' : ''),
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
      case 'choisir-match':
        ouvrirChoixMatch(el.dataset.equipe);
        break;
      case 'forcer-suisse': {
        const voulu = Number(el.dataset.terrain);
        agir((tt) => {
          const libresTt = BT.terrainsLibres(tt);
          const terrain = libresTt.includes(voulu) ? voulu : libresTt[0];
          if (!terrain) return false;
          const m = BT.forcerMatchSuisse(tt);
          if (!m) return false;
          BT.lancer(tt, m, terrain);
          return true;
        });
        break;
      }
      case 'voir-solutions':
        changerOnglet('reglages');
        // L'estimation des réglages s'affiche un instant après (calcul différé).
        setTimeout(() => { const zone = $('#r-horaires'); if (zone) zone.scrollIntoView({ block: 'center' }); }, 350);
        break;
      case 'solution': {
        const solution = solutionsAffichees[Number(el.dataset.index)];
        if (solution && brouillon) appliquerSolution(solution);
        break;
      }
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
      case 'feuille':
        imprimerFeuille();
        break;
      case 'sauvegarde': {
        const maintenant = new Date();
        const horodatage = maintenant.toISOString().slice(0, 16).replace(/[-:T]/g, '');
        const contenu = JSON.stringify({ format: 'badminton-tournoi-loisir', version: 1, date: maintenant.toISOString(), tournoi: t }, null, 1);
        const lien = document.createElement('a');
        lien.href = URL.createObjectURL(new Blob([contenu], { type: 'application/json' }));
        lien.download = nomFichier('sauvegarde-' + horodatage).replace(/\.csv$/, '.json');
        document.body.appendChild(lien);
        lien.click();
        setTimeout(() => { URL.revokeObjectURL(lien.href); lien.remove(); }, 1000);
        break;
      }
      case 'fiches':
        imprimerFiches();
        break;
      case 'photos-zip':
        telechargerPhotos();
        break;
      case 'tout-pointer': {
        const n = BT.equipesAttendues(t).length;
        if (!n || !confirm(n > 1 ? 'Pointer les ' + n + ' équipes pas encore arrivées ?' : 'Pointer la dernière équipe pas encore arrivée ?')) break;
        agir((tt) => {
          const attendues = BT.equipesAttendues(tt).map((e) => e.id);
          attendues.forEach((x) => BT.pointer(tt, x));
          if (attendues.length) BT.apresPointage(tt);
          return attendues.length > 0;
        });
        break;
      }
      case 'son-orga': {
        const activer = !(sonOrgaVoulu() && BT.sonActif());
        try { localStorage.setItem(CLE_SON_ORGA, activer ? 'oui' : 'non'); } catch (err) { /* stockage indisponible */ }
        if (activer) {
          BT.activerSon();
          setTimeout(() => { BT.bip(); rendreOutils(); }, 60);
        }
        rendreOutils();
        break;
      }
      case 'pointer': {
        const equipeId = el.dataset.equipe;
        el.disabled = true;
        agir((tt) => pointerEquipe(tt, equipeId)).then(() => {
          if (el.isConnected) el.disabled = false;
          return D.retirerArrivee(id, equipeId).catch(() => {});
        });
        break;
      }
      case 'depointer': {
        const equipeId = el.dataset.equipe;
        if (!confirm('Annuler le pointage de « ' + BT.nomEquipe(t, equipeId) + ' » ? Ses matchs ne seront plus appelés tant qu’elle n’est pas pointée.')) break;
        D.retirerArrivee(id, equipeId).catch(() => {}).then(() => agir((tt) => {
          if (!BT.annulerPointage(tt, equipeId)) return false;
          BT.apresPointage(tt);
          return true;
        }));
        break;
      }
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
          // Un terrain libre peut maintenant recevoir un match (priorité posée ou retirée).
          if (BT.appelAutoActif(tt) && BT.demarre(tt)) BT.remplirTerrains(tt);
          return true;
        });
        break;
      }
      case 'abandon': {
        const equipeId = el.dataset.equipe;
        if (confirm('Abandon de l’équipe « ' + BT.nomEquipe(t, equipeId) + ' » ? Tous ses matchs restants seront perdus par forfait.')) {
          agir((tt) => { BT.abandonEquipe(tt, equipeId); return true; }).then(() => { if (brouillon) rendreListeEquipes(); });
        }
        break;
      }
      case 'annuler-abandon': {
        const equipeId = el.dataset.equipe;
        if (!BT.abandonAnnulable(t, equipeId)) {
          alert('Impossible d’annuler cet abandon : la suite du tableau de la phase finale a déjà commencé.');
          break;
        }
        if (confirm('Annuler l’abandon de l’équipe « ' + BT.nomEquipe(t, equipeId) + ' » ? Ses matchs perdus par forfait à cause de l’abandon redeviendront à jouer.')) {
          agir((tt) => BT.annulerAbandon(tt, equipeId)).then(() => { if (brouillon) rendreListeEquipes(); });
        }
        break;
      }
      case 'coller-liste':
      case 'coller-fermer': {
        const zone = $('#r-coller');
        if (!zone) break;
        const ouvrir = el.dataset.action === 'coller-liste' && zone.hidden;
        zone.hidden = !ouvrir;
        const bouton = document.querySelector('[data-action="coller-liste"]');
        if (bouton) bouton.setAttribute('aria-expanded', String(ouvrir));
        $('#r-coller-erreur').hidden = true;
        if (ouvrir) $('#r-coller-texte').focus();
        else if (bouton) bouton.focus();
        break;
      }
      case 'coller-remplir': {
        const lues = BT.lireListeEquipes($('#r-coller-texte').value);
        const erreur = $('#r-coller-erreur');
        if (lues.length < 2) {
          erreur.textContent = lues.length ? 'Il faut au moins deux équipes : mets une équipe par ligne.' : 'Colle d’abord ta liste, une équipe par ligne.';
          erreur.hidden = false;
          break;
        }
        const retenues = lues.slice(0, 64);
        changerNbEquipes(retenues.length);
        retenues.forEach((x, i) => {
          brouillon.equipes[i].nom = x.nom || 'Équipe ' + (i + 1);
          brouillon.equipes[i].joueurs = x.joueurs;
        });
        brouillonModifie = true;
        $('#r-equipes').value = retenues.length;
        rendreListeEquipes();
        verifierNoms();
        majReglages();
        $('#r-coller').hidden = true;
        $('#r-coller-texte').value = '';
        const bouton = document.querySelector('[data-action="coller-liste"]');
        if (bouton) bouton.setAttribute('aria-expanded', 'false');
        $('#r-info').textContent = pluriel(retenues.length, 'équipe remplie', 'équipes remplies') + ' d’après ta liste'
          + (lues.length > 64 ? ' (64 au plus, les suivantes sont ignorées)' : '') + '. Vérifie les noms, puis enregistre.';
        $('#r-liste-equipes').scrollIntoView({ block: 'start', behavior: 'smooth' });
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
        if (m && confirm('Refuser le score envoyé pour le match ' + BT.numero(t, m) + ' ? Les joueurs pourront en envoyer un autre.')) {
          D.retirerProposition(id, matchId).catch((err) => toast('Impossible de refuser. ' + err.message));
        }
        break;
      case 'reporter':
        if (m && confirm('Reporter le match ' + BT.numero(t, m) + ' (' + BT.nomEquipe(t, m.a) + ' contre ' + BT.nomEquipe(t, m.b) + ') ? Il passe après les autres matchs à jouer, et n’est rappelé que si aucun autre match ne peut prendre le terrain.')) {
          agir((tt) => {
            const x = trouver(tt, matchId);
            if (!x || x.statut === 'termine') return false;
            BT.reporter(tt, x);
            return true;
          });
        }
        break;
      case 'mdp-oublier':
        D.oublierMotsDePasse();
        rendrePartager();
        toast('Tes prochains tournois n’auront plus de mot de passe automatiquement.');
        break;
      case 'mdp-supprimer': {
        const idAcces = el.dataset.id;
        const qui = el.dataset.nom ? ' de ' + el.dataset.nom : '';
        if (confirm('Supprimer le mot de passe' + qui + ' ? Les appareils déjà organisateurs le restent.')) {
          agir((tt) => { BT.retirerAcces(tt, idAcces); return true; }).then((r) => { if (r) toast('Mot de passe' + qui + ' supprimé.'); });
        }
        break;
      }
      case 'imprimer-regles':
        $('#regles').classList.add('imprimer');
        window.print();
        $('#regles').classList.remove('imprimer');
        break;
      case 'basculer-terrain':
      case 'ouvrir-terrain': {
        const n = Number(el.dataset.terrain);
        if (el.dataset.action === 'ouvrir-terrain' || BT.terrainFerme(t, n)) {
          agir((tt) => {
            BT.ouvrirTerrain(tt, n);
            if (BT.appelAutoActif(tt) && BT.demarre(tt)) BT.remplirTerrains(tt);
            return true;
          });
          break;
        }
        const occupe = BT.matchsEnCours(t).some((m) => m.terrain === n);
        if (!confirm('Fermer le terrain ' + n + ' ? Aucun match n’y sera plus appelé' + (occupe ? ' après celui en cours' : '') + '. Tu pourras le rouvrir à tout moment.')) break;
        agir((tt) => { BT.fermerTerrain(tt, n); return true; });
        break;
      }
      case 'appeler': {
        const terrain = Number(el.dataset.terrain);
        // Même choix que l'appel automatique (repos compris). Pour forcer un match, il y a « Jouer ».
        const essai = JSON.parse(JSON.stringify(t));
        if (!BT.remplirTerrains(essai, null, [terrain]).length) {
          const attente = BT.attenteRepos(t);
          toast(attente > 0
            ? 'Les équipes libres se reposent encore ' + Math.max(1, Math.ceil(attente / 60000)) + ' min. Pour lancer un match quand même, utilise « Jouer » dans la liste « À suivre ».'
            : 'Aucun match ne peut être appelé pour l’instant.');
          break;
        }
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
          const avant = BT.demarre(tt);
          BT.lancer(tt, x, libres[0]);
          if (!avant && BT.appelAutoActif(tt)) BT.remplirTerrains(tt);
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
        if (confirm('Supprimer « ' + t.nom + ' » ? ' + (t.reglages.photos !== false ? 'Les équipes, les matchs, les scores et les photos seront effacés.' : 'Les équipes, les matchs et les scores seront effacés.'))) {
          D.supprimer(t.id).then(() => { location.href = './'; }).catch((err) => toast('Suppression impossible. ' + err.message));
        }
        break;
      default:
        break;
    }
  });

  document.addEventListener('change', (e) => { if (e.target.id === 'mdp-retenir') retenirMdp = e.target.checked; });
  document.addEventListener('click', (e) => {
    const surBouton = e.target.closest && e.target.closest('[data-action="son-orga"]');
    if (!surBouton && sonOrgaVoulu() && !BT.sonActif()) {
      BT.activerSon();
      setTimeout(() => { if (t && t.matchs.length) rendreOutils(); }, 60);
    }
  });

  // Dès que les matchs sont créés et jusqu'à la fin du tournoi, la page de gestion garde l'écran allumé :
  // c'est elle qui appelle les matchs et reçoit les arrivées pointées depuis les téléphones (utile sur
  // une tablette ou un téléphone à la table de marque). Le verrou est redemandé s'il est relâché.
  let verrouEcran = null;
  let demandeVerrou = false;
  function majIndicateurEcran() {
    const el = $('#ecran-allume');
    if (el) el.hidden = !verrouEcran;
  }
  async function garderEcranAllume() {
    const st = t ? BT.statut(t) : '';
    const voulu = (st === 'pret' || st === 'en_cours') && !document.hidden;
    if (!voulu) {
      if (verrouEcran) verrouEcran.release().catch(() => {});
      verrouEcran = null;
      majIndicateurEcran();
      return;
    }
    if (verrouEcran || demandeVerrou || !('wakeLock' in navigator)) { majIndicateurEcran(); return; }
    demandeVerrou = true;
    try {
      verrouEcran = await navigator.wakeLock.request('screen');
      verrouEcran.addEventListener('release', () => {
        verrouEcran = null;
        majIndicateurEcran();
        setTimeout(garderEcranAllume, 1000);
      });
    } catch (e) {
      verrouEcran = null; // refusé sans geste sur la page : nouvel essai au prochain clic
    } finally {
      demandeVerrou = false;
      majIndicateurEcran();
    }
  }
  document.addEventListener('visibilitychange', garderEcranAllume);
  document.addEventListener('click', () => { if (!verrouEcran) garderEcranAllume(); });

  // Liste des équipes pointées : reste dépliée d'un affichage à l'autre.
  document.addEventListener('toggle', (e) => {
    if (e.target.classList && e.target.classList.contains('pointees')) pointeesOuvert = e.target.open;
  }, true);
  document.addEventListener('input', surSaisieReglages);
  document.addEventListener('change', surSaisieReglages);
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'filtre-equipe') return;
    filtreEquipe = e.target.value;
    rendreMatchs();
  });
  setInterval(majChronos, 15000);

  // Avec un repos minimum, un terrain peut attendre : on appelle le match dès que le repos est fini.
  setInterval(() => {
    if (!t || !BT.appelAutoActif(t) || !BT.demarre(t) || !BT.terrainsLibres(t).length) return;
    if (BT.attenteRepos(t) !== 0) return;
    // Fin d'un repos : les matchs reportés attendent, eux, la fin d'un match (sauf s'il n'y en a plus en cours).
    agir((tt) => BT.remplirTerrains(tt, null, null, BT.matchsEnCours(tt).length ? new Set(tt.matchs.filter((m) => m.reporte).map((m) => m.id)) : null).length > 0);
  }, 15000);
  document.addEventListener('submit', (e) => {
    if (e.target.id === 'form-reglages') {
      e.preventDefault();
      enregistrerReglages();
    }
    if (e.target.id === 'form-mdp') {
      e.preventDefault();
      enregistrerMotDePasse(e.target);
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
      try {
        await D.rejoindre(id, cle);
        history.replaceState(null, '', location.pathname + location.search);
      } catch (e) {
        const refus = /permission/i.test((e && (e.code || e.message)) || '');
        messagePlein(refus ? 'Lien organisateur refusé' : 'Connexion impossible',
          refus ? 'Ce lien organisateur n’est pas valide pour ce tournoi.' : 'Vérifie la connexion internet, puis recharge la page.',
          refus ? null : '<button type="button" class="bouton principal" onclick="location.reload()">Recharger la page</button>');
        return;
      }
    }
    if (!D.estOrganisateur(id)) {
      const lienEquipes = 'equipe.html?t=' + encodeURIComponent(id);
      messagePlein(D.enLigne ? 'Page réservée aux organisateurs' : 'Ce tournoi n’est pas sur cet appareil',
        D.enLigne
          ? 'Pour gérer ce tournoi, ouvre le lien organisateur envoyé par la personne qui l’a créé, ou entre le mot de passe organisateur s’il y en a un. Pour suivre ton équipe, va sur la page des équipes.'
          : 'Les tournois sont enregistrés dans le navigateur où ils ont été créés.',
        D.enLigne ? '<a class="bouton principal" href="' + lienEquipes + '">Page des équipes</a>' : null);
      if (D.enLigne) {
        $('.contenu .carte').insertAdjacentHTML('beforeend', '<div id="acces-mdp"></div>');
        D.suivre(id, (lu) => {
          const zone = $('#acces-mdp');
          if (!lu || !lu.acces || !zone) return;
          zone.acces = lu.acces;
          formulaireAcces(lu.acces);
        });
      }
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
      traiterArrivees();
    });

    D.suivreArrivees(id, (a) => {
      arriveesRecues = a || {};
      traiterArrivees();
    });

    D.suivrePropositions(id, (p) => {
      const cles = Object.keys(p || {}).flatMap((mid) => Object.keys((p || {})[mid] || {}).map((eq) => mid + '/' + eq));
      if (clesPropositions && cles.some((k) => !clesPropositions.has(k))) bipOrga();
      clesPropositions = new Set(cles);
      propositions = p || {};
      if (!t) return;
      rendre();
      traiterPropositions();
    });
  }

  demarrer();
})();
