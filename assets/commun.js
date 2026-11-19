/* Tournoi de badminton loisir : logique commune à toutes les pages
   (stockage, calendrier des matchs, appel sur les terrains, scores, classement). */
(function (global) {
  'use strict';

  // Exemple de départ : 15 équipes, 7 terrains, 1 set de 15 points avec 2 points d'écart.
  const REGLAGES_DEFAUT = {
    nbEquipes: 15,
    tousContreTous: true,     // ancien réglage, remplacé par cat
    matchsParEquipe: 14,      // ancien réglage, remplacé par cat
    // Nombre de matchs que joue chaque équipe dans chaque catégorie (tous = contre toutes les autres).
    cat: {
      simple: { k: 0, tous: false },
      double: { k: 14, tous: true },
      mixte: { k: 0, tous: false },
    },
    mixteEgalDouble: true,    // ne pas distinguer mixte et double
    finaleCategorie: 'double', // catégorie des matchs de phase finale
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
    reposMin: 0,              // minutes de repos minimum entre deux matchs d'une équipe
    dureePrevue: 0,           // durée moyenne prévue d'un match (minutes), pour estimer l'heure de fin
    heureDebut: '',           // heure de début prévue (HH:MM)
    heureFin: '',             // heure à laquelle il faut rendre la salle (HH:MM)
    reglesPerso: '',          // règles ajoutées par les organisateurs, affichées avec les règles du tournoi
    photos: true,             // album photo du tournoi et photos d'équipe
    pointage: false,          // pointage à l'arrivée : une équipe ne joue qu'une fois arrivée
    photosMax: 0,             // photos de l'album par personne (0 = sans limite)
    // Déroulement : une seule poule (championnat), plusieurs poules, ou système suisse (les équipes
    // libres qui ont le même nombre de victoires se rencontrent), puis phase finale éventuelle.
    format: 'championnat',
    matchsSuisse: 5,          // système suisse : matchs par équipe
    ecartSuisse: 1,           // système suisse : écart de victoires accepté entre deux adversaires
    categorieSuisse: 'double', // système suisse : catégorie des matchs
    nbPoules: 3,
    phaseFinale: 0,          // championnat : nombre d'équipes qualifiées (0 = pas de phase finale)
    qualifiesParPoule: 2,    // poules : qualifiés par poule (0 = pas de phase finale)
    petiteFinale: true,      // match pour la 3e place
    formatFinale: false,     // format de match propre à la phase finale
    finaleSets: 1,
    finaleAuMeilleur: true,
    finalePoints: 21,
  };

  const CATEGORIES = [
    { cle: 'simple', nom: 'Simple', pluriel: 'simples' },
    { cle: 'double', nom: 'Double', pluriel: 'doubles' },
    { cle: 'mixte', nom: 'Mixte', pluriel: 'mixtes' },
  ];

  // Catégories jouées, avec leur nombre de matchs par équipe (tous : contre toutes les autres).
  function categoriesJouees(r) {
    if (r.format === 'suisse') {
      const c = CATEGORIES.find((x) => x.cle === r.categorieSuisse) || CATEGORIES[1];
      const k = Math.max(1, Number(r.matchsSuisse) || 1);
      return [Object.assign({}, c, { tous: false, k, max: k })];
    }
    const cat = r.cat || {};
    return CATEGORIES.filter((c) => !(c.cle === 'mixte' && r.mixteEgalDouble))
      .map((c) => {
        const x = cat[c.cle] || {};
        const k = Number(x.k) || 0;
        // max : nombre maximum de matchs par équipe (0 ou absent = le minimum).
        return Object.assign({}, c, { tous: !!x.tous, k, max: Number(x.max) > 0 ? Number(x.max) : k });
      })
      .filter((c) => c.tous || c.k > 0);
  }

  function nomCategorie(cle) {
    const c = CATEGORIES.find((x) => x.cle === cle);
    return c ? c.nom : '';
  }

  // Catégorie d'un match (Simple, Double ou Mixte), '' pour les anciens tournois.
  function categorieMatch(t, m) {
    return m && m.categorie ? nomCategorie(m.categorie) : '';
  }

  // Catégorie des matchs de phase finale : celle choisie si elle est jouée, sinon la première jouée.
  function categorieFinale(r) {
    const jouees = categoriesJouees(r).map((c) => c.cle);
    return jouees.includes(r.finaleCategorie) ? r.finaleCategorie : (jouees[0] || 'double');
  }

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
      reglages: JSON.parse(JSON.stringify(REGLAGES_DEFAUT)),
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

  // Liste d'équipes collée par l'organisateur, une équipe par ligne : « Les Volants : Julien et
  // Grégoire », « Les Volants - Julien, Grégoire », « Les Volants (Julien et Grégoire) », colonnes
  // copiées d'un tableur (nom, joueur, joueur) ou nom seul. Les numéros et puces en tête de ligne
  // (« 1. », « 2) », « - », « • ») sont retirés. Rend [{ nom, joueurs }] (noms coupés à 40 caractères,
  // joueurs à 80, comme les champs des réglages).
  function lireListeEquipes(texte) {
    const couper = (s, n) => {
      s = s.replace(/\s+/g, ' ').trim();
      if (s.length <= n) return s;
      const espace = s.lastIndexOf(' ', n);
      return (espace > n / 2 ? s.slice(0, espace) : s.slice(0, n)).trim();
    };
    const relier = (noms) => {
      noms = noms.map((x) => x.trim()).filter(Boolean);
      return noms.length === 2 ? noms[0] + ' et ' + noms[1] : noms.join(', ');
    };
    const sansNumero = (s) => s.replace(/^\s*(?:[-–—*•·▪◦]+\s*|\d{1,3}\s*[.)]\s*|\d{1,3}\s+[-–—:]\s+)/, '');
    // Premier séparateur entre le nom et les joueurs (« : » entre deux chiffres, comme 19:00, n'en est pas un).
    const separateur = (ligne) => {
      const re = /\s*:\s*|\s+[-–—]\s+|\s*;\s*/g;
      let m;
      while ((m = re.exec(ligne))) {
        const fin = m.index + m[0].length;
        if (m[0].trim() === ':' && /\d/.test(ligne.charAt(m.index - 1)) && /\d/.test(ligne.charAt(fin))) continue;
        if (m.index > 0) return m;
      }
      return null;
    };
    const liste = [];
    String(texte || '').split(/\r?\n/).forEach((brute) => {
      const ligne = brute.replace(/\u00a0/g, ' ');
      if (!ligne.trim()) return;
      let nom = '';
      let joueurs = '';
      if (ligne.includes('\t')) {
        const cases = ligne.split('\t').map((x) => x.trim());
        while (cases.length && !cases[0]) cases.shift();
        // Colonne de numéros (1, 2, 3…) avant le nom : ignorée.
        if (cases.length > 1 && /^\d{1,3}[.)]?$/.test(cases[0])) cases.shift();
        nom = sansNumero(cases.shift() || '');
        joueurs = relier(cases);
      } else {
        const propre = sansNumero(ligne.trim()).trim();
        const parentheses = /^(.+?)\s*\((.+)\)$/.exec(propre);
        const sep = separateur(propre);
        if (parentheses) {
          nom = parentheses[1];
          joueurs = parentheses[2];
        } else if (sep) {
          nom = propre.slice(0, sep.index);
          joueurs = propre.slice(sep.index + sep[0].length);
          if (sep[0].trim() === ';') joueurs = relier(joueurs.split(';'));
        } else {
          nom = propre;
        }
      }
      nom = couper(nom, 40);
      joueurs = couper(joueurs, 80);
      if (!nom && !joueurs) return;
      // Ligne d'en-tête d'un tableau (« Équipe », « Nom de l'équipe »…) : ignorée.
      if (!liste.length && /^(nom( de l['’]équipe)?|équipes?|equipes?|teams?|noms?)$/i.test(nom) && (!joueurs || /joueur|player|nom/i.test(joueurs))) return;
      liste.push({ nom, joueurs });
    });
    return liste;
  }

  function nomEquipe(t, id) {
    return equipe(t, id).nom;
  }

  function statut(t) {
    if (!t.matchs.length) return 'preparation';
    if (t.matchs.every((m) => m.statut === 'termine') && !finaleAttendue(t) && suisseFini(t)) return 'termine';
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
    return null;
  }

  // Nombre impair d'équipes et de matchs : impossible que toutes jouent exactement k matchs
  // (les matchs se jouent à deux). Chaque équipe en joue au moins k, une seule en joue k + 1.
  const unMatchDePlus = (n, k) => n % 2 === 1 && k % 2 === 1;

  const pgcd = (a, b) => (b ? pgcd(b, a % b) : a);

  // Le maximum doit laisser la place au match en plus quand le nombre d'équipes est impair.
  function verifierMaximum(n, c, poule) {
    if (c.max < c.k) return 'Le maximum (' + c.max + ') est plus petit que le minimum (' + c.k + ').';
    if (unMatchDePlus(n, c.k) && c.max < c.k + 1) {
      return 'Avec ' + n + ' équipes' + (poule ? ' dans la poule' : '') + ', elles ne peuvent pas toutes jouer exactement ' + c.k
        + ' match' + (c.k > 1 ? 's' : '') + ', car les matchs se jouent à deux. Mets un maximum d’au moins ' + (c.k + 1)
        + ' : une seule équipe jouera ' + (c.k + 1) + ' matchs.';
    }
    return null;
  }

  // Maximum à prévoir pour un minimum donné (le match en plus d'un nombre impair d'équipes).
  function maximumNecessaire(tailles, k) {
    return tailles.some((x) => unMatchDePlus(x, k)) ? k + 1 : k;
  }

  // Paires d'équipes (indices) pour que chaque équipe joue exactement k matchs.
  // plus : équipe qui joue le match en plus quand n et k sont impairs.
  function paires(n, k, plus) {
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
      const pairs = k - (k % 2);
      for (let d = 1; d <= pairs / 2; d++) {
        for (let i = 0; i < n; i++) res.push([i, (i + d) % n]);
      }
      if (k % 2 === 1) {
        // Un tour de plus sur une distance encore libre, première avec n (cycle de toutes les équipes) :
        // les équipes jouent deux par deux le long du cycle, la dernière joue contre la première.
        let d = pairs / 2 + 1;
        while (pgcd(d, n) !== 1) d++;
        const debut = ((plus || 0) % n + n) % n;
        const cycle = Array.from({ length: n }, (_, i) => (debut + i * d) % n);
        for (let i = 0; i + 1 < n; i += 2) res.push([cycle[i], cycle[i + 1]]);
        res.push([cycle[n - 1], cycle[0]]);
      }
    }
    return res;
  }

  // Ordonne les matchs pour laisser le plus de repos possible entre deux matchs d'une même équipe.
  // Avec des catégories (3e élément des paires), elles sont aussi alternées au prorata.
  function ordonner(liste, n) {
    const reste = liste.map((p, i) => ({ p, i }));
    const dernier = new Array(n).fill(-1e9);
    const joues = new Array(n).fill(0);
    const plafondRepos = Math.max(2, Math.floor(n / 2));
    const part = {};
    const places = {};
    liste.forEach((p) => { part[p[2]] = (part[p[2]] || 0) + 1 / liste.length; places[p[2]] = 0; });
    const sortie = [];
    while (reste.length) {
      let meilleur = 0;
      let cleMeilleure = null;
      for (let j = 0; j < reste.length; j++) {
        const [a, b, c] = reste[j].p;
        const repos = Math.min(sortie.length - dernier[a], sortie.length - dernier[b], plafondRepos);
        const retard = (sortie.length + 1) * part[c] - places[c];
        const cle = [repos, Math.round(retard * 4) / 4, -(joues[a] + joues[b]), -reste[j].i];
        if (!cleMeilleure || comparer(cle, cleMeilleure) > 0) {
          meilleur = j;
          cleMeilleure = cle;
        }
      }
      const p = reste.splice(meilleur, 1)[0].p;
      sortie.push(p);
      places[p[2]]++;
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
    if (r.format === 'suisse') {
      const R = Number(r.matchsSuisse) || 0;
      if (R < 1) return 'Chaque équipe doit jouer au moins 1 match.';
      if (R > n - 1) return 'Avec ' + n + ' équipes, chaque équipe peut jouer au plus ' + (n - 1) + ' match' + (n - 1 > 1 ? 's' : '') + ', sinon des équipes se rencontreraient deux fois.';
      if (r.phaseFinale > n) return 'La phase finale demande ' + r.phaseFinale + ' équipes qualifiées, il n’y en a que ' + n + '.';
      return verifierFormatFinale(r, Number(r.phaseFinale) || 0);
    }
    const cats = categoriesJouees(r);
    if (!cats.length) return 'Choisis au moins une catégorie (simple, double ou mixte) avec au moins 1 match par équipe.';
    if (r.format === 'poules') {
      const err = verifierPoules(n, r.nbPoules);
      if (err) return err;
      const tailles = Array.from(new Set(taillesPoules(n, r.nbPoules)));
      for (const c of cats) {
        if (c.tous) continue;
        for (const taille of tailles) {
          const e = verifierFormat(taille, c.k) || verifierMaximum(taille, c, true);
          if (e) return 'En ' + c.nom.toLowerCase() + ', dans une poule de ' + taille + ' équipes : ' + e.charAt(0).toLowerCase() + e.slice(1);
        }
      }
      if (r.qualifiesParPoule > 0) {
        const plusPetite = Math.min(...taillesPoules(n, r.nbPoules));
        if (r.qualifiesParPoule > plusPetite) return 'La plus petite poule compte ' + plusPetite + ' équipes : on ne peut pas en qualifier ' + r.qualifiesParPoule + ' par poule.';
        if (r.qualifiesParPoule * r.nbPoules < 2) return 'Il faut au moins 2 équipes qualifiées pour la phase finale.';
      }
      return verifierFormatFinale(r, r.qualifiesParPoule > 0 ? r.qualifiesParPoule * r.nbPoules : 0);
    }
    for (const c of cats) {
      if (c.tous) continue;
      const e = verifierFormat(n, c.k) || verifierMaximum(n, c, false);
      if (e) return 'En ' + c.nom.toLowerCase() + ' : ' + e.charAt(0).toLowerCase() + e.slice(1);
    }
    if (r.phaseFinale > n) return 'La phase finale demande ' + r.phaseFinale + ' équipes qualifiées, il n’y en a que ' + n + '.';
    return verifierFormatFinale(r, Number(r.phaseFinale) || 0);
  }

  // En phase finale, chaque match doit avoir un vainqueur : le format doit le permettre.
  function verifierFormatFinale(r, Q) {
    if (Q < 2) return null;
    const sets = r.formatFinale ? r.finaleSets : r.sets;
    if (sets % 2 === 0) return 'En phase finale, chaque match doit avoir un vainqueur. Choisis un nombre impair de sets pour la phase finale (case « Format différent pour la phase finale »).';
    if (!r.formatFinale && r.dureeLimite > 0) return 'Avec une durée maximum, un match peut finir à égalité, ce qui est impossible en phase finale. Coche « Format différent pour la phase finale » pour la jouer sans durée maximum.';
    return null;
  }

  function genererMatchs(t) {
    const r = t.reglages;
    const n = t.equipes.length;
    const erreur = verifierDeroulement(n, r);
    if (erreur) throw new Error(erreur);
    delete t.finale;
    t.equipes.forEach((e) => { delete e.abandon; });
    repartirPoules(t);
    if (r.format === 'suisse') {
      // Système suisse : les premiers matchs dans l'ordre de la liste, les suivants au fil des résultats.
      t.matchs = [];
      apparierSuisse(t, true);
      return;
    }
    // Une série de matchs par catégorie ; les mêmes adversaires se retrouvent d'une catégorie à l'autre.
    const cats = categoriesJouees(r);
    const liste = [];
    if (avecPoules(t)) {
      for (let p = 0; p < r.nbPoules; p++) {
        const membres = [];
        t.equipes.forEach((e, i) => { if (e.poule === p) membres.push(i); });
        let plus = 0;
        cats.forEach((c) => {
          const k = c.tous ? membres.length - 1 : c.k;
          paires(membres.length, k, plus).forEach(([x, y]) => liste.push([membres[x], membres[y], c.cle]));
          if (unMatchDePlus(membres.length, k)) plus++;
        });
      }
    } else {
      // L'équipe qui joue le match en plus change d'une catégorie à l'autre.
      let plus = 0;
      cats.forEach((c) => {
        const k = c.tous ? n - 1 : c.k;
        paires(n, k, plus).forEach(([x, y]) => liste.push([x, y, c.cle]));
        if (unMatchDePlus(n, k)) plus++;
      });
    }
    // Mélange les catégories au prorata de leur nombre de matchs (simples, doubles et mixtes alternent).
    const total = {};
    liste.forEach((x) => { total[x[2]] = (total[x[2]] || 0) + 1; });
    const vu = {};
    const melange = liste.map((x) => {
      vu[x[2]] = (vu[x[2]] || 0) + 1;
      return { x, pos: (vu[x[2]] - 0.5) / total[x[2]] };
    }).sort((u, v) => u.pos - v.pos).map((u) => u.x);
    const ordre = ordonner(melange, n);
    t.matchs = ordre.map(([a, b, categorie], i) => {
      const m = {
        id: 'm' + uid(6),
        numero: null,
        ordre: i + 1,
        a: t.equipes[a].id,
        b: t.equipes[b].id,
        statut: 'attente',
        terrain: null,
        debut: null,
        fin: null,
        sets: [],
        categorie,
      };
      if (avecPoules(t)) m.poule = t.equipes[a].poule;
      return m;
    });
  }

  /* ---------- Système suisse (gagnants contre gagnants) ---------- */

  // Les matchs ne sont pas tous créés au départ : dès qu'une équipe est libre, elle rencontre une
  // équipe libre qui a le même nombre de victoires (ou l'écart accepté) et qu'elle n'a pas encore jouée.
  const estSuisse = (t) => !!(t && t.reglages && t.reglages.format === 'suisse');
  const matchsSuisse = (r) => Math.max(1, Number(r.matchsSuisse) || 1);
  const ecartSuisse = (r) => Math.max(0, Number(r.ecartSuisse) || 0);

  // Match à jouer que l'appariement peut encore changer : jamais appelé, ni forcé, ni prioritaire, ni reporté.
  function apparieModifiable(m) {
    return m.phase !== 'finale' && m.statut === 'attente' && !m.debut && !m.numero && !m.force && !m.priorite && !m.reporte;
  }

  // État utile à l'appariement : matchs par équipe (tous statuts), équipes déjà prises par un match
  // à jouer ou en cours, rencontres déjà prévues ou jouées, victoires (un nul compte pour moitié).
  function etatSuisse(t) {
    const nb = new Map();
    const occupe = new Set();
    const deja = new Set();
    const derniereFin = new Map();
    t.matchs.forEach((m) => {
      if (m.phase === 'finale') return;
      [m.a, m.b].forEach((x) => nb.set(x, (nb.get(x) || 0) + 1));
      if (m.statut !== 'termine') { occupe.add(m.a); occupe.add(m.b); }
      deja.add(m.a + '|' + m.b);
      deja.add(m.b + '|' + m.a);
      if (m.statut === 'termine' && m.fin) [m.a, m.b].forEach((x) => derniereFin.set(x, Math.max(derniereFin.get(x) || 0, m.fin)));
    });
    const victoires = new Map(classement(t).map((l) => [l.equipe.id, l.V + l.N / 2]));
    const index = new Map(t.equipes.map((e, i) => [e.id, i]));
    const e = {
      nb, occupe, deja, derniereFin, index,
      R: matchsSuisse(t.reglages),
      actives: t.equipes.filter((x) => !x.abandon).map((x) => x.id),
      v: (id) => victoires.get(id) || 0,
      n: (id) => nb.get(id) || 0,
      rejoue: (x, y) => deja.has(x + '|' + y),
    };
    // Priorité : l'équipe qui a le moins joué, puis celle qui attend depuis le plus longtemps, puis la liste.
    e.ordre = (x, y) => e.n(x) - e.n(y) || (derniereFin.get(x) || 0) - (derniereFin.get(y) || 0) || index.get(x) - index.get(y);
    return e;
  }

  // Meilleure paire parmi des équipes libres (identifiants) : le plus petit écart de victoires (au plus
  // ecartMax), puis les équipes prioritaires (voir etatSuisse). revanches : autorise deux équipes qui se
  // sont déjà rencontrées. finDeTournoi : refuse une paire qui ferait finir une équipe alors qu'une équipe
  // en retard n'aurait plus assez d'adversaires (elle devrait jouer contre des équipes qui ont fini).
  function meilleurePaire(e, ids, ecartMax, revanches, finDeTournoi) {
    const liste = ids.slice().sort(e.ordre);
    let possible = null;
    if (finDeTournoi) {
      const manque = (z) => Math.max(0, e.R - e.n(z));
      const inc = e.actives.filter((z) => manque(z) > 0);
      const dispo = new Map(inc.map((z) => [z, inc.filter((w) => w !== z && !e.rejoue(z, w)).length]));
      possible = (x, y) => {
        const finitX = manque(x) === 1;
        const finitY = manque(y) === 1;
        if (!finitX && !finitY) return true;
        const nouvelle = !e.rejoue(x, y) ? 1 : 0;
        return inc.every((z) => {
          if (z === x) return finitX || manque(x) - 1 <= dispo.get(x) - nouvelle;
          if (z === y) return finitY || manque(y) - 1 <= dispo.get(y) - nouvelle;
          const perdus = (finitX && !e.rejoue(z, x) ? 1 : 0) + (finitY && !e.rejoue(z, y) ? 1 : 0);
          return manque(z) <= dispo.get(z) - perdus;
        });
      };
    }
    let meilleure = null;
    let cle = null;
    for (let i = 0; i < liste.length; i++) {
      for (let j = i + 1; j < liste.length; j++) {
        const x = liste[i];
        const y = liste[j];
        const ecart = Math.abs(e.v(x) - e.v(y));
        if (ecart > ecartMax || (!revanches && e.rejoue(x, y))) continue;
        const c = [ecart, e.rejoue(x, y) ? 1 : 0, i, j];
        if (cle && comparer(c, cle) >= 0) continue;
        if (possible && !possible(x, y)) continue;
        meilleure = [x, y];
        cle = c;
      }
    }
    return meilleure;
  }

  // Les deux équipes libres les plus proches en victoires, quel que soit l'écart : sans revanche si
  // possible, sans priver une équipe en retard de ses derniers adversaires si possible.
  function plusProches(e, ids) {
    return meilleurePaire(e, ids, 99, false, true) || meilleurePaire(e, ids, 99, true, true)
      || meilleurePaire(e, ids, 99, false, false) || meilleurePaire(e, ids, 99, true, false);
  }

  function nouveauMatchSuisse(t, e, a, b, force) {
    const m = {
      id: 'm' + uid(6),
      numero: null,
      ordre: Math.max(0, ...t.matchs.map((x) => x.ordre || 0)) + 1,
      a, b,
      statut: 'attente',
      terrain: null,
      debut: null,
      fin: null,
      sets: [],
      categorie: categoriesJouees(t.reglages)[0].cle,
      victoires: [e.v(a), e.v(b)],
    };
    if (force) m.force = true;
    t.matchs.push(m);
    return m;
  }

  // Pointage : un match à jouer dont une seule équipe est arrivée ne peut pas être appelé. Les équipes
  // arrivées de deux tels matchs jouent ensemble (et les absentes ensemble), ou une équipe arrivée libre
  // prend la place de l'absente. Rend true si un match a changé.
  function reorganiserArrivees(t, e) {
    const ecart = ecartSuisse(t.reglages);
    const la = (id) => estArrivee(t, id);
    const accord = (x, y) => !e.rejoue(x, y) && Math.abs(e.v(x) - e.v(y)) <= ecart;
    const mixtes = t.matchs.filter((m) => apparieModifiable(m) && la(m.a) !== la(m.b)).sort(parOrdre);
    const cotes = (m) => (la(m.a) ? [m.a, m.b] : [m.b, m.a]);
    for (let i = 0; i < mixtes.length; i++) {
      for (let j = i + 1; j < mixtes.length; j++) {
        const [x1, y1] = cotes(mixtes[i]);
        const [x2, y2] = cotes(mixtes[j]);
        if (!accord(x1, x2) || e.rejoue(y1, y2)) continue;
        Object.assign(mixtes[i], { a: x1, b: x2, victoires: [e.v(x1), e.v(x2)] });
        Object.assign(mixtes[j], { a: y1, b: y2, victoires: [e.v(y1), e.v(y2)] });
        return true;
      }
    }
    const libres = e.actives.filter((x) => la(x) && !e.occupe.has(x) && e.n(x) < e.R).sort(e.ordre);
    for (const f of libres) {
      const m = mixtes.find((mm) => accord(f, cotes(mm)[0]));
      if (!m) continue;
      const x = cotes(m)[0];
      Object.assign(m, { a: x, b: f, victoires: [e.v(x), e.v(f)] });
      return true;
    }
    return false;
  }

  // Crée les matchs des équipes libres (voir plus haut). Si plus rien ne se joue ni ne peut être appelé,
  // les équipes libres les plus proches se rencontrent quand même, pour que le tournoi aille au bout.
  // À la fin, si une seule équipe n'a pas joué tous ses matchs, elle joue une équipe qui a fini (match en
  // plus). depart : création du tournoi, toutes les équipes dans l'ordre de la liste. Rend les matchs créés.
  function apparierSuisse(t, depart) {
    if (!estSuisse(t) || t.finale) return [];
    let e = etatSuisse(t);
    if (!depart && pointageActif(t)) {
      for (let tour = 0; tour < 200 && reorganiserArrivees(t, e); tour++) e = etatSuisse(t);
    }
    const crees = [];
    const creer = (paire) => {
      crees.push(nouveauMatchSuisse(t, e, paire[0], paire[1]));
      e = etatSuisse(t);
    };
    const libres = () => e.actives.filter((x) => !e.occupe.has(x) && e.n(x) < e.R && (depart || estArrivee(t, x)));
    const ecart = depart ? 0 : ecartSuisse(t.reglages);
    let paire;
    while ((paire = meilleurePaire(e, libres(), ecart, false, !depart))) creer(paire);
    if (depart) return crees;
    // Rien ne se joue et rien ne peut être appelé : les plus proches jouent quand même (une revanche
    // plutôt qu'un match en plus pour une équipe qui a fini).
    const rienEnJeu = () => !t.matchs.some((m) => m.phase !== 'finale' && m.statut === 'en_cours') && !matchsAppelables(t).length;
    // Avec des équipes pas encore arrivées, pas de revanche ni d'équipe privée de ses derniers adversaires :
    // on attend plutôt les arrivées.
    const absentes = pointageActif(t) && e.actives.some((x) => !estArrivee(t, x));
    while (libres().length >= 2 && rienEnJeu()) {
      paire = absentes ? meilleurePaire(e, libres(), 99, false, true) : plusProches(e, libres());
      if (!paire) break;
      creer(paire);
    }
    // Match en plus : une seule équipe n'a pas joué tous ses matchs, toutes les autres les ont (au moins prévus).
    const incompletes = e.actives.filter((x) => e.n(x) < e.R);
    if (incompletes.length === 1 && libres().length === 1) {
      const x = incompletes[0];
      const y = e.actives.filter((z) => z !== x && !e.occupe.has(z) && estArrivee(t, z))
        .sort((p, q) => Number(e.rejoue(x, p)) - Number(e.rejoue(x, q)) || Math.abs(e.v(x) - e.v(p)) - Math.abs(e.v(x) - e.v(q)) || e.ordre(p, q))[0];
      if (y) creer([x, y]);
    }
    return crees;
  }

  // Après un pointage (ou son annulation) : en système suisse, les équipes arrivées jouent entre elles ;
  // puis l'appel automatique remplit les terrains libres.
  function apresPointage(t) {
    if (estSuisse(t)) apparierSuisse(t);
    if (appelAutoActif(t) && demarre(t)) remplirTerrains(t);
  }

  // Équipes libres qui attendent un adversaire (système suisse), avec leurs victoires.
  function equipesSansAdversaire(t) {
    if (!estSuisse(t) || t.finale) return [];
    const e = etatSuisse(t);
    return e.actives.filter((x) => !e.occupe.has(x) && e.n(x) < e.R && estArrivee(t, x)).sort(e.ordre)
      .map((x) => ({ equipe: x, victoires: e.v(x), joues: e.n(x) }));
  }

  // Match que l'organisateur peut lancer quand même : les deux équipes libres les plus proches en
  // victoires (sans revanche si possible). Rend [a, b] ou null.
  function paireForcee(t) {
    const libres = equipesSansAdversaire(t).map((x) => x.equipe);
    if (libres.length < 2) return null;
    return plusProches(etatSuisse(t), libres);
  }

  function forcerMatchSuisse(t) {
    const paire = paireForcee(t);
    if (!paire) return null;
    return nouveauMatchSuisse(t, etatSuisse(t), paire[0], paire[1], true);
  }

  /* ---------- Match imposé par l'organisateur ---------- */

  // Match pas encore joué entre deux équipes (de cette catégorie de préférence), hors phase finale.
  function matchPrevuEntre(t, a, b, categorie) {
    const prevus = t.matchs.filter((m) => m.statut === 'attente' && m.phase !== 'finale'
      && ((m.a === a && m.b === b) || (m.a === b && m.b === a))).sort(parOrdre);
    return prevus.find((m) => !categorie || m.categorie === categorie) || prevus[0] || null;
  }

  // Ce que l'organisateur doit savoir avant d'imposer un match entre a et b : leur match déjà prévu,
  // s'ils jouent en ce moment, s'ils sont pointés, leurs rencontres passées, et ce que le match change.
  function infosMatchImpose(t, a, b, categorie) {
    const r = t.reglages;
    const suisse = estSuisse(t);
    const enCours = new Map(matchsEnCours(t).map((m) => [m.a, m]).concat(matchsEnCours(t).map((m) => [m.b, m])));
    const info = {
      possible: !!a && !!b && a !== b && !equipe(t, a).abandon && !equipe(t, b).abandon && !t.finale,
      prevu: a && b ? matchPrevuEntre(t, a, b, categorie) : null,
      enCoursA: enCours.get(a) || null,
      enCoursB: enCours.get(b) || null,
      pointeeA: estArrivee(t, a),
      pointeeB: estArrivee(t, b),
      joues: t.matchs.filter((m) => m.statut === 'termine' && m.phase !== 'finale' && ((m.a === a && m.b === b) || (m.a === b && m.b === a))),
      suisse,
      enPlus: [],
      defaits: [],
      memePoule: !avecPoules(t) || equipe(t, a).poule === equipe(t, b).poule,
    };
    if (suisse && info.possible) {
      const e = etatSuisse(t);
      info.victoiresA = e.v(a);
      info.victoiresB = e.v(b);
      // Un nouveau match compte dans les matchs de chaque équipe ; ses autres matchs pas encore appelés sont défaits.
      if (!info.prevu) [a, b].forEach((x) => { if (e.n(x) >= e.R) info.enPlus.push(x); });
      info.defaits = t.matchs.filter((m) => m !== info.prevu && apparieModifiable(m) && (m.a === a || m.b === a || m.a === b || m.b === b));
    }
    // Temps minimum entre deux matchs : repos qu'il reste à chaque équipe (en ms, 0 si reposée).
    const repos = reposMs(t);
    if (repos) {
      const fins = finsParEquipe(t);
      const reste = (x) => (enCours.get(x) ? 0 : Math.max(0, (fins.get(x) || 0) + repos - Date.now()));
      info.reposA = reste(a);
      info.reposB = reste(b);
    }
    info.terrain = info.possible && !info.enCoursA && !info.enCoursB ? terrainsLibres(t)[0] || null : null;
    return info;
  }

  // Impose le match a contre b : celui déjà prévu entre elles s'il existe, sinon un nouveau match (hors du
  // programme, sauf en système suisse où il compte dans leurs matchs). Il part tout de suite sur le terrain
  // donné, ou passe en priorité (il part dès que les deux équipes sont libres). Rend le match, ou null.
  function imposerMatch(t, a, b, options) {
    options = options || {};
    const info = infosMatchImpose(t, a, b, options.categorie);
    if (!info.possible) return null;
    let m = info.prevu;
    if (!m && estSuisse(t)) {
      m = nouveauMatchSuisse(t, etatSuisse(t), a, b, true);
    } else if (!m) {
      const cats = categoriesJouees(t.reglages).map((c) => c.cle);
      m = {
        id: 'm' + uid(6),
        numero: null,
        ordre: Math.max(0, ...t.matchs.map((x) => x.ordre || 0)) + 1,
        a, b,
        statut: 'attente',
        terrain: null,
        debut: null,
        fin: null,
        sets: [],
        categorie: cats.includes(options.categorie) ? options.categorie : (cats[0] || 'double'),
        ajoute: true,
      };
      if (avecPoules(t) && info.memePoule) m.poule = equipe(t, a).poule;
      t.matchs.push(m);
    }
    if (estSuisse(t)) {
      m.force = true;
      defaireAppariements(t, [a, b], m);
    }
    const terrain = options.terrain && info.terrain && terrainsLibres(t).includes(Number(options.terrain)) ? Number(options.terrain) : null;
    const avant = demarre(t);
    if (terrain) lancer(t, m, terrain);
    else prioriser(m, true);
    if (estSuisse(t)) apparierSuisse(t);
    if (appelAutoActif(t) && (avant || terrain)) remplirTerrains(t);
    return m;
  }

  // Défait les matchs à jouer encore modifiables de ces équipes (leurs victoires ont changé, ou elles
  // ne peuvent plus jouer) ; le tournoi garde toujours au moins un match.
  function defaireAppariements(t, equipes, garder) {
    const ids = new Set(equipes);
    const retirer = new Set(t.matchs.filter((m) => m !== garder && apparieModifiable(m) && (ids.has(m.a) || ids.has(m.b))));
    if (retirer.size && retirer.size === t.matchs.length) retirer.delete(t.matchs[0]);
    if (retirer.size) t.matchs = t.matchs.filter((m) => !retirer.has(m));
  }

  // Matchs du système suisse pas encore créés (ceux que les équipes doivent encore jouer).
  function matchsSuisseRestants(t) {
    if (!estSuisse(t) || t.finale) return 0;
    const e = etatSuisse(t);
    const manque = e.actives.reduce((s, x) => s + Math.max(0, e.R - e.n(x)), 0);
    return e.actives.length >= 2 ? Math.ceil(manque / 2) : 0;
  }

  // Matchs qu'une équipe doit encore jouer et qui ne sont pas encore créés (système suisse).
  function matchsSuisseAVenir(t, equipeId) {
    if (!estSuisse(t) || t.finale || equipe(t, equipeId).abandon) return 0;
    const e = etatSuisse(t);
    return e.actives.length >= 2 ? Math.max(0, e.R - e.n(equipeId)) : 0;
  }

  // « autant », « autant, ou une de plus ou de moins »… : adversaires possibles selon l'écart accepté.
  function texteEcartSuisse(r) {
    const ecart = ecartSuisse(r);
    if (!ecart) return 'autant de victoires';
    return 'autant de victoires, ou ' + (ecart === 1 ? 'une' : ecart) + ' de plus ou de moins';
  }

  // Le système suisse est fini : tous les matchs créés sont joués et plus aucune équipe n'en attend.
  function suisseFini(t) {
    if (!estSuisse(t)) return true;
    if (t.matchs.some((m) => m.phase !== 'finale' && m.statut !== 'termine')) return false;
    return matchsSuisseRestants(t) === 0;
  }

  // Nombre total de matchs prévus (les matchs du système suisse pas encore créés compris).
  function nbMatchsPrevus(t) {
    return t.matchs.length + matchsSuisseRestants(t);
  }

  /* ---------- Terrains ---------- */

  const parOrdre = (x, y) => x.ordre - y.ordre;

  function matchsEnCours(t) {
    return t.matchs.filter((m) => m.statut === 'en_cours').sort((x, y) => x.terrain - y.terrain);
  }

  function matchsEnAttente(t) {
    return t.matchs.filter((m) => m.statut === 'attente').sort(parOrdre);
  }

  // Terrains fermés pour un moment (filet cassé, salle partagée…) : plus aucun match n'y est appelé.
  function terrainsFermes(t) {
    return enTableau(t.fermes).map(Number).filter((n) => n >= 1 && n <= t.reglages.terrains);
  }

  function terrainFerme(t, n) {
    return terrainsFermes(t).includes(Number(n));
  }

  function nbTerrainsOuverts(t) {
    return Math.max(0, t.reglages.terrains - terrainsFermes(t).length);
  }

  function fermerTerrain(t, n) {
    const liste = terrainsFermes(t).filter((x) => x !== Number(n));
    liste.push(Number(n));
    t.fermes = liste.sort((a, b) => a - b);
  }

  function ouvrirTerrain(t, n) {
    t.fermes = terrainsFermes(t).filter((x) => x !== Number(n));
    if (!t.fermes.length) delete t.fermes;
  }

  function terrainsLibres(t) {
    const pris = new Set(matchsEnCours(t).map((m) => m.terrain));
    const fermes = new Set(terrainsFermes(t));
    const libres = [];
    for (let i = 1; i <= t.reglages.terrains; i++) if (!pris.has(i) && !fermes.has(i)) libres.push(i);
    return libres;
  }

  /* ---------- Pointage des équipes à l'arrivée ----------
     Avec le pointage, une équipe ne joue qu'une fois arrivée : elle le signale sur son téléphone,
     ou l'organisation la pointe à la table de marque (champ « arrivee » de l'équipe, heure d'arrivée).
     D'ici là, ses matchs ne sont pas appelés et n'ont ni numéro ni heure prévus. */

  function pointageActif(t) {
    return !!(t.reglages && t.reglages.pointage);
  }

  // L'équipe peut-elle être appelée ? (toujours sans pointage ; une équipe inconnue ne bloque rien)
  function estArrivee(t, equipeId) {
    if (!pointageActif(t)) return true;
    const e = t.equipes.find((x) => x.id === equipeId);
    return !e || !!e.arrivee;
  }

  function matchPointe(t, m) {
    return estArrivee(t, m.a) && estArrivee(t, m.b);
  }

  // Équipes attendues (pas encore arrivées, sans compter celles qui ont abandonné).
  function equipesAttendues(t) {
    return pointageActif(t) ? t.equipes.filter((e) => !e.arrivee && !e.abandon) : [];
  }

  function pointer(t, equipeId, quand) {
    const e = t.equipes.find((x) => x.id === equipeId);
    if (!e || e.arrivee) return false;
    e.arrivee = quand || Date.now();
    return true;
  }

  function annulerPointage(t, equipeId) {
    const e = t.equipes.find((x) => x.id === equipeId);
    if (!e || !e.arrivee) return false;
    delete e.arrivee;
    return true;
  }

  // Une équipe qui a joué (ou joue) est forcément arrivée : utile quand le pointage est activé en cours de tournoi.
  function pointerEquipesVenues(t) {
    t.matchs.forEach((m) => {
      if (m.statut === 'en_cours' || (m.statut === 'termine' && !m.forfait)) {
        pointer(t, m.a, m.debut || m.fin || Date.now());
        pointer(t, m.b, m.debut || m.fin || Date.now());
      }
    });
  }

  // Matchs en attente qui peuvent être appelés : les deux équipes sont arrivées.
  function matchsAppelables(t) {
    return matchsEnAttente(t).filter((m) => matchPointe(t, m));
  }

  // Matchs en attente bloqués par une équipe pas encore arrivée.
  function matchsEnAttenteArrivee(t) {
    return pointageActif(t) ? matchsEnAttente(t).filter((m) => !matchPointe(t, m)) : [];
  }

  // Équipes d'un match prioritaire qui attend : gardées pour lui. Sans cela, quand l'une des deux
  // joue encore, l'autre part sur un autre match dès qu'un terrain se libère, et les deux ne sont
  // jamais libres en même temps : le match prioritaire n'était plus appelé.
  function equipesReservees(attente) {
    const reservees = new Set();
    attente.forEach((m) => {
      if (m.priorite) { reservees.add(m.a); reservees.add(m.b); }
    });
    return reservees;
  }
  const bloqueParPriorite = (m, reservees) => !m.priorite && (reservees.has(m.a) || reservees.has(m.b));

  // Choisit le prochain match parmi ceux dont les deux équipes sont libres :
  // d'abord les matchs mis en priorité par un organisateur (leurs équipes ne partent pas jouer
  // ailleurs en attendant), puis ceux où aucune équipe ne sort du terrain, puis les équipes qui
  // ont le moins joué, puis l'ordre de la file.
  function choisir(attente, occupees, eviter, joues, pret) {
    let meilleur = null;
    let cleMeilleure = null;
    const reservees = equipesReservees(attente);
    for (const m of attente) {
      if (occupees.has(m.a) || occupees.has(m.b)) continue;
      if (bloqueParPriorite(m, reservees)) continue;
      if (pret && !pret(m)) continue;
      const cle = [
        m.priorite ? 0 : 1,
        m.reporte ? 1 : 0,
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

  // Équipes du dernier match terminé sur un terrain : elles ne rejouent pas tout de suite si possible.
  function sortiesDuTerrain(t) {
    let dernier = null;
    t.matchs.forEach((m) => {
      if (m.statut === 'termine' && m.debut && m.fin && (!dernier || m.fin > dernier.fin)) dernier = m;
    });
    return dernier ? new Set([dernier.a, dernier.b]) : null;
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

  /* ---------- Numéros des matchs ----------
     Un match reçoit son numéro quand il est appelé (ou terminé sans avoir été appelé) :
     les numéros se suivent dans l'ordre réel des appels. Un match en attente a un numéro
     prévu, calculé sur l'ordre d'appel estimé (planifier). */

  function dernierNumero(t) {
    return t.matchs.reduce((x, m) => (m.statut !== 'attente' && m.numero ? Math.max(x, m.numero) : x), 0);
  }

  function numeroter(t, m) {
    if (m.statut === 'attente' || !m.numero) m.numero = dernierNumero(t) + 1;
  }

  // Calcul gardé en mémoire tant que l'état des matchs ne change pas.
  const cacheNumeros = new WeakMap();
  function numerosPrevus(t) {
    const r = t.reglages;
    const empreinte = [r.terrains, terrainsFermes(t).join('.'), r.reposMin, r.dureePrevue, r.dureeLimite, r.sets, r.points, r.heureDebut,
      r.reposMin ? Math.floor(Date.now() / 15000) : '', r.pointage ? t.equipes.map((e) => (e.arrivee ? 1 : 0)).join('') : '']
      .join('|') + '|' + t.matchs.map((m) => m.id + m.statut + (m.numero || '') + m.ordre + (m.priorite ? 'p' : '') + (m.reporte ? 'r' : '') + (m.debut || '') + '-' + (m.fin || '')).join(',');
    let entree = cacheNumeros.get(t);
    if (!entree || entree.empreinte !== empreinte) {
      const carte = new Map();
      let n = dernierNumero(t);
      planifier(t, dureeMatch(t)).forEach(({ m }) => carte.set(m.id, ++n));
      entree = { empreinte, carte };
      cacheNumeros.set(t, entree);
    }
    return entree.carte;
  }

  // Numéro à afficher pour un match (définitif s'il a été appelé, prévu sinon).
  function numero(t, m) {
    if (m.statut === 'attente') return numerosPrevus(t).get(m.id) || '';
    return m.numero || '';
  }

  // Dernier numéro appelé : « on en est au match n° … ».
  function numeroActuel(t) {
    return dernierNumero(t);
  }

  function lancer(t, m, terrain, maintenant) {
    numeroter(t, m);
    m.statut = 'en_cours';
    m.terrain = terrain;
    m.debut = maintenant || Date.now();
    m.fin = null;
    delete m.priorite;
    delete m.reporte;
    // Un match lancé à la main avec une équipe pas pointée : elle est là, elle est pointée.
    if (pointageActif(t)) {
      pointer(t, m.a, m.debut);
      pointer(t, m.b, m.debut);
    }
  }

  /* ---------- Repos minimum entre deux matchs d'une équipe ---------- */

  function reposMs(t) {
    return (Number(t.reglages.reposMin) || 0) * 60000;
  }

  // Heure de fin du dernier match joué sur un terrain par chaque équipe.
  function finsParEquipe(t) {
    const fins = new Map();
    t.matchs.forEach((m) => {
      if (m.statut !== 'termine' || !m.fin || !m.debut) return;
      [m.a, m.b].forEach((e) => fins.set(e, Math.max(fins.get(e) || 0, m.fin)));
    });
    return fins;
  }

  // Temps d'attente (ms) avant qu'un match aux équipes libres puisse être appelé :
  // 0 s'il y en a un tout de suite, null s'il n'y en a aucun ou sans repos minimum.
  function attenteRepos(t, maintenant) {
    const R = reposMs(t);
    if (!R) return null;
    maintenant = maintenant || Date.now();
    const occupees = new Set();
    matchsEnCours(t).forEach((m) => { occupees.add(m.a); occupees.add(m.b); });
    const fins = finsParEquipe(t);
    let min = null;
    const appelables = matchsAppelables(t);
    const reservees = equipesReservees(appelables);
    // Un match reporté attend la fin d'un autre match ; s'il n'y en a plus en cours, il est appelé
    // à la fin du repos comme les autres (sinon il ne le serait jamais).
    const rienEnJeu = !occupees.size;
    appelables.forEach((m) => {
      if ((m.reporte && !rienEnJeu) || occupees.has(m.a) || occupees.has(m.b) || bloqueParPriorite(m, reservees)) return;
      const pret = Math.max(fins.get(m.a) || 0, fins.get(m.b) || 0) + R;
      const reste = Math.max(0, pret - maintenant);
      min = min === null ? reste : Math.min(min, reste);
    });
    return min;
  }

  // Appelle un match sur chaque terrain libre (ou seulement sur les terrains
  // indiqués). Retourne les matchs appelés. Un appel à la main peut ignorer le repos minimum.
  function remplirTerrains(t, eviter, seulement, exclus, ignorerRepos) {
    if (estSuisse(t)) apparierSuisse(t);
    eviter = eviter || sortiesDuTerrain(t);
    const occupees = new Set();
    matchsEnCours(t).forEach((m) => { occupees.add(m.a); occupees.add(m.b); });
    const attente = matchsAppelables(t).filter((m) => !exclus || !exclus.has(m.id));
    const joues = compterJoues(t);
    const R = ignorerRepos ? 0 : reposMs(t);
    const fins = R ? finsParEquipe(t) : null;
    const maintenant = Date.now();
    const pret = R ? (m) => (fins.get(m.a) || 0) + R <= maintenant && (fins.get(m.b) || 0) + R <= maintenant : null;
    const appeles = [];
    const cibles = terrainsLibres(t).filter((n) => !seulement || seulement.includes(n));
    for (const terrain of cibles) {
      const m = choisir(attente, occupees, eviter, joues, pret);
      if (!m) break;
      lancer(t, m, terrain);
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
    const horlogeDonnee = !!maintenant;
    maintenant = maintenant || Date.now();
    let D = duree || 0;
    // Avant le lancement, les heures partent de l'heure de début prévue si elle est à venir.
    // Sans heure de début à venir, on ne donne pas d'heure (on ne sait pas quand le tournoi sera lancé).
    if (!demarre(t) && !horlogeDonnee) {
      const debut = heureDuJour(t.reglages.heureDebut, maintenant);
      if (debut !== null && debut > maintenant) maintenant = debut;
      else D = 0;
    }
    const T = nbTerrainsOuverts(t);
    // Un match en cours sur un terrain fermé ou retiré n'occupe pas de place : ce terrain ne resservira pas.
    const fermes = new Set(terrainsFermes(t));
    const enJeu = t.matchs.filter((m) => m.statut === 'en_cours')
      .sort((x, y) => (x.debut || 0) - (y.debut || 0))
      .map((m) => ({ m, fin: Math.max(maintenant, (m.debut || maintenant) + D), compte: !fermes.has(m.terrain) && m.terrain <= t.reglages.terrains }));
    let places = enJeu.filter((x) => x.compte).length;
    // Les matchs d'une équipe pas encore arrivée ne sont pas prévus : on ne sait pas quand elle viendra.
    const attente = matchsAppelables(t);
    const occupees = new Set();
    enJeu.forEach(({ m }) => { occupees.add(m.a); occupees.add(m.b); });
    const joues = compterJoues(t);
    // Le repos minimum ne compte dans la prévision que si l'on connaît la durée des matchs.
    const R = D ? reposMs(t) : 0;
    const fins = R ? finsParEquipe(t) : new Map();
    let eviter = sortiesDuTerrain(t);
    let horloge = maintenant;
    const pret = R ? (m) => (fins.get(m.a) || 0) + R <= horloge && (fins.get(m.b) || 0) + R <= horloge : null;
    // Un match reporté ne revient qu'à la fin d'un match (pas tout de suite, ni à la fin d'un repos).
    let apresFin = false;
    const sansReporte = (m) => !m.reporte && (!pret || pret(m));
    const resultat = [];
    while (attente.length) {
      if (places < T) {
        const m = choisir(attente, occupees, eviter, joues, apresFin ? pret : sansReporte);
        if (m) {
          resultat.push({ m, heure: D ? horloge : null });
          prendre(m, attente, occupees, joues);
          enJeu.push({ m, fin: horloge + D, compte: true });
          enJeu.sort((x, y) => x.fin - y.fin);
          places++;
          continue;
        }
        // Des équipes libres se reposent encore : on avance jusqu'à la fin de leur repos.
        if (R) {
          let prochain = null;
          const reservees = equipesReservees(attente);
          attente.forEach((x) => {
            if (x.reporte || occupees.has(x.a) || occupees.has(x.b) || bloqueParPriorite(x, reservees)) return;
            const p = Math.max(fins.get(x.a) || 0, fins.get(x.b) || 0) + R;
            if (prochain === null || p < prochain) prochain = p;
          });
          if (prochain !== null && prochain > horloge && (!enJeu.length || prochain < enJeu[0].fin)) {
            horloge = prochain;
            apresFin = false;
            continue;
          }
        }
      }
      const fini = enJeu.shift();
      if (!fini) {
        attente.forEach((m) => resultat.push({ m, heure: null }));
        break;
      }
      if (fini.compte) places--;
      horloge = Math.max(horloge, fini.fin);
      occupees.delete(fini.m.a);
      occupees.delete(fini.m.b);
      if (R) { fins.set(fini.m.a, fini.fin); fins.set(fini.m.b, fini.fin); }
      eviter = new Set([fini.m.a, fini.m.b]);
      apresFin = true;
    }
    return resultat;
  }

  function prochains(t) {
    return planifier(t, dureeMatch(t)).map((x) => x.m);
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
    return dureeReglee(t.reglages);
  }

  // Durée d'un match d'après les réglages : la durée prévue par les organisateurs,
  // sinon une estimation d'après le format (ms).
  function dureeReglee(r) {
    // Durée prévue par l'organisateur, sans dépasser la durée maximum d'un match.
    if (Number(r.dureePrevue) > 0) return Math.min(Number(r.dureePrevue), Number(r.dureeLimite) > 0 ? Number(r.dureeLimite) : Infinity) * 60 * 1000;
    return dureeSelonFormat(r);
  }

  // Estimation d'après le format : environ 25 secondes par point joué (échanges et pauses compris),
  // le perdant d'un set marquant en moyenne les deux tiers des points du gagnant, une minute pour
  // s'installer, et au plus la durée maximum réglée.
  const SECONDES_PAR_POINT = 25;
  function dureeSelonFormat(reg) {
    const n = Math.max(1, Number(reg.sets) || 1);
    const sets = reg.auMeilleur && n > 1 && n % 2 === 1 ? (n + 1) / 2 + 0.4 * (n - 1) / 2 : n;
    const points = sets * (Number(reg.points) || 15) * 1.65;
    let minutes = Math.round((points * SECONDES_PAR_POINT + 60) / 60);
    if (Number(reg.dureeLimite) > 0) minutes = Math.min(minutes, Number(reg.dureeLimite));
    return Math.max(1, minutes) * 60 * 1000;
  }

  // Durée d'un match de phase finale quand elle a son propre format.
  function dureeFinale(t, D) {
    const r = t.reglages;
    if (!r.formatFinale) return D;
    return Math.round(D * dureeSelonFormat(formatMatch(t, { phase: 'finale' })) / dureeSelonFormat(r));
  }

  /* ---------- Horaires ---------- */

  // « 14:30 » → horodatage de ce jour-là (jour de « ref »), ou null.
  function heureDuJour(hhmm, ref) {
    const x = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
    if (!x || Number(x[1]) > 23 || Number(x[2]) > 59) return null;
    const d = new Date(ref || Date.now());
    d.setHours(Number(x[1]), Number(x[2]), 0, 0);
    return d.getTime();
  }

  // Heure à laquelle il faut rendre la salle, le jour de « ref » (le lendemain si elle est avant le début).
  function heureFinSalle(t, ref) {
    ref = ref || Date.now();
    // Point de départ : premier match lancé, sinon l'heure de début prévue, sinon maintenant.
    const debuts = t.matchs.filter((m) => m.debut).map((m) => m.debut);
    const base = debuts.length ? Math.min(...debuts) : (heureDuJour(t.reglages.heureDebut, ref) || ref);
    const fin = heureDuJour(t.reglages.heureFin, base);
    if (fin === null) return null;
    return fin <= base ? fin + 24 * 3600 * 1000 : fin;
  }

  // Durée estimée (ms) d'un tournoi pas encore commencé, phase finale comprise, avec des matchs de D ms.
  function dureeEstimee(t, D) {
    if (!D || !t.matchs.length) return null;
    const base = Date.UTC(2000, 0, 3, 8);
    const copie = Object.assign({}, t, { reglages: Object.assign({}, t.reglages, { heureDebut: '', pointage: false }) });
    let fin = base;
    planifier(copie, D, base).forEach((x) => { if (x.heure) fin = Math.max(fin, x.heure + D); });
    const T = Math.max(1, nbTerrainsOuverts(t));
    fin += dureeSuisseRestante(t, D, T);
    const DF = dureeFinale(t, D);
    toursFinaleRestants(t).forEach((n) => { fin += Math.ceil(n / T) * DF; });
    return fin - base;
  }

  // Système suisse : durée des matchs pas encore créés (une équipe ne joue qu'un match à la fois).
  function dureeSuisseRestante(t, D, T) {
    const restants = matchsSuisseRestants(t);
    if (!restants) return 0;
    const e = etatSuisse(t);
    const parTour = Math.max(1, Math.min(T, Math.floor(e.actives.length / 2)));
    return Math.ceil(restants / parTour) * D;
  }

  // Minutes de dépassement de l'heure de fin de la salle (0 si ça tient), ou null si on ne sait pas.
  function depassementSalle(t, fin, ref) {
    const limite = heureFinSalle(t, ref);
    if (!fin || limite === null) return null;
    return Math.max(0, Math.ceil((fin - limite) / 60000));
  }

  // Tournoi pas commencé qui finirait après l'heure de fin de la salle : changements de réglages qui
  // le feraient finir au moins 10 minutes avant, chacun seul (sinon moins de points ou une durée
  // maximum, avec moins de matchs).
  // Chaque solution : { texte, changements, fin } ; changements = { points: 11 }, { sets: 1 },
  // { dureeLimite: 12, formatFinale: true, … }, { cat: { cle, k, max } }, { nbPoules: 4 },
  // { terrains: 8 } ou { reposMin: 0 }. Les estimations reprennent dureeEstimee.
  function solutionsHoraires(t) {
    const r = t.reglages;
    const debut = heureDuJour(r.heureDebut);
    if (debut === null || !r.heureFin || !t.matchs.length || demarre(t)) return [];
    const n = t.equipes.length;
    const poules = r.format === 'poules';
    const appliquer = (changements) => {
      const r2 = JSON.parse(JSON.stringify(r));
      Object.keys(changements).forEach((cle) => {
        if (cle === 'cat') r2.cat[changements.cat.cle] = { k: changements.cat.k, max: changements.cat.max, tous: false };
        else r2[cle] = changements[cle];
      });
      return r2;
    };
    const estimer = (changements) => {
      const r2 = appliquer(changements);
      if (verifierDeroulement(n, r2)) return null;
      let tt;
      if (changements.cat || changements.nbPoules) {
        tt = { id: 'solution', nom: '', reglages: r2, matchs: [], equipes: t.equipes.map((e) => ({ id: e.id, nom: e.nom, joueurs: '' })) };
        genererMatchs(tt);
      } else {
        tt = Object.assign({}, t, { reglages: r2 });
      }
      const duree = dureeEstimee(tt, dureeReglee(r2));
      if (!duree) return null;
      // retard : minutes qui manquent pour finir 10 minutes avant la fin de la salle.
      return { fin: debut + duree, retard: depassementSalle(tt, debut + duree + 10 * 60000, debut) };
    };
    const actuel = estimer({});
    if (!actuel || depassementSalle(t, actuel.fin, debut) === 0) return [];
    // Première option qui tient, de la plus douce à la plus forte.
    const premiere = (options) => {
      for (const o of options) {
        const e = estimer(o.changements);
        if (e && !e.retard) return Object.assign({ fin: e.fin }, o);
      }
      return null;
    };
    const format = Number(r.dureePrevue) > 0 ? [] : null; // durée prévue fixée : points et sets n'y changent rien
    const minutes = Math.round(dureeReglee(r) / 60000);
    const Q = poules ? (r.qualifiesParPoule > 0 ? r.qualifiesParPoule * r.nbPoules : 0) : Number(r.phaseFinale) || 0;
    const optionsPoints = format || [15, 11].filter((p) => p < r.points).map((p) => ({
      texte: 'Sets de ' + p + ' points au lieu de ' + r.points,
      avec: 'des sets de ' + p + ' points',
      changements: { points: p, plafond: r.ecart2 ? plafondAuto(p) : Math.min(r.plafond, p) },
    }));
    const optionsSets = format || (r.sets > 1 ? [{
      texte: 'Un seul set par match au lieu ' + (r.sets % 2 === 1 && r.auMeilleur ? 'du meilleur des ' + r.sets : 'de ' + r.sets),
      changements: { sets: 1 },
    }] : []);
    const optionsDuree = [25, 20, 15, 12, 10, 8].filter((d) => d < minutes && (!r.dureeLimite || d < r.dureeLimite)).map((d) => {
      const changements = { dureeLimite: d };
      let texte = 'Durée maximum de ' + d + ' min par match' + (r.dureeLimite ? ' au lieu de ' + r.dureeLimite : '');
      let avec = 'une durée maximum de ' + d + ' min par match';
      if (Q >= 2 && !r.formatFinale) {
        // Une phase finale ne peut pas finir à égalité : elle garde le format actuel, sans limite de temps.
        Object.assign(changements, { formatFinale: true, finaleSets: r.sets % 2 === 1 ? r.sets : 1, finaleAuMeilleur: r.auMeilleur, finalePoints: r.points });
        texte += ', phase finale sans limite de temps';
        avec += ' (phase finale sans limite de temps)';
      }
      return { texte, avec, changements };
    });
    // Moins de matchs : la catégorie qui en compte le plus, ou une poule de plus.
    const tailles = poules ? taillesPoules(n, r.nbPoules) : [n];
    const cats = categoriesJouees(r).map((c) => Object.assign({}, c, { nb: c.tous ? Math.max(...tailles) - 1 : c.k }));
    const grande = cats.sort((a, b) => b.nb - a.nb)[0];
    const optionsMatchs = (avec) => {
      const liste = [];
      if (r.format === 'suisse') {
        const R = matchsSuisse(r);
        let bas = 1;
        let haut = R - 1;
        let trouve = null;
        while (bas <= haut) {
          const k = Math.floor((bas + haut) / 2);
          const o = { texte: k + ' match' + (k > 1 ? 's' : '') + ' par équipe au lieu de ' + R, changements: Object.assign({ matchsSuisse: k }, avec) };
          const e = estimer(o.changements);
          if (e && !e.retard) { trouve = Object.assign({ fin: e.fin }, o); bas = k + 1; } else haut = k - 1;
        }
        if (trouve) liste.push(trouve);
      } else if (poules && grande && grande.tous) {
        for (let p = r.nbPoules + 1; p <= Math.min(8, r.nbPoules + 2); p++) {
          liste.push({ texte: p + ' poules au lieu de ' + r.nbPoules + ' (moins de matchs par équipe)', changements: Object.assign({ nbPoules: p }, avec) });
        }
      } else if (grande && grande.nb > 1) {
        // Le plus de matchs possible (recherche par dichotomie : moins de matchs, fin plus tôt).
        const option = (k) => ({
          texte: k + ' ' + (k > 1 ? grande.pluriel : grande.nom.toLowerCase()) + ' par équipe au lieu de ' + grande.nb + (grande.tous ? ' (contre toutes les autres)' : ''),
          changements: Object.assign({ cat: { cle: grande.cle, k, max: maximumNecessaire(tailles, k) } }, avec),
        });
        let bas = 1;
        let haut = grande.nb - 1;
        let trouve = null;
        while (bas <= haut) {
          const k = Math.floor((bas + haut) / 2);
          const e = estimer(option(k).changements);
          if (e && !e.retard) { trouve = Object.assign({ fin: e.fin }, option(k)); bas = k + 1; } else haut = k - 1;
        }
        if (trouve) liste.push(trouve);
      }
      return liste;
    };
    const solutions = [];
    const ajouter = (s) => { if (s) solutions.push(s); };
    ajouter(premiere(optionsPoints));
    ajouter(premiere(optionsSets));
    ajouter(premiere(optionsDuree));
    const matchs = optionsMatchs({});
    ajouter(matchs[0] && matchs[0].fin ? matchs[0] : premiere(matchs));
    const terrains = [1, 2].filter((x) => r.terrains + x <= 30).map((x) => ({
      texte: (r.terrains + x) + ' terrains au lieu de ' + r.terrains + ', si la salle en a',
      changements: { terrains: r.terrains + x },
    }));
    ajouter(premiere(terrains));
    if (r.reposMin > 0) ajouter(premiere([{ texte: 'Pas de repos minimum entre deux matchs', changements: { reposMin: 0 } }]));
    if (solutions.length) return solutions;
    // Rien ne suffit seul : le format le plus court, avec moins de matchs.
    const courts = optionsPoints.slice(-1).concat(optionsDuree.slice(-1));
    for (const c of courts) {
      const avec = optionsMatchs(c.changements);
      const s = avec[0] && avec[0].fin ? avec[0] : premiere(avec);
      if (s) return [Object.assign({}, s, { texte: s.texte + ', avec ' + c.avec })];
    }
    return [];
  }

  // Heure de fin estimée du tournoi, ou null.
  function finEstimee(t, maintenant) {
    maintenant = maintenant || Date.now();
    const D = dureeMatch(t);
    if (!D || !demarre(t)) return null;
    let fin = maintenant;
    t.matchs.forEach((m) => { if (m.statut === 'en_cours') fin = Math.max(fin, (m.debut || maintenant) + D); });
    planifier(t, D, maintenant).forEach((x) => { if (x.heure) fin = Math.max(fin, x.heure + D); });
    const T = Math.max(1, nbTerrainsOuverts(t));
    // Matchs des équipes pas encore arrivées : joués après, une équipe ne jouant qu'un match à la fois.
    const bloques = matchsEnAttenteArrivee(t);
    if (bloques.length) {
      const parEquipe = new Map();
      bloques.forEach((m) => [m.a, m.b].forEach((e) => { if (!estArrivee(t, e)) parEquipe.set(e, (parEquipe.get(e) || 0) + 1); }));
      fin += Math.max(Math.ceil(bloques.length / T), ...parEquipe.values()) * D;
    }
    fin += dureeSuisseRestante(t, D, T);
    const DF = dureeFinale(t, D);
    toursFinaleRestants(t).forEach((n) => { fin += Math.ceil(n / T) * DF; });
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
      if (t.reglages.petiteFinale && Q >= 4) tours[tours.length - 1] += 1;
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
      if (tour === R - 1 && R >= 2 && t.reglages.petiteFinale && t.finale.places.filter(Boolean).length >= 4 && !matchTableau(t, tour, 0, true)) n++;
      if (n) tours.push(n);
    }
    return tours;
  }

  // Un match prioritaire est appelé avant les autres dès que ses deux équipes sont libres.
  // Un match reporté puis mis en priorité n'est plus reporté : il passe devant dès que possible.
  function prioriser(m, active) {
    if (active) {
      m.priorite = true;
      delete m.reporte;
    } else {
      delete m.priorite;
    }
  }

  // Passe un match en fin de file (équipe absente, erreur d'appel…).
  function reporter(t, m) {
    const etaitEnCours = m.statut === 'en_cours';
    const lance = demarre(t);
    m.statut = 'attente';
    m.numero = null;
    m.terrain = null;
    m.debut = null;
    m.ordre = Math.max(0, ...t.matchs.map((x) => x.ordre)) + 1;
    delete m.priorite;
    m.reporte = true;
    // Le match reporté n'est pas rappelé tout de suite sur le terrain qu'il libère.
    if (etaitEnCours && appelAutoActif(t)) remplirTerrains(t, new Set([m.a, m.b]), null, new Set([m.id]));
    // Match en attente reporté (par exemple un match prioritaire) : ses équipes ne sont plus gardées.
    else if (!etaitEnCours && lance && appelAutoActif(t)) remplirTerrains(t, null, null, new Set([m.id]));
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

  // Score le plus haut possible dans un set (null : pas de limite, avec 2 points d'écart sans maximum).
  function maxPointsSet(reg) {
    if (!reg.ecart2) return reg.points;
    return reg.plafond > reg.points ? reg.plafond : null;
  }

  // Case de score : chiffres seulement, 2 au plus.
  const chiffresScore = (v) => String(v == null ? '' : v).replace(/\D/g, '').slice(0, 2);

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

  // forfaitDe : équipe perdante quand le match est réglé par forfait.
  function enregistrerScore(t, m, sets, forfaitDe) {
    const etaitEnCours = m.statut === 'en_cours';
    const etaitAppele = m.statut !== 'attente';
    const lance = demarre(t);
    const gagnantAvant = m.statut === 'termine' ? resultat(m).gagnant || 'nul' : null;
    // Score saisi sans appel : les deux équipes ont joué, elles sont donc là. Un match appelé les a déjà
    // pointées, et un forfait ne prouve pas que l'équipe forfait est venue.
    if (pointageActif(t) && !etaitEnCours && !forfaitDe) {
      pointer(t, m.a, m.debut || Date.now());
      pointer(t, m.b, m.debut || Date.now());
    }
    // Un match jamais appelé et réglé par forfait ne prend pas de numéro.
    if (forfaitDe && !etaitAppele) m.numero = null;
    else numeroter(t, m);
    m.sets = sets;
    m.statut = 'termine';
    if (forfaitDe) m.forfait = forfaitDe;
    else delete m.forfait;
    delete m.forfaitAbandon;
    delete m.priorite;
    delete m.reporte;
    if (etaitEnCours || !m.fin) m.fin = Date.now();
    if (t.finale) avancerTableau(t);
    if (estSuisse(t)) {
      // Résultat corrigé qui change le vainqueur : les prochains adversaires de ces équipes sont revus.
      if (gagnantAvant && gagnantAvant !== (resultat(m).gagnant || 'nul')) defaireAppariements(t, [m.a, m.b], m);
      apparierSuisse(t);
    }
    // Terrain libéré, ou équipes libérées (par exemple un match prioritaire réglé sans être joué) : l'appel repart.
    if (etaitEnCours && appelAutoActif(t)) remplirTerrains(t, new Set([m.a, m.b]));
    else if (!etaitEnCours && lance && appelAutoActif(t)) remplirTerrains(t);
  }

  // Score donné par un forfait : l'équipe présente gagne tous les sets nécessaires sans perdre de point.
  function setsForfait(reg, gagnantEstA) {
    const n = reg.auMeilleur && reg.sets % 2 === 1 ? (reg.sets + 1) / 2 : reg.sets;
    return Array.from({ length: n }, () => (gagnantEstA ? [reg.points, 0] : [0, reg.points]));
  }

  // Forfait sur un seul match.
  function enregistrerForfait(t, m, perdantId) {
    enregistrerScore(t, m, setsForfait(formatMatch(t, m), perdantId === m.b), perdantId);
  }

  // Abandon d'une équipe : tous ses matchs restants sont perdus par forfait.
  function abandonEquipe(t, equipeId) {
    const lance = demarre(t);
    const e = t.equipes.find((x) => x.id === equipeId);
    if (e) e.abandon = Date.now();
    // Système suisse : ses prochains matchs pas encore appelés sont défaits, ses adversaires en retrouvent un autre.
    if (estSuisse(t)) defaireAppariements(t, [equipeId]);
    const liberees = new Set();
    t.matchs.forEach((m) => {
      if (m.statut === 'termine' || (m.a !== equipeId && m.b !== equipeId)) return;
      if (m.statut === 'en_cours') { liberees.add(m.a); liberees.add(m.b); } else m.numero = null;
      m.sets = setsForfait(formatMatch(t, m), equipeId === m.b);
      m.statut = 'termine';
      m.fin = Date.now();
      m.forfait = equipeId;
      m.forfaitAbandon = true;
      delete m.priorite;
      delete m.reporte;
    });
    if (t.finale) avancerTableau(t);
    if (estSuisse(t)) apparierSuisse(t);
    if (lance && appelAutoActif(t)) remplirTerrains(t, liberees);
  }

  // Annule l'abandon : les matchs perdus par forfait pour cette équipe redeviennent à jouer.
  // Matchs perdus par forfait à cause de l'abandon de l'équipe. Un forfait posé à la main n'en fait pas
  // partie ; seuls les très anciens tournois (abandon « true », sans marquage) rouvrent tous ses forfaits.
  function matchsAbandon(t, equipeId) {
    const e = t.equipes.find((x) => x.id === equipeId);
    const marques = t.matchs.some((m) => m.forfaitAbandon && m.forfait === equipeId);
    const ancien = !marques && !!e && e.abandon === true;
    return t.matchs.filter((m) => m.statut === 'termine' && m.forfait === equipeId && (m.forfaitAbandon || ancien));
  }

  // L'abandon ne peut plus être annulé quand la suite du tableau d'un de ses matchs de phase finale a commencé.
  function abandonAnnulable(t, equipeId) {
    return !matchsAbandon(t, equipeId).some((m) => suiteCommencee(t, m));
  }

  // Retourne false si l'annulation est impossible (suite du tableau commencée).
  function annulerAbandon(t, equipeId) {
    if (!abandonAnnulable(t, equipeId)) return false;
    const rouvrir = matchsAbandon(t, equipeId);
    const e = t.equipes.find((x) => x.id === equipeId);
    if (e) delete e.abandon;
    rouvrir.forEach((m) => {
      const adversaire = m.a === equipeId ? m.b : m.a;
      if (equipe(t, adversaire).abandon) {
        // L'adversaire est toujours parti : le match reste perdu par forfait, à son nom.
        m.forfait = adversaire;
        m.sets = setsForfait(formatMatch(t, m), adversaire === m.b);
        m.forfaitAbandon = true;
        return;
      }
      delete m.forfaitAbandon;
      m.statut = 'attente';
      m.sets = [];
      m.fin = null;
      m.debut = null;
      m.terrain = null;
      delete m.forfait;
      m.numero = null;
    });
    if (t.finale) avancerTableau(t);
    if (estSuisse(t)) apparierSuisse(t);
    if (demarre(t) && appelAutoActif(t)) remplirTerrains(t);
    return true;
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
    return t.matchs.length > 0 && t.matchs.every((m) => m.phase === 'finale' || m.statut === 'termine') && suisseFini(t);
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
      id: 'm' + uid(6), numero: null, ordre: plusGrand('ordre') + 1,
      a: v.a, b: v.b, statut: 'attente', terrain: null, debut: null, fin: null, sets: [],
      phase: 'finale', tour: v.tour, slot: v.slot, categorie: categorieFinale(t.reglages),
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
      m.forfaitAbandon = true;
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
          else if (m.statut === 'attente' && (m.a !== v.a || m.b !== v.b)) { m.a = v.a; m.b = v.b; change = true; }
        } else if (m && m.statut === 'attente') {
          t.matchs.splice(t.matchs.indexOf(m), 1);
          change = true;
        }
      });
      // Retire la petite finale si l'option a été désactivée avant qu'elle se termine.
      if (!t.reglages.petiteFinale) {
        const p = matchTableau(t, R - 1, 0, true);
        if (p && p.statut === 'attente') { t.matchs.splice(t.matchs.indexOf(p), 1); change = true; }
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
    if (m.ajoute) return m.poule != null && avecPoules(t) ? nomPoule(m.poule) + ', match ajouté' : 'Match ajouté';
    if (m.poule != null && avecPoules(t)) return nomPoule(m.poule);
    if (estSuisse(t) && m.victoires && m.victoires.length === 2) {
      const mots = (v) => String(v).replace('.', ',') + ' victoire' + (v > 1 ? 's' : '');
      const [x, y] = m.victoires.map(Number);
      return x === y ? 'Équipes à ' + mots(x) : 'Équipes à ' + String(Math.min(x, y)).replace('.', ',') + ' et ' + mots(Math.max(x, y));
    }
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
      else if (m) info = 'Match ' + numero(t, m) + ', à jouer';
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
  // Un résultat de phase finale ne peut plus changer si le match suivant du tableau a commencé.
  function suiteCommencee(t, m) {
    if (!t.finale || !m || m.phase !== 'finale' || m.petite) return false;
    const R = nbTours(t);
    const suivants = [];
    if (m.tour + 1 < R) suivants.push(matchTableau(t, m.tour + 1, Math.floor(m.slot / 2), false));
    if (m.tour === R - 2) suivants.push(matchTableau(t, R - 1, 0, true));
    return suivants.some((x) => x && x.statut !== 'attente');
  }

  // Remet un match terminé dans les matchs à jouer. Retourne false si c'est impossible.
  function effacerResultat(t, m) {
    if (suiteCommencee(t, m)) return false;
    // Une équipe partie (abandon) ne rejoue pas : il faut d'abord annuler son abandon.
    if (equipe(t, m.a).abandon || equipe(t, m.b).abandon) return false;
    m.statut = 'attente';
    m.numero = null;
    m.sets = [];
    m.fin = null;
    m.debut = null;
    m.terrain = null;
    delete m.forfait;
    delete m.forfaitAbandon;
    if (t.finale) avancerTableau(t);
    if (estSuisse(t)) {
      // Le match est à rejouer : les autres matchs prévus de ses équipes sont défaits.
      defaireAppariements(t, [m.a, m.b], m);
      apparierSuisse(t);
    }
    if (appelAutoActif(t) && demarre(t)) remplirTerrains(t);
    return true;
  }

  /* ---------- Statistiques (récapitulatif) ---------- */

  // Score d'un match vu par une équipe : [points pour, points contre] par set.
  function setsPour(m, equipeId) {
    return (m.sets || []).map(([x, y]) => (m.a === equipeId ? [x, y] : [y, x]));
  }

  function dureeMinutes(m) {
    return m.debut && m.fin && m.fin > m.debut ? Math.round((m.fin - m.debut) / 60000) : null;
  }

  // Rang et parcours d'une équipe : classement final s'il existe, sinon classement de sa poule.
  function placeEquipe(t, equipeId) {
    const e = equipe(t, equipeId);
    const fini = statut(t) === 'termine';
    const final = fini ? classementFinal(t) : null;
    if (final) {
      const l = final.find((x) => x.equipe.id === equipeId);
      return { rang: l ? l.rang : null, sur: t.equipes.length, definitif: true, etape: l ? l.etape : '' };
    }
    const poule = avecPoules(t) ? e.poule : null;
    const lignes = classement(t, poule);
    const l = lignes.find((x) => x.equipe.id === equipeId);
    return { rang: l && l.J ? l.rang : null, sur: lignes.length, definitif: fini, etape: poule != null ? nomPoule(poule) : '' };
  }

  function statsEquipe(t, equipeId) {
    const mes = t.matchs.filter((m) => m.statut === 'termine' && (m.a === equipeId || m.b === equipeId))
      .sort((x, y) => (x.fin || 0) - (y.fin || 0));
    const s = {
      joues: mes.length, V: 0, D: 0, N: 0, setsP: 0, setsC: 0, ptsP: 0, ptsC: 0,
      serie: 0, minutes: 0, parCategorie: {}, meilleureVictoire: null, plusSerre: null, plusLong: null,
    };
    let serie = 0;
    mes.forEach((m) => {
      const r = resultat(m);
      const cote = m.a === equipeId ? 'a' : 'b';
      const gagne = r.gagnant === cote;
      const perdu = r.gagnant && !gagne;
      const pour = cote === 'a' ? r.ptsA : r.ptsB;
      const contre = cote === 'a' ? r.ptsB : r.ptsA;
      s.ptsP += pour;
      s.ptsC += contre;
      s.setsP += cote === 'a' ? r.setsA : r.setsB;
      s.setsC += cote === 'a' ? r.setsB : r.setsA;
      if (gagne) s.V++; else if (perdu) s.D++; else s.N++;
      serie = gagne ? serie + 1 : 0;
      s.serie = Math.max(s.serie, serie);
      const c = m.categorie || '';
      s.parCategorie[c] = s.parCategorie[c] || { V: 0, D: 0, N: 0 };
      s.parCategorie[c][gagne ? 'V' : perdu ? 'D' : 'N']++;
      const duree = dureeMinutes(m);
      if (duree) s.minutes += duree;
      if (m.forfait) return;
      const adversaire = m.a === equipeId ? m.b : m.a;
      const fiche = { m, adversaire, score: setsPour(m, equipeId), ecart: pour - contre, duree };
      if (gagne && (!s.meilleureVictoire || fiche.ecart > s.meilleureVictoire.ecart)) s.meilleureVictoire = fiche;
      const serre = Math.abs(pour - contre);
      if (!s.plusSerre || serre < Math.abs(s.plusSerre.ecart) || (serre === Math.abs(s.plusSerre.ecart) && pour + contre > s.plusSerre.total)) {
        s.plusSerre = Object.assign({ total: pour + contre }, fiche);
      }
      if (duree && (!s.plusLong || duree > s.plusLong.duree)) s.plusLong = fiche;
    });
    s.moyenne = s.joues ? Math.round((s.ptsP / s.joues) * 10) / 10 : 0;
    return s;
  }

  function statsTournoi(t) {
    const joues = t.matchs.filter((m) => m.statut === 'termine' && !m.forfait);
    const s = {
      matchs: joues.length, total: t.matchs.length, points: 0, sets: 0,
      plusGrandEcart: null, plusSerre: null, plusLong: null, debut: null, fin: null, champion: null,
    };
    joues.forEach((m) => {
      const r = resultat(m);
      s.points += r.ptsA + r.ptsB;
      s.sets += (m.sets || []).length;
      const ecart = Math.abs(r.ptsA - r.ptsB);
      const fiche = { m, ecart, total: r.ptsA + r.ptsB, duree: dureeMinutes(m) };
      if (r.gagnant && (!s.plusGrandEcart || ecart > s.plusGrandEcart.ecart)) s.plusGrandEcart = fiche;
      if (!s.plusSerre || ecart < s.plusSerre.ecart || (ecart === s.plusSerre.ecart && fiche.total > s.plusSerre.total)) s.plusSerre = fiche;
      if (fiche.duree && (!s.plusLong || fiche.duree > s.plusLong.duree)) s.plusLong = fiche;
      if (m.debut) s.debut = s.debut ? Math.min(s.debut, m.debut) : m.debut;
      if (m.fin) s.fin = s.fin ? Math.max(s.fin, m.fin) : m.fin;
    });
    if (statut(t) === 'termine') {
      const final = classementFinal(t);
      if (final && final[0]) s.champion = final[0].equipe;
    }
    return s;
  }

  // Podium des trois premières places (ordre d'affichage 2, 1, 3).
  // Équipes à égalité (par exemple deux 3e sans match pour la 3e place) : sur la même marche.
  function podiumHtml(lignes) {
    const marche = (place) => {
      const sur = lignes.filter((l) => l.rang === place);
      return sur.length ? '<div class="marche marche--' + place + '">'
        + '<div class="marche-nom">' + sur.map((l) => esc(l.equipe.nom)).join('<br>') + '</div>'
        + '<div class="marche-bloc">' + place + '</div></div>' : '<div></div>';
    };
    return '<div class="podium">' + marche(2) + marche(1) + marche(3) + '</div>';
  }

  function signe(n) {
    return n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '0';
  }

  // Un match peut finir à égalité : nombre pair de sets, ou durée maximum avec plusieurs sets.
  function nulsReglages(r) {
    return r.sets % 2 === 0 || (r.dureeLimite > 0 && r.sets > 1);
  }

  function nulsPossibles(t) {
    return nulsReglages(t.reglages) || t.matchs.some((m) => m.statut === 'termine' && !resultat(m).gagnant);
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
    const sansCategories = !(t.reglages && t.reglages.cat);
    t.reglages = Object.assign({}, REGLAGES_DEFAUT, t.reglages);
    if (sansCategories) {
      t.reglages.cat = {
        simple: { k: 0, tous: false },
        double: { k: Number(t.reglages.matchsParEquipe) || 1, tous: !!t.reglages.tousContreTous },
        mixte: { k: 0, tous: false },
      };
    } else {
      const cat = {};
      CATEGORIES.forEach((c) => {
        const x = t.reglages.cat[c.cle] || {};
        cat[c.cle] = { k: Number(x.k) || 0, tous: !!x.tous, max: Number(x.max) || 0 };
      });
      t.reglages.cat = cat;
    }
    t.equipes = enTableau(t.equipes).map((e) => Object.assign({}, e, { nom: e.nom || '', joueurs: e.joueurs || '' }));
    t.matchs = enTableau(t.matchs).map((m) => {
      const x = Object.assign({ terrain: null, debut: null, fin: null }, m, {
        sets: enTableau(m.sets).map((paire) => enTableau(paire).map(Number)),
      });
      if (m.victoires) x.victoires = enTableau(m.victoires).map(Number);
      return x;
    });
    const fermes = enTableau(t.fermes).map(Number).filter((n) => n >= 1 && n <= t.reglages.terrains);
    if (fermes.length) t.fermes = fermes;
    else delete t.fermes;
    if (t.finale && t.finale.taille) {
      const brut = t.finale.places || {};
      t.finale = { taille: Number(t.finale.taille), places: Array.from({ length: Number(t.finale.taille) }, (_, i) => brut[i] || '') };
    } else {
      delete t.finale;
    }
    return t;
  }

  /* ---------- Règles du tournoi (écrites à partir des réglages) ---------- */

  const listeEt = (l) => (l.length > 1 ? l.slice(0, -1).join(', ') + ' et ' + l[l.length - 1] : l[0] || '');

  // « 1 set de 15 points », « 2 sets gagnants de 21 points (au meilleur des 3) »…
  function formatEnMots(reg) {
    const n = reg.sets;
    if (n === 1) return '1 set de ' + reg.points + ' points';
    if (reg.auMeilleur && n % 2 === 1) return (n + 1) / 2 + ' sets gagnants de ' + reg.points + ' points (au meilleur des ' + n + ')';
    return n + ' sets de ' + reg.points + ' points, tous joués';
  }

  // Règles du tournoi : [{ titre, lignes: [texte, ...] }]. Rien d'autre que ce que le site applique.
  function reglesTournoi(t) {
    const r = t.reglages;
    const n = t.equipes.length;
    const poules = avecPoules(t);
    const sections = [];

    // Déroulement
    const der = [];
    const suisse = estSuisse(t);
    if (poules) {
      const tailles = Array.from(new Set(taillesPoules(n, r.nbPoules))).sort((a, b) => b - a);
      der.push(n + ' équipes réparties en ' + r.nbPoules + ' poules de ' + listeEt(tailles.map(String)) + ' équipes.');
    } else if (suisse) {
      const R = matchsSuisse(r);
      const c = categoriesJouees(r)[0];
      const ecart = ecartSuisse(r);
      der.push(n + ' équipes. Chaque équipe joue ' + R + ' ' + (R > 1 ? c.pluriel : c.nom.toLowerCase()) + '.');
      der.push('Les gagnants jouent contre les gagnants : dès qu’une équipe est libre, elle rencontre une équipe libre qui a '
        + (ecart ? 'le même nombre de victoires ou ' + (ecart === 1 ? 'une victoire' : ecart + ' victoires') + ' d’écart au plus' : 'le même nombre de victoires')
        + ', et qu’elle n’a pas encore jouée.');
      der.push(r.pointage ? 'Au départ, les équipes arrivées jouent entre elles, dans l’ordre d’arrivée.' : 'Au départ, les équipes se rencontrent dans l’ordre de la liste.');
      der.push('Si aucune équipe ne convient, l’organisation peut lancer un match quand même.');
      if ((n * R) % 2 === 1) der.push('Comme le compte de matchs est impair, une équipe joue un match de plus à la fin.');
    } else {
      der.push(n + ' équipes, toutes dans la même poule.');
    }
    const cats = suisse ? [] : categoriesJouees(r);
    const taillesImpaires = (poules ? taillesPoules(n, r.nbPoules) : [n]).filter((x) => x % 2 === 1);
    const morceaux = cats.map((c) => (c.tous
      ? 'un ' + c.nom.toLowerCase() + ' contre chaque autre équipe' + (poules ? ' de sa poule' : '')
      : c.k + ' ' + (c.k > 1 ? c.pluriel : c.nom.toLowerCase())));
    if (morceaux.length) der.push('Chaque équipe joue ' + listeEt(morceaux) + '.');
    // Nombre impair d'équipes et de matchs : une équipe joue un match de plus (pas la même d'une catégorie à l'autre).
    const enPlus = cats.filter((c) => !c.tous && c.k % 2 === 1 && taillesImpaires.length);
    if (enPlus.length) {
      der.push((poules ? 'Dans chaque poule au nombre impair d’équipes, ' : 'Comme le nombre d’équipes est impair, ')
        + listeEt(enPlus.map((c, i) => (i === 0 ? 'une équipe joue ' : 'une autre ') + (c.k + 1) + ' ' + c.pluriel)) + '.');
    }
    if (r.mixteEgalDouble && cats.some((c) => c.cle === 'double')) der.push('Pas de différence entre double et mixte.');
    const Q = nbQualifies(t);
    if (Q >= 2) {
      let S = 2;
      while (S < Q) S *= 2;
      const titre = ['la finale', 'les demi-finales', 'les quarts de finale', 'les huitièmes de finale', 'les seizièmes de finale'][Math.round(Math.log2(S)) - 1] || 'un tableau de ' + S;
      const q = r.qualifiesParPoule;
      der.push((poules
        ? (q === 1 ? 'Les premiers de chaque poule' : 'Les ' + q + ' premiers de chaque poule')
        : 'Les ' + Q + ' premiers du classement')
        + (S === 2 ? ' jouent la finale.' : ' jouent une phase finale à élimination directe, à partir des ' + titre.replace(/^les /, '') + '.'));
      if (S > Q) der.push(S - Q === 1 ? 'L’équipe la mieux classée passe directement au tour suivant.' : 'Les ' + (S - Q) + ' équipes les mieux classées passent directement au tour suivant.');
      if (r.petiteFinale && Q >= 4) der.push('Les perdants des demi-finales jouent un match pour la 3e place.');
      if (cats.length >= 2) der.push('Les matchs de phase finale se jouent en ' + nomCategorie(categorieFinale(r)).toLowerCase() + '.');
      der.push('En phase finale, chaque match doit avoir un vainqueur.');
    } else {
      der.push(poules ? 'Pas de phase finale, le classement de chaque poule est le résultat final.'
        : suisse ? 'Pas de phase finale, le classement après tous les matchs est le classement final.'
          : 'Pas de phase finale, le classement du championnat est le classement final.');
    }
    sections.push({ titre: 'Déroulement', lignes: der });

    // Matchs
    const mat = ['Chaque match se joue en ' + formatEnMots(r) + '.'];
    if (nulsReglages(r)) mat.push('Un match peut finir à égalité.');
    if (r.ecart2) {
      mat.push(r.plafond > r.points
        ? 'Il faut 2 points d’écart pour gagner un set, jusqu’à ' + r.plafond + ' points au maximum (à ' + (r.plafond - 1) + ' partout, le point suivant gagne le set).'
        : 'Il faut 2 points d’écart pour gagner un set.');
    } else {
      mat.push('La première équipe à ' + r.points + ' points gagne le set, sans écart obligatoire.');
    }
    if (r.dureeLimite > 0) mat.push('Un match dure ' + r.dureeLimite + ' minutes au maximum. Quand le temps est écoulé, le score atteint à ce moment-là compte.');
    if (Q >= 2 && r.formatFinale) {
      mat.push('En phase finale, les matchs se jouent en ' + formatEnMots({ sets: r.finaleSets, auMeilleur: r.finaleAuMeilleur, points: r.finalePoints }) + ', ' + (r.ecart2 ? 'avec 2 points d’écart (maximum ' + plafondAuto(r.finalePoints) + ')' : 'sans écart obligatoire') + ' et sans durée maximum.');
    }
    if (r.reposMin > 0) mat.push('Chaque équipe a au moins ' + r.reposMin + ' minute' + (r.reposMin > 1 ? 's' : '') + ' de repos entre deux matchs.');
    sections.push({ titre: 'Matchs', lignes: mat });

    // Appel des matchs
    const app = [];
    if (heureDuJour(r.heureDebut) !== null) app.push('Début du tournoi à ' + texteHeure(r.heureDebut) + '.');
    app.push(r.appelAuto
      ? 'Les matchs sont appelés au fur et à mesure que les terrains se libèrent. Chaque match a un numéro.'
      : 'Les organisateurs appellent les matchs au fur et à mesure que les terrains se libèrent. Chaque match a un numéro.');
    app.push('Une équipe ne joue qu’un match à la fois. Le site évite de faire rejouer tout de suite une équipe qui sort du terrain, puis fait passer celles qui ont le moins joué. Les organisateurs peuvent faire passer un match en priorité, ou imposer un match entre deux équipes.');
    if (r.pointage) app.push('À ton arrivée, signale-toi sur ton téléphone (bouton « On est arrivés » sur la page de ton équipe) ou à la table de marque. Les matchs de ton équipe ne sont appelés qu’une fois pointée.');
    app.push('Quand ton match est appelé, il s’affiche sur l’écran de la salle et sur ton téléphone, avec le numéro du terrain.');
    sections.push({ titre: 'Appel des matchs', lignes: app });

    // Scores et forfaits
    const sco = [];
    if (r.scoresJoueurs) {
      sco.push('À la fin du match, envoie le score depuis ton téléphone. Un organisateur le valide ensuite.');
      if (r.validationAuto) sco.push('Si les deux équipes envoient le même score, il est validé tout seul.');
    } else {
      sco.push('À la fin du match, donne le score à un organisateur.');
    }
    const texteForfait = (reg) => setsForfait(reg, true).map(([a, b]) => a + '-' + b).join(', ');
    const forfaitFinale = Q >= 2 && r.formatFinale ? texteForfait(formatMatch(t, { phase: 'finale' })) : '';
    sco.push('Une équipe absente peut perdre par forfait. Le match compte alors ' + texteForfait(r) + ' pour l’adversaire'
      + (forfaitFinale && forfaitFinale !== texteForfait(r) ? ' (' + forfaitFinale + ' en phase finale)' : '') + '.');
    sections.push({ titre: 'Scores', lignes: sco });

    // Classement
    const cla = [(poules ? 'Dans chaque poule, le classement se fait au nombre de victoires' : 'Le classement se fait au nombre de victoires')
      + (nulsReglages(r) ? ', un match nul comptant pour une demi-victoire.' : '.')];
    cla.push('Si exactement deux équipes sont à égalité, le match qu’elles ont joué l’une contre l’autre les départage. Sinon, on regarde la différence de sets, puis la différence de points, puis le nombre de points marqués, et en dernier l’ordre alphabétique.');
    sections.push({ titre: 'Classement', lignes: cla });

    if (r.photos !== false) {
      const max = Number(r.photosMax) || 0;
      sections.push({ titre: 'Photos', lignes: [
        'Ajoute tes photos du tournoi depuis l’onglet Photos' + (max ? ', ' + max + ' au plus par personne' : '') + '. Tout le monde les voit, elles passent aussi sur l’écran de la salle.',
        'Chaque équipe peut mettre sa photo sur sa page. Tu peux retirer les photos que tu as ajoutées, les organisateurs peuvent retirer toutes les photos.',
      ] });
    }
    const perso = String(r.reglesPerso || '').split('\n').map((x) => x.trim()).filter(Boolean);
    if (perso.length) sections.push({ titre: 'Règles des organisateurs', lignes: perso });
    return sections;
  }

  function reglesHtml(t) {
    return '<div class="regles-liste">' + reglesTournoi(t).map((s) => '<section class="regles-bloc"><h3>' + esc(s.titre) + '</h3><ul>'
      + s.lignes.map((l) => '<li>' + esc(l) + '</li>').join('') + '</ul></section>').join('') + '</div>';
  }

  // Empreinte des règles, pour savoir si un téléphone a déjà lu la version actuelle.
  function empreinteRegles(t) {
    const texte = JSON.stringify(reglesTournoi(t));
    let h = 5381;
    for (let i = 0; i < texte.length; i++) h = ((h * 33) ^ texte.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  /* ---------- Mot de passe organisateur ----------
     La clé organisateur du tournoi est chiffrée avec le mot de passe (PBKDF2 puis AES-GCM) et
     rangée dans le tournoi (t.acces, un mot de passe par organisateur). Un appareil qui connaît un mot de passe retrouve la clé et
     devient organisateur comme avec le lien organisateur. */

  const enBase64 = (octets) => btoa(String.fromCharCode.apply(null, Array.from(new Uint8Array(octets))));
  const depuisBase64 = (texte) => Uint8Array.from(atob(texte), (c) => c.charCodeAt(0));

  async function cleDuMotDePasse(motDePasse, sel) {
    const sub = globalThis.crypto.subtle;
    const base = await sub.importKey('raw', new TextEncoder().encode(motDePasse), 'PBKDF2', false, ['deriveKey']);
    return sub.deriveKey({ name: 'PBKDF2', salt: sel, iterations: 200000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  // Majuscules et espaces autour ignorés : « Abc », « ABC » et « abc » ouvrent le même accès.
  const normaliserMotDePasse = (x) => String(x || '').trim().toLowerCase();

  async function chiffrerCle(cle, motDePasse) {
    motDePasse = normaliserMotDePasse(motDePasse);
    const sel = globalThis.crypto.getRandomValues(new Uint8Array(16));
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
    const k = await cleDuMotDePasse(motDePasse, sel);
    const chiffre = await globalThis.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, k, new TextEncoder().encode(cle));
    return { sel: enBase64(sel), iv: enBase64(iv), chiffre: enBase64(chiffre) };
  }

  // Clé organisateur si le mot de passe est le bon, sinon null.
  async function dechiffrerCle(acces, motDePasse) {
    if (!acces || !acces.sel || !acces.iv || !acces.chiffre) return null;
    // Forme normalisée d'abord, puis telle quelle (mots de passe enregistrés avant la normalisation).
    const essais = Array.from(new Set([normaliserMotDePasse(motDePasse), String(motDePasse || '').trim()]));
    for (const essai of essais) {
      try {
        const k = await cleDuMotDePasse(essai, depuisBase64(acces.sel));
        const clair = await globalThis.crypto.subtle.decrypt({ name: 'AES-GCM', iv: depuisBase64(acces.iv) }, k, depuisBase64(acces.chiffre));
        return new TextDecoder().decode(clair);
      } catch (e) { /* essai suivant */ }
    }
    return null;
  }

  // Mots de passe du tournoi : [{ id, nom, sel, iv, chiffre }] (ancien format à un seul mot de passe accepté).
  function listeAcces(t) {
    const a = t && t.acces;
    if (!a || typeof a !== 'object') return [];
    if (a.sel) return [Object.assign({ id: 'principal', nom: '' }, a)];
    return Object.keys(a).filter((k) => a[k] && a[k].sel).map((k) => Object.assign({ nom: '' }, a[k], { id: k }));
  }

  // Essaie le mot de passe sur chaque accès : { cle, nom } si l'un d'eux s'ouvre, sinon null.
  async function ouvrirAcces(t, motDePasse) {
    for (const a of listeAcces(t)) {
      const cle = await dechiffrerCle(a, motDePasse);
      if (cle) return { cle, nom: a.nom || '' };
    }
    return null;
  }

  // Ajoute (ou remplace, à nom égal) un mot de passe organisateur dans le tournoi.
  function poserAcces(t, nom, chiffre) {
    const liste = listeAcces(t).filter((a) => (a.nom || '').toLowerCase() !== (nom || '').toLowerCase());
    const acces = {};
    liste.forEach((a) => { acces[a.id === 'principal' ? 'a' + uid(6) : a.id] = { nom: a.nom || '', sel: a.sel, iv: a.iv, chiffre: a.chiffre }; });
    acces['a' + uid(6)] = Object.assign({ nom: nom || '' }, chiffre);
    t.acces = acces;
  }

  function retirerAcces(t, idAcces) {
    const acces = {};
    listeAcces(t).filter((a) => a.id !== idAcces).forEach((a) => { acces[a.id] = { nom: a.nom || '', sel: a.sel, iv: a.iv, chiffre: a.chiffre }; });
    if (Object.keys(acces).length) t.acces = acces;
    else delete t.acces;
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

  // Heures écrites à la française : « 19h05 », « 9h30 ».
  function heure(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.getHours() + 'h' + String(d.getMinutes()).padStart(2, '0');
  }

  // Heure d'un réglage (« 19:00 ») écrite à la française (« 19h00 »).
  function texteHeure(hhmm) {
    const x = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
    return x ? Number(x[1]) + 'h' + x[2] : '';
  }

  // Heure tapée par un organisateur : « 19h00 », « 19h », « 19 h 30 », « 19:00 », « 1900 », « 19 ».
  // Donne « HH:MM », '' si le champ est vide, null si l'heure n'est pas reconnue.
  function lireHeure(texte) {
    const x = String(texte || '').trim().toLowerCase().replace(/\s+/g, '');
    if (!x) return '';
    const m = /^(\d{1,2})(?:[h:.](\d{2})?)?(?:min)?$/.exec(x) || /^(\d{1,2})(\d{2})$/.exec(x);
    if (!m) return null;
    const h = Number(m[1]);
    const mn = Number(m[2] || 0);
    if (h > 23 || mn > 59) return null;
    return String(h).padStart(2, '0') + ':' + String(mn).padStart(2, '0');
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
    REGLAGES_DEFAUT, LIBELLES_STATUT, plafondAuto, CATEGORIES, categoriesJouees, nomCategorie, categorieMatch, categorieFinale,
    uid, esc, entier,
    nouveauTournoi, ajusterEquipes, equipe, lireListeEquipes, nomEquipe, statut, texteFormat,
    estSuisse, apparierSuisse, apresPointage, equipesSansAdversaire, matchPrevuEntre, infosMatchImpose, imposerMatch, paireForcee, forcerMatchSuisse, matchsSuisseRestants, matchsSuisseAVenir, texteEcartSuisse, suisseFini, nbMatchsPrevus,
    verifierFormat, paires, ordonner, genererMatchs,
    matchsEnCours, matchsEnAttente, equipesReservees, bloqueParPriorite, matchsAppelables, matchsEnAttenteArrivee, pointageActif, estArrivee, matchPointe, equipesAttendues, pointer, annulerPointage, pointerEquipesVenues, terrainsLibres, terrainsFermes, terrainFerme, nbTerrainsOuverts, fermerTerrain, ouvrirTerrain, remplirTerrains, lancer, demarre, prochains, reporter, appelAutoActif,
    numero, numeroActuel, attenteRepos,
    planifier, dureeMatch, dureeReglee, dureeSelonFormat, finEstimee, dureeEstimee, heureDuJour, texteHeure, lireHeure, heureFinSalle, depassementSalle, solutionsHoraires, prioriser,
    resultat, texteScore, verifierSet, verifierScore, enregistrerScore,
    setsForfait, enregistrerForfait, abandonEquipe, annulerAbandon, abandonAnnulable, effacerResultat,
    nomPoule, avecPoules, listePoules, taillesPoules, verifierPoules, verifierDeroulement, unMatchDePlus, maximumNecessaire,
    nbQualifies, qualifies, phasePoulesFinie, lancerPhaseFinale, annulerPhaseFinale, avancerTableau,
    nbTours, nomTourIndex, matchTableau, participants, issue, tableauTermine, finaleAttendue,
    etiquetteMatch, formatMatch, classementPoules, classementFinal, tableauHtml,
    setsPour, placeEquipe, statsEquipe, statsTournoi,
    classement, nulsPossibles, podiumHtml, signe,
    lireSaisie, memesSets, enTableau, normaliser, maxPointsSet, chiffresScore, suiteCommencee, nulsReglages, reglesTournoi, reglesHtml, empreinteRegles, chiffrerCle, dechiffrerCle, listeAcces, ouvrirAcces, poserAcces, retirerAcces,
    urlPage, qrSvg, heure, idDansAdresse, ICONE, activerSon, sonActif, bip,
  };
})(typeof window !== 'undefined' ? window : globalThis);
