/* Image récapitulative à télécharger ou partager depuis le téléphone (format story 1080 × 1920). */
(function (global) {
  'use strict';
  const BT = global.BT;
  const W = 1080;
  const H = 1920;
  const M = 64;
  const POLICE = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const JAUNE = '#f4c430';
  const VERT_NUIT = '#05291c';

  function rectArrondi(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Écrit un texte sur une ligne, en réduisant la taille s'il est trop large.
  function ecrire(ctx, texte, x, y, o) {
    let taille = o.taille;
    const police = () => (o.poids || 700) + ' ' + taille + 'px ' + POLICE;
    ctx.font = police();
    while (o.max && ctx.measureText(texte).width > o.max && taille > 16) {
      taille -= 2;
      ctx.font = police();
    }
    ctx.fillStyle = o.couleur || '#fff';
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(texte, x, y);
    return taille;
  }

  // Découpe un texte en lignes (au plus maxLignes, avec points de suspension).
  function couper(ctx, texte, largeur, maxLignes) {
    const mots = String(texte).split(/\s+/);
    const lignes = [];
    let ligne = '';
    mots.forEach((mot) => {
      const essai = ligne ? ligne + ' ' + mot : mot;
      if (ctx.measureText(essai).width <= largeur || !ligne) ligne = essai;
      else { lignes.push(ligne); ligne = mot; }
    });
    if (ligne) lignes.push(ligne);
    if (lignes.length > maxLignes) {
      const garde = lignes.slice(0, maxLignes);
      let fin = garde[maxLignes - 1];
      while (ctx.measureText(fin + '…').width > largeur && fin.length > 1) fin = fin.slice(0, -1);
      garde[maxLignes - 1] = fin + '…';
      return garde;
    }
    return lignes;
  }

  function chargerIcone() {
    return new Promise((ok) => {
      const img = new Image();
      img.onload = () => ok(img);
      img.onerror = () => ok(null);
      const svg = BT.ICONE.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" ');
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  function fond(ctx) {
    const degrade = ctx.createLinearGradient(0, 0, W * 0.4, H);
    degrade.addColorStop(0, '#0d4a37');
    degrade.addColorStop(1, '#03201a');
    ctx.fillStyle = degrade;
    ctx.fillRect(0, 0, W, H);
    // Un terrain vu du dessus, en filigrane
    ctx.save();
    ctx.translate(W * 0.72, H * 0.58);
    ctx.rotate(-0.18);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 8;
    ctx.strokeRect(-260, -560, 520, 1120);
    ctx.beginPath();
    ctx.moveTo(-260, 0); ctx.lineTo(260, 0);
    ctx.moveTo(-200, -560); ctx.lineTo(-200, 560);
    ctx.moveTo(200, -560); ctx.lineTo(200, 560);
    ctx.moveTo(-260, -170); ctx.lineTo(260, -170);
    ctx.moveTo(-260, 170); ctx.lineTo(260, 170);
    ctx.moveTo(0, -560); ctx.lineTo(0, -170);
    ctx.moveTo(0, 170); ctx.lineTo(0, 560);
    ctx.stroke();
    ctx.restore();
  }

  function dateTournoi(t, st) {
    const ts = st.debut || t.cree || Date.now();
    const texte = new Date(ts).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return texte.charAt(0).toUpperCase() + texte.slice(1);
  }

  function entete(ctx, t, st, icone, etiquette) {
    if (icone) ctx.drawImage(icone, M, 70, 92, 92);
    ecrire(ctx, t.nom, M + 116, 128, { taille: 50, poids: 800, max: W - 2 * M - 116 });
    ecrire(ctx, dateTournoi(t, st), M + 116, 172, { taille: 30, poids: 600, couleur: 'rgba(255,255,255,0.7)', max: W - 2 * M - 116 });
    ecrire(ctx, etiquette, M, 262, { taille: 30, poids: 800, couleur: JAUNE });
  }

  function tuile(ctx, x, y, w, h, valeur, libelle) {
    rectArrondi(ctx, x, y, w, h, 28);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fill();
    ecrire(ctx, String(valeur), x + w / 2, y + h * 0.55, { taille: 76, poids: 850, align: 'center', max: w - 30 });
    ecrire(ctx, libelle, x + w / 2, y + h * 0.84, { taille: 28, poids: 650, couleur: 'rgba(255,255,255,0.72)', align: 'center', max: w - 24 });
  }

  function grilleTuiles(ctx, y, tuiles) {
    const ecart = 24;
    const w = (W - 2 * M - 2 * ecart) / 3;
    const h = 190;
    tuiles.forEach((x, i) => {
      tuile(ctx, M + (i % 3) * (w + ecart), y + Math.floor(i / 3) * (h + ecart), w, h, x[0], x[1]);
    });
    return y + Math.ceil(tuiles.length / 3) * (h + ecart);
  }

  function faits(ctx, y, liste, max) {
    liste.slice(0, max || 3).forEach(([libelle, valeur]) => {
      rectArrondi(ctx, M, y, W - 2 * M, 112, 24);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fill();
      ecrire(ctx, libelle.toUpperCase(), M + 32, y + 42, { taille: 24, poids: 800, couleur: JAUNE, max: W - 2 * M - 64 });
      ecrire(ctx, valeur, M + 32, y + 88, { taille: 38, poids: 700, max: W - 2 * M - 64 });
      y += 128;
    });
    return y;
  }

  function miniClassement(ctx, y, lignes, moi) {
    ecrire(ctx, 'CLASSEMENT', M, y, { taille: 28, poids: 800, couleur: JAUNE });
    y += 24;
    lignes.forEach((l) => {
      const estMoi = l.equipe.id === moi;
      rectArrondi(ctx, M, y, W - 2 * M, 62, 16);
      ctx.fillStyle = estMoi ? JAUNE : 'rgba(255,255,255,0.06)';
      ctx.fill();
      const couleur = estMoi ? VERT_NUIT : '#fff';
      ecrire(ctx, String(l.rang || ''), M + 30, y + 44, { taille: 34, poids: 850, couleur });
      ecrire(ctx, l.equipe.nom, M + 110, y + 44, { taille: 34, poids: 750, couleur, max: W - 2 * M - 360 });
      ecrire(ctx, l.etape ? l.etape : l.V + ' V · ' + l.D + ' D', W - M - 30, y + 44, { taille: 30, poids: 650, couleur: estMoi ? VERT_NUIT : 'rgba(255,255,255,0.75)', align: 'right', max: 230 });
      y += 74;
    });
    return y;
  }

  function texteScore(sets) {
    return sets.map(([x, y]) => x + '-' + y).join(' · ');
  }

  function rangTexte(r) {
    return r === 1 ? '1er' : r + 'e';
  }

  // Classement à montrer : final s'il existe, sinon celui de la poule (ou du championnat).
  function lignesClassement(t, equipeId) {
    const final = BT.statut(t) === 'termine' ? BT.classementFinal(t) : null;
    if (final) return final;
    const e = equipeId ? BT.equipe(t, equipeId) : null;
    return BT.classement(t, BT.avecPoules(t) && e ? e.poule : null);
  }

  function extrait(lignes, moi, n) {
    const debut = lignes.slice(0, n);
    if (!moi || debut.some((l) => l.equipe.id === moi)) return debut;
    const ligneMoi = lignes.find((l) => l.equipe.id === moi);
    return ligneMoi ? debut.slice(0, n - 1).concat([ligneMoi]) : debut;
  }

  function dessinerEquipe(ctx, t, equipeId, icone) {
    const st = BT.statsTournoi(t);
    const s = BT.statsEquipe(t, equipeId);
    const e = BT.equipe(t, equipeId);
    const place = BT.placeEquipe(t, equipeId);
    entete(ctx, t, st, icone, 'RÉCAP DE L’ÉQUIPE');

    ctx.font = '850 92px ' + POLICE;
    const nomLignes = couper(ctx, e.nom, W - 2 * M, 2);
    let y = 370;
    nomLignes.forEach((ligne) => { ecrire(ctx, ligne, M, y, { taille: 92, poids: 850, max: W - 2 * M }); y += 96; });
    if (e.joueurs) { ecrire(ctx, e.joueurs, M, y - 30, { taille: 36, poids: 600, couleur: 'rgba(255,255,255,0.75)', max: W - 2 * M }); y += 30; }

    // Place
    y += 10;
    rectArrondi(ctx, M, y, W - 2 * M, 220, 36);
    ctx.fillStyle = JAUNE;
    ctx.fill();
    if (place.rang) {
      ecrire(ctx, rangTexte(place.rang), M + 50, y + 160, { taille: 150, poids: 900, couleur: VERT_NUIT, max: 330 });
      ecrire(ctx, 'sur ' + place.sur + ' équipes', M + 400, y + 92, { taille: 46, poids: 800, couleur: VERT_NUIT, max: W - 2 * M - 440 });
    } else {
      ecrire(ctx, 'En jeu', M + 50, y + 140, { taille: 110, poids: 900, couleur: VERT_NUIT, max: 330 });
      ecrire(ctx, 'pas encore classée', M + 400, y + 92, { taille: 42, poids: 800, couleur: VERT_NUIT, max: W - 2 * M - 440 });
    }
    const etape = place.etape === 'Vainqueur' ? 'Vainqueur du tournoi' : place.etape || '';
    ecrire(ctx, (etape ? etape + ', ' : '') + (place.definitif ? 'classement final' : 'classement provisoire'), M + 400, y + 150,
      { taille: 32, poids: 650, couleur: 'rgba(5,41,28,0.8)', max: W - 2 * M - 440 });
    y += 260;

    // Chiffres clés
    const diff = s.ptsP - s.ptsC;
    y = grilleTuiles(ctx, y, [
      [s.V, s.V > 1 ? 'victoires' : 'victoire'],
      [s.D, s.D > 1 ? 'défaites' : 'défaite'],
      [s.joues, s.joues > 1 ? 'matchs joués' : 'match joué'],
      [s.ptsP, 'points marqués'],
      [(diff > 0 ? '+' : diff < 0 ? '−' : '') + Math.abs(diff), 'différence'],
      [s.serie, s.serie > 1 ? 'victoires d’affilée' : 'victoire d’affilée'],
    ]);
    y += 16;

    // Moments forts
    const moments = [];
    if (s.meilleureVictoire) moments.push(['Plus belle victoire', texteScore(s.meilleureVictoire.score) + ' contre ' + BT.nomEquipe(t, s.meilleureVictoire.adversaire)]);
    if (s.plusSerre) moments.push(['Match le plus serré', texteScore(s.plusSerre.score) + ' contre ' + BT.nomEquipe(t, s.plusSerre.adversaire)]);
    const cats = Object.keys(s.parCategorie).filter(Boolean);
    if (cats.length > 1) moments.push(['Bilan par catégorie', cats.map((c) => BT.nomCategorie(c) + ' ' + s.parCategorie[c].V + '-' + s.parCategorie[c].D).join('   ')]);
    if (s.minutes) moments.push(['Temps de jeu', s.minutes + (s.minutes > 1 ? ' minutes' : ' minute') + ' sur le terrain' + (s.plusLong ? ', plus long match ' + s.plusLong.duree + ' min' : '')]);
    if (s.joues) moments.push(['Moyenne', s.moyenne.toLocaleString('fr-FR') + ' points marqués par match']);
    if (!moments.length) moments.push(['Premier match', 'Les résultats s’afficheront ici au fil du tournoi']);
    y = faits(ctx, y, moments, 4);
    y += 12;

    // Classement, s'il reste de la place pour au moins 3 lignes
    const place3 = Math.floor((H - 130 - (y + 54)) / 74);
    if (place3 >= 3) miniClassement(ctx, y + 30, extrait(lignesClassement(t, equipeId), equipeId, Math.min(place3, 5)), equipeId);

    // Le tournoi en une ligne
    const resume = st.matchs + (st.matchs > 1 ? ' matchs joués, ' : ' match joué, ') + st.points.toLocaleString('fr-FR') + (st.points > 1 ? ' points marqués' : ' point marqué') + (st.champion ? ', vainqueur ' + st.champion.nom : '');
    ecrire(ctx, resume, W / 2, H - 92, { taille: 30, poids: 650, couleur: 'rgba(255,255,255,0.7)', align: 'center', max: W - 2 * M });
    ecrire(ctx, 'Tournoi de badminton loisir', W / 2, H - 44, { taille: 26, poids: 600, couleur: 'rgba(255,255,255,0.45)', align: 'center' });
  }

  function dessinerTournoi(ctx, t, icone) {
    const st = BT.statsTournoi(t);
    entete(ctx, t, st, icone, 'LE TOURNOI EN CHIFFRES');
    let y = 320;
    const final = BT.statut(t) === 'termine' ? BT.classementFinal(t) : null;
    rectArrondi(ctx, M, y, W - 2 * M, 230, 36);
    ctx.fillStyle = JAUNE;
    ctx.fill();
    if (st.champion) {
      ecrire(ctx, 'VAINQUEUR', M + 50, y + 70, { taille: 32, poids: 850, couleur: 'rgba(5,41,28,0.75)' });
      ecrire(ctx, st.champion.nom, M + 50, y + 165, { taille: 92, poids: 900, couleur: VERT_NUIT, max: W - 2 * M - 100 });
    } else {
      ecrire(ctx, 'EN COURS', M + 50, y + 70, { taille: 32, poids: 850, couleur: 'rgba(5,41,28,0.75)' });
      ecrire(ctx, st.matchs + ' / ' + st.total + (st.matchs > 1 ? ' matchs joués' : ' match joué'), M + 50, y + 165, { taille: 80, poids: 900, couleur: VERT_NUIT, max: W - 2 * M - 100 });
    }
    y += 270;
    const duree = st.debut && st.fin ? Math.round((st.fin - st.debut) / 60000) : 0;
    y = grilleTuiles(ctx, y, [
      [st.matchs, st.matchs > 1 ? 'matchs joués' : 'match joué'],
      [st.points.toLocaleString('fr-FR'), st.points > 1 ? 'points marqués' : 'point marqué'],
      [st.sets, st.sets > 1 ? 'sets joués' : 'set joué'],
      [t.equipes.length, 'équipes'],
      [t.reglages.terrains, t.reglages.terrains > 1 ? 'terrains' : 'terrain'],
      [duree ? Math.floor(duree / 60) + ' h ' + String(duree % 60).padStart(2, '0') : '0 h 00', 'de jeu'],
    ]);
    y += 16;
    const moments = [];
    const affiche = (f) => BT.nomEquipe(t, f.m.a) + ' ' + BT.texteScore(f.m) + ' ' + BT.nomEquipe(t, f.m.b);
    if (st.plusGrandEcart) moments.push(['Plus grand écart', affiche(st.plusGrandEcart)]);
    if (st.plusSerre) moments.push(['Match le plus serré', affiche(st.plusSerre)]);
    if (st.plusLong) moments.push(['Plus long match', st.plusLong.duree + ' min, ' + BT.nomEquipe(t, st.plusLong.m.a) + ' contre ' + BT.nomEquipe(t, st.plusLong.m.b)]);
    if (!moments.length) moments.push(['Premier match', 'Les résultats s’afficheront ici au fil du tournoi']);
    y = faits(ctx, y, moments);
    const lignes = (final || lignesClassement(t, null)).slice(0, 4);
    if (lignes.length && y < H - 400) miniClassement(ctx, y + 30, lignes, null);
    ecrire(ctx, 'Tournoi de badminton loisir', W / 2, H - 44, { taille: 26, poids: 600, couleur: 'rgba(255,255,255,0.45)', align: 'center' });
  }

  // Renvoie un canvas 1080 × 1920 : récap de l'équipe, ou du tournoi sans équipe.
  async function dessinerRecap(t, equipeId) {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    const icone = await chargerIcone();
    fond(ctx);
    if (equipeId) dessinerEquipe(ctx, t, equipeId, icone);
    else dessinerTournoi(ctx, t, icone);
    return canvas;
  }

  BT.dessinerRecap = dessinerRecap;
})(typeof window !== 'undefined' ? window : globalThis);
