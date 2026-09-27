# Politique de sécurité

## Signaler une vulnérabilité

Merci de **ne pas ouvrir d'issue publique** pour une faille de sécurité. Utilisez le signalement privé
de GitHub : onglet **Security › Report a vulnerability** de ce dépôt.

Indiquez la version concernée, les étapes pour reproduire le problème et son impact. Une réponse est
apportée dans les meilleurs délais, et le correctif est publié dans une nouvelle version.

## Versions prises en charge

Seule la dernière version publiée reçoit des correctifs. Les mises à jour automatiques la diffusent
aux installations existantes.

## Modèle de menace

### Ce contre quoi Coffre-Fort protège

- **Vol du fichier du coffre** (copie du disque, sauvegarde, clé USB perdue) : sans le mot de passe
  maître, le contenu est inexploitable. Chaque essai coûte environ une seconde et 256 Mio de mémoire.
- **Altération du fichier** : toute modification, même d'un seul octet, est détectée à l'ouverture.
- **Fuite par le presse-papiers** : les données copiées sont exclues de l'historique Windows et de la
  synchronisation cloud, puis effacées après 20 secondes.
- **Captures et partages d'écran** : la fenêtre est exclue des captures.
- **Poste laissé sans surveillance** : verrouillage automatique après inactivité, au verrouillage de
  la session Windows et à la mise en veille.
- **Contenu malveillant dans l'interface** : bac à sable Chromium, isolation du contexte, politique
  de sécurité du contenu stricte, aucune ressource distante, aucune navigation possible.

### Ce qui sort du périmètre

- **Un ordinateur déjà compromis** : un enregistreur de frappe ou un programme malveillant exécuté
  avec vos droits peut capturer le mot de passe maître au moment de la saisie.
- **Un mot de passe maître faible ou réutilisé** : l'application refuse les mots de passe trop
  prévisibles, mais la solidité finale dépend de votre choix.
- **La mémoire vive** : la clé de chiffrement est effacée au verrouillage, mais le moteur JavaScript
  ne permet pas d'effacer de façon garantie les chaînes de caractères déjà affichées.

## Détails techniques

| Élément | Choix |
|---|---|
| Dérivation de clé | Argon2id, 3 passes, 256 Mio, parallélisme 4, sel aléatoire de 16 octets |
| Chiffrement | AES-256-GCM, nonce aléatoire de 12 octets renouvelé à chaque enregistrement |
| Authentification | En-tête (paramètres, sel, nonce) authentifié comme données associées (AAD) |
| Remplissage | Contenu arrondi par blocs de 4 Kio avant chiffrement |
| Aléa | `crypto.randomBytes` et `crypto.randomInt` de Node.js |
| Écriture | Fichier temporaire, `fsync`, remplacement atomique, copie `.bak` chiffrée |

Format du fichier `.cfv` :

```
"CFVAULT\x01" │ longueur de l'en-tête (4 octets, big-endian) │ en-tête JSON │ AES-256-GCM(données) │ tag (16 octets)
```

## Mises à jour

Les mises à jour sont téléchargées depuis les versions publiées de ce dépôt GitHub, en HTTPS. Le
fichier téléchargé est vérifié par son empreinte SHA-512, publiée dans `latest.yml` avec la version.
L'installateur n'étant pas signé par un certificat de signature de code, l'authenticité d'une mise à
jour repose sur la sécurité du dépôt GitHub. La vérification automatique peut être désactivée dans
**Paramètres › À propos**.

Les versions sont compilées et publiées exclusivement par GitHub Actions, à partir du code de ce dépôt.
