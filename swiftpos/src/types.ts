import { Timestamp } from 'firebase/firestore';

export type UserRole = 'admin' | 'staff';

export interface UserProfile {
  uid: string;
  email: string;
  role: UserRole;
  displayName?: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  barcode: string;
  category: string;
  stock: number;
  imageUrl?: string;
  createdAt: Timestamp;
}

export interface CartItem extends Product {
  quantity: number;
}

export interface Sale {
  id: string;
  items: {
    productId: string;
    name: string;
    price: number;
    quantity: number;
  }[];
  total: number;
  timestamp: Timestamp;
  userId: string;
}
