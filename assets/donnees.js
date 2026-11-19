/* Stockage des tournois.
   Sans configuration (assets/config.js vide) : tout reste dans ce navigateur.
   Avec la configuration Firebase : les tournois sont en ligne, les téléphones des joueurs
   voient les matchs en direct et peuvent envoyer leurs scores. */
(function (global) {
  'use strict';
  const BT = global.BT;
  const CONFIG = global.BT_FIREBASE || null;
  const VERSION_SDK = '10.12.2';

  const PREFIXE = 'badminton:';
  const CLE_REGISTRE = PREFIXE + 'tournois';
  const cleTournoi = (id) => PREFIXE + 't:' + id;
  const clePropositions = (id) => PREFIXE + 'p:' + id;
  const clePhotos = (id) => PREFIXE + 'ph:' + id;

  // Vignettes de l'album, de la plus récente à la plus ancienne.
  function listeMiniatures(brut) {
    return Object.keys(brut || {}).map((k) => Object.assign({ id: k }, brut[k]))
      .filter((p) => p && typeof p.image === 'string')
      .sort((x, y) => (y.date || 0) - (x.date || 0));
  }

  function lireJSON(cle) {
    try { return JSON.parse(global.localStorage.getItem(cle)); } catch (e) { return null; }
  }
  function ecrireJSON(cle, valeur) {
    try { global.localStorage.setItem(cle, JSON.stringify(valeur)); } catch (e) { /* stockage plein ou bloqué */ }
  }
  function effacer(cle) {
    try { global.localStorage.removeItem(cle); } catch (e) { /* stockage bloqué */ }
  }
  // Comme ecrireJSON, mais signale un stockage plein (photos en mode local).
  function ecrireJSONouErreur(cle, valeur) {
    try { global.localStorage.setItem(cle, JSON.stringify(valeur)); } catch (e) { throw new Error('quota : stockage plein'); }
  }
  // Supprime les valeurs undefined, refusées par la base en ligne.
  const nettoyer = (x) => JSON.parse(JSON.stringify(x));

  /* ---------- Registre : tournois gérés depuis cet appareil ---------- */

  const registre = {
    liste() {
      return lireJSON(CLE_REGISTRE) || [];
    },
    trouver(id) {
      return registre.liste().find((x) => x.id === id) || null;
    },
    noter(t, extra) {
      const liste = registre.liste();
      const ancien = liste.find((x) => x.id === t.id) || {};
      const entree = Object.assign({}, ancien, extra || {}, {
        id: t.id, nom: t.nom, maj: t.maj || Date.now(), statut: BT.statut(t), equipes: t.equipes.length,
      });
      ecrireJSON(CLE_REGISTRE, [entree].concat(liste.filter((x) => x.id !== t.id)));
    },
    retirer(id) {
      ecrireJSON(CLE_REGISTRE, registre.liste().filter((x) => x.id !== id));
    },
  };

  /* ---------- Avertir les pages ouvertes (même onglet et autres onglets) ---------- */

  const abonnes = {};
  function notifier(cle) {
    (abonnes[cle] || new Set()).forEach((fn) => fn());
  }
  function abonner(cle, fn) {
    (abonnes[cle] = abonnes[cle] || new Set()).add(fn);
    const surStorage = (e) => { if (e.key === cle) fn(); };
    global.addEventListener('storage', surStorage);
    return () => {
      abonnes[cle].delete(fn);
      global.removeEventListener('storage', surStorage);
    };
  }

  /* ---------- Mode local : tout dans ce navigateur ---------- */

  const local = {
    enLigne: false,
    economiserConnexion() {},

    suivre(id, rappel) {
      const lire = () => rappel(BT.normaliser(lireJSON(cleTournoi(id))));
      const arreter = abonner(cleTournoi(id), lire);
      setTimeout(lire, 0);
      return arreter;
    },

    async modifier(id, fn) {
      const t = BT.normaliser(lireJSON(cleTournoi(id)));
      if (!t) throw new Error('Tournoi introuvable.');
      if (fn(t) === false) return t;
      t.maj = Date.now();
      ecrireJSON(cleTournoi(id), t);
      registre.noter(t);
      notifier(cleTournoi(id));
      return t;
    },

    async creer(t) {
      t.maj = Date.now();
      ecrireJSON(cleTournoi(t.id), t);
      registre.noter(t, { cle: BT.uid(24) });
    },

    async supprimer(id) {
      effacer(cleTournoi(id));
      effacer(clePropositions(id));
      effacer(clePhotos(id));
      registre.retirer(id);
      notifier(cleTournoi(id));
    },

    /* Photos (dans ce navigateur) */
    async monIdentifiant() {
      return 'local';
    },
    suivreMiniatures(id, rappel) {
      const lire = () => rappel(listeMiniatures((lireJSON(clePhotos(id)) || {}).miniatures));
      const arreter = abonner(clePhotos(id), lire);
      setTimeout(lire, 0);
      return arreter;
    },
    async lirePhoto(id, photoId) {
      const d = lireJSON(clePhotos(id)) || {};
      return d.photos && d.photos[photoId] ? d.photos[photoId].image : null;
    },
    async ajouterPhoto(id, p) {
      const d = lireJSON(clePhotos(id)) || {};
      const k = 'p' + Date.now().toString(36) + BT.uid(4);
      d.miniatures = Object.assign({}, d.miniatures, { [k]: { image: p.mini, date: Date.now(), uid: 'local', equipe: p.equipe || '', l: p.l || 0, h: p.h || 0 } });
      d.photos = Object.assign({}, d.photos, { [k]: { image: p.image, uid: 'local' } });
      ecrireJSONouErreur(clePhotos(id), d);
      notifier(clePhotos(id));
      return k;
    },
    async supprimerPhoto(id, photoId) {
      const d = lireJSON(clePhotos(id)) || {};
      if (d.miniatures) delete d.miniatures[photoId];
      if (d.photos) delete d.photos[photoId];
      ecrireJSON(clePhotos(id), d);
      notifier(clePhotos(id));
    },
    suivrePhotosEquipes(id, rappel) {
      const lire = () => rappel((lireJSON(clePhotos(id)) || {}).equipes || {});
      const arreter = abonner(clePhotos(id), lire);
      setTimeout(lire, 0);
      return arreter;
    },
    async poserPhotoEquipe(id, equipeId, image) {
      const d = lireJSON(clePhotos(id)) || {};
      d.equipes = Object.assign({}, d.equipes, { [equipeId]: { image, uid: 'local', date: Date.now() } });
      ecrireJSONouErreur(clePhotos(id), d);
      notifier(clePhotos(id));
    },
    async retirerPhotoEquipe(id, equipeId) {
      const d = lireJSON(clePhotos(id)) || {};
      if (d.equipes) delete d.equipes[equipeId];
      ecrireJSON(clePhotos(id), d);
      notifier(clePhotos(id));
    },

    estOrganisateur(id) {
      return !!registre.trouver(id) || !!lireJSON(cleTournoi(id));
    },

    /* Pointage à l'arrivée : dans ce navigateur, l'arrivée va directement dans le tournoi. */
    async signalerArrivee(id, equipeId) {
      await local.modifier(id, (t) => {
        if (!BT.pointer(t, equipeId)) return false;
        BT.apresPointage(t);
        return true;
      });
      return 'pointee';
    },
    suivreArrivees() {
      return () => {};
    },
    async retirerArrivee() {},

    async assurerOrganisateur(id) {
      return local.estOrganisateur(id);
    },

    async rejoindre() {
      return false;
    },

    suivrePropositions(id, rappel) {
      const lire = () => rappel(lireJSON(clePropositions(id)) || {});
      const arreter = abonner(clePropositions(id), lire);
      setTimeout(lire, 0);
      return arreter;
    },

    async proposer(id, matchId, equipeId, sets) {
      const p = lireJSON(clePropositions(id)) || {};
      p[matchId] = p[matchId] || {};
      p[matchId][equipeId] = { sets, date: Date.now(), uid: 'local' };
      ecrireJSON(clePropositions(id), p);
      notifier(clePropositions(id));
    },

    async retirerProposition(id, matchId, equipeId) {
      const p = lireJSON(clePropositions(id)) || {};
      if (equipeId) {
        if (p[matchId]) delete p[matchId][equipeId];
        if (p[matchId] && !Object.keys(p[matchId]).length) delete p[matchId];
      } else {
        delete p[matchId];
      }
      ecrireJSON(clePropositions(id), p);
      notifier(clePropositions(id));
    },

    suivreConnexion(rappel) {
      rappel(null);
      return () => {};
    },
  };

  /* ---------- Mode en ligne : base Firebase ---------- */

  function chargerScript(src) {
    return new Promise((ok, echec) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = () => echec(new Error('Chargement impossible de ' + src));
      document.head.appendChild(s);
    });
  }

  let initialisation = null;
  function initialiser() {
    if (!initialisation) {
      initialisation = (async () => {
        const base = 'https://www.gstatic.com/firebasejs/' + VERSION_SDK + '/';
        await chargerScript(base + 'firebase-app-compat.js');
        await Promise.all([chargerScript(base + 'firebase-auth-compat.js'), chargerScript(base + 'firebase-database-compat.js')]);
        const options = Object.assign({}, CONFIG);
        const emulateur = options.emulateur;
        delete options.emulateur;
        const app = global.firebase.initializeApp(options);
        const db = app.database();
        const auth = app.auth();
        if (emulateur) {
          db.useEmulator(emulateur.hote, emulateur.base);
          auth.useEmulator('http://' + emulateur.hote + ':' + emulateur.auth, { disableWarnings: true });
        }
        return { db, auth };
      })();
      initialisation.catch(() => { initialisation = null; });
    }
    return initialisation;
  }

  // Connexion anonyme (sans compte) : nécessaire pour écrire dans la base.
  let connexion = null;
  async function connecter() {
    const { auth } = await initialiser();
    if (auth.currentUser) return auth.currentUser;
    if (!connexion) {
      connexion = (async () => {
        const restaure = await new Promise((ok) => {
          const arreter = auth.onAuthStateChanged((u) => { arreter(); ok(u); });
        });
        if (restaure) return restaure;
        return (await auth.signInAnonymously()).user;
      })();
      connexion.catch(() => { connexion = null; });
    }
    return connexion;
  }

  // Suit un chemin de la base en direct ; retourne la fonction qui arrête le suivi.
  function suivreChemin(chemin, rappel) {
    let actif = true;
    let ref = null;
    let ecouteur = null;
    initialiser().then(({ db }) => {
      if (!actif) return;
      ref = db.ref(chemin);
      ecouteur = ref.on('value', (instantane) => rappel(instantane.val()), () => rappel(null));
    }).catch(() => rappel(null));
    return () => {
      actif = false;
      if (ref && ecouteur) ref.off('value', ecouteur);
    };
  }

  const enLigne = {
    enLigne: true,

    // Page cachée depuis une minute (téléphone en poche) : la connexion est libérée, car le forfait
    // gratuit de Firebase compte 100 appareils connectés en même temps. Elle revient dès que la page
    // est de nouveau affichée, et les données se remettent à jour toutes seules.
    economiserConnexion() {
      let minuterie = null;
      document.addEventListener('visibilitychange', () => {
        clearTimeout(minuterie);
        initialiser().then(({ db }) => {
          if (document.hidden) minuterie = setTimeout(() => { if (document.hidden) db.goOffline(); }, 60 * 1000);
          else db.goOnline();
        }).catch(() => {});
      });
    },

    suivre(id, rappel) {
      let actif = true;
      let ref = null;
      let ecouteur = null;
      const cache = BT.normaliser(lireJSON(cleTournoi(id)));
      if (cache) setTimeout(() => { if (actif) rappel(cache, { cache: true }); }, 0);
      initialiser().then(({ db }) => {
        if (!actif) return;
        ref = db.ref('tournois/' + id + '/donnees');
        ecouteur = ref.on('value', (instantane) => {
          const t = BT.normaliser(instantane.val());
          if (t) {
            ecrireJSON(cleTournoi(id), t);
            if (registre.trouver(id)) registre.noter(t);
          }
          rappel(t);
        }, (erreur) => rappel(cache, { erreur }));
      }).catch((erreur) => { if (actif) rappel(cache, { erreur }); });
      return () => {
        actif = false;
        if (ref && ecouteur) ref.off('value', ecouteur);
      };
    },

    // Modification atomique : si deux organisateurs saisissent en même temps, aucune saisie ne se perd.
    async modifier(id, fn) {
      await connecter();
      const { db } = await initialiser();
      const resultat = await db.ref('tournois/' + id + '/donnees').transaction((courant) => {
        if (courant === null) return courant;
        const t = BT.normaliser(courant);
        if (fn(t) === false) return undefined;
        t.maj = Date.now();
        return nettoyer(t);
      });
      return BT.normaliser(resultat.snapshot.val());
    },

    async creer(t) {
      const utilisateur = await connecter();
      const { db } = await initialiser();
      const cle = BT.uid(24);
      await db.ref('cles/' + t.id).set(cle);
      const acces = {};
      acces['preuves/' + t.id + '/' + utilisateur.uid] = cle;
      acces['tournois/' + t.id + '/admins/' + utilisateur.uid] = true;
      await db.ref().update(acces);
      t.maj = Date.now();
      await db.ref('tournois/' + t.id + '/donnees').set(nettoyer(t));
      ecrireJSON(cleTournoi(t.id), t);
      registre.noter(t, { cle });
    },

    async supprimer(id) {
      if (await enLigne.assurerOrganisateur(id)) {
        const { db } = await initialiser();
        await db.ref('tournois/' + id).update({ donnees: null, propositions: null });
        // Photos : à part, pour que la suppression du tournoi marche même avec d'anciennes règles.
        await db.ref('tournois/' + id).update({ miniatures: null, photos: null, equipesPhotos: null }).catch(() => {});
        await db.ref('tournois/' + id + '/arrivees').remove().catch(() => {});
      }
      effacer(cleTournoi(id));
      registre.retirer(id);
    },

    estOrganisateur(id) {
      const entree = registre.trouver(id);
      return !!(entree && entree.cle);
    },

    // Inscrit cet appareil comme organisateur grâce à la clé du tournoi.
    async assurerOrganisateur(id) {
      const entree = registre.trouver(id);
      if (!entree || !entree.cle) return false;
      const utilisateur = await connecter();
      const { db } = await initialiser();
      const deja = await db.ref('tournois/' + id + '/admins/' + utilisateur.uid).once('value');
      if (deja.val() === true) return true;
      const acces = {};
      acces['preuves/' + id + '/' + utilisateur.uid] = entree.cle;
      acces['tournois/' + id + '/admins/' + utilisateur.uid] = true;
      await db.ref().update(acces);
      return true;
    },

    // Ouverture du lien organisateur (ou mot de passe) sur un appareil. La preuve est toujours écrite :
    // les règles de la base vérifient la clé, même si l'appareil était déjà organisateur. En cas
    // d'échec, l'entrée d'avant est remise (une clé fausse ou une coupure réseau n'efface rien).
    async rejoindre(id, cle) {
      const avant = registre.trouver(id);
      const autres = () => registre.liste().filter((x) => x.id !== id);
      ecrireJSON(CLE_REGISTRE, [Object.assign({ id, nom: 'Tournoi', maj: Date.now() }, avant || {}, { cle })].concat(autres()));
      try {
        const utilisateur = await connecter();
        const { db } = await initialiser();
        const acces = {};
        acces['preuves/' + id + '/' + utilisateur.uid] = cle;
        acces['tournois/' + id + '/admins/' + utilisateur.uid] = true;
        await db.ref().update(acces);
        return true;
      } catch (erreur) {
        ecrireJSON(CLE_REGISTRE, avant ? [avant].concat(autres()) : autres());
        throw erreur;
      }
    },

    /* Photos : vignettes et photos d'équipe suivies en direct, grandes photos lues à la demande.
       Tout le monde peut en ajouter ; chacun retire les siennes, les organisateurs toutes. */
    // Identifiant de ce téléphone dans la base, sans créer de connexion s'il n'en a pas encore
    // (pas de compte pour chaque spectateur ; il en a un dès qu'il envoie un score ou une photo).
    async monIdentifiant(creer) {
      if (creer) return (await connecter()).uid;
      const { auth } = await initialiser();
      if (auth.currentUser) return auth.currentUser.uid;
      const u = await new Promise((ok) => { const arreter = auth.onAuthStateChanged((x) => { arreter(); ok(x); }); });
      return u ? u.uid : null;
    },
    suivreMiniatures(id, rappel) {
      return suivreChemin('tournois/' + id + '/miniatures', (val) => rappel(listeMiniatures(val)));
    },
    async lirePhoto(id, photoId) {
      const { db } = await initialiser();
      return (await db.ref('tournois/' + id + '/photos/' + photoId + '/image').once('value')).val();
    },
    async ajouterPhoto(id, p) {
      const utilisateur = await connecter();
      const { db } = await initialiser();
      const k = db.ref('tournois/' + id + '/miniatures').push().key;
      const maj = {};
      maj['tournois/' + id + '/miniatures/' + k] = {
        image: p.mini, date: global.firebase.database.ServerValue.TIMESTAMP, uid: utilisateur.uid, equipe: p.equipe || '', l: p.l || 0, h: p.h || 0,
      };
      maj['tournois/' + id + '/photos/' + k] = { image: p.image, uid: utilisateur.uid };
      await db.ref().update(maj);
      return k;
    },
    async supprimerPhoto(id, photoId) {
      await connecter();
      const { db } = await initialiser();
      const maj = {};
      maj['tournois/' + id + '/miniatures/' + photoId] = null;
      maj['tournois/' + id + '/photos/' + photoId] = null;
      await db.ref().update(maj);
    },
    suivrePhotosEquipes(id, rappel) {
      return suivreChemin('tournois/' + id + '/equipesPhotos', (val) => rappel(val || {}));
    },
    async poserPhotoEquipe(id, equipeId, image) {
      const utilisateur = await connecter();
      const { db } = await initialiser();
      await db.ref('tournois/' + id + '/equipesPhotos/' + equipeId).set({
        image, uid: utilisateur.uid, date: global.firebase.database.ServerValue.TIMESTAMP,
      });
    },
    async retirerPhotoEquipe(id, equipeId) {
      await connecter();
      const { db } = await initialiser();
      await db.ref('tournois/' + id + '/equipesPhotos/' + equipeId).remove();
    },

    /* Pointage à l'arrivée : un joueur n'écrit pas dans le tournoi. Son téléphone dépose l'arrivée
       dans arrivees/<équipe>, et la page de gestion la reporte dans le tournoi (avec l'appel des matchs).
       Un appareil organisateur pointe directement. */
    async signalerArrivee(id, equipeId) {
      if (enLigne.estOrganisateur(id) && await enLigne.assurerOrganisateur(id).catch(() => false)) {
        await enLigne.modifier(id, (t) => {
          if (!BT.pointer(t, equipeId)) return false;
          BT.apresPointage(t);
          return true;
        });
        return 'pointee';
      }
      const utilisateur = await connecter();
      const { db } = await initialiser();
      await db.ref('tournois/' + id + '/arrivees/' + equipeId).set({
        date: global.firebase.database.ServerValue.TIMESTAMP,
        uid: utilisateur.uid,
      });
      return 'signalee';
    },
    suivreArrivees(id, rappel) {
      return suivreChemin('tournois/' + id + '/arrivees', (val) => rappel(val || {}));
    },
    async retirerArrivee(id, equipeId) {
      await connecter();
      const { db } = await initialiser();
      await db.ref('tournois/' + id + '/arrivees/' + equipeId).remove();
    },

    suivrePropositions(id, rappel) {
      let actif = true;
      let ref = null;
      let ecouteur = null;
      initialiser().then(({ db }) => {
        if (!actif) return;
        ref = db.ref('tournois/' + id + '/propositions');
        ecouteur = ref.on('value', (instantane) => rappel(instantane.val() || {}), () => rappel({}));
      }).catch(() => rappel({}));
      return () => {
        actif = false;
        if (ref && ecouteur) ref.off('value', ecouteur);
      };
    },

    async proposer(id, matchId, equipeId, sets) {
      const utilisateur = await connecter();
      const { db } = await initialiser();
      await db.ref('tournois/' + id + '/propositions/' + matchId + '/' + equipeId).set({
        sets,
        date: global.firebase.database.ServerValue.TIMESTAMP,
        uid: utilisateur.uid,
      });
    },

    async retirerProposition(id, matchId, equipeId) {
      await connecter();
      const { db } = await initialiser();
      await db.ref('tournois/' + id + '/propositions/' + matchId + (equipeId ? '/' + equipeId : '')).remove();
    },

    // rappel(true) quand l'appareil est connecté à la base, rappel(false) sinon.
    suivreConnexion(rappel) {
      let actif = true;
      let ref = null;
      let ecouteur = null;
      initialiser().then(({ db }) => {
        if (!actif) return;
        ref = db.ref('.info/connected');
        ecouteur = ref.on('value', (s) => rappel(s.val() === true));
      }).catch(() => rappel(false));
      return () => {
        actif = false;
        if (ref && ecouteur) ref.off('value', ecouteur);
      };
    },
  };

  const Donnees = Object.assign({}, CONFIG ? enLigne : local, {
    mesTournois: () => registre.liste(),
    // Dernière version connue du tournoi sur cet appareil (copie gardée à chaque mise à jour).
    lireCopie: (id) => BT.normaliser(lireJSON(cleTournoi(id))),
    cleOrganisateur: (id) => (registre.trouver(id) || {}).cle || null,
    // Mots de passe retenus sur cet appareil, posés sur chaque tournoi qu'il crée ensuite (mode en ligne).
    // [{ nom, mdp }] ; l'ancien format (un seul mot de passe en texte) est accepté.
    motsDePasseRetenus() {
      let brut = '';
      try { brut = localStorage.getItem('badminton:mdp-defaut') || ''; } catch (e) { return []; }
      if (!brut) return [];
      try {
        const liste = JSON.parse(brut);
        if (Array.isArray(liste)) return liste.filter((x) => x && x.mdp);
      } catch (e) { /* ancien format */ }
      return [{ nom: '', mdp: brut }];
    },
    retenirMotDePasse(nom, motDePasse) {
      const liste = this.motsDePasseRetenus().filter((x) => (x.nom || '').toLowerCase() !== (nom || '').toLowerCase());
      liste.push({ nom: nom || '', mdp: motDePasse });
      try { localStorage.setItem('badminton:mdp-defaut', JSON.stringify(liste)); } catch (e) { /* stockage indisponible */ }
    },
    oublierMotsDePasse() {
      try { localStorage.removeItem('badminton:mdp-defaut'); } catch (e) { /* stockage indisponible */ }
    },
    async appliquerMotDePasseRetenu(id) {
      const liste = this.motsDePasseRetenus();
      const cle = this.cleOrganisateur(id);
      if (!this.enLigne || !liste.length || !cle) return false;
      const chiffres = [];
      for (const x of liste) chiffres.push({ nom: x.nom || '', chiffre: await BT.chiffrerCle(cle, x.mdp) });
      await this.modifier(id, (t) => { chiffres.forEach((x) => BT.poserAcces(t, x.nom, x.chiffre)); });
      return true;
    },
  });

  BT.Donnees = Donnees;
})(typeof window !== 'undefined' ? window : globalThis);
