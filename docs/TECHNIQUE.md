# Sillonette : notes techniques

```
onglet YouTube Music ─(content script)─► extension (service worker / event page)
  ─ ws://127.0.0.1:4455 (obs-websocket v5, dans OBS) ─ CallVendorRequest obs-browser/emit_event ─►
  obs-browser : window.dispatchEvent(new CustomEvent("sillonette", {detail})) dans chaque source Navigateur
  ─► overlay = fichier local (sillonette-overlay.html, « Fichier local » d'OBS)
```

Commandes : voir le [README](../README.md).

## Protocole (vérifié dans les sources, pas supposé)

- obs-websocket v5 (`docs/generated/protocol.md`) : `Hello` (op 0) → `Identify` (op 1, `rpcVersion: 1`,
  `eventSubscriptions: 0`, `authentication = b64(sha256(b64(sha256(mdp + salt)) + challenge))`) →
  `Identified` (op 2) → `Request` (op 6) / `RequestResponse` (op 7). Mauvais mot de passe : fermeture 4009.
- obs-browser (`obs-browser-plugin.cpp`, `browser-app.cpp`) : vendor `obs-browser`, requête `emit_event`,
  `requestData = { event_name, event_data }`. Le nom est collé **sans échappement** dans du JavaScript
  évalué : il reste une constante (`sillonette`). L'événement part dans **toutes** les sources Navigateur.
- `event_data` traverse `obs_data` (libobs `obs-data.c`) : **les éléments de tableau qui ne sont pas des
  objets sont supprimés**. Constaté dans un vrai OBS 33 (liste `sh` du thème vide). Le thème voyage donc
  sous forme de chaîne (`encodeTheme`).
- « Fichier local » d'OBS = `http://absolute/<chemin>` (schéma maison, pas `file://`), sans fragment `#` :
  les réglages ne peuvent pas être dans l'URL, ils voyagent dans chaque événement.

## Événement (`src/shared/event.ts`)

`{ v: 1, np: <morceau ou « rien »>, theme: "<encodeTheme>", err: "" | "E10" }`.
L'overlay valide tout (tailles, textes nettoyés, nombres bornés, pochette limitée aux hôtes autorisés,
thème normalisé) : n'importe quel client obs-websocket peut émettre le même événement.

## Réglages de l'overlay (0.2.0)

- **Format** (`src/shared/config.ts`) : un objet de réglages court (`sk`, `ly`, `ac`, `tx`, `bg`, `ba`,
  `ft`, `sc`, `rd`, `sh`, `an`, `tc`, `mq`, `pa`, `pt`, `id`, `al`, `rm`, `lg`, `as`, `sd`, et depuis 0.2.0
  `nt` et `er`). Gardé tel quel dans `storage.local` (`theme`), envoyé dans le champ `theme` de chaque
  événement sous forme de texte (`encodeTheme` : seulement ce qui diffère du skin, base64url). Règle
  d'or : clé inconnue ignorée, valeur invalide = valeur du skin. Un overlay plus ancien ignore les
  nouvelles clés. Taille d'un thème maximal encodé : bien moins de 750 caractères (limite 1 500 ; test
  unitaire).
- `nt` : 0 = carte toujours visible ; 3 à 60 = la carte s'affiche à chaque nouveau morceau (titre,
  artiste ou pochette différents) puis se cache après `nt` secondes, jusqu'au morceau suivant. Une
  reprise après pause n'est pas un nouveau morceau. Les renvois toutes les 5 s ne prolongent rien. Le
  badge d'erreur est un élément à part : il reste visible. Pendant la fenêtre, les règles de pause
  s'appliquent.
