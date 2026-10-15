import { hashPassword } from './crypto';
import {
  Budget, CashSession, DbState, JournalEntry, PaymentMode, PaymentRequest, Product, PurchaseOrder, RoleId, Sale,
  StockMovement, Supplier, TreasuryAccount, TreasuryMovement, User
} from './models';

export const DEMO_PASSWORD = 'Tammak#2026';

export const DEMO_ACCOUNTS: { identifiant: string; role: RoleId }[] = [
  { identifiant: 'c.ekambi', role: 'caissier' },
  { identifiant: 'h.tchoupo', role: 'stock' },
  { identifiant: 'a.bello', role: 'acheteur' },
  { identifiant: 'p.essomba', role: 'financier' },
  { identifiant: 'm.fotso', role: 'comptable' },
  { identifiant: 'e.mbarga', role: 'manager' },
  { identifiant: 'r.nkoulou', role: 'admin' }
];

function rng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function daysAgo(days: number, hour = 9, minute = 0): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

export function createSeed(): DbState {
  const random = rng(20261015);
  const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];

  const people: [string, string, string, RoleId, string][] = [
    ['u-cekambi', 'Christelle', 'Ekambi', 'caissier', 'c.ekambi'],
    ['u-jndjock', 'Junior', 'Ndjock', 'caissier', 'j.ndjock'],
    ['u-htchoupo', 'Hervé', 'Tchoupo', 'stock', 'h.tchoupo'],
    ['u-abello', 'Aïcha', 'Bello', 'acheteur', 'a.bello'],
    ['u-pessomba', 'Patrick', 'Essomba', 'financier', 'p.essomba'],
    ['u-mfotso', 'Mireille', 'Fotso', 'comptable', 'm.fotso'],
    ['u-embarga', 'Estelle', 'Mbarga', 'manager', 'e.mbarga'],
    ['u-rnkoulou', 'Rodrigue', 'Nkoulou', 'admin', 'r.nkoulou']
  ];
  const users: User[] = people.map(([id, prenom, nom, role, identifiant], index) => {
    const salt = `tammak-${identifiant}-${index}`;
    return {
      id, prenom, nom, role, identifiant, salt,
      actif: true,
      passwordHash: hashPassword(DEMO_PASSWORD, salt),
      mustChangePassword: false,
      telephone: `+237 6${String(77 + index * 3)} ${String(12 + index * 9).padStart(2, '0')} ${String(30 + index * 7).padStart(2, '0')} ${String(40 + index * 5).padStart(2, '0')}`,
      creeLe: daysAgo(120 - index),
      creePar: role === 'manager' || role === 'admin' ? undefined : 'u-embarga'
    };
  });

  const products: Product[] = [
    { id: 'p-baguette', reference: 'PAI-001', libelle: 'Baguette tradition', categorie: 'Pains', type: 'fini', unite: 'pièce', prix: 175, stock: 220, seuil: 80, actif: true },
    { id: 'p-campagne', reference: 'PAI-002', libelle: 'Pain de campagne', categorie: 'Pains', type: 'fini', unite: 'pièce', prix: 900, stock: 24, seuil: 10, actif: true },
    { id: 'p-complet', reference: 'PAI-003', libelle: 'Pain complet', categorie: 'Pains', type: 'fini', unite: 'pièce', prix: 600, stock: 8, seuil: 12, actif: true },
    { id: 'p-mie', reference: 'PAI-004', libelle: 'Pain de mie', categorie: 'Pains', type: 'fini', unite: 'pièce', prix: 1000, stock: 30, seuil: 10, actif: true },
    { id: 'p-croissant', reference: 'VIE-001', libelle: 'Croissant au beurre', categorie: 'Viennoiseries', type: 'fini', unite: 'pièce', prix: 400, stock: 64, seuil: 30, actif: true },
    { id: 'p-chocolatine', reference: 'VIE-002', libelle: 'Pain au chocolat', categorie: 'Viennoiseries', type: 'fini', unite: 'pièce', prix: 450, stock: 18, seuil: 25, actif: true },
    { id: 'p-chausson', reference: 'VIE-003', libelle: 'Chausson aux pommes', categorie: 'Viennoiseries', type: 'fini', unite: 'pièce', prix: 500, stock: 22, seuil: 10, actif: true },
    { id: 'p-brioche', reference: 'VIE-004', libelle: 'Brioche tressée', categorie: 'Viennoiseries', type: 'fini', unite: 'pièce', prix: 1500, stock: 4, seuil: 6, actif: true },
    { id: 'p-tarte', reference: 'PAT-001', libelle: 'Tarte au citron (part)', categorie: 'Pâtisseries', type: 'fini', unite: 'part', prix: 1200, stock: 16, seuil: 8, actif: true },
    { id: 'p-eclair', reference: 'PAT-002', libelle: 'Éclair au café', categorie: 'Pâtisseries', type: 'fini', unite: 'pièce', prix: 800, stock: 20, seuil: 8, actif: true },
    { id: 'p-ananas', reference: 'PAT-003', libelle: 'Gâteau ananas-coco', categorie: 'Pâtisseries', type: 'fini', unite: 'pièce', prix: 12000, stock: 3, seuil: 2, actif: true },
    { id: 'm-farine', reference: 'MAT-001', libelle: 'Farine de blé T55', categorie: 'Farines', type: 'matiere', unite: 'kg', prix: 520, stock: 640, seuil: 400, actif: true },
    { id: 'm-beurre', reference: 'MAT-002', libelle: 'Beurre doux', categorie: 'Produits laitiers', type: 'matiere', unite: 'kg', prix: 6200, stock: 18, seuil: 25, actif: true },
    { id: 'm-sucre', reference: 'MAT-003', libelle: 'Sucre en poudre', categorie: 'Épicerie', type: 'matiere', unite: 'kg', prix: 700, stock: 85, seuil: 40, actif: true },
    { id: 'm-levure', reference: 'MAT-004', libelle: 'Levure boulangère', categorie: 'Épicerie', type: 'matiere', unite: 'kg', prix: 3200, stock: 12, seuil: 5, actif: true },
    { id: 'm-oeufs', reference: 'MAT-005', libelle: 'Œufs frais (plateau 30)', categorie: 'Produits frais', type: 'matiere', unite: 'plateau', prix: 2700, stock: 14, seuil: 10, actif: true },
    { id: 'm-lait', reference: 'MAT-006', libelle: 'Lait entier', categorie: 'Produits laitiers', type: 'matiere', unite: 'L', prix: 900, stock: 46, seuil: 30, actif: true },
    { id: 'm-chocolat', reference: 'MAT-007', libelle: 'Chocolat noir 64 %', categorie: 'Épicerie', type: 'matiere', unite: 'kg', prix: 9500, stock: 6, seuil: 4, actif: true }
  ];

  const suppliers: Supplier[] = [
    { id: 's-minoterie', nom: 'Minoterie du Wouri', contact: 'Emmanuel Ngando', telephone: '+237 233 42 18 50', email: 'commandes@minoterie-wouri.cm', categorie: 'Farines', actif: true },
    { id: 's-laiterie', nom: 'Laiterie de l’Adamaoua', contact: 'Hadjara Moussa', telephone: '+237 222 25 64 11', email: 'ventes@laiterie-adamaoua.cm', categorie: 'Produits laitiers', actif: true },
    { id: 's-ferme', nom: 'Ferme avicole de la Menoua', contact: 'Serge Kamdem', telephone: '+237 677 52 18 04', email: 'contact@ferme-menoua.cm', categorie: 'Produits frais', actif: true },
    { id: 's-sahel', nom: 'Comptoir de Bonabéri', contact: 'Carine Eyoum', telephone: '+237 233 39 77 90', email: 'pro@comptoir-bonaberi.cm', categorie: 'Épicerie', actif: true },
    { id: 's-ndar', nom: 'Emballages de Bonanjo', contact: 'Blaise Etame', telephone: '+237 699 31 09 66', email: 'devis@emballages-bonanjo.cm', categorie: 'Emballages', actif: true }
  ];

  const finishedProducts = products.filter((product) => product.type === 'fini');
  const weights = [10, 2, 2, 2, 6, 5, 2, 1, 2, 2, 1];
  const weighted: Product[] = [];
  finishedProducts.forEach((product, index) => {
    for (let i = 0; i < weights[index]; i++) {
      weighted.push(product);
    }
  });

  const sessions: CashSession[] = [];
  const sales: Sale[] = [];
  const entries: JournalEntry[] = [];
  let saleCounter = 1200;
  let entryCounter = 0;
  const modes: PaymentMode[] = ['especes', 'especes', 'especes', 'momo', 'momo', 'orange_money', 'carte'];

  for (let day = 13; day >= 0; day--) {
    const caissiers = day === 0 ? ['u-jndjock'] : ['u-cekambi', 'u-jndjock'];
    let dayTotal = 0;
    caissiers.forEach((caissierId, index) => {
      const sessionId = `cs-${day}-${index}`;
      const session: CashSession = {
        id: sessionId,
        poste: caissierId === 'u-cekambi' ? 'Caisse 1 — Comptoir' : 'Caisse 2 — Terrasse',
        caissierId,
        ouverture: daysAgo(day, 6, 30),
        fondInitial: 25000,
        statut: day === 0 ? 'ouverte' : 'fermee'
      };
      const saleCount = day === 0 ? 34 : 22 + Math.floor(random() * 18);
      let cash = 0;
      for (let s = 0; s < saleCount; s++) {
        const lineCount = 1 + Math.floor(random() * 3);
        const lines = new Map<string, { product: Product; quantity: number }>();
        for (let l = 0; l < lineCount; l++) {
          const product = pick(weighted);
          const quantity = product.prix > 5000 ? 1 : 1 + Math.floor(random() * (product.prix < 300 ? 6 : 3));
          const existing = lines.get(product.id);
          lines.set(product.id, { product, quantity: (existing ? existing.quantity : 0) + quantity });
        }
        const saleLines = Array.from(lines.values()).map(({ product, quantity }) => ({
          productId: product.id, libelle: product.libelle, quantite: quantity, prixUnitaire: product.prix
        }));
        const total = saleLines.reduce((sum, line) => sum + line.quantite * line.prixUnitaire, 0);
        const paiement = pick(modes);
        const minute = Math.floor((s / saleCount) * (day === 0 ? 240 : 700));
        saleCounter++;
        sales.push({
          id: `v-${saleCounter}`,
          numero: `VT-${String(saleCounter).padStart(6, '0')}`,
          date: daysAgo(day, 6 + Math.floor((40 + minute) / 60), (40 + minute) % 60),
          caissierId,
          sessionId,
          lignes: saleLines,
          sousTotal: total,
          remise: 0,
          total,
          paiement,
          montantRecu: paiement === 'especes' ? Math.ceil(total / 500) * 500 : undefined,
          statut: 'validee'
        });
        if (paiement === 'especes') {
          cash += total;
        }
        dayTotal += total;
      }
      if (day > 0) {
        const ecart = random() < 0.25 ? -Math.round(random() * 4) * 250 : 0;
        session.fermeture = daysAgo(day, 19, 45);
        session.attendu = session.fondInitial + cash;
        session.declare = session.attendu + ecart;
        session.ecart = ecart;
      }
      sessions.push(session);
    });
    if (day > 0) {
      entryCounter++;
      entries.push({
        id: `e-ve-${day}`,
        numero: `EC-${String(entryCounter).padStart(5, '0')}`,
        date: daysAgo(day, 20, 0),
        journal: 'VE',
        libelle: `Ventes comptoir du ${new Date(daysAgo(day)).toLocaleDateString('fr-FR')}`,
        lignes: [
          { compte: '571', libelle: 'Caisse', debit: dayTotal, credit: 0 },
          { compte: '702', libelle: 'Ventes de produits finis', debit: 0, credit: dayTotal }
        ],
        statut: day > 2 ? 'validee' : 'brouillon',
        auteurId: 'u-mfotso',
        controlePar: day > 2 ? 'u-mfotso' : undefined,
        source: 'Clôture de caisse'
      });
    }
  }

  // Une demande d'annulation en attente de validation par le Manager.
  const lastSale = sales[sales.length - 4];
  lastSale.statut = 'annulation_demandee';
  lastSale.motifAnnulation = 'Erreur de saisie : le client a pris une baguette au lieu d’un pain de campagne.';

  const orders: PurchaseOrder[] = [
    {
      id: 'o-41', numero: 'BC-2026-0041', fournisseurId: 's-minoterie',
      lignes: [{ productId: 'm-farine', libelle: 'Farine de blé T55', quantite: 1000, prixUnitaire: 500 }],
      total: 500000, statut: 'livree', creePar: 'u-abello', creeLe: daysAgo(12), soumisLe: daysAgo(12),
      validePar: 'u-embarga', valideLe: daysAgo(11), livreLe: daysAgo(9), regle: true
    },
    {
      id: 'o-42', numero: 'BC-2026-0042', fournisseurId: 's-laiterie',
      lignes: [
        { productId: 'm-beurre', libelle: 'Beurre doux', quantite: 20, prixUnitaire: 6100 },
        { productId: 'm-lait', libelle: 'Lait entier', quantite: 40, prixUnitaire: 880 }
      ],
      total: 157200, statut: 'livree', creePar: 'u-abello', creeLe: daysAgo(6), soumisLe: daysAgo(6),
      validePar: 'u-embarga', valideLe: daysAgo(6), livreLe: daysAgo(3), regle: false
    },
    {
      id: 'o-43', numero: 'BC-2026-0043', fournisseurId: 's-ferme',
      lignes: [{ productId: 'm-oeufs', libelle: 'Œufs frais (plateau 30)', quantite: 20, prixUnitaire: 2650 }],
      total: 53000, statut: 'approuvee', creePar: 'u-abello', creeLe: daysAgo(2), soumisLe: daysAgo(2),
      valideLe: daysAgo(2), livraisonPrevue: daysAgo(-1), regle: false
    },
    {
      id: 'o-44', numero: 'BC-2026-0044', fournisseurId: 's-minoterie',
      lignes: [
        { productId: 'm-farine', libelle: 'Farine de blé T55', quantite: 1500, prixUnitaire: 510 },
        { productId: 'm-levure', libelle: 'Levure boulangère', quantite: 10, prixUnitaire: 3150 }
      ],
      total: 796500, statut: 'en_validation', creePar: 'u-abello', creeLe: daysAgo(1), soumisLe: daysAgo(1),
      livraisonPrevue: daysAgo(-3), regle: false
    },
    {
      id: 'o-45', numero: 'BC-2026-0045', fournisseurId: 's-sahel',
      lignes: [{ productId: 'm-chocolat', libelle: 'Chocolat noir 64 %', quantite: 8, prixUnitaire: 9400 }],
      total: 75200, statut: 'brouillon', creePar: 'u-abello', creeLe: daysAgo(0, 8, 10), regle: false
    }
  ];

  const accounts: TreasuryAccount[] = [
    { id: 't-caisse', libelle: 'Caisse principale', type: 'caisse', compteComptable: '571', solde: 412500 },
    { id: 't-banque', libelle: 'Banque — compte courant', type: 'banque', compteComptable: '521', solde: 6845000 },
    { id: 't-momo', libelle: 'MTN Mobile Money', type: 'mobile', compteComptable: '5211', solde: 938400 },
    { id: 't-om', libelle: 'Orange Money', type: 'mobile', compteComptable: '5212', solde: 401750 }
  ];

  const treasury: TreasuryMovement[] = [];
  const spending: [string, string, number, number][] = [
    ['Matières premières', 'Règlement BC-2026-0041 — Minoterie du Wouri', 500000, 8],
    ['Matières premières', 'Achat comptant — fruits et citrons', 46500, 5],
    ['Énergie', 'Facture électricité — fours', 386000, 7],
    ['Énergie', 'Recharge gaz — fournil', 92000, 2],
    ['Salaires', 'Avances sur salaires', 300000, 10],
    ['Loyer', 'Loyer du local — mois en cours', 350000, 12],
    ['Entretien', 'Révision du four à sole', 128000, 6],
    ['Entretien', 'Réparation pétrin', 54000, 3],
    ['Emballages', 'Sachets kraft et boîtes à gâteaux', 68000, 4]
  ];
  spending.forEach(([categorie, libelle, montant, day], index) => {
    treasury.push({
      id: `tm-s-${index}`, date: daysAgo(day, 11), compteId: index % 3 === 0 ? 't-banque' : index % 3 === 1 ? 't-momo' : 't-banque',
      sens: 'sortie', montant, categorie, libelle, auteurId: 'u-pessomba'
    });
  });
  [12, 9, 6, 3, 1].forEach((day, index) => {
    treasury.push({
      id: `tm-e-${index}`, date: daysAgo(day, 17), compteId: 't-banque', sens: 'entree',
      montant: 650000 + index * 42000, categorie: 'Dépôt des recettes', libelle: 'Versement des recettes en banque', auteurId: 'u-pessomba'
    });
  });

  const periode = new Date().toISOString().slice(0, 7);
  const budgets: Budget[] = [
    ['Matières premières', 2500000], ['Énergie', 450000], ['Salaires', 1800000],
    ['Loyer', 350000], ['Entretien', 150000], ['Emballages', 120000]
  ].map(([categorie, montant], index) => ({
    id: `b-${index}`, categorie: categorie as string, periode, montantPrevu: montant as number,
    statut: 'valide', creePar: 'u-pessomba', validePar: 'u-embarga'
  }));
  budgets.push({ id: 'b-6', categorie: 'Marketing', periode, montantPrevu: 200000, statut: 'propose', creePar: 'u-pessomba' });

  const paymentRequests: PaymentRequest[] = [
    {
      id: 'dp-11', numero: 'DP-2026-0011', beneficiaire: 'Minoterie du Wouri', objet: 'Règlement BC-2026-0041',
      montant: 500000, categorie: 'Matières premières', compteId: 't-banque', commandeId: 'o-41', statut: 'payee',
      creePar: 'u-pessomba', creeLe: daysAgo(9), validePar: 'u-embarga', payeLe: daysAgo(8)
    },
    {
      id: 'dp-12', numero: 'DP-2026-0012', beneficiaire: 'Laiterie de l’Adamaoua', objet: 'Règlement BC-2026-0042',
      montant: 157200, categorie: 'Matières premières', compteId: 't-banque', commandeId: 'o-42', statut: 'en_validation',
      creePar: 'u-pessomba', creeLe: daysAgo(1)
    }
  ];

  const movements: StockMovement[] = [
    { id: 'mv-1', date: daysAgo(9, 10), productId: 'm-farine', type: 'livraison', quantite: 1000, stockAvant: 210, stockApres: 1210, motif: 'Réception BC-2026-0041', auteurId: 'u-abello', statut: 'applique', reference: 'BC-2026-0041' },
    { id: 'mv-2', date: daysAgo(3, 9), productId: 'm-beurre', type: 'livraison', quantite: 20, stockAvant: 9, stockApres: 29, motif: 'Réception BC-2026-0042', auteurId: 'u-abello', statut: 'applique', reference: 'BC-2026-0042' },
    { id: 'mv-3', date: daysAgo(3, 9, 5), productId: 'm-lait', type: 'livraison', quantite: 40, stockAvant: 18, stockApres: 58, motif: 'Réception BC-2026-0042', auteurId: 'u-abello', statut: 'applique', reference: 'BC-2026-0042' },
    { id: 'mv-4', date: daysAgo(2, 5), productId: 'm-farine', type: 'sortie', quantite: -280, stockAvant: 920, stockApres: 640, motif: 'Production — fournée du matin', auteurId: 'u-htchoupo', statut: 'applique' },
    { id: 'mv-5', date: daysAgo(1, 5), productId: 'm-beurre', type: 'sortie', quantite: -11, stockAvant: 29, stockApres: 18, motif: 'Production — viennoiseries', auteurId: 'u-htchoupo', statut: 'applique' },
    { id: 'mv-6', date: daysAgo(1, 18), productId: 'p-eclair', type: 'perte', quantite: -3, stockAvant: 23, stockApres: 20, motif: 'Invendus en fin de journée', auteurId: 'u-htchoupo', statut: 'applique' },
    { id: 'mv-7', date: daysAgo(0, 7), productId: 'p-croissant', type: 'perte', quantite: -14, stockAvant: 64, stockApres: 50, motif: 'Fournée trop cuite — four n°2 à recalibrer', auteurId: 'u-htchoupo', statut: 'en_attente' },
    { id: 'mv-8', date: daysAgo(0, 6), productId: 'p-baguette', type: 'entree', quantite: 180, stockAvant: 40, stockApres: 220, motif: 'Production — fournée de 5 h', auteurId: 'u-htchoupo', statut: 'applique' }
  ];

  entries.push(
    {
      id: 'e-ac-41', numero: `EC-${String(++entryCounter).padStart(5, '0')}`, date: daysAgo(9, 12), journal: 'AC',
      libelle: 'Facture Minoterie du Wouri — BC-2026-0041',
      lignes: [
        { compte: '601', libelle: 'Achats de matières premières', debit: 500000, credit: 0 },
        { compte: '401', libelle: 'Fournisseurs', debit: 0, credit: 500000 }
      ],
      statut: 'validee', auteurId: 'u-mfotso', controlePar: 'u-mfotso', source: 'Réception de commande'
    },
    {
      id: 'e-bq-41', numero: `EC-${String(++entryCounter).padStart(5, '0')}`, date: daysAgo(8, 12), journal: 'BQ',
      libelle: 'Règlement Minoterie du Wouri — DP-2026-0011',
      lignes: [
        { compte: '401', libelle: 'Fournisseurs', debit: 500000, credit: 0 },
        { compte: '521', libelle: 'Banque', debit: 0, credit: 500000 }
      ],
      statut: 'validee', auteurId: 'u-mfotso', controlePar: 'u-mfotso', source: 'Paiement'
    },
    {
      id: 'e-ac-42', numero: `EC-${String(++entryCounter).padStart(5, '0')}`, date: daysAgo(3, 12), journal: 'AC',
      libelle: 'Facture Laiterie de l’Adamaoua — BC-2026-0042',
      lignes: [
        { compte: '601', libelle: 'Achats de matières premières', debit: 157200, credit: 0 },
        { compte: '401', libelle: 'Fournisseurs', debit: 0, credit: 157200 }
      ],
      statut: 'brouillon', auteurId: 'u-mfotso', source: 'Réception de commande'
    }
  );

  return {
    version: 1,
    users,
    products,
    movements,
    sessions,
    sales,
    suppliers,
    orders,
    accounts,
    treasury,
    paymentRequests,
    budgets,
    entries,
    settings: {
      nomEtablissement: 'TAMMAK — Boulangerie & Pâtisserie',
      sessionTimeoutMin: 15,
      maxTentatives: 5,
      verrouillageMin: 10,
      mfaPrivilegies: true,
      separationTaches: true,
      seuilAchat: 250000,
      seuilPaiement: 100000,
      seuilEcartStock: 10,
      remiseMaxPct: 10
    },
    backups: [],
    counters: { vente: saleCounter, commande: 45, paiement: 12, ecriture: entryCounter, mouvement: 8, produit: 0 },
    loginAttempts: {},
    audit: []
  };
}
