/* Page d'accueil : liste des tournois enregistrés et création. */
(function () {
  'use strict';
  const { esc, Store } = BT;

  document.getElementById('icone').outerHTML = BT.ICONE;

  function dateCourte(ts) {
    return new Date(ts).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  function rendre() {
    const liste = Store.liste();
    document.getElementById('vide').hidden = liste.length > 0;
    document.getElementById('liste').innerHTML = liste.map((x) => `
      <li class="tournoi-ligne">
        <a class="nom" href="tournoi.html?t=${esc(x.id)}">${esc(x.nom)}</a>
        <span class="pastille pastille--${esc(x.statut)}">${esc(BT.LIBELLES_STATUT[x.statut] || '')}</span>
        <span class="infos">${x.equipes ? esc(x.equipes) + ' équipes, ' : ''}modifié le ${esc(dateCourte(x.maj))}</span>
        <span class="actions">
          <a class="bouton petit principal" href="tournoi.html?t=${esc(x.id)}">Ouvrir</a>
          <a class="bouton petit" href="ecran.html?t=${esc(x.id)}" target="_blank" rel="noopener">Écran</a>
          <button class="bouton petit danger" type="button" data-supprimer="${esc(x.id)}">Supprimer</button>
        </span>
      </li>`).join('');
  }

  document.getElementById('nouveau').addEventListener('click', () => {
    const t = BT.nouveauTournoi();
    Store.enregistrer(t);
    location.href = 'tournoi.html?t=' + encodeURIComponent(t.id) + '#reglages';
  });

  document.getElementById('liste').addEventListener('click', (e) => {
    const bouton = e.target.closest('[data-supprimer]');
    if (!bouton) return;
    const id = bouton.dataset.supprimer;
    const t = Store.charger(id);
    const nom = t ? t.nom : 'ce tournoi';
    if (confirm('Supprimer « ' + nom + ' » ? Les équipes, les matchs et les scores seront effacés de cet appareil.')) {
      Store.supprimer(id);
      rendre();
    }
  });

  window.addEventListener('storage', rendre);
  rendre();
})();
