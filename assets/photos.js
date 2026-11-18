/* Photos : réduction des images sur le téléphone avant l'envoi.
   La base gratuite garde les photos en texte (JPEG en base64) : chaque photo existe en
   grande taille (ouverte à la demande) et en vignette (affichée dans l'album). */
(function (global) {
  'use strict';
  const BT = global.BT;

  // Tailles maximales, en caractères (les règles de la base refusent un peu au-delà).
  const LIMITES = { photo: 650000, miniature: 55000, equipe: 75000 };
  const DEBUT_JPEG = 'data:image/jpeg;base64,';

  // Une image venue de la base n'est affichée que si c'est bien un JPEG en base64.
  function imageSure(src) {
    return typeof src === 'string' && src.startsWith(DEBUT_JPEG) && /^[A-Za-z0-9+/]+=*$/.test(src.slice(DEBUT_JPEG.length)) ? src : '';
  }

  // Lit le fichier choisi (photo du téléphone), en respectant le sens de la prise de vue.
  async function chargerImage(fichier) {
    if (global.createImageBitmap) {
      try {
        const bitmap = await global.createImageBitmap(fichier, { imageOrientation: 'from-image' });
        return { source: bitmap, largeur: bitmap.width, hauteur: bitmap.height, liberer: () => bitmap.close && bitmap.close() };
      } catch (e) { /* format non lu ainsi : essai avec une image classique */ }
    }
    const url = URL.createObjectURL(fichier);
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    try {
      await img.decode();
    } catch (e) {
      URL.revokeObjectURL(url);
      throw new Error('Ce fichier n’est pas une photo lisible.');
    }
    return { source: img, largeur: img.naturalWidth, hauteur: img.naturalHeight, liberer: () => URL.revokeObjectURL(url) };
  }

  // Dessine l'image au plus « cote » pixels de côté (recadrée au centre si « carre »).
  function reduire(image, cote, carre) {
    let sx = 0;
    let sy = 0;
    let sw = image.largeur;
    let sh = image.hauteur;
    if (carre) {
      const c = Math.min(sw, sh);
      sx = (sw - c) / 2;
      sy = (sh - c) / 2;
      sw = c;
      sh = c;
    }
    const k = Math.min(1, cote / Math.max(sw, sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(sw * k));
    canvas.height = Math.max(1, Math.round(sh * k));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; // fond blanc pour les images transparentes
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image.source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  // JPEG le plus net possible sous la taille maximale.
  function enJpeg(canvas, max, qualites) {
    for (const q of qualites) {
      const d = canvas.toDataURL('image/jpeg', q);
      if (d.startsWith(DEBUT_JPEG) && d.length <= max) return d;
    }
    return null;
  }

  // Photo de l'album : grande taille et vignette.
  async function preparerPhoto(fichier) {
    const image = await chargerImage(fichier);
    try {
      let grande = null;
      for (const cote of [1280, 1024, 800]) {
        grande = enJpeg(reduire(image, cote, false), LIMITES.photo, [0.75, 0.65, 0.55]);
        if (grande) break;
      }
      const mini = enJpeg(reduire(image, 360, false), LIMITES.miniature, [0.65, 0.5, 0.4]);
      if (!grande || !mini) throw new Error('Photo trop lourde.');
      return { image: grande, mini, l: image.largeur, h: image.hauteur };
    } finally {
      image.liberer();
    }
  }

  // Photo d'une équipe : petit carré.
  async function preparerPhotoEquipe(fichier) {
    const image = await chargerImage(fichier);
    try {
      const carre = enJpeg(reduire(image, 320, true), LIMITES.equipe, [0.8, 0.7, 0.6, 0.5]);
      if (!carre) throw new Error('Photo trop lourde.');
      return carre;
    } finally {
      image.liberer();
    }
  }

  // Message à montrer quand un envoi échoue.
  function messageErreur(e) {
    const texte = String((e && (e.code || e.message)) || '');
    if (/permission/i.test(texte)) return 'La base n’accepte pas encore les photos. Préviens l’organisateur : il doit mettre à jour les règles de la base.';
    if (/quota|plein/i.test(texte)) return 'Plus de place sur cet appareil pour garder les photos.';
    return e && e.message && !/^[A-Z_]+:/.test(e.message) ? e.message : 'L’envoi n’a pas abouti. Vérifie ta connexion et réessaie.';
  }

  BT.Photos = { preparerPhoto, preparerPhotoEquipe, imageSure, messageErreur, LIMITES };
})(typeof window !== 'undefined' ? window : globalThis);
