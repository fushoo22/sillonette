# Sillonette 0.2.0 (bêta) : personnalise ton overlay

Sillonette affiche dans OBS le morceau que tu écoutes sur YouTube Music (titre, artiste, pochette,
progression), sans aucun serveur : tout se passe sur ton PC.

## Télécharger

Prends le fichier **`sillonette-0.2.0.zip`** plus bas (rubrique « Assets »). Pas besoin du code source.
Mode d'emploi : `LISEZMOI.txt` dans le zip, ou https://fushoo.fr/sillonette/installation/

## Avertissements, à lire avant d'installer

- **Version bêta.** La 0.1.2 a été essayée avec succès par l'auteur sous Windows avec un vrai OBS ;
  la 0.2.0 a été testée sous Linux seulement. **Pas encore testée pendant de longs lives** (plusieurs heures).
  Garde une solution de secours.
- **Le mot de passe WebSocket d'OBS donne le contrôle total d'OBS**, clé de stream comprise.
  Ne le montre jamais à l'écran, ne le donne à personne. Copie-le avec le bouton « Copier » d'OBS
  (pas les points qui le masquent).
- L'extension s'installe en « mode développeur » (extension non empaquetée) : elle ne se met jamais
  à jour toute seule. Pour une nouvelle version, dézippe-la dans le même dossier puis recharge-la.
- Sillonette affiche le titre du morceau : il ne diffuse aucun son et ne donne aucun droit sur la
  musique. Les règles de YouTube Music et de ta plateforme de stream s'appliquent.
- Projet indépendant et gratuit, non affilié à YouTube, à Google ni à l'OBS Project.
  Licence MIT : fourni « tel quel », sans garantie.

## Nouveautés de la 0.2.0

- **Une page pour personnaliser l'overlay, avec un aperçu en direct.** Dans la popup, clique sur
  **« Personnaliser… »** (ou, sur la page des extensions : Sillonette → Détails → « Options de
  l'extension »). Tu peux régler :
  - l'apparence : skin, disposition, couleur d'accent, du texte et du fond, opacité du fond, arrondi
    des coins, forme de la pochette, ombre ;
  - le texte : police du titre, taille, défilement des titres trop longs ;
  - ce qui s'affiche : pochette, artiste, album, barre de progression, temps, mascotte (skin Lofi) ;
  - les animations : apparition, changement de morceau, « Réduire les mouvements » ;
  - le comportement : en pause (afficher « En pause », griser, ou masquer après quelques secondes),
    sans musique (masquer ou « Sillonette en attente »), alignement à gauche ou à droite, langue de
    l'overlay (français ou anglais).

  L'aperçu utilise le vrai overlay. Choisis **« Démo (faux morceaux) »** ou **« En direct (ta
  musique) »** : en direct, tu vois le morceau que Sillonette envoie à OBS à ce moment-là (code E10
  compris), seulement dans la page, même si OBS n'est pas connecté ; si rien ne joue, la page le dit.
  La pochette vient alors des serveurs d'images de Google, comme dans OBS. Chaque réglage est enregistré tout de suite
  dans ton navigateur, et l'overlay change dans OBS en quelques secondes (si Sillonette est connecté).
  La page prévient si le texte risque d'être difficile à lire (contraste), et le bouton
  **« Rétablir les réglages du skin »** remet tout comme avant.
- **Nouveau : « Quelques secondes à chaque nouveau morceau ».** La carte apparaît quand le morceau
  change, reste le temps choisi (10 s par défaut, de 3 à 60 s), puis se cache jusqu'au morceau suivant.
  Elle ne revient pas quand tu relances après une pause. Si un code d'erreur s'affiche (E10), il reste
  visible.
- **Tu peux choisir d'afficher ou non les codes d'erreur (E10) à l'antenne.** Avant, le badge
  s'affichait toujours dans OBS.
- **L'extension parle aussi anglais (English).** La popup (tous les messages, y compris les erreurs
  et l'avertissement sur le mot de passe) et la page de réglages suivent la langue de ton navigateur :
  français s'il est en français, anglais sinon. Les boutons **FR / EN** en haut changent la langue, et
  ton choix est gardé. Cela ne change pas la langue de l'overlay (réglage « Langue de l'overlay »).
  Le zip contient aussi `README-EN.txt`, un résumé en anglais du mode d'emploi.
