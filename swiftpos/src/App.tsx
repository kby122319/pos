import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  doc, 
  getDoc,
  setDoc,
  Timestamp,
  orderBy,
  limit,
  increment,
  writeBatch
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { Product, CartItem, Sale, UserProfile } from './types';
import { 
  ShoppingCart, 
  Package, 
  BarChart3, 
  LogOut, 
  Plus, 
  Minus, 
  Trash2, 
  Scan, 
  Search, 
  X,
  CheckCircle2,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  XAxis,
  YAxis,
  AreaChart,
  Area
} from 'recharts';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Components ---

const Button = React.forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline', size?: 'sm' | 'md' | 'lg' }>(
  ({ className, variant = 'primary', size = 'md', ...props }, ref) => {
    const variants = {
      primary: 'bg-black text-white hover:bg-zinc-800',
      secondary: 'bg-zinc-100 text-zinc-900 hover:bg-zinc-200',
      danger: 'bg-red-500 text-white hover:bg-red-600',
      ghost: 'bg-transparent hover:bg-zinc-100 text-zinc-600',
      outline: 'bg-transparent border border-zinc-200 hover:bg-zinc-50 text-zinc-900'
    };
    const sizes = {
      sm: 'px-3 py-1.5 text-xs',
      md: 'px-4 py-2 text-sm',
      lg: 'px-6 py-3 text-base'
    };
    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center rounded-lg font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    );
  }
);

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'flex h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
);

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'pos' | 'admin' | 'analytics'>('pos');
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [scanMode, setScanMode] = useState<'pos' | 'add-product'>('pos');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddProduct, setShowAddProduct] = useState(false);
  const [newProduct, setNewProduct] = useState<Partial<Product>>({
    name: '',
    price: 0,
    barcode: '',
    category: '',
    stock: 0
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        if (userDoc.exists()) {
          setUserProfile(userDoc.data() as UserProfile);
        } else {
          const profile: UserProfile = {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            role: firebaseUser.email === 'kurtvilleyambagon@gmail.com' ? 'admin' : 'staff',
            displayName: firebaseUser.displayName || ''
          };
          await setDoc(doc(db, 'users', firebaseUser.uid), profile);
          setUserProfile(profile);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'products'), orderBy('name'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const productList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(productList);
    });
    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login failed', error);
    }
  };

  const handleLogout = () => signOut(auth);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => 
          item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...product, quantity: 1 }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => prev.filter(item => item.id !== productId));
  };

  const updateQuantity = (productId: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === productId) {
        const newQty = Math.max(1, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleCheckout = async () => {
    if (cart.length === 0 || !user) return;

    try {
      const batch = writeBatch(db);
      const saleData = {
        items: cart.map(item => ({
          productId: item.id,
          name: item.name,
          price: item.price,
          quantity: item.quantity
        })),
        total: cartTotal,
        timestamp: Timestamp.now(),
        userId: user.uid
      };

      const saleRef = doc(collection(db, 'sales'));
      batch.set(saleRef, saleData);

      cart.forEach(item => {
        const productRef = doc(db, 'products', item.id);
        batch.update(productRef, {
          stock: increment(-item.quantity)
        });
      });

      await batch.commit();
      setCart([]);
      alert('Sale completed successfully!');
    } catch (error) {
      console.error('Checkout failed', error);
      alert('Checkout failed. Please try again.');
    }
  };

  const handleScan = (decodedText: string) => {
    if (scanMode === 'pos') {
      const product = products.find(p => p.barcode === decodedText);
      if (product) {
        addToCart(product);
        setIsScanning(false);
      } else {
        alert('Product not found for barcode: ' + decodedText);
      }
    } else {
      setNewProduct(prev => ({ ...prev, barcode: decodedText }));
      setIsScanning(false);
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.barcode || newProduct.price === undefined) return;

    try {
      await addDoc(collection(db, 'products'), {
        ...newProduct,
        createdAt: Timestamp.now()
      });
      setShowAddProduct(false);
      setNewProduct({ name: '', price: 0, barcode: '', category: '', stock: 0 });
    } catch (error) {
      console.error('Failed to add product', error);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-zinc-50 p-4">
        <div className="w-full max-w-md space-y-8 rounded-2xl bg-white p-8 shadow-xl shadow-zinc-200/50">
          <div className="text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-black text-white">
              <ShoppingCart className="h-8 w-8" />
            </div>
            <h1 className="mt-6 text-3xl font-bold tracking-tight text-zinc-900">SwiftPOS</h1>
            <p className="mt-2 text-zinc-500">Sign in to manage your store</p>
          </div>
          <Button onClick={handleLogin} className="w-full py-6 text-lg">
            Sign in with Google
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-50 text-zinc-900">
      {/* Sidebar */}
      <aside className="flex w-20 flex-col items-center border-r border-zinc-200 bg-white py-8 lg:w-64 lg:items-stretch lg:px-6">
        <div className="flex items-center gap-3 px-2 lg:px-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black text-white">
            <ShoppingCart className="h-6 w-6" />
          </div>
          <span className="hidden text-xl font-bold lg:block">SwiftPOS</span>
        </div>

        <nav className="mt-12 flex-1 space-y-2">
          <button
            onClick={() => setView('pos')}
            className={cn(
              "flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-all",
              view === 'pos' ? "bg-black text-white shadow-lg shadow-black/10" : "text-zinc-500 hover:bg-zinc-100"
            )}
          >
            <ShoppingCart className="h-5 w-5" />
            <span className="hidden font-medium lg:block">Point of Sale</span>
          </button>
          {userProfile?.role === 'admin' && (
            <>
              <button
                onClick={() => setView('admin')}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-all",
                  view === 'admin' ? "bg-black text-white shadow-lg shadow-black/10" : "text-zinc-500 hover:bg-zinc-100"
                )}
              >
                <Package className="h-5 w-5" />
                <span className="hidden font-medium lg:block">Inventory</span>
              </button>
              <button
                onClick={() => setView('analytics')}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-4 py-3 transition-all",
                  view === 'analytics' ? "bg-black text-white shadow-lg shadow-black/10" : "text-zinc-500 hover:bg-zinc-100"
                )}
              >
                <BarChart3 className="h-5 w-5" />
                <span className="hidden font-medium lg:block">Analytics</span>
              </button>
            </>
          )}
        </nav>

        <div className="mt-auto pt-8">
          <div className="hidden px-4 py-3 lg:block">
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">User</p>
            <p className="mt-1 truncate text-sm font-medium">{user.displayName}</p>
            <p className="text-xs text-zinc-500">{userProfile?.role}</p>
          </div>
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-red-500 transition-all hover:bg-red-50"
          >
            <LogOut className="h-5 w-5" />
            <span className="hidden font-medium lg:block">Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden">
        {view === 'pos' && (
          <div className="flex h-full">
            {/* Products Grid */}
            <div className="flex flex-1 flex-col overflow-hidden p-6">
              <header className="mb-8 flex items-center justify-between gap-4">
                <div className="relative flex-1 max-w-md">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <Input
                    placeholder="Search products or scan barcode..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button 
                  variant="secondary" 
                  onClick={() => {
                    setScanMode('pos');
                    setIsScanning(true);
                  }}
                  className="gap-2"
                >
                  <Scan className="h-4 w-4" />
                  Scan Barcode
                </Button>
              </header>

              <div className="grid flex-1 grid-cols-2 gap-4 overflow-y-auto pb-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {products
                  .filter(p => 
                    p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                    p.barcode.includes(searchQuery)
                  )
                  .map(product => (
                    <button
                      key={product.id}
                      onClick={() => addToCart(product)}
                      className="group flex flex-col items-start rounded-2xl border border-zinc-200 bg-white p-4 text-left transition-all hover:border-black hover:shadow-xl hover:shadow-zinc-200/50"
                    >
                      <div className="aspect-square w-full rounded-xl bg-zinc-100 flex items-center justify-center text-zinc-400 group-hover:bg-zinc-50">
                        {product.imageUrl ? (
                          <img src={product.imageUrl} alt={product.name} className="h-full w-full object-cover rounded-xl" referrerPolicy="no-referrer" />
                        ) : (
                          <Package className="h-8 w-8" />
                        )}
                      </div>
                      <h3 className="mt-4 font-semibold text-zinc-900">{product.name}</h3>
                      <p className="text-sm text-zinc-500">{product.category}</p>
                      <div className="mt-auto flex w-full items-center justify-between pt-4">
                        <span className="text-lg font-bold">${product.price.toFixed(2)}</span>
                        <span className={cn(
                          "text-xs font-medium px-2 py-1 rounded-full",
                          product.stock > 10 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
                        )}>
                          {product.stock} in stock
                        </span>
                      </div>
                    </button>
                  ))}
              </div>
            </div>

            {/* Cart Sidebar */}
            <aside className="flex w-96 flex-col border-l border-zinc-200 bg-white">
              <div className="p-6">
                <h2 className="text-xl font-bold">Current Order</h2>
              </div>
              
              <div className="flex-1 space-y-4 overflow-y-auto px-6">
                {cart.length === 0 ? (
                  <div className="flex h-full flex-col items-center justify-center text-center text-zinc-400">
                    <ShoppingCart className="mb-4 h-12 w-12 opacity-20" />
                    <p>Your cart is empty</p>
                  </div>
                ) : (
                  cart.map(item => (
                    <div key={item.id} className="flex items-center gap-4 rounded-xl border border-zinc-100 p-3">
                      <div className="h-12 w-12 flex-shrink-0 rounded-lg bg-zinc-100 flex items-center justify-center">
                        <Package className="h-6 w-6 text-zinc-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="truncate font-medium">{item.name}</h4>
                        <p className="text-sm text-zinc-500">${item.price.toFixed(2)}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => updateQuantity(item.id, -1)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 hover:bg-zinc-200"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="w-6 text-center font-medium">{item.quantity}</span>
                        <button 
                          onClick={() => updateQuantity(item.id, 1)}
                          className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 hover:bg-zinc-200"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                      <button 
                        onClick={() => removeFromCart(item.id)}
                        className="text-zinc-300 hover:text-red-500"
                      >
                        <Trash2 className="h-5 w-5" />
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="border-t border-zinc-200 p-6 space-y-4">
                <div className="flex items-center justify-between text-zinc-500">
                  <span>Subtotal</span>
                  <span>${cartTotal.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-zinc-500">
                  <span>Tax (0%)</span>
                  <span>$0.00</span>
                </div>
                <div className="flex items-center justify-between text-2xl font-bold pt-2">
                  <span>Total</span>
                  <span>${cartTotal.toFixed(2)}</span>
                </div>
                <Button 
                  onClick={handleCheckout} 
                  disabled={cart.length === 0}
                  className="w-full py-6 text-lg"
                >
                  Complete Checkout
                </Button>
              </div>
            </aside>
          </div>
        )}

        {view === 'admin' && (
          <div className="h-full overflow-y-auto p-8">
            <header className="mb-8 flex items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold">Inventory Management</h1>
                <p className="text-zinc-500">Manage your products and stock levels</p>
              </div>
              <div className="flex gap-3">
                <Button 
                  variant="outline" 
                  onClick={async () => {
                    const sampleProducts = [
                      { name: 'Classic T-Shirt', price: 25.00, barcode: '123456789', category: 'Apparel', stock: 50 },
                      { name: 'Denim Jeans', price: 59.99, barcode: '987654321', category: 'Apparel', stock: 30 },
                      { name: 'Coffee Mug', price: 12.50, barcode: '456789123', category: 'Home', stock: 100 },
                      { name: 'Wireless Mouse', price: 29.99, barcode: '789123456', category: 'Electronics', stock: 20 },
                      { name: 'Notebook', price: 5.00, barcode: '321654987', category: 'Stationery', stock: 200 }
                    ];
                    try {
                      const batch = writeBatch(db);
                      sampleProducts.forEach(p => {
                        const ref = doc(collection(db, 'products'));
                        batch.set(ref, { ...p, createdAt: Timestamp.now() });
                      });
                      await batch.commit();
                      alert('Sample data seeded successfully!');
                    } catch (e) {
                      console.error(e);
                      alert('Failed to seed data.');
                    }
                  }}
                >
                  Seed Sample Data
                </Button>
                <Button onClick={() => setShowAddProduct(true)} className="gap-2">
                  <Plus className="h-5 w-5" />
                  Add Product
                </Button>
              </div>
            </header>

            <div className="rounded-2xl border border-zinc-200 bg-white overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-zinc-50 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-6 py-4">Product</th>
                    <th className="px-6 py-4">Barcode</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Price</th>
                    <th className="px-6 py-4">Stock</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200">
                  {products.map(product => (
                    <tr key={product.id} className="hover:bg-zinc-50">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="h-10 w-10 rounded-lg bg-zinc-100 flex items-center justify-center">
                            <Package className="h-5 w-5 text-zinc-400" />
                          </div>
                          <span className="font-medium">{product.name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-sm text-zinc-500">{product.barcode}</td>
                      <td className="px-6 py-4 text-sm text-zinc-500">{product.category}</td>
                      <td className="px-6 py-4 font-medium">${product.price.toFixed(2)}</td>
                      <td className="px-6 py-4">
                        <span className={cn(
                          "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                          product.stock > 10 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                        )}>
                          {product.stock} units
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="ghost" size="sm">Edit</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {view === 'analytics' && <AnalyticsView />}
      </main>

      {/* Scanner Overlay */}
      {isScanning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white">
            <div className="flex items-center justify-between border-b border-zinc-100 p-6">
              <h3 className="text-xl font-bold">Scan Barcode</h3>
              <button onClick={() => setIsScanning(false)} className="rounded-full p-2 hover:bg-zinc-100">
                <X className="h-6 w-6" />
              </button>
            </div>
            <div className="p-6">
              <Scanner onScan={handleScan} />
              <p className="mt-4 text-center text-sm text-zinc-500">
                Position the barcode within the frame to scan
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Add Product Modal */}
      {showAddProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="text-2xl font-bold">New Product</h3>
              <button onClick={() => setShowAddProduct(false)} className="rounded-full p-2 hover:bg-zinc-100">
                <X className="h-6 w-6" />
              </button>
            </div>
            <form onSubmit={handleAddProduct} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">Product Name</label>
                <Input 
                  required 
                  value={newProduct.name} 
                  onChange={e => setNewProduct(prev => ({ ...prev, name: e.target.value }))} 
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-700">Price ($)</label>
                  <Input 
                    type="number" 
                    step="0.01" 
                    required 
                    value={newProduct.price} 
                    onChange={e => setNewProduct(prev => ({ ...prev, price: parseFloat(e.target.value) }))} 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-zinc-700">Initial Stock</label>
                  <Input 
                    type="number" 
                    required 
                    value={newProduct.stock} 
                    onChange={e => setNewProduct(prev => ({ ...prev, stock: parseInt(e.target.value) }))} 
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">Barcode</label>
                <div className="flex gap-2">
                  <Input 
                    required 
                    value={newProduct.barcode} 
                    onChange={e => setNewProduct(prev => ({ ...prev, barcode: e.target.value }))} 
                  />
                  <Button 
                    type="button" 
                    variant="secondary" 
                    onClick={() => {
                      setScanMode('add-product');
                      setIsScanning(true);
                    }}
                  >
                    <Scan className="h-5 w-5" />
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">Category</label>
                <Input 
                  value={newProduct.category} 
                  onChange={e => setNewProduct(prev => ({ ...prev, category: e.target.value }))} 
                />
              </div>
              <Button type="submit" className="w-full py-4 mt-4">Create Product</Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function Scanner({ onScan }: { onScan: (text: string) => void }) {
  useEffect(() => {
    const scanner = new Html5QrcodeScanner(
      "reader",
      { fps: 10, qrbox: { width: 250, height: 250 } },
      /* verbose= */ false
    );
    scanner.render(onScan, (error) => {
      // console.warn(error);
    });

    return () => {
      scanner.clear().catch(error => console.error("Failed to clear scanner", error));
    };
  }, [onScan]);

  return <div id="reader" className="overflow-hidden rounded-2xl border-0" />;
}

function AnalyticsView() {
  const [sales, setSales] = useState<Sale[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'sales'), orderBy('timestamp', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const salesList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale));
      setSales(salesList);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const dailyRevenue = sales.reduce((acc: any, sale) => {
    const date = sale.timestamp.toDate().toLocaleDateString();
    acc[date] = (acc[date] || 0) + sale.total;
    return acc;
  }, {});

  const chartData = Object.entries(dailyRevenue).map(([date, total]) => ({
    date,
    revenue: total
  })).reverse();

  const totalRevenue = sales.reduce((sum, s) => sum + s.total, 0);
  const totalSales = sales.length;
  const avgOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;

  return (
    <div className="h-full overflow-y-auto p-8">
      <header className="mb-8">
        <h1 className="text-3xl font-bold">Sales Analytics</h1>
        <p className="text-zinc-500">Track your store performance</p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3 mb-8">
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">Total Revenue</p>
          <h2 className="mt-2 text-4xl font-bold">${totalRevenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</h2>
          <div className="mt-4 flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">+12.5% from last month</span>
          </div>
        </div>
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">Total Sales</p>
          <h2 className="mt-2 text-4xl font-bold">{totalSales}</h2>
          <div className="mt-4 flex items-center gap-2 text-emerald-600">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-sm font-medium">+8.2% from last month</span>
          </div>
        </div>
        <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
          <p className="text-sm font-medium text-zinc-500">Avg. Order Value</p>
          <h2 className="mt-2 text-4xl font-bold">${avgOrderValue.toFixed(2)}</h2>
          <div className="mt-4 flex items-center gap-2 text-zinc-400">
            <AlertCircle className="h-4 w-4" />
            <span className="text-sm font-medium">Stable performance</span>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-zinc-200 bg-white p-8 shadow-sm">
        <h3 className="mb-8 text-xl font-bold">Revenue Over Time</h3>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#000" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#000" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} dy={10} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} />
              <Tooltip 
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              />
              <Area type="monotone" dataKey="revenue" stroke="#000" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
