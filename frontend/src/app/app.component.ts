import { Component, HostListener } from '@angular/core';

interface NavigationItem {
  id: string;
  label: string;
  icon: string;
}

interface Product {
  name: string;
  category: string;
  reference: string;
  price: number;
  stock: number;
  unit: string;
  color: string;
}

interface CartItem {
  product: Product;
  quantity: number;
}

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent {
  readonly todayLabel = new Intl.DateTimeFormat('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date()).toLocaleUpperCase('fr');

  readonly navSections: { label: string; items: NavigationItem[] }[] = [
    {
      label: 'PRINCIPAL',
      items: [
        { id: 'dashboard', label: 'Vue d’ensemble', icon: 'grid' },
        { id: 'sales', label: 'Ventes', icon: 'receipt' },
        { id: 'cash', label: 'Caisse', icon: 'cash' }
      ]
    },
    {
      label: 'GESTION',
      items: [
        { id: 'products', label: 'Produits', icon: 'bread' },
        { id: 'stock', label: 'Stocks', icon: 'box' },
        { id: 'purchases', label: 'Achats', icon: 'cart' },
        { id: 'finance', label: 'Trésorerie', icon: 'wallet' },
        { id: 'accounting', label: 'Comptabilité', icon: 'ledger' }
      ]
    },
    {
      label: 'PILOTAGE',
      items: [
        { id: 'reports', label: 'Rapports', icon: 'chart' },
        { id: 'team', label: 'Équipe & accès', icon: 'users' }
      ]
    }
  ];

  readonly pageCopy: { [key: string]: { title: string; description: string; action: string } } = {
    dashboard: {
      title: 'Bonjour, Amadou 👋',
      description: 'Voici ce qui se passe dans votre boulangerie aujourd’hui.',
      action: 'Nouvelle vente'
    },
    sales: { title: 'Ventes', description: 'Suivez vos ventes et les encaissements de la journée.', action: 'Nouvelle vente' },
    cash: { title: 'Caisse', description: 'Gardez un œil sur vos sessions de caisse et vos encaissements.', action: 'Nouvelle vente' },
    products: { title: 'Produits', description: 'Votre catalogue, toujours à portée de main.', action: 'Ajouter un produit' },
    stock: { title: 'Gestion des stocks', description: 'Anticipez les ruptures et suivez vos mouvements.', action: 'Ajouter un produit' },
    purchases: { title: 'Achats & fournisseurs', description: 'Commandes, livraisons et relations fournisseurs.', action: 'Nouvelle commande' },
    finance: { title: 'Trésorerie', description: 'Visualisez les entrées, sorties et règlements.', action: 'Nouvelle vente' },
    accounting: { title: 'Comptabilité', description: 'Vos écritures et journaux comptables au même endroit.', action: 'Exporter' },
    reports: { title: 'Rapports', description: 'Les chiffres essentiels pour prendre les bonnes décisions.', action: 'Exporter' },
    team: { title: 'Équipe & accès', description: 'Les personnes qui font tourner la maison.', action: 'Ajouter un membre' }
  };

  products: Product[] = [
    { name: 'Baguette tradition', category: 'Pains', reference: 'PAI-001', price: 300, stock: 42, unit: 'pièces', color: 'wheat' },
    { name: 'Croissant au beurre', category: 'Viennoiseries', reference: 'VIE-014', price: 450, stock: 18, unit: 'pièces', color: 'butter' },
    { name: 'Pain au chocolat', category: 'Viennoiseries', reference: 'VIE-015', price: 500, stock: 6, unit: 'pièces', color: 'choco' },
    { name: 'Pain complet', category: 'Pains', reference: 'PAI-008', price: 800, stock: 12, unit: 'pièces', color: 'grain' },
    { name: 'Brioche maison', category: 'Pâtisseries', reference: 'PAT-003', price: 1_200, stock: 3, unit: 'pièces', color: 'brioche' }
  ];

  readonly pageTransactions = [
    { name: 'Vente comptoir', detail: 'Aujourd’hui · 10:42', reference: '#VT-0248', amount: 8_500, status: 'Payée', type: 'positive' },
    { name: 'Commande #CMD-018', detail: 'Aujourd’hui · 09:18', reference: 'Boulangerie Ndiaye', amount: -24_000, status: 'À régler', type: 'pending' },
    { name: 'Vente comptoir', detail: 'Aujourd’hui · 08:56', reference: '#VT-0247', amount: 12_300, status: 'Payée', type: 'positive' },
    { name: 'Farine du Sahel', detail: 'Hier · 16:30', reference: 'Règlement fournisseur', amount: -35_000, status: 'Payée', type: 'neutral' }
  ];

  readonly topProducts = [
    { name: 'Baguette tradition', quantity: 86, share: 88, color: 'terracotta' },
    { name: 'Croissant au beurre', quantity: 54, share: 65, color: 'gold' },
    { name: 'Pain au chocolat', quantity: 38, share: 47, color: 'brown' }
  ];

  activePage = 'dashboard';
  searchQuery = '';
  isMobileNavOpen = false;
  isSaleOpen = false;
  isProductFormOpen = false;
  toastMessage = '';
  cart: CartItem[] = [];
  productDraft = { name: '', category: 'Pains', price: 0, stock: 0 };
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  get currentPage(): { title: string; description: string; action: string } {
    return this.pageCopy[this.activePage] || this.pageCopy['dashboard'];
  }

  get filteredProducts(): Product[] {
    const query = this.searchQuery.trim().toLocaleLowerCase('fr');
    if (!query) {
      return this.products;
    }
    return this.products.filter((product) =>
      `${product.name} ${product.category} ${product.reference}`.toLocaleLowerCase('fr').includes(query)
    );
  }

  get cartTotal(): number {
    return this.cart.reduce((total, item) => total + item.product.price * item.quantity, 0);
  }

  get cartCount(): number {
    return this.cart.reduce((total, item) => total + item.quantity, 0);
  }

  selectPage(page: string): void {
    this.activePage = page;
    this.isMobileNavOpen = false;
    this.searchQuery = '';
  }

  @HostListener('document:keydown', ['$event'])
  handleKeyboardShortcut(event: KeyboardEvent): void {
    if (event.key === 'F2') {
      event.preventDefault();
      this.openSale();
    } else if (event.key === 'Escape') {
      this.isSaleOpen = false;
      this.isProductFormOpen = false;
      this.isMobileNavOpen = false;
    }
  }

  runPrimaryAction(): void {
    if (this.activePage === 'products' || this.activePage === 'stock') {
      this.openProductForm();
      return;
    }
    if (this.activePage === 'purchases') {
      this.showToast('Le module de commandes sera bientôt disponible.');
      return;
    }
    if (this.activePage === 'team') {
      this.showToast('La gestion des comptes sera bientôt disponible.');
      return;
    }
    if (this.activePage === 'reports' || this.activePage === 'accounting') {
      this.showToast('Votre export est en cours de préparation.');
      return;
    }
    this.openSale();
  }

  openSale(): void {
    this.isSaleOpen = true;
    this.cart = [];
  }

  addToCart(product: Product): void {
    const existingItem = this.cart.find((item) => item.product.reference === product.reference);
    if (existingItem) {
      existingItem.quantity += 1;
    } else {
      this.cart.push({ product, quantity: 1 });
    }
  }

  changeQuantity(item: CartItem, change: number): void {
    item.quantity += change;
    if (item.quantity < 1) {
      this.cart = this.cart.filter((cartItem) => cartItem !== item);
    }
  }

  completeSale(): void {
    if (this.cart.length === 0) {
      return;
    }
    this.isSaleOpen = false;
    this.showToast(`Vente enregistrée · ${this.formatAmount(this.cartTotal)} FCFA`);
    this.cart = [];
  }

  openProductForm(): void {
    this.productDraft = { name: '', category: 'Pains', price: 0, stock: 0 };
    this.isProductFormOpen = true;
  }

  saveProduct(): void {
    const name = this.productDraft.name.trim();
    if (!name || this.productDraft.price <= 0) {
      this.showToast('Renseignez un nom et un prix supérieur à 0.');
      return;
    }
    const prefix = this.productDraft.category === 'Pains' ? 'PAI' : this.productDraft.category === 'Viennoiseries' ? 'VIE' : 'PAT';
    const number = (this.products.length + 1).toString().padStart(3, '0');
    this.products.unshift({
      name,
      category: this.productDraft.category,
      reference: `${prefix}-${number}`,
      price: this.productDraft.price,
      stock: this.productDraft.stock,
      unit: 'pièces',
      color: 'wheat'
    });
    this.isProductFormOpen = false;
    this.showToast(`${name} a été ajouté au catalogue.`);
  }

  formatAmount(amount: number): string {
    return new Intl.NumberFormat('fr-FR').format(amount);
  }

  showToast(message: string): void {
    this.toastMessage = message;
    if (this.toastTimer) {
      clearTimeout(this.toastTimer);
    }
    this.toastTimer = setTimeout(() => {
      this.toastMessage = '';
    }, 3200);
  }
}
