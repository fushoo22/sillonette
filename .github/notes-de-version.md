# Sillonette 0.1.2 (bêta)

Sillonette affiche dans OBS le morceau que tu écoutes sur YouTube Music (titre, artiste, pochette,
progression), sans aucun serveur : tout se passe sur ton PC.

## Télécharger

Prends le fichier **`sillonette-0.1.2.zip`** plus bas (rubrique « Assets »). Pas besoin du code source.
Mode d'emploi : `LISEZMOI.txt` dans le zip, ou https://fushoo.fr/sillonette/installation/

## Avertissements, à lire avant d'installer

- **Version bêta.** Essayée avec succès par l'auteur sous Windows avec un vrai OBS, et testée
  automatiquement sous Linux. **Pas encore testée pendant de longs lives** (plusieurs heures).
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

## Nouveautés de la 0.1.2

- La popup explique où copier le mot de passe dans OBS (bouton « Copier »).
- Si tu colles les points qui masquent le mot de passe, la popup le dit et ne change rien.
- « Enregistrer et connecter » relance la connexion tout de suite ; les espaces collés autour du
  mot de passe sont ignorés (0.1.1).

## Un avis, un bug ?

Onglet « Issues » de ce dépôt (compte GitHub nécessaire). **Tout y est public** : n'y mets jamais
ton mot de passe OBS, ta clé de stream, ni une capture ou un journal qui les montre.
