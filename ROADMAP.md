# FillMyDoc — Roadmap

## Tier 1 — Différenciation immédiate

### 1. Notifications email automatiques
Envoyer le lien de signature par email directement aux destinataires depuis le dashboard de signing. Resend est déjà intégré pour l'OTP, il suffit d'étendre son usage.

- [ ] Bouton "Envoyer par email" sur le dashboard de signing (individuel + bulk)
- [ ] Template email personnalisable (sujet, corps, lien de signature)
- [ ] Statut "envoyé" visible sur le dashboard
- [ ] Gestion des erreurs d'envoi (bounces, invalid emails)

### 2. Relances automatiques
Rappels configurables pour les documents non signés.

- [ ] Configuration des délais de relance (ex: J+3, J+7)
- [ ] Job CRON / scheduler pour déclencher les relances
- [ ] Template email de relance distinct du premier envoi
- [ ] Limite de relances max par document
- [ ] Indicateur "relancé X fois" sur le dashboard

### 3. Preview live du document
Aperçu en temps réel du PDF généré pendant l'étape de mapping, avec les données de la première ligne du CSV.

- [ ] Endpoint backend pour générer un PDF de preview (1 seule ligne)
- [ ] Composant frontend d'aperçu intégré à l'étape de mapping
- [ ] Rafraîchissement automatique quand le mapping change
- [ ] Sélecteur de ligne CSV pour prévisualiser différents résultats

---

## Tier 2 — Rétention & usage pro

### 4. Historique / tableau de bord global
Garder un historique de toutes les générations passées avec statistiques.

- [ ] Table `jobs` en base (date, template name, nombre de docs, mode)
- [ ] Page dashboard global listant tous les jobs passés
- [ ] Stats : nombre de docs générés, taux de signature, temps moyen de signature
- [ ] Filtres par date, statut, template
- [ ] Possibilité de relancer une génération depuis l'historique

### 5. Templates sauvegardés
Sauvegarder les mappings template↔CSV pour réutilisation.

- [ ] Table `saved_templates` en base (nom, mapping, conditions, prefix, etc.)
- [ ] Bouton "Sauvegarder ce mapping" après configuration
- [ ] Liste des templates sauvegardés au lancement de l'app
- [ ] Chargement automatique du mapping quand un template connu est re-uploadé
- [ ] Gestion (renommer, supprimer) des templates sauvegardés

### 6. Webhook / intégration Zapier
Notifier un système externe quand un document est signé.

- [ ] Table `webhooks` en base (URL, événements, secret)
- [ ] UI de configuration des webhooks
- [ ] Événements supportés : `document.signed`, `job.completed`, `document.viewed`
- [ ] Payload JSON standardisé avec signature HMAC
- [ ] Retry automatique en cas d'échec (3 tentatives, backoff exponentiel)
- [ ] Logs des appels webhook

---

## Tier 3 — Polish & conversion

### 7. Export CSV du suivi
Exporter l'état des signatures depuis le dashboard.

- [ ] Bouton "Exporter en CSV" sur le dashboard de signing
- [ ] Colonnes : destinataire, email, statut, date de signature, date d'envoi, nombre de relances
- [ ] Endpoint backend dédié `GET /api/signing/job/:jobId/export`

### 8. Branding personnalisé
Logo et couleurs custom sur la page de signature et le bloc de signature PDF.

- [ ] Upload de logo (stockage local ou S3)
- [ ] Configuration des couleurs primaires
- [ ] Rendu du logo sur la page de signature publique
- [ ] Intégration du logo dans le bloc de signature PDF (pdf-lib)
- [ ] Prévisualisation du branding dans les settings

### 9. QR code sur le PDF
QR code sur chaque PDF pointant vers une page de vérification/audit.

- [ ] Génération de QR code (librairie `qrcode`)
- [ ] Incrustation sur le PDF via pdf-lib (position configurable)
- [ ] Page publique de vérification `/verify/:documentHash`
- [ ] Affichage du statut, signataire, date, hash du document
