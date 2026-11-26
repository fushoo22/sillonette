# Sillonette 0.1.3 (bêta)

Sillonette affiche dans OBS le morceau que tu écoutes sur YouTube Music (titre, artiste, pochette,
progression), sans aucun serveur : tout se passe sur ton PC.

## Télécharger

Prends le fichier **`sillonette-0.1.3.zip`** plus bas (rubrique « Assets »). Pas besoin du code source.
Mode d'emploi : `LISEZMOI.txt` dans le zip, ou https://fushoo.fr/sillonette/installation/

## Avertissements, à lire avant d'installer

- **Version bêta.** La 0.1.2 a été essayée avec succès par l'auteur sous Windows avec un vrai OBS ;
  les corrections de la 0.1.3 ont été testées sous Linux seulement. **Pas encore testée pendant de longs lives** (plusieurs heures).
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

## Corrections de la 0.1.3

Toutes concernent l'overlay (ce qui s'affiche dans OBS). L'extension n'a pas changé.

- **Titres en arabe ou en hébreu trop longs** : avant, ils défilaient dans le mauvais sens et sortaient
  de la carte (seuls les premiers mots restaient visibles). Maintenant ils défilent vers la droite et
  la fin du titre s'affiche.
- **Défilement des titres longs mal réglé** : avant, la longueur du défilement était mesurée une seule
  fois, parfois avant le chargement du skin ou de la police. Après un changement de skin ou de
  disposition, au lancement d'OBS avec un autre skin que Studio, ou si tu changes la taille de la
  source, le titre pouvait défiler trop loin, pas assez, ou pas du tout. Maintenant la mesure est
  refaite à chacun de ces moments.
- **Ancienne pochette affichée avec le nouveau titre** : avant, au changement de morceau, la pochette du
  morceau précédent restait jusqu'à ce que la nouvelle soit chargée (visible avec une connexion lente).
  Maintenant la place reste vide pendant ce court chargement.

Autre modification : un test automatique de l'overlay en plus, et un fichier `CHANGELOG.md`
(historique de toutes les versions).

## Comment mettre à jour

1. Télécharge `sillonette-0.1.3.zip` et extrais-le **dans le même dossier** que la version précédente,
   en remplaçant les fichiers (c'est surtout le dossier `overlay` qui change).
2. Page des extensions du navigateur : « Mettre à jour » ou la flèche en rond sur la carte Sillonette.
3. Dans OBS : clic droit sur la source → Propriétés → « Rafraîchir le cache de cette page ».

Ton mot de passe et tes réglages restent enregistrés.

## Ce qui a été testé, et ce qui ne l'a pas été

- Testé : tests automatiques (Chromium et Firefox sous Linux, faux OBS), et essai avec un vrai OBS 33
  sous Linux : titre arabe long, changement de skin puis rechargement de la source.
- **Pas testé** : Windows, macOS, Edge, Opera ; longs lives (plusieurs heures).

## Un avis, un bug ?

Onglet « Issues » de ce dépôt (compte GitHub nécessaire). **Tout y est public** : n'y mets jamais
ton mot de passe OBS, ta clé de stream, ni une capture ou un journal qui les montre.
