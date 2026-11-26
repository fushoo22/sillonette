# Historique des versions

Les téléchargements sont sur la page [Releases](https://github.com/fushoo22/sillonette/releases).
Pour mettre à jour : voir « Mettre a jour » dans `LISEZMOI.txt` (extraire le nouveau zip dans le même
dossier en remplaçant les fichiers, recharger l'extension, puis dans OBS « Rafraichir le cache de cette
page » dans les propriétés de la source).

## 0.2.0 (bêta)

Nouveautés : la personnalisation de l'overlay.

- **Page « Personnaliser l'overlay »**, avec un **aperçu en direct** (le vrai overlay, avec de faux
  morceaux). On l'ouvre avec le nouveau bouton **« Personnaliser… »** de la popup (ou « Options » de
  l'extension). Tous les réglages : couleurs (accent, texte, fond), opacité du fond, arrondi des coins,
  forme de la pochette, ombre, police du titre, taille, défilement des titres longs, éléments affichés
  (pochette, artiste, album, barre, temps, mascotte), animations d'apparition et de changement de
  morceau, « Réduire les mouvements », comportement en pause, sans musique, alignement, langue de
  l'overlay. Chaque réglage est enregistré tout de suite dans le navigateur et arrive dans OBS en
  quelques secondes.
- **Aperçu « Démo » ou « En direct »** : en démo, de faux morceaux ; en direct, le morceau que
  l'extension envoie à OBS à ce moment-là (même état, E10 compris), affiché seulement dans la page,
  même si OBS n'est pas connecté. Rien de plus n'est envoyé à OBS. La page dit quand aucune musique
  ne joue. Pour afficher la vraie pochette, les pages de l'extension ont le droit de charger des
  images depuis les mêmes serveurs Google que l'overlay (règle de sécurité CSP élargie à ces seules
  images ; aucune permission en plus).
- **Alerte de contraste** : la page prévient si le texte risque d'être difficile à lire.
- **Bouton « Rétablir les réglages du skin »**.
- **Nouveau mode « Quelques secondes à chaque nouveau morceau »** (10 s par défaut, de 3 à 60 s) : la
  carte apparaît au changement de morceau, puis se cache jusqu'au morceau suivant. Elle ne revient pas
  quand on relance après une pause. Un code d'erreur (E10) reste toujours visible.
- **Choix d'afficher ou non les codes d'erreur (E10) à l'antenne.** Avant, le badge s'affichait toujours
  dans OBS.
- Mode d'emploi du **« CSS personnalisé » d'OBS** pour les cas avancés (majuscules, contour du texte…)
  dans `LISEZMOI.txt`.
- **L'extension parle aussi anglais** : popup (tous les messages d'état et d'erreur, aides,
  avertissement sur le mot de passe) et page de réglages. Elle suit la langue du navigateur (français
  si le navigateur est en français, anglais sinon) ; les boutons **FR / EN** la changent, et le choix
  est gardé. Cela ne change pas la langue de l'overlay (réglage à part). La description de
  l'extension s'affiche aussi dans les deux langues. Nouveau fichier `README-EN.txt` dans le zip :
  un résumé en anglais du mode d'emploi (`LISEZMOI.txt` reste la référence, en français).

Modifications :

- **La popup garde tes réglages** : changer de skin ou de disposition dans la popup ne remet plus tout à
  zéro. Un autre skin apporte ses couleurs, sa police et ses formes ; le reste (taille, contenu,
  comportement) est gardé.
- Correction d'un défaut qui serait apparu avec la nouvelle page : avec « En pause : Masquer après N
  secondes », le délai repartait de zéro à chaque renvoi de l'extension (toutes les 5 s), donc la
  carte ne se cachait jamais pour un délai de 5 s ou plus. Le délai compte maintenant depuis le début
  de la pause. (Ce réglage n'était pas accessible avant la 0.2.0.)
- Les réglages déjà enregistrés (skin et disposition) sont gardés. Une valeur invalide reprend celle du
  skin, comme avant.
- Rien de plus n'est envoyé à OBS : toujours le même message, avec les réglages dans le même champ.
  Aucune permission en plus.

Mettre à jour : remplacer **les deux dossiers** (`extension-chrome` et `overlay`). Un ancien overlay
ignore les nouveaux réglages (sans erreur).

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
