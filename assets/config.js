/* Connexion à la base en ligne Firebase.
   Tant que BT_FIREBASE vaut null, les tournois restent enregistrés dans le navigateur
   de l'organisateur (pas de suivi ni d'envoi de score depuis les téléphones).
   Une fois le projet Firebase créé, remplacer null par la configuration de l'application web :
   { apiKey: '…', authDomain: '…', databaseURL: '…', projectId: '…', appId: '…' }
   Ces valeurs ne sont pas secrètes : la sécurité vient des règles de database.rules.json. */
window.BT_FIREBASE = null;
