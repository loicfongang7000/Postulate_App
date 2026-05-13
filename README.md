# CV → Offres France (local)

Application web **locale** : import d’un CV (PDF ou DOCX), extraction de mots-clés, recherche d’offres sur **France Travail** et **Adzuna** (France), fusion, dédoublonnage et score de correspondance avec le texte du CV.

## Prérequis

- Node.js 20+
- Compte développeur [France Travail (francetravail.io)](https://francetravail.io) — identifiants OAuth2 « client credentials »
- Clés [Adzuna API](https://developer.adzuna.com) (`app_id` / `app_key`)

## Installation

```bash
npm install
cp .env.example .env.local
# Renseignez FRANCE_TRAVAIL_CLIENT_ID, FRANCE_TRAVAIL_CLIENT_SECRET, ADZUNA_APP_ID, ADZUNA_APP_KEY
npm run dev
```

Ouvrez [http://localhost:3000](http://localhost:3000), déposez votre CV, ajustez éventuellement mots-clés / ville / département.

## Variables d’environnement

Voir [`.env.example`](.env.example). Les secrets restent sur votre poste (fichier `.env.local`, non versionné).

## Tests

```bash
npm test
```

## Limites

- Les APIs ne couvrent pas l’intégralité du marché (offres hors plateformes, LinkedIn, etc.).
- Le score est une **heuristique** (recouvrement de tokens), pas une décision RH.