- **Pour aller plus loin : le « CSS personnalisé » d'OBS.** Le mode d'emploi (`LISEZMOI.txt`, partie 7)
  explique comment mettre le titre en majuscules ou ajouter un contour au texte, sans rien installer.

## Autres modifications

- **La popup garde tes réglages.** Avant, choisir un skin ou une disposition dans la popup remettait
  tout le reste à zéro. Maintenant, un autre skin apporte ses couleurs, sa police et ses formes, et le
  reste (taille, contenu, comportement) est gardé.
- **Délai « Masquer après N secondes » en pause** : il repartait de zéro à chaque renvoi automatique de
  l'extension (toutes les 5 s), donc la carte ne se cachait jamais avec un délai de 5 s ou plus. Il
  compte maintenant depuis le début de la pause. Ce réglage n'était pas accessible avant la 0.2.0 :
  aucun utilisateur n'a pu le rencontrer.
- Tes réglages déjà enregistrés (skin et disposition) sont gardés. Une valeur invalide reprend celle du
  skin.
- Rien de plus n'est envoyé à OBS (toujours le même message, avec les réglages dans le même champ), et
  l'extension ne demande **aucune permission en plus**. Les réglages restent dans ton navigateur.
- Pour l'aperçu en direct, les pages de l'extension peuvent maintenant afficher des images venant des
  mêmes serveurs Google que l'overlay (pochettes) ; rien d'autre n'est autorisé.
- L'extension est un peu plus lourde (environ 0,5 Mo) : elle contient une copie de l'overlay et de ses
  polices pour l'aperçu.

## Comment mettre à jour

1. Télécharge `sillonette-0.2.0.zip` et extrais-le **dans le même dossier** que la version précédente,
   en remplaçant les fichiers. **Les deux dossiers changent** (`extension-chrome` et `overlay`) : un
   ancien overlay ignore les nouveaux réglages, sans erreur.
2. Page des extensions du navigateur : « Mettre à jour » ou la flèche en rond sur la carte Sillonette.
3. Dans OBS : clic droit sur la source → Propriétés → « Rafraîchir le cache de cette page ».

Ton mot de passe, ton skin et ta disposition restent enregistrés.

## Ce qui a été testé, et ce qui ne l'a pas été

- Testé sous Linux : 44 tests unitaires (dont la parité des textes français et anglais), 15 tests de
  bout en bout (Chromium et Firefox, faux OBS), dont la page de réglages (aperçu, enregistrement, envoi
  à OBS, clavier seul, audit d'accessibilité WCAG 2.1 AA en français et en anglais, page en largeur de
  téléphone), l'aperçu en direct (vrai morceau, pochette, E10, sans OBS) et un navigateur en anglais
  (popup, messages d'erreur, choix FR / EN gardé).
- **Essai avec un vrai OBS 33 sous Linux** (configuration jetable, son coupé, aucun live) : réglages
  changés sur la page et appliqués dans OBS en moins d'une seconde ; mode « 4 secondes » (affiché au
  nouveau morceau, caché après, pas de retour à la reprise, badge E10 visible) ; source rechargée et
  OBS redémarré (réglages revenus seuls) ; 7 combinaisons skin / disposition / taille (50 à 200 %) sans
  débordement à la taille conseillée ; CSS personnalisé appliqué. 23 points vérifiés sur 23.
- La page de réglages a aussi été essayée dans Firefox (module temporaire) : aperçu et envoi à OBS.
- L'essai avec le vrai OBS a été fait avec l'interface en français et avant l'ajout de l'aperçu en
  direct ; l'anglais et l'aperçu en direct sont vérifiés par les tests automatiques (faux YouTube
  Music), pas avec le vrai site.
- **Pas testé** : Windows, macOS, Edge, Opera ; longs lives (plusieurs heures).

## Un avis, un bug ?

Onglet « Issues » de ce dépôt (compte GitHub nécessaire). **Tout y est public** : n'y mets jamais
ton mot de passe OBS, ta clé de stream, ni une capture ou un journal qui les montre.
