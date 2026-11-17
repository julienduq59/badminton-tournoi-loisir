/* Tournoi de badminton loisir : logique commune à toutes les pages
   (stockage, calendrier des matchs, appel sur les terrains, scores, classement). */
(function (global) {
  'use strict';

  // Exemple de départ : 15 équipes, 7 terrains, 1 set de 15 points avec 2 points d'écart.
  const REGLAGES_DEFAUT = {
    nbEquipes: 15,
    tousContreTous: true,
    matchsParEquipe: 14,
    sets: 1,
    auMeilleur: true,
    points: 15,
    ecart2: true,
    plafond: 21,
    terrains: 7,
    appelAuto: true,
    scoresJoueurs: true,
    validationAuto: false,
    dureeLimite: 0,
    // Déroulement : une seule poule (championnat) ou plusieurs poules, puis phase finale éventuelle.
    format: 'championnat',
    nbPoules: 3,
    phaseFinale: 0,          // championnat : nombre d'équipes qualifiées (0 = pas de phase finale)
    qualifiesParPoule: 2,    // poules : qualifiés par poule (0 = pas de phase finale)
    petiteFinale: true,      // match pour la 3e place
    formatFinale: false,     // format de match propre à la phase finale
    finaleSets: 1,
    finaleAuMeilleur: true,
    finalePoints: 21,
  };

  const LETTRES = 'ABCDEFGH';
  const nomPoule = (p) => 'Poule ' + LETTRES[p];

  // Score maximum proposé par défaut : 21 points → 30, 15 points → 21.
  function plafondAuto(points) {
    return points + Math.ceil(points * 0.4);
  }

  /* ---------- Outils ---------- */

  function uid(n) {
    n = n || 8;
    const alphabet = 'abcdefghijkmnopqrstuvwxyz23456789';
    const octets = global.crypto && global.crypto.getRandomValues
      ? global.crypto.getRandomValues(new Uint8Array(n))
      : Array.from({ length: n }, () => Math.floor(Math.random() * 256));
    let s = '';
    for (const x of octets) s += alphabet[x % alphabet.length];
    return s;
  }

  function esc(texte) {
    return String(texte == null ? '' : texte)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function entier(valeur, min, max, defaut) {
    const n = parseInt(valeur, 10);
    if (Number.isNaN(n)) return defaut;
    return Math.min(max, Math.max(min, n));
  }

  /* ---------- Tournoi ---------- */

  function nouveauTournoi() {
    const t = {
      v: 1,
      id: uid(10),
      nom: 'Tournoi loisir',
      cree: Date.now(),
      maj: Date.now(),
      reglages: Object.assign({}, REGLAGES_DEFAUT),
      equipes: [],
      matchs: [],
    };
    ajusterEquipes(t, t.reglages.nbEquipes);
    return t;
  }

  function ajusterEquipes(t, n) {
    while (t.equipes.length < n) {
      t.equipes.push({ id: 'e' + uid(6), nom: 'Équipe ' + (t.equipes.length + 1), joueurs: '' });
    }
    t.equipes.length = n;
  }

  function equipe(t, id) {
    return t.equipes.find((e) => e.id === id) || { id, nom: 'Équipe supprimée', joueurs: '' };
  }

  function nomEquipe(t, id) {
    return equipe(t, id).nom;
  }

  function statut(t) {
    if (!t.matchs.length) return 'preparation';
    if (t.matchs.every((m) => m.statut === 'termine') && !finaleAttendue(t)) return 'termine';
    if (demarre(t)) return 'en_cours';
    return 'pret';
  }

  const LIBELLES_STATUT = {
    preparation: 'En préparation',
    pret: 'Prêt à démarrer',
    en_cours: 'En cours',
    termine: 'Terminé',
  };

  function texteFormat(reg) {
    const n = reg.sets;
    let s;
    if (n === 1) s = '1 set';
    else if (reg.auMeilleur && n % 2 === 1) s = (n + 1) / 2 + ' sets gagnants';
    else s = n + ' sets';
    s += ' de ' + reg.points + ' points';
    if (reg.ecart2) {
      s += reg.plafond > reg.points
        ? ', 2 points d’écart (maximum ' + reg.plafond + ')'
        : ', 2 points d’écart';
    }
    if (reg.dureeLimite > 0) s += ', ' + reg.dureeLimite + ' minutes maximum';
    return s;
  }

  /* ---------- Calendrier ---------- */

  // Retourne un message si le nombre de matchs par équipe est impossible.
  function verifierFormat(n, k) {
    if (n < 2) return 'Il faut au moins 2 équipes.';
    if (k < 1) return 'Chaque équipe doit jouer au moins 1 match.';
    if (k > n - 1) return 'Avec ' + n + ' équipes, chaque équipe peut jouer au plus ' + (n - 1) + ' matchs.';
    if (n % 2 === 1 && k % 2 === 1) {
      return 'Avec un nombre impair d’équipes (' + n + '), chaque équipe doit jouer un nombre pair de matchs (par exemple '
        + Math.max(2, k - 1) + ' ou ' + Math.min(n - 1, k + 1) + ').';
    }
    return null;
  }

  // Paires d'équipes (indices) pour que chaque équipe joue exactement k matchs.
  function paires(n, k) {
    const res = [];
    if (n % 2 === 0) {
      // Méthode du cercle : chaque tour fait jouer toutes les équipes une fois.
      const tourne = Array.from({ length: n - 1 }, (_, i) => i + 1);
      for (let r = 0; r < k; r++) {
        const ordre = [0].concat(tourne);
        for (let i = 0; i < n / 2; i++) res.push([ordre[i], ordre[n - 1 - i]]);
        tourne.unshift(tourne.pop());
      }
    } else {
      // Nombre impair : chaque équipe rencontre ses voisines à distance 1, 2… k/2.
      for (let d = 1; d <= k / 2; d++) {
        for (let i = 0; i < n; i++) res.push([i, (i + d) % n]);
      }
    }
    return res;
  }

  // Ordonne les matchs pour laisser le plus de repos possible entre deux matchs d'une même équipe.
  function ordonner(liste, n) {
    const reste = liste.map((p, i) => ({ p, i }));
    const dernier = new Array(n).fill(-1e9);
    const joues = new Array(n).fill(0);
    const plafondRepos = Math.max(2, Math.floor(n / 2));
    const sortie = [];
    while (reste.length) {
      let meilleur = 0;
      let cleMeilleure = null;
      for (let j = 0; j < reste.length; j++) {
        const [a, b] = reste[j].p;
        const repos = Math.min(sortie.length - dernier[a], sortie.length - dernier[b], plafondRepos);
        const cle = [repos, -(joues[a] + joues[b]), -reste[j].i];
        if (!cleMeilleure || comparer(cle, cleMeilleure) > 0) {
          meilleur = j;
          cleMeilleure = cle;
        }
      }
      const p = reste.splice(meilleur, 1)[0].p;
      sortie.push(p);
      dernier[p[0]] = dernier[p[1]] = sortie.length - 1;
      joues[p[0]]++;
      joues[p[1]]++;
    }
    return sortie;
  }

  function comparer(x, y) {
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  }

  // Vérifie qu'on peut faire nbPoules poules d'au moins 2 équipes.
  function verifierPoules(n, nbPoules) {
    if (nbPoules < 2) return 'Il faut au moins 2 poules.';
    if (nbPoules > LETTRES.length) return 'Il peut y avoir au plus ' + LETTRES.length + ' poules.';
    if (n < nbPoules * 2) return 'Avec ' + n + ' équipes, on peut faire au plus ' + Math.floor(n / 2) + ' poules (2 équipes minimum par poule).';
    return null;
  }

  // Taille de chaque poule : les équipes sont réparties le plus également possible.
  function taillesPoules(n, nbPoules) {
    return Array.from({ length: nbPoules }, (_, p) => Math.floor(n / nbPoules) + (p < n % nbPoules ? 1 : 0));
  }

  // Répartition en serpentin (1re équipe en A, 2e en B… puis retour) pour équilibrer les poules.
  function repartirPoules(t) {
    const P = t.reglages.format === 'poules' ? t.reglages.nbPoules : 1;
    t.equipes.forEach((e, i) => {
      if (P < 2) { delete e.poule; return; }
      const tour = Math.floor(i / P);
      const pos = i % P;
      e.poule = tour % 2 === 0 ? pos : P - 1 - pos;
    });
  }

  function avecPoules(t) {
    return t.reglages.format === 'poules';
  }

  // Liste des poules : [{ numero, nom, equipes }]. Une seule « poule » en championnat.
  function listePoules(t) {
    if (!avecPoules(t)) return [{ numero: null, nom: '', equipes: t.equipes.slice() }];
    const P = t.reglages.nbPoules;
    return Array.from({ length: P }, (_, p) => ({ numero: p, nom: nomPoule(p), equipes: t.equipes.filter((e) => e.poule === p) }));
  }

  // Message si les réglages du déroulement sont impossibles, sinon null.
  function verifierDeroulement(n, r) {
    if (r.format === 'poules') {
      const err = verifierPoules(n, r.nbPoules);
      if (err) return err;
      if (r.qualifiesParPoule > 0) {
        const plusPetite = Math.min(...taillesPoules(n, r.nbPoules));
        if (r.qualifiesParPoule > plusPetite) return 'La plus petite poule compte ' + plusPetite + ' équipes : on ne peut pas en qualifier ' + r.qualifiesParPoule + ' par poule.';
        if (r.qualifiesParPoule * r.nbPoules < 2) return 'Il faut au moins 2 équipes qualifiées pour la phase finale.';
      }
      return null;
    }
    const err = verifierFormat(n, r.matchsParEquipe);
    if (err) return err;
    if (r.phaseFinale > n) return 'La phase finale demande ' + r.phaseFinale + ' équipes qualifiées, il n’y en a que ' + n + '.';
    return null;
  }

  function genererMatchs(t) {
    const r = t.reglages;
    const n = t.equipes.length;
    const erreur = verifierDeroulement(n, r);
    if (erreur) throw new Error(erreur);
    delete t.finale;
    repartirPoules(t);
    let liste;
    if (avecPoules(t)) {
      liste = [];
      for (let p = 0; p < r.nbPoules; p++) {
        const membres = [];
        t.equipes.forEach((e, i) => { if (e.poule === p) membres.push(i); });
        paires(membres.length, membres.length - 1).forEach(([x, y]) => liste.push([membres[x], membres[y]]));
      }
    } else {
      liste = paires(n, r.matchsParEquipe);
    }
    const ordre = ordonner(liste, n);
    t.matchs = ordre.map(([a, b], i) => {
      const m = {
        id: 'm' + uid(6),
        numero: i + 1,
        ordre: i + 1,
        a: t.equipes[a].id,
        b: t.equipes[b].id,
        statut: 'attente',
        terrain: null,
        debut: null,
        fin: null,
        sets: [],
      };
      if (avecPoules(t)) m.poule = t.equipes[a].poule;
      return m;
    });
  }

  /* ---------- Terrains ---------- */

  const parOrdre = (x, y) => x.ordre - y.ordre;

  function matchsEnCours(t) {
    return t.matchs.filter((m) => m.statut === 'en_cours').sort((x, y) => x.terrain - y.terrain);
  }

  function matchsEnAttente(t) {
    return t.matchs.filter((m) => m.statut === 'attente').sort(parOrdre);
  }

  function terrainsLibres(t) {
    const pris = new Set(matchsEnCours(t).map((m) => m.terrain));
    const libres = [];
    for (let i = 1; i <= t.reglages.terrains; i++) if (!pris.has(i)) libres.push(i);
    return libres;
  }

  // Choisit le prochain match parmi ceux dont les deux équipes sont libres :
  // d'abord les matchs mis en priorité par un organisateur, puis ceux où aucune
  // équipe ne sort du terrain, puis les équipes qui ont le moins joué, puis l'ordre de la file.
  function choisir(attente, occupees, eviter, joues) {
    let meilleur = null;
    let cleMeilleure = null;
    for (const m of attente) {
      if (occupees.has(m.a) || occupees.has(m.b)) continue;
      const cle = [
        m.priorite ? 0 : 1,
        eviter && (eviter.has(m.a) || eviter.has(m.b)) ? 1 : 0,
        (joues.get(m.a) || 0) + (joues.get(m.b) || 0),
        m.ordre,
      ];
      if (!cleMeilleure || comparer(cle, cleMeilleure) < 0) {
        meilleur = m;
        cleMeilleure = cle;
      }
    }
    return meilleur;
  }

  // Nombre de matchs commencés ou terminés par équipe.
  function compterJoues(t) {
    const joues = new Map();
    t.matchs.forEach((m) => {
      if (m.statut === 'attente') return;
      joues.set(m.a, (joues.get(m.a) || 0) + 1);
      joues.set(m.b, (joues.get(m.b) || 0) + 1);
    });
    return joues;
  }

  function prendre(m, attente, occupees, joues) {
    attente.splice(attente.indexOf(m), 1);
    occupees.add(m.a);
    occupees.add(m.b);
    joues.set(m.a, (joues.get(m.a) || 0) + 1);
    joues.set(m.b, (joues.get(m.b) || 0) + 1);
  }

  function lancer(m, terrain, maintenant) {
    m.statut = 'en_cours';
    m.terrain = terrain;
    m.debut = maintenant || Date.now();
    m.fin = null;
    delete m.priorite;
  }

  // Appelle un match sur chaque terrain libre (ou seulement sur les terrains
  // indiqués). Retourne les matchs appelés.
  function remplirTerrains(t, eviter, seulement) {
    const occupees = new Set();
    matchsEnCours(t).forEach((m) => { occupees.add(m.a); occupees.add(m.b); });
    const attente = matchsEnAttente(t);
    const joues = compterJoues(t);
    const appeles = [];
    const cibles = terrainsLibres(t).filter((n) => !seulement || seulement.includes(n));
    for (const terrain of cibles) {
      const m = choisir(attente, occupees, eviter, joues);
      if (!m) break;
      lancer(m, terrain);
      prendre(m, attente, occupees, joues);
      appeles.push(m);
    }
    return appeles;
  }

  // Le tournoi a commencé dès qu'un match a été appelé ou joué (un forfait seul ne compte pas).
  // Appel automatique actif (réglé et pas en pause).
  function appelAutoActif(t) {
    return !!t.reglages.appelAuto && !t.pause;
  }

  function demarre(t) {
    return t.matchs.some((m) => m.statut === 'en_cours' || (m.statut === 'termine' && !m.forfait));
  }

  // Ordre prévu des matchs en attente, en supposant que les matchs se terminent
  // dans l'ordre où ils ont commencé (même règle que l'appel automatique).
  // Avec une durée de match (en ms), donne aussi l'heure de début estimée de chacun.
  function planifier(t, duree, maintenant) {
    maintenant = maintenant || Date.now();
    const D = duree || 0;
    const T = Math.max(1, t.reglages.terrains);
    const enJeu = t.matchs.filter((m) => m.statut === 'en_cours')
      .sort((x, y) => (x.debut || 0) - (y.debut || 0))
      .map((m) => ({ m, fin: Math.max(maintenant, (m.debut || maintenant) + D) }));
    const attente = matchsEnAttente(t);
    const occupees = new Set();
    enJeu.forEach(({ m }) => { occupees.add(m.a); occupees.add(m.b); });
    const joues = compterJoues(t);
    let eviter = null;
    let horloge = maintenant;
    const resultat = [];
    while (attente.length) {
      if (enJeu.length < T) {
        const m = choisir(attente, occupees, eviter, joues);
        if (m) {
          resultat.push({ m, heure: D ? horloge : null });
          prendre(m, attente, occupees, joues);
          enJeu.push({ m, fin: horloge + D });
          continue;
        }
      }
      const fini = enJeu.shift();
      if (!fini) {
        attente.forEach((m) => resultat.push({ m, heure: null }));
        break;
      }
      horloge = Math.max(horloge, fini.fin);
      occupees.delete(fini.m.a);
      occupees.delete(fini.m.b);
      eviter = new Set([fini.m.a, fini.m.b]);
    }
    return resultat;
  }

  function prochains(t) {
    return planifier(t).map((x) => x.m);
  }

  // Durée habituelle d'un match (en ms) : médiane des derniers matchs joués,
  // à défaut la durée limite réglée. null tant qu'on ne peut pas l'estimer.
  function dureeMatch(t) {
    const durees = t.matchs
      .filter((m) => m.statut === 'termine' && !m.forfait && m.debut && m.fin)
      .sort((x, y) => y.fin - x.fin)
      .slice(0, 12)
      .map((m) => m.fin - m.debut)
      .filter((d) => d >= 60 * 1000 && d <= 3 * 3600 * 1000)
      .sort((a, b) => a - b);
    if (durees.length >= 3) return durees[Math.floor(durees.length / 2)];
    if (t.reglages.dureeLimite > 0) return t.reglages.dureeLimite * 60 * 1000;
    return null;
  }

  // Heure de fin estimée du tournoi, ou null.
  function finEstimee(t, maintenant) {
    maintenant = maintenant || Date.now();
    const D = dureeMatch(t);
    if (!D || !demarre(t)) return null;
    let fin = maintenant;
    t.matchs.forEach((m) => { if (m.statut === 'en_cours') fin = Math.max(fin, (m.debut || maintenant) + D); });
    planifier(t, D, maintenant).forEach((x) => { if (x.heure) fin = Math.max(fin, x.heure + D); });
    const T = Math.max(1, t.reglages.terrains);
    toursFinaleRestants(t).forEach((n) => { fin += Math.ceil(n / T) * D; });
    return fin;
  }

  // Nombre de matchs de phase finale pas encore créés, tour par tour (pour l'estimation).
  function toursFinaleRestants(t) {
    const Q = nbQualifies(t);
    if (!t.finale) {
      if (Q < 2) return [];
      let S = 2;
      while (S < Q) S *= 2;
      const tours = [Q - S / 2];
      for (let n = S / 4; n >= 1; n /= 2) tours.push(n);
      if (t.reglages.petiteFinale && S >= 4) tours[tours.length - 1] += 1;
      return tours.filter((n) => n > 0);
    }
    const R = nbTours(t);
    const tours = [];
    for (let tour = 0; tour < R; tour++) {
      let n = 0;
      for (let slot = 0; slot < t.finale.taille / Math.pow(2, tour + 1); slot++) {
        const [a, b] = participants(t, tour, slot);
        if (a === '' || b === '') continue;
        if (!matchTableau(t, tour, slot, false)) n++;
      }
      if (tour === R - 1 && R >= 2 && t.reglages.petiteFinale && !matchTableau(t, tour, 0, true)) n++;
      if (n) tours.push(n);
    }
    return tours;
  }

  // Un match prioritaire est appelé avant les autres dès que ses deux équipes sont libres.
  function prioriser(m, active) {
    if (active) m.priorite = true;
    else delete m.priorite;
  }

  // Passe un match en fin de file (équipe absente, erreur d'appel…).
  function reporter(t, m) {
    const etaitEnCours = m.statut === 'en_cours';
    m.statut = 'attente';
    m.terrain = null;
    m.debut = null;
    m.ordre = Math.max(0, ...t.matchs.map((x) => x.ordre)) + 1;
    if (etaitEnCours && appelAutoActif(t)) remplirTerrains(t, new Set([m.a, m.b]));
  }

  /* ---------- Scores ---------- */

  function resultat(m) {
    let setsA = 0, setsB = 0, ptsA = 0, ptsB = 0;
    for (const [x, y] of m.sets || []) {
      ptsA += x;
      ptsB += y;
      if (x > y) setsA++;
      else if (y > x) setsB++;
    }
    const gagnant = setsA > setsB ? 'a' : setsB > setsA ? 'b' : null;
    return { setsA, setsB, ptsA, ptsB, gagnant };
  }

  function texteScore(m) {
    return (m.sets || []).map(([x, y]) => x + '-' + y).join(' · ');
  }

  // Message d'alerte si le set ne respecte pas les réglages, sinon null.
  function verifierSet(a, b, reg) {
    if (a === b) return 'égalité';
    const g = Math.max(a, b);
    const p = Math.min(a, b);
    const P = reg.points;
    // Avec une durée maximum, un set peut s'arrêter avant le nombre de points.
    if (reg.dureeLimite > 0 && g < P) return null;
    if (!reg.ecart2) return g === P ? null : 'le set se joue en ' + P + ' points';
    const L = reg.plafond > P ? reg.plafond : Infinity;
    if (g === P && p <= P - 2) return null;
    if (g > P && g <= L && g - p === 2) return null;
    if (g === L && p === L - 1) return null;
    if (g < P) return 'le set se joue en ' + P + ' points';
    if (g > L) return 'le maximum est de ' + L + ' points';
    return 'il faut 2 points d’écart';
  }

  // sets : tableau de [scoreA, scoreB] déjà convertis en nombres.
  function verifierScore(sets, reg) {
    const alertes = [];
    sets.forEach(([a, b], i) => {
      const msg = verifierSet(a, b, reg);
      if (msg) alertes.push('Set ' + (i + 1) + ' (' + a + '-' + b + ') : ' + msg + '.');
    });
    const n = reg.sets;
    if (reg.dureeLimite > 0) return alertes;
    if (reg.auMeilleur && n > 1 && n % 2 === 1) {
      const majorite = (n + 1) / 2;
      let ga = 0, gb = 0, fin = -1;
      sets.forEach(([a, b], i) => {
        if (a > b) ga++;
        else if (b > a) gb++;
        if (fin < 0 && (ga === majorite || gb === majorite)) fin = i;
      });
      if (fin < 0) alertes.push('Aucune équipe n’a gagné ' + majorite + ' sets.');
      else if (fin < sets.length - 1) alertes.push('Le match était déjà gagné après le set ' + (fin + 1) + '.');
    } else if (sets.length !== n) {
      alertes.push(n + (n > 1 ? ' sets attendus, ' : ' set attendu, ') + sets.length + ' saisi' + (sets.length > 1 ? 's' : '') + '.');
    }
    return alertes;
  }

  function enregistrerScore(t, m, sets) {
    const etaitEnCours = m.statut === 'en_cours';
    m.sets = sets;
    m.statut = 'termine';
    delete m.forfait;
    delete m.priorite;
    if (etaitEnCours || !m.fin) m.fin = Date.now();
    if (t.finale) avancerTableau(t);
    if (etaitEnCours && appelAutoActif(t)) remplirTerrains(t, new Set([m.a, m.b]));
  }

  // Score donné par un forfait : l'équipe présente gagne tous les sets nécessaires sans perdre de point.
  function setsForfait(reg, gagnantEstA) {
    const n = reg.auMeilleur && reg.sets % 2 === 1 ? (reg.sets + 1) / 2 : reg.sets;
    return Array.from({ length: n }, () => (gagnantEstA ? [reg.points, 0] : [0, reg.points]));
  }

  // Forfait sur un seul match.
  function enregistrerForfait(t, m, perdantId) {
    enregistrerScore(t, m, setsForfait(formatMatch(t, m), perdantId === m.b));
    m.forfait = perdantId;
  }

  // Abandon d'une équipe : tous ses matchs restants sont perdus par forfait.
  function abandonEquipe(t, equipeId) {
    const lance = demarre(t);
    const e = t.equipes.find((x) => x.id === equipeId);
    if (e) e.abandon = true;
    const liberees = new Set();
    t.matchs.forEach((m) => {
      if (m.statut === 'termine' || (m.a !== equipeId && m.b !== equipeId)) return;
      if (m.statut === 'en_cours') { liberees.add(m.a); liberees.add(m.b); }
      m.sets = setsForfait(formatMatch(t, m), equipeId === m.b);
      m.statut = 'termine';
      m.fin = Date.now();
      m.forfait = equipeId;
      delete m.priorite;
    });
    if (t.finale) avancerTableau(t);
    if (lance && appelAutoActif(t)) remplirTerrains(t, liberees);
  }

  // Annule l'abandon : les matchs perdus par forfait pour cette équipe redeviennent à jouer.
  function annulerAbandon(t, equipeId) {
    const e = t.equipes.find((x) => x.id === equipeId);
    if (e) delete e.abandon;
    t.matchs.forEach((m) => {
      if (m.statut !== 'termine' || m.forfait !== equipeId) return;
      m.statut = 'attente';
      m.sets = [];
      m.fin = null;
      m.debut = null;
      m.terrain = null;
      delete m.forfait;
    });
    if (t.finale) avancerTableau(t);
    if (demarre(t) && appelAutoActif(t)) remplirTerrains(t);
  }

  /* ---------- Classement ---------- */

  // Classement de la phase de poules (ou du championnat). Avec un numéro de poule,
  // seulement les équipes de cette poule. Les matchs de phase finale ne comptent pas.
  function classement(t, poule) {
    const equipes = poule == null ? t.equipes : t.equipes.filter((e) => e.poule === poule);
    const stats = new Map(equipes.map((e) => [e.id, {
      equipe: e, J: 0, V: 0, N: 0, D: 0, setsP: 0, setsC: 0, ptsP: 0, ptsC: 0,
    }]));
    for (const m of t.matchs) {
      if (m.statut !== 'termine' || m.phase === 'finale') continue;
      const A = stats.get(m.a);
      const B = stats.get(m.b);
      if (!A || !B) continue;
      const r = resultat(m);
      A.J++; B.J++;
      A.setsP += r.setsA; A.setsC += r.setsB; B.setsP += r.setsB; B.setsC += r.setsA;
      A.ptsP += r.ptsA; A.ptsC += r.ptsB; B.ptsP += r.ptsB; B.ptsC += r.ptsA;
      if (r.gagnant === 'a') { A.V++; B.D++; }
      else if (r.gagnant === 'b') { B.V++; A.D++; }
      else { A.N++; B.N++; }
    }
    const lignes = Array.from(stats.values()).map((l) => Object.assign(l, {
      score: l.V * 2 + l.N,
      diffSets: l.setsP - l.setsC,
      diffPts: l.ptsP - l.ptsC,
    }));
    // Deux équipes seules à égalité de victoires : le résultat de leur match les départage.
    const parScore = new Map();
    lignes.forEach((l) => parScore.set(l.score, (parScore.get(l.score) || 0) + 1));
    const duel = (x, y) => {
      if (parScore.get(x.score) !== 2) return 0;
      let bilan = 0;
      t.matchs.forEach((m) => {
        if (m.statut !== 'termine' || m.phase === 'finale') return;
        const xEstA = m.a === x.equipe.id && m.b === y.equipe.id;
        const xEstB = m.b === x.equipe.id && m.a === y.equipe.id;
        if (!xEstA && !xEstB) return;
        const r = resultat(m);
        if (r.gagnant) bilan += (r.gagnant === 'a') === xEstA ? 1 : -1;
      });
      return Math.sign(bilan);
    };
    const egal = (x, y) => x.score === y.score && duel(x, y) === 0 && x.diffSets === y.diffSets
      && x.diffPts === y.diffPts && x.ptsP === y.ptsP;
    lignes.sort((x, y) => y.score - x.score || -duel(x, y) || y.diffSets - x.diffSets || y.diffPts - x.diffPts
      || y.ptsP - x.ptsP || x.equipe.nom.localeCompare(y.equipe.nom, 'fr'));
    lignes.forEach((l, i) => { l.rang = i > 0 && egal(l, lignes[i - 1]) ? lignes[i - 1].rang : i + 1; });
    return lignes;
  }

  /* ---------- Phase finale (élimination directe) ---------- */

  function nbQualifies(t) {
    const r = t.reglages;
    if (r.format === 'poules') return r.qualifiesParPoule > 0 ? r.qualifiesParPoule * r.nbPoules : 0;
    return r.phaseFinale || 0;
  }

  const comparerBilans = (x, y) => y.score - x.score || y.diffSets - x.diffSets || y.diffPts - x.diffPts || y.ptsP - x.ptsP;

  // Équipes qualifiées, de la tête de série 1 à la dernière. En poules : tous les premiers
  // de poule d'abord (classés entre eux par leur bilan), puis les deuxièmes, etc.
  function qualifies(t) {
    const r = t.reglages;
    if (avecPoules(t)) {
      const parPlace = [];
      for (let p = 0; p < r.nbPoules; p++) {
        classement(t, p).filter((l) => !l.equipe.abandon).slice(0, r.qualifiesParPoule)
          .forEach((l, k) => { (parPlace[k] = parPlace[k] || []).push(Object.assign({ poule: p, place: k + 1 }, l)); });
      }
      const ordre = [];
      parPlace.forEach((groupe) => ordre.push(...groupe.sort(comparerBilans)));
      return ordre;
    }
    return classement(t).filter((l) => !l.equipe.abandon).slice(0, nbQualifies(t))
      .map((l, k) => Object.assign({ poule: null, place: k + 1 }, l));
  }

  // Ordre des têtes de série dans le tableau : 1 contre 8, 4 contre 5, 2 contre 7, 3 contre 6…
  function ordreTableau(S) {
    let o = [1];
    while (o.length < S) {
      const n = o.length * 2;
      o = o.reduce((acc, x) => acc.concat([x, n + 1 - x]), []);
    }
    return o;
  }

  // Évite que deux équipes de la même poule se rencontrent dès le premier tour.
  function eviterMemePoule(places) {
    const meme = (x, y) => !!(x && y && x.poule != null && x.poule === y.poule);
    for (let i = 0; i < places.length; i += 2) {
      if (!meme(places[i], places[i + 1])) continue;
      for (let j = 0; j < places.length; j += 2) {
        if (j === i || !places[j + 1]) continue;
        if (!meme(places[i], places[j + 1]) && !meme(places[j], places[i + 1])) {
          [places[i + 1], places[j + 1]] = [places[j + 1], places[i + 1]];
          break;
        }
      }
    }
  }

  function phasePoulesFinie(t) {
    return t.matchs.length > 0 && t.matchs.every((m) => m.phase === 'finale' || m.statut === 'termine');
  }

  function nbTours(t) {
    return t.finale ? Math.round(Math.log2(t.finale.taille)) : 0;
  }

  function nomTourIndex(R, tour) {
    return ['Finale', 'Demi-finale', 'Quart de finale', 'Huitième de finale', 'Seizième de finale'][R - 1 - tour] || 'Tour ' + (tour + 1);
  }

  function matchTableau(t, tour, slot, petite) {
    return t.matchs.find((m) => m.phase === 'finale' && m.tour === tour && m.slot === slot && !!m.petite === !!petite);
  }

  // Les deux équipes d'une case du tableau : identifiant, '' (case vide) ou undefined (pas encore connue).
  function participants(t, tour, slot) {
    if (tour === 0) return [t.finale.places[2 * slot], t.finale.places[2 * slot + 1]];
    const x = issue(t, tour - 1, 2 * slot);
    const y = issue(t, tour - 1, 2 * slot + 1);
    return [x.connue ? x.gagnant : undefined, y.connue ? y.gagnant : undefined];
  }

  // Résultat d'une case : vainqueur et perdant quand ils sont connus (une case sans adversaire qualifie d'office).
  function issue(t, tour, slot) {
    const [a, b] = participants(t, tour, slot);
    if (a === undefined || b === undefined) return { connue: false };
    if (!a && !b) return { connue: true, gagnant: '', perdant: '' };
    if (!a || !b) return { connue: true, gagnant: a || b, perdant: '', exempt: true };
    const m = matchTableau(t, tour, slot, false);
    if (!m || m.statut !== 'termine') return { connue: false };
    const r = resultat(m);
    if (!r.gagnant) return { connue: false };
    return r.gagnant === 'a' ? { connue: true, gagnant: m.a, perdant: m.b } : { connue: true, gagnant: m.b, perdant: m.a };
  }

  function creerMatchFinale(t, v) {
    const plusGrand = (champ) => t.matchs.reduce((x, m) => Math.max(x, m[champ] || 0), 0);
    const m = {
      id: 'm' + uid(6), numero: plusGrand('numero') + 1, ordre: plusGrand('ordre') + 1,
      a: v.a, b: v.b, statut: 'attente', terrain: null, debut: null, fin: null, sets: [],
      phase: 'finale', tour: v.tour, slot: v.slot,
    };
    if (v.petite) m.petite = true;
    t.matchs.push(m);
    // Une équipe qui a abandonné perd tout de suite par forfait.
    const absente = [m.a, m.b].find((x) => equipe(t, x).abandon);
    if (absente) {
      m.sets = setsForfait(formatMatch(t, m), absente === m.b);
      m.statut = 'termine';
      m.fin = Date.now();
      m.forfait = absente;
    }
  }

  // Crée les matchs du tableau dès que leurs deux équipes sont connues, et met à jour ceux
  // qui n'ont pas commencé si un résultat a été corrigé.
  function avancerTableau(t) {
    if (!t.finale) return;
    const R = nbTours(t);
    for (let passe = 0; passe < R + 2; passe++) {
      let change = false;
      const voulus = [];
      for (let tour = 0; tour < R; tour++) {
        if (tour === R - 1 && R >= 2 && t.reglages.petiteFinale) {
          const x = issue(t, R - 2, 0);
          const y = issue(t, R - 2, 1);
          const ok = x.connue && y.connue && x.perdant && y.perdant;
          voulus.push({ tour, slot: 0, petite: true, a: ok ? x.perdant : null, b: ok ? y.perdant : null });
        }
        for (let slot = 0; slot < t.finale.taille / Math.pow(2, tour + 1); slot++) {
          const [a, b] = participants(t, tour, slot);
          voulus.push({ tour, slot, petite: false, a: a && b ? a : null, b: a && b ? b : null });
        }
      }
      // Un match pas encore terminé suit toujours le tableau (correction d'un résultat précédent).
      voulus.forEach((v) => {
        const m = matchTableau(t, v.tour, v.slot, v.petite);
        if (v.a && v.b) {
          if (!m) { creerMatchFinale(t, v); change = true; }
          else if (m.statut !== 'termine' && (m.a !== v.a || m.b !== v.b)) { m.a = v.a; m.b = v.b; change = true; }
        } else if (m && m.statut !== 'termine') {
          t.matchs.splice(t.matchs.indexOf(m), 1);
          change = true;
        }
      });
      // Retire la petite finale si l'option a été désactivée avant qu'elle se termine.
      if (!t.reglages.petiteFinale) {
        const p = matchTableau(t, R - 1, 0, true);
        if (p && p.statut !== 'termine') { t.matchs.splice(t.matchs.indexOf(p), 1); change = true; }
      }
      if (!change) break;
    }
  }

  function lancerPhaseFinale(t) {
    const q = qualifies(t);
    if (q.length < 2) throw new Error('Il faut au moins 2 équipes qualifiées.');
    let S = 2;
    while (S < q.length) S *= 2;
    const places = ordreTableau(S).map((s) => (s <= q.length ? q[s - 1] : null));
    eviterMemePoule(places);
    t.finale = { taille: S, places: places.map((x) => (x ? x.equipe.id : '')) };
    avancerTableau(t);
    if (appelAutoActif(t)) remplirTerrains(t);
  }

  // Annule la phase finale si aucun de ses matchs n'a commencé.
  function annulerPhaseFinale(t) {
    if (t.matchs.some((m) => m.phase === 'finale' && m.statut !== 'attente' && !m.forfait)) return false;
    t.matchs = t.matchs.filter((m) => m.phase !== 'finale');
    delete t.finale;
    return true;
  }

  function tableauTermine(t) {
    if (!t.finale) return false;
    const R = nbTours(t);
    if (!issue(t, R - 1, 0).connue) return false;
    const p = matchTableau(t, R - 1, 0, true);
    return !p || p.statut === 'termine';
  }

  // Une phase finale est prévue et n'est pas encore jouée jusqu'au bout.
  function finaleAttendue(t) {
    if (t.finale) return !tableauTermine(t);
    return nbQualifies(t) >= 2;
  }

  // Étiquette d'un match : poule ou tour de la phase finale.
  function etiquetteMatch(t, m) {
    if (m.phase === 'finale') return m.petite ? 'Match pour la 3e place' : nomTourIndex(nbTours(t), m.tour);
    if (m.poule != null && avecPoules(t)) return nomPoule(m.poule);
    return '';
  }

  // Réglages à utiliser pour un match (la phase finale peut avoir son propre format).
  function formatMatch(t, m) {
    const r = t.reglages;
    if (!m || m.phase !== 'finale' || !r.formatFinale) return r;
    return Object.assign({}, r, {
      sets: r.finaleSets, auMeilleur: r.finaleAuMeilleur, points: r.finalePoints,
      plafond: plafondAuto(r.finalePoints), dureeLimite: 0,
    });
  }

  // Classement de toutes les équipes après les poules : place dans la poule, puis bilan.
  function classementPoules(t) {
    if (!avecPoules(t)) return classement(t).map((l) => Object.assign({ etape: '' }, l));
    const lignes = [];
    for (let p = 0; p < t.reglages.nbPoules; p++) {
      classement(t, p).forEach((l, k) => lignes.push(Object.assign({ poule: p, place: k + 1, etape: nomPoule(p) + ', ' + (k === 0 ? '1re' : (k + 1) + 'e') }, l)));
    }
    return lignes.sort((x, y) => x.place - y.place || comparerBilans(x, y));
  }

  // Classement final : le tableau de la phase finale décide des premières places,
  // les autres équipes suivent selon leurs résultats de poule. null s'il n'y a pas d'ordre global.
  function classementFinal(t) {
    if (!t.finale) {
      if (avecPoules(t)) return null;
      return classement(t).map((l) => Object.assign({ etape: '' }, l));
    }
    const R = nbTours(t);
    const S = t.finale.taille;
    const places = new Map();
    const fin = issue(t, R - 1, 0);
    if (fin.connue) {
      places.set(fin.gagnant, { rang: 1, etape: 'Vainqueur' });
      if (fin.perdant) places.set(fin.perdant, { rang: 2, etape: 'Finaliste' });
    }
    const petite = matchTableau(t, R - 1, 0, true);
    if (petite && petite.statut === 'termine') {
      const r = resultat(petite);
      if (r.gagnant) {
        places.set(r.gagnant === 'a' ? petite.a : petite.b, { rang: 3, etape: '3e place' });
        places.set(r.gagnant === 'a' ? petite.b : petite.a, { rang: 4, etape: '4e place' });
      }
    }
    for (let tour = R - 2; tour >= 0; tour--) {
      for (let slot = 0; slot < S / Math.pow(2, tour + 1); slot++) {
        const x = issue(t, tour, slot);
        if (x.connue && x.perdant && !places.has(x.perdant)) places.set(x.perdant, { rang: S / Math.pow(2, tour + 1) + 1, etape: nomTourIndex(R, tour) });
      }
    }
    const base = classementPoules(t);
    const qualifiesIds = new Set(t.finale.places.filter(Boolean));
    const dedans = base.filter((l) => places.has(l.equipe.id)).map((l) => Object.assign({}, l, places.get(l.equipe.id)))
      .sort((x, y) => x.rang - y.rang);
    const enLice = base.filter((l) => qualifiesIds.has(l.equipe.id) && !places.has(l.equipe.id))
      .map((l) => Object.assign({}, l, { rang: null, etape: 'Encore en lice' }));
    const dehors = base.filter((l) => !qualifiesIds.has(l.equipe.id))
      .map((l, k) => Object.assign({}, l, { rang: qualifiesIds.size + k + 1 }));
    return dedans.concat(enLice, dehors);
  }

  // Tableau de la phase finale en colonnes (un tour par colonne). Commun à toutes les pages.
  function tableauHtml(t, moi) {
    if (!t.finale) return '';
    const R = nbTours(t);
    const S = t.finale.taille;
    const nom = (id) => (id ? esc(nomEquipe(t, id)) : '');
    const caseHtml = (tour, slot, petite) => {
      let a;
      let b;
      if (petite) {
        const x = issue(t, R - 2, 0);
        const y = issue(t, R - 2, 1);
        a = x.connue ? x.perdant : undefined;
        b = y.connue ? y.perdant : undefined;
      } else {
        [a, b] = participants(t, tour, slot);
      }
      if (!petite && tour === 0 && (!a || !b) && (a || b)) {
        return '<div class="tf-match tf-match--exempt"><div class="tf-equipe gagnant' + ((a || b) === moi ? ' moi' : '') + '"><span>' + nom(a || b) + '</span></div>'
          + '<div class="tf-info">Qualifiée d’office</div></div>';
      }
      if (!petite && tour === 0 && !a && !b) return '';
      const m = matchTableau(t, tour, slot, !!petite);
      const r = m && m.statut === 'termine' ? resultat(m) : null;
      const ligne = (id, gagne) => '<div class="tf-equipe' + (gagne ? ' gagnant' : '') + (id && id === moi ? ' moi' : '') + '">'
        + '<span>' + (id ? nom(id) : '<em>À déterminer</em>') + '</span></div>';
      let info = '';
      if (m && m.statut === 'termine') info = m.forfait ? 'Forfait de ' + esc(nomEquipe(t, m.forfait)) : esc(texteScore(m));
      else if (m && m.statut === 'en_cours') info = '<strong>Terrain ' + m.terrain + '</strong>, en cours';
      else if (m) info = 'Match ' + m.numero + ', à jouer';
      return '<div class="tf-match' + (m && m.statut === 'en_cours' ? ' tf-match--en_cours' : '') + '">'
        + ligne(m ? m.a : a, r && r.gagnant === 'a') + ligne(m ? m.b : b, r && r.gagnant === 'b')
        + (info ? '<div class="tf-info">' + info + '</div>' : '') + '</div>';
    };
    let h = '<div class="tableau-finale" style="--tours:' + R + '">';
    for (let tour = 0; tour < R; tour++) {
      const titre = ['Finale', 'Demi-finales', 'Quarts de finale', 'Huitièmes de finale', 'Seizièmes de finale'][R - 1 - tour] || 'Tour ' + (tour + 1);
      h += '<div class="tf-tour"><h3>' + titre + '</h3><div class="tf-cases">';
      for (let slot = 0; slot < S / Math.pow(2, tour + 1); slot++) h += caseHtml(tour, slot, false);
      if (tour === R - 1 && R >= 2 && t.reglages.petiteFinale) {
        h += '<h3 class="tf-petite">Match pour la 3e place</h3>' + caseHtml(tour, 0, true);
      }
      h += '</div></div>';
    }
    return h + '</div>';
  }

  // Remet un match terminé à jouer (correction).
  function effacerResultat(t, m) {
    m.statut = 'attente';
    m.sets = [];
    m.fin = null;
    m.debut = null;
    m.terrain = null;
    delete m.forfait;
    if (t.finale) avancerTableau(t);
    if (appelAutoActif(t) && demarre(t)) remplirTerrains(t);
  }

  // Podium des trois premières places (ordre d'affichage 2, 1, 3).
  function podiumHtml(lignes) {
    const marche = (l, place) => l ? '<div class="marche marche--' + place + '">'
      + '<div class="marche-nom">' + esc(l.equipe.nom) + '</div>'
      + '<div class="marche-bloc">' + l.rang + '</div></div>' : '<div></div>';
    return '<div class="podium">' + marche(lignes[1], 2) + marche(lignes[0], 1) + marche(lignes[2], 3) + '</div>';
  }

  function signe(n) {
    return n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0';
  }

  function nulsPossibles(t) {
    const r = t.reglages;
    return r.sets % 2 === 0 || !r.auMeilleur || t.matchs.some((m) => m.statut === 'termine' && !resultat(m).gagnant);
  }

  /* ---------- Saisie des scores ---------- */

  // paires : [[texteA, texteB], ...] lues dans un formulaire. Les lignes vides sont ignorées.
  function lireSaisie(paires) {
    const sets = [];
    for (let i = 0; i < paires.length; i++) {
      const va = String(paires[i][0]).trim();
      const vb = String(paires[i][1]).trim();
      if (va === '' && vb === '') continue;
      if (va === '' || vb === '') return { erreur: 'Il manque un score au set ' + (i + 1) + '.' };
      const a = Number(va);
      const b = Number(vb);
      if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a > 99 || b > 99) {
        return { erreur: 'Le score du set ' + (i + 1) + ' doit être un nombre entre 0 et 99.' };
      }
      sets.push([a, b]);
    }
    if (!sets.length) return { erreur: 'Saisis au moins un set.' };
    return { sets };
  }

  function memesSets(x, y) {
    return JSON.stringify(x || []) === JSON.stringify(y || []);
  }

  /* ---------- Données reçues du stockage ou de la base en ligne ---------- */

  function enTableau(x) {
    if (Array.isArray(x)) return x.filter((v) => v != null);
    if (x && typeof x === 'object') {
      return Object.keys(x).sort((a, b) => Number(a) - Number(b)).map((k) => x[k]).filter((v) => v != null);
    }
    return [];
  }

  // Remet en forme un tournoi lu en ligne (la base supprime les tableaux vides et les valeurs nulles).
  function normaliser(t) {
    if (!t || typeof t !== 'object') return null;
    t.nom = t.nom || 'Tournoi loisir';
    t.reglages = Object.assign({}, REGLAGES_DEFAUT, t.reglages);
    t.equipes = enTableau(t.equipes).map((e) => Object.assign({}, e, { nom: e.nom || '', joueurs: e.joueurs || '' }));
    t.matchs = enTableau(t.matchs).map((m) => Object.assign({ terrain: null, debut: null, fin: null }, m, {
      sets: enTableau(m.sets).map((paire) => enTableau(paire).map(Number)),
    }));
    if (t.finale && t.finale.taille) {
      const brut = t.finale.places || {};
      t.finale = { taille: Number(t.finale.taille), places: Array.from({ length: Number(t.finale.taille) }, (_, i) => brut[i] || '') };
    } else {
      delete t.finale;
    }
    return t;
  }

  /* ---------- Affichage ---------- */

  function urlPage(page, params) {
    const url = new URL(page, global.location.href);
    Object.keys(params || {}).forEach((k) => url.searchParams.set(k, params[k]));
    return url.href;
  }

  function qrSvg(texte) {
    if (typeof global.qrcode !== 'function') return '';
    const qr = global.qrcode(0, 'M');
    qr.addData(texte);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 8, scalable: true, alt: 'QR code vers ' + texte });
  }

  function heure(ts) {
    if (!ts) return '';
    return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  const ICONE = '<svg viewBox="0 0 64 64" aria-hidden="true"><g transform="rotate(-35 32 32)">'
    + '<path d="M22 46 L10 8 H54 L42 46 Z" fill="#fff"/>'
    + '<path d="M27 46 L24 8 M32 46 V8 M37 46 L40 8" stroke="#0a3d2b" stroke-width="2" opacity=".3"/>'
    + '<path d="M16.5 27 H47.5" stroke="#0a3d2b" stroke-width="2.4" opacity=".4"/>'
    + '<path d="M21 46 H43 A11 11 0 0 1 21 46 Z" fill="#f4c430"/></g></svg>';

  // Petit signal sonore (deux notes). Le navigateur ne l'autorise qu'après un premier geste
  // sur la page : activerSon() est à appeler dans un clic.
  let contexteAudio = null;
  function activerSon() {
    try {
      const Contexte = global.AudioContext || global.webkitAudioContext;
      if (!Contexte) return false;
      contexteAudio = contexteAudio || new Contexte();
      if (contexteAudio.state === 'suspended') contexteAudio.resume();
      return true;
    } catch (e) { return false; }
  }
  function sonActif() {
    return !!contexteAudio && contexteAudio.state === 'running';
  }
  function bip() {
    if (!sonActif()) return;
    const t0 = contexteAudio.currentTime;
    [[880, 0], [1175, 0.2], [1568, 0.4]].forEach(([frequence, decalage]) => {
      const osc = contexteAudio.createOscillator();
      const gain = contexteAudio.createGain();
      osc.type = 'sine';
      osc.frequency.value = frequence;
      gain.gain.setValueAtTime(0.0001, t0 + decalage);
      gain.gain.exponentialRampToValueAtTime(0.35, t0 + decalage + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + decalage + 0.45);
      osc.connect(gain).connect(contexteAudio.destination);
      osc.start(t0 + decalage);
      osc.stop(t0 + decalage + 0.5);
    });
  }

  function idDansAdresse() {
    return new URLSearchParams(global.location.search).get('t');
  }

  global.BT = {
    REGLAGES_DEFAUT, LIBELLES_STATUT, plafondAuto,
    uid, esc, entier,
    nouveauTournoi, ajusterEquipes, equipe, nomEquipe, statut, texteFormat,
    verifierFormat, paires, ordonner, genererMatchs,
    matchsEnCours, matchsEnAttente, terrainsLibres, remplirTerrains, lancer, demarre, prochains, reporter, appelAutoActif,
    planifier, dureeMatch, finEstimee, prioriser,
    resultat, texteScore, verifierSet, verifierScore, enregistrerScore,
    setsForfait, enregistrerForfait, abandonEquipe, annulerAbandon, effacerResultat,
    nomPoule, avecPoules, listePoules, taillesPoules, verifierPoules, verifierDeroulement,
    nbQualifies, qualifies, phasePoulesFinie, lancerPhaseFinale, annulerPhaseFinale, avancerTableau,
    nbTours, nomTourIndex, matchTableau, participants, issue, tableauTermine, finaleAttendue,
    etiquetteMatch, formatMatch, classementPoules, classementFinal, tableauHtml,
    classement, nulsPossibles, podiumHtml, signe,
    lireSaisie, memesSets, enTableau, normaliser,
    urlPage, qrSvg, heure, idDansAdresse, ICONE, activerSon, sonActif, bip,
  };
})(typeof window !== 'undefined' ? window : globalThis);
