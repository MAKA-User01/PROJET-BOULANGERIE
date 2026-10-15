export type RoleId = 'caissier' | 'stock' | 'acheteur' | 'financier' | 'comptable' | 'manager' | 'admin';

export type Permission =
  | 'ventes:caisse'
  | 'ventes:superviser'
  | 'ventes:rapport'
  | 'produits:lire'
  | 'produits:gerer'
  | 'stocks:lire_limite'
  | 'stocks:lire'
  | 'stocks:gerer'
  | 'stocks:valider'
  | 'achats:lire_limite'
  | 'achats:lire'
  | 'achats:preparer'
  | 'achats:valider'
  | 'tresorerie:lire'
  | 'tresorerie:gerer'
  | 'tresorerie:valider'
  | 'compta:lire'
  | 'compta:saisir'
  | 'compta:controler'
  | 'utilisateurs:gerer'
  | 'utilisateurs:assistance'
  | 'regles:gerer'
  | 'config:gerer'
  | 'journaux:synthese'
  | 'journaux:technique'
  | 'sauvegarde:valider'
  | 'sauvegarde:executer';

export interface User {
  id: string;
  prenom: string;
  nom: string;
  identifiant: string;
  role: RoleId;
  actif: boolean;
  salt: string;
  passwordHash: string;
  mustChangePassword: boolean;
  telephone?: string;
  creeLe: string;
  creePar?: string;
  derniereConnexion?: string;
}

export type ProductType = 'fini' | 'matiere';

export interface Product {
  id: string;
  reference: string;
  libelle: string;
  categorie: string;
  type: ProductType;
  unite: string;
  prix: number;
  stock: number;
  seuil: number;
  actif: boolean;
}

export type MovementType = 'entree' | 'sortie' | 'perte' | 'inventaire' | 'vente' | 'livraison' | 'annulation';
export type MovementStatus = 'applique' | 'en_attente' | 'rejete';

export interface StockMovement {
  id: string;
  date: string;
  productId: string;
  type: MovementType;
  quantite: number;
  stockAvant: number;
  stockApres: number;
  motif: string;
  auteurId: string;
  statut: MovementStatus;
  validePar?: string;
  reference?: string;
}

export interface CashSession {
  id: string;
  poste: string;
  caissierId: string;
  ouverture: string;
  fermeture?: string;
  fondInitial: number;
  attendu?: number;
  declare?: number;
  ecart?: number;
  statut: 'ouverte' | 'fermee';
}

export type PaymentMode = 'especes' | 'momo' | 'orange_money' | 'carte';

export interface SaleLine {
  productId: string;
  libelle: string;
  quantite: number;
  prixUnitaire: number;
}

export type SaleStatus = 'validee' | 'annulation_demandee' | 'annulee';

export interface Sale {
  id: string;
  numero: string;
  date: string;
  caissierId: string;
  sessionId: string;
  lignes: SaleLine[];
  sousTotal: number;
  remise: number;
  total: number;
  paiement: PaymentMode;
  montantRecu?: number;
  statut: SaleStatus;
  motifAnnulation?: string;
  annulePar?: string;
}

export interface Supplier {
  id: string;
  nom: string;
  contact: string;
  telephone: string;
  email: string;
  categorie: string;
  actif: boolean;
}

export type OrderStatus = 'brouillon' | 'en_validation' | 'approuvee' | 'rejetee' | 'livree' | 'annulee';

export interface OrderLine {
  productId: string;
  libelle: string;
  quantite: number;
  prixUnitaire: number;
}

export interface PurchaseOrder {
  id: string;
  numero: string;
  fournisseurId: string;
  lignes: OrderLine[];
  total: number;
  statut: OrderStatus;
  creePar: string;
  creeLe: string;
  livraisonPrevue?: string;
  soumisLe?: string;
  validePar?: string;
  valideLe?: string;
  motifRejet?: string;
  livreLe?: string;
  regle: boolean;
}

export interface TreasuryAccount {
  id: string;
  libelle: string;
  type: 'caisse' | 'banque' | 'mobile';
  compteComptable: string;
  solde: number;
}

export interface TreasuryMovement {
  id: string;
  date: string;
  compteId: string;
  sens: 'entree' | 'sortie';
  montant: number;
  categorie: string;
  libelle: string;
  auteurId: string;
  reference?: string;
}

export type PaymentRequestStatus = 'en_validation' | 'approuvee' | 'rejetee' | 'payee';

export interface PaymentRequest {
  id: string;
  numero: string;
  beneficiaire: string;
  objet: string;
  montant: number;
  categorie: string;
  compteId: string;
  commandeId?: string;
  statut: PaymentRequestStatus;
  creePar: string;
  creeLe: string;
  validePar?: string;
  motifRejet?: string;
  payeLe?: string;
}

export interface Budget {
  id: string;
  categorie: string;
  periode: string;
  montantPrevu: number;
  statut: 'propose' | 'valide';
  creePar: string;
  validePar?: string;
}

export type JournalCode = 'VE' | 'AC' | 'BQ' | 'CA' | 'OD';

export interface EntryLine {
  compte: string;
  libelle: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  numero: string;
  date: string;
  journal: JournalCode;
  libelle: string;
  lignes: EntryLine[];
  statut: 'brouillon' | 'validee';
  auteurId: string;
  controlePar?: string;
  source?: string;
  contrepassationDe?: string;
}

export type AuditResult = 'succes' | 'echec' | 'refus';

export interface AuditLog {
  seq: number;
  date: string;
  userId?: string;
  identifiant: string;
  role?: RoleId;
  action: string;
  ressource: string;
  objet?: string;
  resultat: AuditResult;
  motif?: string;
  details?: string;
  prevHash: string;
  hash: string;
}

export interface Settings {
  nomEtablissement: string;
  sessionTimeoutMin: number;
  maxTentatives: number;
  verrouillageMin: number;
  mfaPrivilegies: boolean;
  separationTaches: boolean;
  seuilAchat: number;
  seuilPaiement: number;
  seuilEcartStock: number;
  remiseMaxPct: number;
}

export interface Backup {
  id: string;
  date: string;
  auteurId: string;
  taille: number;
  checksum: string;
  contenu: string;
  testeLe?: string;
  testeOk?: boolean;
}

export interface LoginAttempt {
  count: number;
  lockedUntil?: string;
}

export interface DbState {
  version: number;
  users: User[];
  products: Product[];
  movements: StockMovement[];
  sessions: CashSession[];
  sales: Sale[];
  suppliers: Supplier[];
  orders: PurchaseOrder[];
  accounts: TreasuryAccount[];
  treasury: TreasuryMovement[];
  paymentRequests: PaymentRequest[];
  budgets: Budget[];
  entries: JournalEntry[];
  settings: Settings;
  backups: Backup[];
  counters: { [key: string]: number };
  loginAttempts: { [identifiant: string]: LoginAttempt };
  audit: AuditLog[];
}
