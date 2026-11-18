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
      // Photos HEIC (certains téléphones Android, fichiers venus d'un iPhone) : lues seulement par Safari.
      if (/hei[cf]/i.test(fichier.type || '') || /\.hei[cf]$/i.test(fichier.name || '')) {
        throw new Error('Ce téléphone ne lit pas les photos au format HEIC. Envoie une capture d’écran de la photo, ou règle l’appareil photo en JPEG.');
      }
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

  /* ---------- Téléchargement de toutes les photos en un fichier .zip ---------- */

  // Octets d'une image en base64.
  function octets(src) {
    const bin = atob(src.slice(src.indexOf(',') + 1));
    const tab = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) tab[i] = bin.charCodeAt(i);
    return tab;
  }

  const TABLE_CRC = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c >>> 0;
    }
    return table;
  })();
  function crc32(tab) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < tab.length; i++) c = TABLE_CRC[(c ^ tab[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  // Archive .zip sans compression (les JPEG sont déjà compressés) : [{ nom, octets, date }].
  function creerZip(fichiers) {
    const morceaux = [];
    const central = [];
    let position = 0;
    const encodeur = new TextEncoder();
    fichiers.forEach((f) => {
      const nom = encodeur.encode(f.nom);
      const crc = crc32(f.octets);
      const d = new Date(f.date || Date.now());
      const heure = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
      const jour = ((Math.max(1980, d.getFullYear()) - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
      const entete = new DataView(new ArrayBuffer(30));
      entete.setUint32(0, 0x04034b50, true);
      entete.setUint16(4, 20, true);
      entete.setUint16(6, 0x0800, true); // noms en UTF-8
      entete.setUint16(10, heure, true);
      entete.setUint16(12, jour, true);
      entete.setUint32(14, crc, true);
      entete.setUint32(18, f.octets.length, true);
      entete.setUint32(22, f.octets.length, true);
      entete.setUint16(26, nom.length, true);
      morceaux.push(entete.buffer, nom, f.octets);
      const ligne = new DataView(new ArrayBuffer(46));
      ligne.setUint32(0, 0x02014b50, true);
      ligne.setUint16(4, 20, true);
      ligne.setUint16(6, 20, true);
      ligne.setUint16(8, 0x0800, true);
      ligne.setUint16(12, heure, true);
      ligne.setUint16(14, jour, true);
      ligne.setUint32(16, crc, true);
      ligne.setUint32(20, f.octets.length, true);
      ligne.setUint32(24, f.octets.length, true);
      ligne.setUint16(28, nom.length, true);
      ligne.setUint32(42, position, true);
      central.push(ligne.buffer, nom);
      position += 30 + nom.length + f.octets.length;
    });
    const tailleCentral = central.reduce((total, x) => total + x.byteLength, 0);
    const fin = new DataView(new ArrayBuffer(22));
    fin.setUint32(0, 0x06054b50, true);
    fin.setUint16(8, fichiers.length, true);
    fin.setUint16(10, fichiers.length, true);
    fin.setUint32(12, tailleCentral, true);
    fin.setUint32(16, position, true);
    return new Blob(morceaux.concat(central, [fin.buffer]), { type: 'application/zip' });
  }

  BT.Photos = { preparerPhoto, preparerPhotoEquipe, imageSure, messageErreur, octets, creerZip, LIMITES };
})(typeof window !== 'undefined' ? window : globalThis);
