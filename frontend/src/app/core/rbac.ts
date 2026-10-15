import { Permission, RoleId } from './models';

export interface RoleDefinition {
  id: RoleId;
  label: string;
  description: string;
  tone: string;
  privileged: boolean;
  permissions: Permission[];
}

/**
 * Matrice des droits (cahier des charges §4.3).
 * Refus par défaut : toute permission absente de cette liste est refusée.
 */
export const ROLES: RoleDefinition[] = [
  {
    id: 'caissier',
    label: 'Caissier',
    description: 'Ouvre et clôture sa caisse, encaisse les ventes et imprime les reçus.',
    tone: 'gold',
    privileged: false,
    permissions: ['ventes:caisse', 'produits:lire', 'stocks:lire_limite', 'achats:lire_limite']
  },
  {
    id: 'stock',
    label: 'Gestionnaire de stock',
    description: 'Gère les entrées, sorties, pertes et inventaires.',
    tone: 'okok',
    privileged: false,
    permissions: ['produits:lire', 'produits:gerer', 'stocks:lire', 'stocks:gerer', 'achats:lire']
  },
  {
    id: 'acheteur',
    label: 'Acheteur',
    description: 'Gère les fournisseurs, prépare et suit les commandes.',
    tone: 'indigo',
    privileged: false,
    permissions: ['produits:lire', 'stocks:lire', 'achats:lire', 'achats:preparer']
  },
  {
    id: 'financier',
    label: 'Financier',
    description: 'Suit la trésorerie, les règlements et les budgets.',
    tone: 'folere',
    privileged: false,
    permissions: ['ventes:rapport', 'tresorerie:lire', 'tresorerie:gerer', 'compta:lire']
  },
  {
    id: 'comptable',
    label: 'Comptable',
    description: 'Saisit et contrôle les écritures, produit les journaux et états.',
    tone: 'teal',
    privileged: false,
    permissions: ['tresorerie:lire', 'compta:lire', 'compta:saisir', 'compta:controler']
  },
  {
    id: 'manager',
    label: 'Manager',
    description: 'Supervise l’activité, valide les opérations sensibles et crée les comptes métier.',
    tone: 'crust',
    privileged: true,
    permissions: [
      'ventes:superviser', 'produits:lire', 'produits:gerer', 'stocks:lire', 'stocks:valider',
      'achats:lire', 'achats:valider', 'tresorerie:lire', 'tresorerie:valider', 'compta:lire',
      'compta:controler', 'utilisateurs:gerer', 'regles:gerer', 'journaux:synthese', 'sauvegarde:valider'
    ]
  },
  {
    id: 'admin',
    label: 'Administrateur technique',
    description: 'Maintient la configuration technique, les sauvegardes et les journaux techniques.',
    tone: 'slate',
    privileged: true,
    permissions: ['utilisateurs:assistance', 'config:gerer', 'journaux:technique', 'sauvegarde:executer']
  }
];

/** Rôles qu'un Manager peut attribuer (§3.2) ; Manager et Admin suivent une procédure renforcée. */
export const ASSIGNABLE_ROLES: RoleId[] = ['caissier', 'stock', 'acheteur', 'financier', 'comptable'];

export function roleOf(id: RoleId): RoleDefinition {
  return ROLES.find((role) => role.id === id) as RoleDefinition;
}

export function hasPermission(role: RoleId | undefined, permission: Permission): boolean {
  if (!role) {
    return false;
  }
  return roleOf(role).permissions.includes(permission);
}

export interface NavItem {
  path: string;
  label: string;
  icon: string;
  any: Permission[];
  badge?: 'validations' | 'stock';
}

export interface NavSection {
  label: string;
  items: NavItem[];
}

export const NAVIGATION: NavSection[] = [
  {
    label: 'Au quotidien',
    items: [
      { path: 'tableau-de-bord', label: 'Tableau de bord', icon: 'grid', any: [] },
      { path: 'caisse', label: 'Caisse', icon: 'cash', any: ['ventes:caisse'] },
      { path: 'ventes', label: 'Ventes', icon: 'receipt', any: ['ventes:caisse', 'ventes:superviser', 'ventes:rapport'] },
      { path: 'validations', label: 'Validations', icon: 'stamp', any: ['stocks:valider', 'achats:valider', 'tresorerie:valider', 'ventes:superviser'], badge: 'validations' }
    ]
  },
  {
    label: 'Fournil & réserves',
    items: [
      { path: 'produits', label: 'Produits', icon: 'bread', any: ['produits:lire'] },
      { path: 'stocks', label: 'Stocks', icon: 'box', any: ['stocks:lire_limite', 'stocks:lire', 'stocks:gerer'], badge: 'stock' },
      { path: 'achats', label: 'Achats & fournisseurs', icon: 'cart', any: ['achats:lire_limite', 'achats:lire', 'achats:preparer', 'achats:valider'] }
    ]
  },
  {
    label: 'Finances',
    items: [
      { path: 'tresorerie', label: 'Trésorerie', icon: 'wallet', any: ['tresorerie:lire', 'tresorerie:gerer', 'tresorerie:valider'] },
      { path: 'comptabilite', label: 'Comptabilité', icon: 'ledger', any: ['compta:lire', 'compta:saisir', 'compta:controler'] }
    ]
  },
  {
    label: 'Gouvernance',
    items: [
      { path: 'utilisateurs', label: 'Utilisateurs & rôles', icon: 'users', any: ['utilisateurs:gerer', 'utilisateurs:assistance'] },
      { path: 'journaux', label: 'Journaux d’audit', icon: 'shield', any: ['journaux:synthese', 'journaux:technique'] },
      { path: 'administration', label: 'Administration', icon: 'settings', any: ['config:gerer', 'sauvegarde:executer', 'sauvegarde:valider'] }
    ]
  }
];

export const PERMISSION_LABELS: { [key in Permission]: string } = {
  'ventes:caisse': 'Gérer sa caisse et encaisser',
  'ventes:superviser': 'Superviser les ventes et caisses',
  'ventes:rapport': 'Lire les rapports de ventes',
  'produits:lire': 'Consulter le catalogue',
  'produits:gerer': 'Créer et modifier les produits',
  'stocks:lire_limite': 'Consulter les disponibilités',
  'stocks:lire': 'Consulter les stocks et mouvements',
  'stocks:gerer': 'Enregistrer les mouvements de stock',
  'stocks:valider': 'Valider les ajustements sensibles',
  'achats:lire_limite': 'Consulter les fournisseurs',
  'achats:lire': 'Consulter les commandes',
  'achats:preparer': 'Préparer et suivre les commandes',
  'achats:valider': 'Valider les commandes selon seuil',
  'tresorerie:lire': 'Consulter la trésorerie',
  'tresorerie:gerer': 'Saisir règlements et budgets',
  'tresorerie:valider': 'Valider paiements et budgets',
  'compta:lire': 'Consulter la comptabilité',
  'compta:saisir': 'Saisir les écritures',
  'compta:controler': 'Contrôler les écritures',
  'utilisateurs:gerer': 'Créer les comptes métier',
  'utilisateurs:assistance': 'Assistance technique des comptes',
  'regles:gerer': 'Définir les seuils de validation',
  'config:gerer': 'Configuration technique',
  'journaux:synthese': 'Synthèse des journaux',
  'journaux:technique': 'Consultation technique des journaux',
  'sauvegarde:valider': 'Valider les besoins de sauvegarde',
  'sauvegarde:executer': 'Exécuter les sauvegardes'
};
