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
  };

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
    if (t.matchs.every((m) => m.statut === 'termine')) return 'termine';
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

  function genererMatchs(t) {
    const n = t.equipes.length;
    const k = t.reglages.matchsParEquipe;
    const erreur = verifierFormat(n, k);
    if (erreur) throw new Error(erreur);
    const ordre = ordonner(paires(n, k), n);
    t.matchs = ordre.map(([a, b], i) => ({
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
    }));
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
    let fin = 0;
    t.matchs.forEach((m) => { if (m.statut === 'en_cours') fin = Math.max(fin, maintenant, (m.debut || maintenant) + D); });
    planifier(t, D, maintenant).forEach((x) => { if (x.heure) fin = Math.max(fin, x.heure + D); });
    return fin || null;
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
    if (etaitEnCours && t.reglages.appelAuto) remplirTerrains(t, new Set([m.a, m.b]));
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
    if (etaitEnCours && t.reglages.appelAuto) remplirTerrains(t, new Set([m.a, m.b]));
  }

  // Score donné par un forfait : l'équipe présente gagne tous les sets nécessaires sans perdre de point.
  function setsForfait(reg, gagnantEstA) {
    const n = reg.auMeilleur && reg.sets % 2 === 1 ? (reg.sets + 1) / 2 : reg.sets;
    return Array.from({ length: n }, () => (gagnantEstA ? [reg.points, 0] : [0, reg.points]));
  }

  // Forfait sur un seul match.
  function enregistrerForfait(t, m, perdantId) {
    enregistrerScore(t, m, setsForfait(t.reglages, perdantId === m.b));
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
      m.sets = setsForfait(t.reglages, equipeId === m.b);
      m.statut = 'termine';
      m.fin = Date.now();
      m.forfait = equipeId;
      delete m.priorite;
    });
    if (lance && t.reglages.appelAuto) remplirTerrains(t, liberees);
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
    if (demarre(t) && t.reglages.appelAuto) remplirTerrains(t);
  }

  /* ---------- Classement ---------- */

  function classement(t) {
    const stats = new Map(t.equipes.map((e) => [e.id, {
      equipe: e, J: 0, V: 0, N: 0, D: 0, setsP: 0, setsC: 0, ptsP: 0, ptsC: 0,
    }]));
    for (const m of t.matchs) {
      if (m.statut !== 'termine') continue;
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
        if (m.statut !== 'termine') return;
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
    matchsEnCours, matchsEnAttente, terrainsLibres, remplirTerrains, lancer, demarre, prochains, reporter,
    planifier, dureeMatch, finEstimee, prioriser,
    resultat, texteScore, verifierSet, verifierScore, enregistrerScore,
    setsForfait, enregistrerForfait, abandonEquipe, annulerAbandon,
    classement, nulsPossibles, podiumHtml, signe,
    lireSaisie, memesSets, enTableau, normaliser,
    urlPage, qrSvg, heure, idDansAdresse, ICONE, activerSon, sonActif, bip,
  };
})(typeof window !== 'undefined' ? window : globalThis);
