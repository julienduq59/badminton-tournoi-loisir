/* Page d'accueil : tournois gérés depuis cet appareil et création. */
(function () {
  'use strict';
  const { esc } = BT;
  const D = BT.Donnees;

  document.getElementById('icone').outerHTML = BT.ICONE;
  document.getElementById('note-stockage').textContent = D.enLigne
    ? 'Ce sont les tournois que tu gères depuis cet appareil. Pour en gérer un depuis un autre téléphone, utilise son lien organisateur (onglet QR code).'
    : 'Les tournois sont enregistrés dans ce navigateur, sur cet appareil.';

  // Mot de passe organisateur retenu sur cet appareil : posé sur chaque nouveau tournoi.
  async function motDePasseAuto(id) {
    try { await D.appliquerMotDePasseRetenu(id); } catch (e) { /* le tournoi reste sans mot de passe */ }
  }

  function dateCourte(ts) {
    return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function rendre() {
    const liste = D.mesTournois();
    document.getElementById('vide').hidden = liste.length > 0;
    document.getElementById('liste').innerHTML = liste.map((x) => `
      <li class="tournoi-ligne">
        <a class="nom" href="tournoi.html?t=${esc(x.id)}">${esc(x.nom)}</a>
        ${x.statut ? `<span class="pastille pastille--${esc(x.statut)}">${esc(BT.LIBELLES_STATUT[x.statut] || '')}</span>` : ''}
        <span class="infos">${x.equipes ? esc(x.equipes) + ' équipes, ' : ''}modifié le ${esc(dateCourte(x.maj))}</span>
        <span class="actions">
          <a class="bouton petit principal" href="tournoi.html?t=${esc(x.id)}">Ouvrir</a>
          <a class="bouton petit" href="ecran.html?t=${esc(x.id)}" target="_blank" rel="noopener">Écran</a>
          <button class="bouton petit" type="button" data-recommencer="${esc(x.id)}">Recommencer</button>
          <button class="bouton petit danger" type="button" data-supprimer="${esc(x.id)}">Supprimer</button>
        </span>
      </li>`).join('');
  }

  const boutonNouveau = document.getElementById('nouveau');
  boutonNouveau.addEventListener('click', async () => {
    const erreur = document.getElementById('erreur');
    erreur.hidden = true;
    boutonNouveau.disabled = true;
    boutonNouveau.textContent = 'Création en cours';
    try {
      const t = BT.nouveauTournoi();
      await D.creer(t);
      await motDePasseAuto(t.id);
      location.href = 'tournoi.html?t=' + encodeURIComponent(t.id) + '#reglages';
    } catch (e) {
      erreur.textContent = 'Création impossible. ' + (e && e.message ? e.message : 'Vérifie la connexion internet.');
      erreur.hidden = false;
      boutonNouveau.disabled = false;
      boutonNouveau.textContent = 'Créer un tournoi';
    }
  });

  // Nouveau tournoi avec les mêmes équipes et les mêmes réglages (scores remis à zéro).
  async function recommencer(id, bouton) {
    const source = D.lireCopie(id);
    if (!source) {
      alert('Ouvre d’abord ce tournoi une fois sur cet appareil, puis réessaie.');
      return;
    }
    if (!confirm('Créer un nouveau tournoi avec les mêmes équipes et les mêmes réglages que « ' + source.nom + ' » ? L’ancien tournoi reste dans la liste.')) return;
    bouton.disabled = true;
    try {
      const t = BT.nouveauTournoi();
      t.nom = source.nom;
      t.reglages = Object.assign({}, source.reglages);
      t.equipes = source.equipes.map((e) => ({ id: 'e' + BT.uid(6), nom: e.nom, joueurs: e.joueurs || '' }));
      await D.creer(t);
      await motDePasseAuto(t.id);
      location.href = 'tournoi.html?t=' + encodeURIComponent(t.id) + '#reglages';
    } catch (err) {
      bouton.disabled = false;
      alert('Création impossible. ' + (err && err.message ? err.message : ''));
    }
  }

  document.getElementById('liste').addEventListener('click', async (e) => {
    const relance = e.target.closest('[data-recommencer]');
    if (relance) { recommencer(relance.dataset.recommencer, relance); return; }
    const bouton = e.target.closest('[data-supprimer]');
    if (!bouton) return;
    const id = bouton.dataset.supprimer;
    const entree = D.mesTournois().find((x) => x.id === id);
    const nom = entree ? entree.nom : 'ce tournoi';
    if (!confirm('Supprimer « ' + nom + ' » ? Les équipes, les matchs et les scores seront effacés.')) return;
    bouton.disabled = true;
    try {
      await D.supprimer(id);
    } catch (err) {
      alert('Suppression impossible. ' + (err && err.message ? err.message : ''));
    }
    rendre();
  });

  // Restauration d'un fichier de sauvegarde : crée un nouveau tournoi identique.
  document.getElementById('bouton-restaurer').addEventListener('click', () => document.getElementById('restaurer').click());
  document.getElementById('restaurer').addEventListener('change', async (e) => {
    const fichier = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!fichier) return;
    try {
      let donnees;
      try { donnees = JSON.parse(await fichier.text()); } catch (e) { throw new Error('format'); }
      const source = donnees && donnees.tournoi;
      if (!source || !Array.isArray(source.equipes) || !Array.isArray(source.matchs) || !source.reglages) throw new Error('format');
      const t = BT.normaliser(source);
      delete t.acces; // l'ancien mot de passe protégeait la clé de l'ancien tournoi
      t.id = BT.uid(10);
      t.cree = Date.now();
      if (!confirm('Restaurer « ' + t.nom + ' » (' + t.equipes.length + ' équipes, ' + t.matchs.length + ' matchs) ? Il sera ajouté à tes tournois.')) return;
      await D.creer(t);
      await motDePasseAuto(t.id);
      location.href = 'tournoi.html?t=' + encodeURIComponent(t.id);
    } catch (err) {
      alert(err && err.message === 'format' ? 'Ce fichier n’est pas une sauvegarde de tournoi.' : 'Restauration impossible. ' + (err && err.message ? err.message : ''));
    }
  });

  window.addEventListener('storage', rendre);
  rendre();
})();
