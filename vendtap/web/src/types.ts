export interface User {
  id: number;
  username: string;
  name: string;
  role: 'admin' | 'salesman' | 'warehouse';
}

export interface Product {
  id: number;
  sku: string;
  name: string;
  category: string | null;
  unit: string;
  cost: number;
  price: number;
  stock: number;
  reorder_level: number;
  active: number;
}

export interface Customer {
  id: number;
  name: string;
  contact: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  balance: number;
}

export interface Invoice {
  id: number;
  number: string;
  customer_id: number;
  customer_name?: string;
  salesman_name?: string;
  status: 'open' | 'partial' | 'paid' | 'void';
  subtotal: number;
  tax: number;
  total: number;
  paid: number;
  note: string | null;
  created_at: string;
  items?: InvoiceItem[];
  payments?: Payment[];
}

export interface InvoiceItem {
  id: number;
  product_id: number;
  description: string;
  quantity: number;
  price: number;
  line_total: number;
}

export interface Payment {
  id: number;
  invoice_id: number;
  amount: number;
  method: string;
  created_at: string;
  invoice_number?: string;
  received_by_name?: string;
}

export interface Truck {
  id: number;
  name: string;
  plate: string | null;
  driver_name: string | null;
  status: 'idle' | 'loading' | 'on_route';
}

export interface Dashboard {
  todaySales: number;
  todayInvoices: number;
  outstanding: number;
  lowStock: number;
  products: number;
  customers: number;
  trucks: number;
}
