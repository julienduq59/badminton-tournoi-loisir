/* Tournoi de badminton loisir : logique commune à toutes les pages
   (stockage, calendrier des matchs, appel sur les terrains, scores, classement). */
(function (global) {
  'use strict';

  const PREFIXE = 'badminton:';
  const CLE_INDEX = PREFIXE + 'tournois';
  const cleTournoi = (id) => PREFIXE + 't:' + id;

  const REGLAGES_DEFAUT = {
    nbEquipes: 8,
    tousContreTous: true,
    matchsParEquipe: 7,
    sets: 1,
    auMeilleur: true,
    points: 21,
    ecart2: true,
    plafond: 30,
    terrains: 3,
    appelAuto: true,
  };

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
    if (t.matchs.some((m) => m.statut !== 'attente')) return 'en_cours';
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
  // d'abord ceux où aucune équipe ne sort du terrain, puis les équipes qui ont
  // le moins joué, puis l'ordre de la file.
  function choisir(attente, occupees, eviter, joues) {
    let meilleur = null;
    let cleMeilleure = null;
    for (const m of attente) {
      if (occupees.has(m.a) || occupees.has(m.b)) continue;
      const cle = [
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

  function demarre(t) {
    return t.matchs.some((m) => m.statut !== 'attente');
  }

  // Ordre prévu des matchs en attente, en supposant que les matchs se terminent
  // dans l'ordre où ils ont commencé (même règle que l'appel automatique).
  function prochains(t) {
    const T = Math.max(1, t.reglages.terrains);
    const enJeu = t.matchs.filter((m) => m.statut === 'en_cours').sort((x, y) => (x.debut || 0) - (y.debut || 0));
    const attente = matchsEnAttente(t);
    const occupees = new Set();
    enJeu.forEach((m) => { occupees.add(m.a); occupees.add(m.b); });
    const joues = compterJoues(t);
    let eviter = null;
    const resultat = [];
    while (attente.length) {
      if (enJeu.length < T) {
        const m = choisir(attente, occupees, eviter, joues);
        if (m) {
          resultat.push(m);
          prendre(m, attente, occupees, joues);
          enJeu.push(m);
          continue;
        }
      }
      const fini = enJeu.shift();
      if (!fini) {
        resultat.push.apply(resultat, attente);
        break;
      }
      occupees.delete(fini.a);
      occupees.delete(fini.b);
      eviter = new Set([fini.a, fini.b]);
    }
    return resultat;
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
    if (etaitEnCours || !m.fin) m.fin = Date.now();
    if (etaitEnCours && t.reglages.appelAuto) remplirTerrains(t, new Set([m.a, m.b]));
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
    const egal = (x, y) => x.score === y.score && x.diffSets === y.diffSets && x.diffPts === y.diffPts && x.ptsP === y.ptsP;
    lignes.sort((x, y) => y.score - x.score || y.diffSets - x.diffSets || y.diffPts - x.diffPts
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

  /* ---------- Stockage (dans ce navigateur) ---------- */

  function lireJSON(cle) {
    try { return JSON.parse(global.localStorage.getItem(cle)); } catch (e) { return null; }
  }

  const Store = {
    liste() {
      return lireJSON(CLE_INDEX) || [];
    },
    charger(id) {
      return id ? lireJSON(cleTournoi(id)) : null;
    },
    enregistrer(t) {
      t.maj = Date.now();
      global.localStorage.setItem(cleTournoi(t.id), JSON.stringify(t));
      const liste = Store.liste().filter((x) => x.id !== t.id);
      liste.unshift({ id: t.id, nom: t.nom, maj: t.maj, statut: statut(t), equipes: t.equipes.length });
      global.localStorage.setItem(CLE_INDEX, JSON.stringify(liste));
      return t;
    },
    supprimer(id) {
      global.localStorage.removeItem(cleTournoi(id));
      global.localStorage.setItem(CLE_INDEX, JSON.stringify(Store.liste().filter((x) => x.id !== id)));
    },
    // Prévient quand le tournoi est modifié depuis un autre onglet ou une autre fenêtre.
    ecouter(id, rappel) {
      const gestionnaire = (e) => { if (e.key === cleTournoi(id)) rappel(Store.charger(id)); };
      global.addEventListener('storage', gestionnaire);
      return () => global.removeEventListener('storage', gestionnaire);
    },
  };

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

  function idDansAdresse() {
    return new URLSearchParams(global.location.search).get('t');
  }

  global.BT = {
    REGLAGES_DEFAUT, LIBELLES_STATUT,
    uid, esc, entier,
    nouveauTournoi, ajusterEquipes, equipe, nomEquipe, statut, texteFormat,
    verifierFormat, paires, ordonner, genererMatchs,
    matchsEnCours, matchsEnAttente, terrainsLibres, remplirTerrains, lancer, demarre, prochains, reporter,
    resultat, texteScore, verifierSet, verifierScore, enregistrerScore,
    classement, nulsPossibles, podiumHtml, signe,
    Store, urlPage, qrSvg, heure, idDansAdresse, ICONE,
  };
})(typeof window !== 'undefined' ? window : globalThis);
