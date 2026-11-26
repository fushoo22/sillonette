# Historique des versions

Les téléchargements sont sur la page [Releases](https://github.com/fushoo22/sillonette/releases).
Pour mettre à jour : voir « Mettre a jour » dans `LISEZMOI.txt` (extraire le nouveau zip dans le même
dossier en remplaçant les fichiers, recharger l'extension, puis dans OBS « Rafraichir le cache de cette
page » dans les propriétés de la source).

## 0.1.3 (bêta)

Corrections de l'overlay (fichier `overlay`, affiché dans OBS) :

- **Titres en arabe ou en hébreu** : quand le titre était trop long, il défilait dans le mauvais sens
  et finissait par sortir de la carte (seuls les premiers mots restaient visibles). Il défile maintenant
  vers la droite et montre bien la fin du titre.
- **Défilement des titres longs mal réglé** : la distance de défilement était mesurée une seule fois,
  parfois avant que le skin ou la police soient chargés. Après un changement de skin ou de disposition,
  au démarrage d'OBS avec un autre skin que Studio, ou après un changement de taille de la source, le
  titre pouvait défiler trop loin (vide à la fin), pas assez (fin du titre jamais visible), ou ne pas
  défiler du tout. La mesure est refaite quand le skin, une police ou la taille changent.
- **Pochette du morceau précédent** : au changement de morceau, l'ancienne pochette restait affichée à
  côté du nouveau titre tant que la nouvelle n'était pas chargée (bien visible avec une connexion lente).
  La place de la pochette reste maintenant vide le temps du chargement.

Autres modifications :

- Nouveau test de bout en bout de l'overlay seul (`test/e2e/overlay.e2e.mjs`), qui vérifie aussi que le
  « CSS personnalisé » d'une source OBS s'applique.
- Ce fichier `CHANGELOG.md`.

L'extension (popup, connexion à OBS, lecture de YouTube Music) n'a pas changé.

## 0.1.2 (bêta) — 26/11/2026

- La popup explique où copier le mot de passe dans OBS (bouton « Copier » à droite du mot de passe).
- Si on colle les points qui masquent le mot de passe au lieu du mot de passe, la popup le dit et ne
  change rien.
- Première version publique : textes du dépôt (statut bêta, limites), publication automatique du zip
  sur GitHub Releases, formulaires pour signaler un bug ou donner un avis.

## 0.1.1 — 26/11/2026

- « Enregistrer et connecter » relance la connexion tout de suite (avant : nouvel essai seulement une
  minute après un mot de passe refusé).
- Les espaces collés autour du mot de passe sont ignorés.

## 0.1.0 — 26/11/2026

Première version (en développement, non publiée) :

- Extension (Chrome, Edge, Opera ; Firefox en module temporaire) qui lit le morceau joué sur YouTube
  Music et l'envoie à OBS sur le même PC par le serveur WebSocket d'OBS, sans aucun serveur.
- Overlay chargé comme fichier local dans une source Navigateur d'OBS.
- Connexion uniquement à 127.0.0.1, liste fermée des messages envoyés à OBS, mot de passe gardé ou
  seulement pour la session, bouton « Oublier ».
- Un seul onglet YouTube Music à la fois (code E10 pour les autres).
- Six skins, trois dispositions, polices incluses.
