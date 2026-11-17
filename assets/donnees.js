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

  function lireJSON(cle) {
    try { return JSON.parse(global.localStorage.getItem(cle)); } catch (e) { return null; }
  }
  function ecrireJSON(cle, valeur) {
    try { global.localStorage.setItem(cle, JSON.stringify(valeur)); } catch (e) { /* stockage plein ou bloqué */ }
  }
  function effacer(cle) {
    try { global.localStorage.removeItem(cle); } catch (e) { /* stockage bloqué */ }
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
      registre.retirer(id);
      notifier(cleTournoi(id));
    },

    estOrganisateur(id) {
      return !!registre.trouver(id) || !!lireJSON(cleTournoi(id));
    },

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

  const enLigne = {
    enLigne: true,

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

    // Ouverture du lien organisateur sur un autre appareil.
    async rejoindre(id, cle) {
      const liste = registre.liste().filter((x) => x.id !== id);
      ecrireJSON(CLE_REGISTRE, [{ id, nom: 'Tournoi', maj: Date.now(), cle }].concat(liste));
      try {
        return await enLigne.assurerOrganisateur(id);
      } catch (erreur) {
        registre.retirer(id);
        throw erreur;
      }
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
    // Mot de passe retenu sur cet appareil, appliqué aux tournois qu'il crée ensuite (mode en ligne).
    motDePasseRetenu() {
      try { return localStorage.getItem('badminton:mdp-defaut') || ''; } catch (e) { return ''; }
    },
    retenirMotDePasse(motDePasse) {
      try {
        if (motDePasse) localStorage.setItem('badminton:mdp-defaut', motDePasse);
        else localStorage.removeItem('badminton:mdp-defaut');
      } catch (e) { /* stockage indisponible */ }
    },
    async appliquerMotDePasseRetenu(id) {
      const motDePasse = this.motDePasseRetenu();
      const cle = this.cleOrganisateur(id);
      if (!this.enLigne || !motDePasse || !cle) return false;
      const acces = await BT.chiffrerCle(cle, motDePasse);
      await this.modifier(id, (t) => { t.acces = acces; });
      return true;
    },
  });

  BT.Donnees = Donnees;
})(typeof window !== 'undefined' ? window : globalThis);
