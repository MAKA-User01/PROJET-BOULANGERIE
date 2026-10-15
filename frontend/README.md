# La Mie Dorée — frontend ERP

Interface Angular de démonstration pour le système de gestion de la boulangerie, construite à partir du cahier des charges du projet.

## Démarrer

Pré-requis : Node.js compatible avec Angular 12 et npm.

```bash
npm install
npm start
```

L’application est ensuite accessible sur `http://localhost:4200`.

## Construire

```bash
npm run build
```

Le résultat de production est généré dans `dist/boulangerie-erp/`.

## Ce que contient cette première version

- Tableau de bord en français : ventes, tickets, panier moyen, alertes de stock, activité récente et meilleures ventes.
- Navigation vers les espaces ventes, caisse, produits, stocks, achats, trésorerie, comptabilité, rapports et équipe.
- Point de vente de démonstration avec panier, quantités et total en FCFA.
- Formulaire d’ajout de produit avec recherche et filtre du catalogue.
- Mise en page responsive pour ordinateur, tablette et téléphone.
- Polices système et icônes locales : l’interface ne dépend pas d’une connexion Internet.

Les données affichées sont des données de démonstration stockées dans le navigateur. La connexion, les règles de rôles et permissions, la persistance et les appels API nécessiteront un backend avant toute mise en production. La vérification des permissions et les opérations sensibles devront être appliquées côté serveur, conformément au cahier des charges.