- `er` : 1 = badge d'erreur (E10) affiché dans OBS, 0 = jamais (comme `er=0` dans un fragment d'aperçu).
- Délai de pause (`pa = hide`, `pt`) : compté depuis le premier événement « en pause » (avant 0.2.0, chaque
  renvoi de 5 s le relançait ; le réglage n'était pas exposé).
- **Page d'options** (`src/options`, `options_ui`, ouverte dans un onglet) : aucun droit en plus. Chaque
  changement passe par `normalizeTheme`, est écrit dans `storage.local` (200 ms après la fin d'un
  glissement de curseur), et le service d'arrière-plan l'envoie aussitôt à OBS. Changer de skin (page ou
  popup) applique les couleurs, polices et formes du skin et garde le reste (`withSkin`). La popup ne
  réécrit plus le thème avec le skin et la disposition seuls.
- **Aperçu** : copie de l'overlay dans l'extension (`apercu/`, même `overlay.js`, même CSS ; les polices y
  sont des fichiers car la CSP des pages d'extension refuse les polices `data:`). Sa propre CSP n'autorise
  que les fichiers de l'extension et les images des hôtes des pochettes (pas de réseau). En mode démo
  (`#demo=1&s=…`) : la page change seulement le fragment, et l'overlay en démo applique le nouveau
  fragment sans se recharger (`hashchange`). Contrôlé par `scripts/check-manifest.mjs`.
- **Aperçu « En direct »** : la page calcule le même événement que le service d'arrière-plan
  (`src/background/build-event.ts`, à partir de l'état partagé entre onglets dans `storage.session` et
  des réglages de la page) et le remet à l'overlay de l'aperçu (`apercu.html?direct`, sans mode démo) par
  `dispatchEvent` dans la page, toutes les 2 s et à chaque changement. Rien n'est envoyé à OBS par la
  page ; marche sans OBS. Pour la vraie pochette, la CSP des pages de l'extension et celle de l'aperçu
  ajoutent `img-src` vers les seuls hôtes des pochettes (`DEFAULT_ART_HOSTS`, déjà vérifiés sur chaque
  adresse). Contrôlé par `scripts/check-manifest.mjs`.
- Contraste : `src/shared/contrast.ts` (WCAG 2.1, pire cas sur scène noire et blanche, seuil 4,5:1).

## Comportement

- **Un seul onglet à la fois** (`src/background/lease.ts`) :
  premier onglet qui joue gagne, les autres reçoivent E10 ; libération à la pause, à l'arrêt, à la fermeture
  ou après 45 s de silence ; état oublié après 75 s sans nouvelle.
- **Renvoi toutes les 5 s** : une source rechargée ou un OBS lancé après se resynchronise en ≤ 5 s.
- **Reconnexion** : 1 s, 2 s, 4 s… 15 s ; 60 s après un mot de passe refusé (pas de rafale).
- **Fermeture d'onglet** : l'overlay est vidé aussitôt. Navigateur fermé : l'overlay se cache après 20 s.
- **Titres longs** : la distance de défilement est mesurée à chaque nouveau morceau, puis de nouveau quand
  un skin ou une police finit de charger et quand la source change de taille ; un titre de droite à gauche
  (arabe, hébreu : `dir="auto"`) défile vers la droite (0.1.3).
- **Pochette** : tant que la pochette du nouveau morceau charge, l'ancienne est masquée (classe
  `art-loading`) ; en cas d'échec, la note ♪ la remplace (0.1.3).

## Sécurité

### Ce que fait obs-websocket (sources lues : obs-websocket 5.7.6 = version incluse dans OBS 33.0.3)

Sources : `docs/generated/protocol.md`, `src/websocketserver/WebSocketServer.cpp`,
`WebSocketServer_Protocol.cpp`, `src/utils/Crypto.cpp`, `src/Config.cpp`, `src/forms/SettingsDialog.cpp`
(https://github.com/obsproject/obs-websocket/tree/5.7.6) ; obs-browser `obs-browser-plugin.cpp`,
`obs-browser-source.cpp`, `browser-app.cpp` (commit 08a0ada, celui d'OBS 33.0.3). Vérifié sur un vrai
OBS 33.0.3 par `test/obs-reel/essai.mjs` (le script affiche chaque constat).

- **Le mot de passe ne circule pas.** Hello donne `salt` et `challenge` ; le client répond
  `b64(sha256(b64(sha256(mdp + salt)) + challenge))`. Le **sel est tiré à chaque démarrage du serveur**
  (lancement d'OBS, ou changement de port/mot de passe), le **défi à chaque connexion**.
- **Stocker le « secret » `b64(sha256(mdp + sel))` au lieu du mot de passe ne sert à rien** : il vaut le
  mot de passe tant qu'OBS tourne, et il devient inutilisable au redémarrage d'OBS (sel neuf ; constaté :
  refus 4009). L'extension garde donc le mot de passe lui-même.
- **Aucune permission par client.** Un client identifié peut tout faire : `GetStreamServiceSettings`
  renvoie la **clé de stream**, `SetStreamServiceSettings`/`StartStream` détournent le live, etc.
  `emit_event` (obs-browser) colle le nom d'événement **sans échappement** dans du JavaScript exécuté dans
  **toutes** les sources Navigateur. Il n'existe aucun jeton à droits réduits.
- **Écoute sur toutes les interfaces** (`listen(port)` ; seule option : `--websocket_ipv4_only`, qui
  écoute alors sur 0.0.0.0). Constaté : `*:14455`. **Pas de réglage pour se limiter à 127.0.0.1.**
- **Pas de chiffrement** (websocketpp `asio_no_tls`) : `ws://` en clair. Sur 127.0.0.1 le trafic ne quitte
  pas le PC ; depuis le réseau, il passe en clair.
- **Pas de contrôle de l'en-tête Origin** (`onValidate` accepte tout) : constaté, une page web ordinaire
  reçoit le Hello. Seul le mot de passe la bloque.
- **Pas de limite d'essais** : constaté, 25 mauvaises réponses en 73 ms, la bonne acceptée juste après.
  Un mot de passe court (OBS accepte 6 caractères) se devine ; celui généré par OBS fait 16 lettres/chiffres.
- **Le serveur ne prouve pas son identité** : n'importe quel programme qui écoute sur le port peut envoyer
  un Hello. Il recevrait le titre en cours et une réponse à SON défi, avec laquelle il peut essayer des
  mots de passe hors ligne (sans espoir contre les 16 caractères d'OBS, facile contre un mot de passe court).
  Le protocole n'offre rien pour vérifier le serveur. Cas réaliste seulement si OBS est fermé et qu'un
  autre programme du PC a pris le port.
- `eventSubscriptions` absent = **toutes** les catégories ; `0` = aucune (constaté : 0 événement contre 5).
- Aucun événement « source rechargée » côté WebSocket : seul `Identified` (op 2) signale une (re)connexion.
  D'où le renvoi toutes les 5 s.
- OBS garde lui-même le mot de passe **en clair** (`plugin_config/obs-websocket/config.json`).

### Ce que fait l'extension

- Connexion **uniquement** à `ws://127.0.0.1:<port>` (code, hôte non modifiable) et CSP de l'extension
  `connect-src ws://127.0.0.1:*` (testé : fetch HTTP et `ws://localhost` bloqués). Firefox MV3 met
  `upgrade-insecure-requests` par défaut (ws:// → wss://) : la CSP explicite le remplace.
- `eventSubscriptions: 0`, et **liste fermée** de ce qui part sur la socket (`allowedMessage()` dans
  `src/background/obsws.ts`, testée) : Identify, ou `CallVendorRequest` obs-browser/`emit_event` avec un nom `[a-z-]`.
  C'est un garde-fou contre une erreur de code, **pas une protection** : qui vole le mot de passe a tout OBS.
- Mot de passe : jamais renvoyé dans la popup, jamais journalisé, jamais envoyé (seule la réponse au défi).
  - Case « Le garder après la fermeture du navigateur » (cochée par défaut, nécessaire pour un live après
    redémarrage du PC) : `storage.local` (sur disque, **non chiffré**). Décochée : `storage.session`
    (mémoire seulement, à recoller à chaque ouverture du navigateur). Gain limité : OBS garde déjà le même
    mot de passe en clair sur le même disque.
  - **Chrome/Edge** : `storage.local` est fermé au content script (`setAccessLevel TRUSTED_CONTEXTS`, testé :
    le script de l'onglet YouTube Music reçoit « Access to storage is not allowed »). Gain : un onglet
    YouTube Music compromis ne peut plus lire le mot de passe via le content script. **Firefox 160 :**
    `storage.local.setAccessLevel` n'existe pas, le content script pourrait le lire (constaté).
  - Bouton **« Oublier le mot de passe »** : retiré des deux stockages, connexion coupée.
  - Pas de mot de passe enregistré alors qu'OBS en demande : rien n'est envoyé (aucun échec dans OBS),
    message « OBS demande son mot de passe ».
- Messages clairs : OBS sans mot de passe (pastille orange, « tout appareil du réseau peut le piloter »),
  mot de passe refusé (4009), expulsé par OBS (4011), version incompatible (4010), OBS pas prêt (207).
  Nouvel essai au bout d'une minute dans ces cas.
- Mot de passe de moins de 12 caractères : avertissement (pas de limite d'essais côté OBS).
- Extension non empaquetée : elle ne se met jamais à jour toute seule (pas de mise à jour malveillante
  à distance) ; en contrepartie aucune correction n'arrive sans remplacer le dossier.
- CSP de l'overlay : scripts et styles du dossier seulement, polices `data:`, images du dossier et des hôtes de
  pochettes, aucune connexion. `style-src` accepte `'unsafe-inline'` car OBS injecte le « CSS personnalisé »
  de la source en `<style>` (sinon erreur CSP dans le journal d'OBS).

### Ce qui reste impossible à corriger avec obs-websocket

Droits complets pour le détenteur du mot de passe (clé de stream comprise) ; écoute sur le réseau local ;
pas de TLS ; pas de contrôle d'origine ; pas de limite d'essais ; pas d'authentification du serveur ;
événement envoyé à toutes les sources Navigateur ; mot de passe en clair chez OBS. Seule parade externe
pour le réseau : le pare-feu du système (bloquer les connexions entrantes vers OBS depuis le réseau ;
ce PC n'a besoin que de 127.0.0.1). Effet réel d'un refus dans le pare-feu de Windows : pas encore vérifié.

## Données

- **Lues** dans l'onglet YouTube Music (`src/content`) : titre, artiste, album, adresse de la pochette,
  durée, position, vitesse de lecture, publicité ou non. Rien d'autre (pas de compte, pas d'historique).
- **Gardées dans le navigateur** (stockage de l'extension) : port, mot de passe d'OBS (`storage.local`
  ou `storage.session`), réglages d'apparence de l'overlay (skin, disposition, couleurs… : `storage.local`), langue de l'interface choisie (`uiLang`) ; en mémoire de session : état des onglets et de la connexion.
- **Envoyées** : seulement à OBS, sur `ws://127.0.0.1` (CSP de l'extension). Pas de statistiques, pas de
  compte, pas de mise à jour automatique.
- **Réseau de l'overlay** : il charge la pochette directement chez Google (`lh3.googleusercontent.com`,
  `*.googleusercontent.com`, `i.ytimg.com`, `*.ggpht.com`), sans en-tête Referer. Google voit donc
  l'adresse IP du PC et l'image demandée. Les polices sont incluses dans le fichier (aucun appel).
- OBS lui-même, et son navigateur intégré, font leurs propres connexions (indépendantes de Sillonette).

## Limites connues

- Réglages communs à toutes les sources Sillonette d'OBS (l'événement va à toutes) : pas de réglages par
  scène.

- Interface de l'extension (popup, page de réglages) en français et en anglais (`src/shared/ui-text.ts`) : langue du navigateur par défaut (`i18n.getUILanguage`), boutons FR / EN gardés dans `storage.local` (`uiLang`), indépendants de la langue de l'overlay (`lg`). Description du manifeste par `_locales/{fr,en}`.

- Service worker Chrome : gardé en vie par le trafic WebSocket (Chrome ≥ 116) tant qu'OBS est connecté ;
  non prouvé sur de longues durées (les tests attachent DevTools, ce qui le garde en vie). Si OBS est fermé,
  le worker s'endort ; le pouls de l'onglet qui joue (20 s) le réveille et il se reconnecte. Un onglet **en pause**
  ne pulse pas : après un redémarrage d'OBS, il réapparaît à la reprise de la lecture.
- Firefox : extension temporaire (non signée) ; l'event page peut aussi être suspendue.
- Windows : essayé avec succès par l'auteur avec un vrai OBS (versions de Windows, d'OBS et du navigateur
  non relevées) ; aucun test automatique sous Windows. Chemins `http://absolute/C:/…` gérés par obs-browser
  d'après ses sources.
- L'événement va à toutes les sources Navigateur d'OBS (alertes, chat tiers…) : elles peuvent lire le titre.

## État : bêta

Fait : tests unitaires et de bout en bout (Chromium, Firefox, faux OBS), essai court avec un vrai
OBS 33 sous Linux (`test/obs-reel/essai.mjs`), essai réussi par l'auteur sous Windows avec un vrai OBS.
Le 26/11/2026 (0.1.2, vrai OBS 33 sous Linux, configuration jetable) : 6 skins × 3 dispositions sans
débordement à la taille conseillée, textes CJK/emoji/accents, OBS relancé, source rechargée, 15 minutes
avec un changement de morceau toutes les 40 s (23 morceaux, connexion jamais perdue, mémoire d'OBS stable) ;
lecture réelle de music.youtube.com sans compte dans un Chromium visible. Ce n'est pas un essai long.

Le 26/11/2026 (0.2.0, vrai OBS 33 sous Linux, configuration jetable, `test/obs-reel/perso.mjs`) : réglage
changé sur la page d'options appliqué dans OBS en moins d'une seconde ; mode « 4 s » (affiché au nouveau
morceau, caché ensuite, pas de retour à la reprise, badge E10 visible carte cachée) ; source rechargée et
OBS redémarré avec les réglages revenus seuls ; 7 combinaisons skin / disposition / taille (50 à 200 %)
sans débordement à la taille conseillée, titre long et badge E10 compris ; CSS personnalisé d'OBS
(majuscules, contour) appliqué sans erreur CSP : 23 points sur 23.

Avant une version stable : plusieurs heures de live sans problème (service worker) ; refus d'OBS dans le
pare-feu de Windows vérifié ; signature Firefox ; éventuellement publication dans les boutiques
d'extensions.
