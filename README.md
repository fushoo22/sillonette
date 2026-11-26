# Sillonette

Sillonette affiche dans OBS le morceau que tu écoutes sur YouTube Music (titre, artiste, pochette,
progression), **sans aucun serveur** : tout se passe sur ton PC.

> **En développement.** Pas encore de version publiée. Jamais testé sous Windows ni sur de longues
> durées (plusieurs heures de live). À essayer seulement si tu acceptes quelques bugs.

Sillonette est un projet indépendant, gratuit, **non affilié** à YouTube, à Google ni à l'OBS Project.

## Comment ça marche

```
onglet YouTube Music ─► extension Sillonette (Chrome, Edge, Opera ; Firefox en test)
   ─► serveur WebSocket d'OBS, sur ce PC (127.0.0.1)
   ─► événement JavaScript ─► overlay (fichier local) dans une source « Navigateur » d'OBS
```

- L'extension lit ce que YouTube Music joue (titre, artiste, album, adresse de la pochette, position).
- Elle l'envoie à OBS **sur ce PC uniquement** (`ws://127.0.0.1`), par le serveur WebSocket intégré à OBS.
- OBS transmet l'information à l'overlay, un fichier HTML local chargé dans une source « Navigateur ».
- L'extension ne contacte aucun site. La seule chose qui sort du PC : **les pochettes**, que l'overlay
  charge directement chez Google (comme YouTube Music lui-même).

## À savoir avant d'essayer (honnêtement)

**Le mot de passe WebSocket d'OBS donne le contrôle total d'OBS** : changer de scène, démarrer ou
arrêter le live et l'enregistrement, **lire ou changer la clé de stream**… OBS ne permet pas de
créer un mot de passe « limité » : c'est tout ou rien. Sillonette n'envoie qu'une seule sorte de
message à OBS (le morceau en cours), mais quiconque récupère ce mot de passe peut tout faire.

- Ne montre jamais ce mot de passe à l'écran (attention pendant un live) et ne le donne à personne.
- Garde le mot de passe généré par OBS (16 caractères) : OBS ne limite pas le nombre d'essais.
- Le serveur WebSocket d'OBS écoute aussi sur ton réseau local, sans chiffrement : seul le mot de
  passe le protège. Sillonette n'a besoin que du PC lui-même ; si le pare-feu demande d'autoriser
  OBS sur le réseau, tu peux refuser (non vérifié sous Windows).
- Le mot de passe est enregistré **non chiffré** : par OBS dans ses réglages, et par l'extension dans
  le profil du navigateur (sauf si tu décoches « Le garder après la fermeture du navigateur »).
- OBS envoie l'événement à **toutes** ses sources « Navigateur » : une autre source (alertes, chat…)
  peut voir le titre en cours.

Détails techniques et sources vérifiées : [docs/TECHNIQUE.md](docs/TECHNIQUE.md).

## Installer (pour essayer)

Le mode d'emploi pas à pas est dans [LISEZMOI.txt](LISEZMOI.txt) (aussi dans le zip). En bref :

1. OBS 28 ou plus récent : Outils → Paramètres du serveur WebSocket → activer, copier le mot de passe.
2. Navigateur : page des extensions → mode développeur → « Charger l'extension non empaquetée » →
   dossier `extension-chrome`.
3. Popup Sillonette : port (4455) et mot de passe, puis « Enregistrer et connecter ».
4. OBS : **crée une nouvelle source « Navigateur web »** → « Fichier local » →
   `overlay/sillonette-overlay.html`, 800 × 200 (ou la taille conseillée par la popup).

Sillonette s'installe à côté d'autres extensions sans les remplacer (identité propre :
`sillonette@fushoo.fr` sous Firefox, dossier distinct sous Chrome).

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
```

Les tests de bout en bout utilisent le Chromium de Playwright (`npx playwright-core install chromium`,
ou `SILLONETTE_CHROMIUM=/chemin/vers/chrome`) et Firefox (`SILLONETTE_FIREFOX`).

Organisation : `src/content` (lecture de YouTube Music), `src/background` (partage entre onglets,
client obs-websocket), `src/popup`, `src/overlay`, `src/skins`, `src/fonts`, `scripts` (construction,
zip, contrôles), `test`.

## Licences

Code sous licence MIT (voir [LICENSE](LICENSE)). Polices sous SIL Open Font License 1.1
(`src/fonts/OFL-*.txt`, copiées dans `overlay/licences/` du zip). YouTube et YouTube Music sont
des marques de Google LLC ; OBS Studio est un logiciel de l'OBS Project.
