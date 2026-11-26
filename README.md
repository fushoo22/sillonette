# Sillonette

Sillonette affiche dans OBS le morceau que tu écoutes sur YouTube Music (titre, artiste, pochette,
progression), **sans aucun serveur** : tout se passe sur ton PC.

> **Version bêta.** Essayée avec succès par l'auteur sous Windows avec un vrai OBS, et testée
> automatiquement sous Linux. **Pas encore testée sur de longues durées** (plusieurs heures de live).
> Garde une solution de secours pour tes lives.

Sillonette est un projet indépendant et gratuit, **non affilié** à YouTube, à Google ni à l'OBS Project.

## Télécharger

Le zip est dans la page **[Releases](https://github.com/fushoo22/sillonette/releases/latest)** de ce
dépôt : `sillonette-<version>.zip` (extension pour Chrome, Edge et Opera + overlay pour OBS + mode
d'emploi). Ne le télécharge pas ailleurs.

Mode d'emploi pas à pas : [LISEZMOI.txt](LISEZMOI.txt) (aussi dans le zip), ou la page
[fushoo.fr/sillonette/installation/](https://fushoo.fr/sillonette/installation/).

Ce qui change d'une version à l'autre (corrections, nouveautés) : [CHANGELOG.md](CHANGELOG.md).

## Comment ça marche

```
onglet YouTube Music ─► extension Sillonette (Chrome, Edge, Opera ; Firefox en module temporaire)
   ─► serveur WebSocket d'OBS, sur ce PC (127.0.0.1)
   ─► événement JavaScript ─► overlay (fichier local) dans une source « Navigateur web » d'OBS
```

- L'extension lit ce que YouTube Music joue (titre, artiste, album, adresse de la pochette, position).
- Elle l'envoie à OBS **sur ce PC uniquement** (`ws://127.0.0.1`), par le serveur WebSocket intégré à OBS.
- OBS transmet l'information à l'overlay, un fichier HTML local chargé dans une source « Navigateur web ».
- L'extension ne contacte aucun site. La seule chose qui sort du PC : **les pochettes**, que l'overlay
  charge directement chez Google (comme YouTube Music lui-même).

## À savoir avant d'installer (honnêtement)

**Le mot de passe WebSocket d'OBS donne le contrôle total d'OBS** : changer de scène, démarrer ou
arrêter le live et l'enregistrement, **lire ou changer la clé de stream**… OBS ne permet pas de
créer un mot de passe « limité » : c'est tout ou rien. Sillonette n'envoie qu'une seule sorte de
message à OBS (le morceau en cours), mais quiconque récupère ce mot de passe peut tout faire.

- Ne montre jamais ce mot de passe à l'écran (attention pendant un live) et ne le donne à personne.
- Garde le mot de passe généré par OBS (16 caractères) : OBS ne limite pas le nombre d'essais.
- Le serveur WebSocket d'OBS écoute aussi sur ton réseau local, sans chiffrement : seul le mot de
  passe le protège. Sillonette n'a besoin que du PC lui-même ; si le pare-feu de Windows demande
  d'autoriser OBS sur le réseau, tu peux refuser (ce cas précis n'a pas encore été vérifié).
- Le mot de passe est enregistré **non chiffré** : par OBS dans ses réglages, et par l'extension dans
  le profil du navigateur (sauf si tu décoches « Le garder après la fermeture du navigateur »).
- OBS envoie l'événement à **toutes** ses sources « Navigateur web » : une autre source (alertes, chat…)
  peut voir le titre en cours.
- Sillonette affiche le titre du morceau : il ne diffuse aucun son et ne donne aucun droit sur la
  musique. Les règles de YouTube Music et de ta plateforme de stream s'appliquent.

Détails techniques et sources vérifiées : [docs/TECHNIQUE.md](docs/TECHNIQUE.md).

## Installer, en bref

1. Dézippe dans un dossier que tu gardes (par exemple `C:\Sillonette\`).
2. OBS 28 ou plus récent : Outils → Paramètres du serveur WebSocket → « Activer le serveur WebSocket »,
   puis « Afficher les informations de connexion » et le bouton **« Copier »** à droite du mot de passe
   (pas les points affichés : ils masquent le mot de passe).
3. Navigateur : page des extensions → « Mode développeur » → « Charger l'extension non empaquetée » →
   dossier `extension-chrome`.
4. Popup Sillonette : port (4455) et mot de passe, puis « Enregistrer et connecter ».
5. OBS : **crée une nouvelle source « Navigateur web »** → « Fichier local » →
   `overlay\sillonette-overlay.html`, 800 × 200 (ou la taille conseillée par la popup).

Mettre à jour : dézippe la nouvelle version **dans le même dossier** (en remplaçant les fichiers : les
dossiers `extension-chrome` et `overlay`), puis recharge l'extension sur la page des extensions. Rien ne
se met à jour tout seul.

## Personnaliser

Popup Sillonette → **« Personnaliser… »** : une page avec un aperçu en direct (le vrai overlay, avec de
faux morceaux) pour régler couleurs, opacité, police, taille, éléments affichés, animations,
comportement en pause et sans musique, alignement, langue de l'overlay et codes d'erreur. Chaque
réglage est enregistré dans le navigateur et arrive dans OBS en quelques secondes. Le mode
**« Quelques secondes à chaque nouveau morceau »** montre la carte au changement de morceau (10 s par
défaut, de 3 à 60 s), puis la cache jusqu'au suivant (pas de retour à la reprise après une pause ; un
code d'erreur reste visible). Pour aller plus loin sans rien installer : le **« CSS personnalisé »**
de la source dans OBS (exemples dans [LISEZMOI.txt](LISEZMOI.txt), partie 7).

Sillonette s'installe à côté d'autres extensions sans les remplacer (identité propre :
`sillonette@fushoo.fr` sous Firefox, dossier distinct sous Chrome).

## Donner un avis, signaler un bug

Par les [Issues](https://github.com/fushoo22/sillonette/issues/new/choose) de ce dépôt (compte GitHub
nécessaire). **Tout y est public** : n'y mets jamais ton mot de passe WebSocket d'OBS, ta clé de
stream, une capture ou un journal qui les montre, ni d'information personnelle.

Une faille de sécurité ne se décrit pas en public : contacte fushoo en message privé, comme indiqué
dans les [mentions légales de fushoo.fr](https://fushoo.fr/mentions-legales/) (rubrique Contact).

## Pour les développeurs

Il faut Node.js 24 ou plus récent.

```sh
npm ci
npm run lint          # types (tsc), construction, contrôle des manifestes et de l'overlay
npm test              # tests unitaires
npm run lint:firefox  # web-ext lint (outil installé à part, dans tools/web-ext)
npm run e2e           # bout en bout : Chromium et Firefox sans tête, faux OBS
npm run zip           # dist-zip/sillonette-<version>.zip (extension Chrome + overlay + LISEZMOI)
node test/obs-reel/essai.mjs WORK OUT   # essai manuel avec un vrai OBS (configuration jetable)
node test/obs-reel/perso.mjs WORK OUT   # idem, pour la personnalisation (mesures des captures d'OBS)
```

Les tests de bout en bout utilisent le Chromium de Playwright (`npx playwright-core install chromium`,
ou `SILLONETTE_CHROMIUM=/chemin/vers/chrome`) et Firefox (`SILLONETTE_FIREFOX`).

Publication : pousser une étiquette `v<version>` (la même que `package.json`) lance
`.github/workflows/release.yml` : contrôles, tests unitaires, tests de bout en bout dans Chromium,
construction du zip et création de la Release avec les notes de `.github/notes-de-version.md`.

Organisation : `src/content` (lecture de YouTube Music), `src/background` (partage entre onglets,
client obs-websocket), `src/popup`, `src/options` (page de personnalisation), `src/overlay`, `src/skins`, `src/fonts`, `scripts` (construction,
zip, contrôles), `test`.

## Licences

Code sous licence MIT (voir [LICENSE](LICENSE)) : fourni « tel quel », sans garantie. Polices sous
SIL Open Font License 1.1 (`src/fonts/OFL-*.txt`, copiées dans `overlay/licences/` du zip).
YouTube et YouTube Music sont des marques de Google LLC ; OBS Studio est un logiciel de l'OBS Project.
