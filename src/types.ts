export interface Client {
  id: number;
  name: string;
  address: string;
  phone: string;
  last_service_date?: string;
  next_reminder_date?: string;
}

export interface Service {
  id: number;
  client_id: number;
  client_name: string;
  client_phone: string;
  client_address: string;
  date: string;
  status: 'scheduled' | 'in_progress' | 'completed';
  photos_before?: string[];
  photos_after?: string[];
  value: number;
  payment_method?: string;
  installments: number;
  signature?: string;
  notes?: string;
}

export interface FinancialRecord {
  id: number;
  type: 'income' | 'expense';
  description: string;
  amount: number;
  date: string;
  category: string;
}

export interface AppSettings {
  logo?: string;
  theme?: 'light' | 'dark';
  company_name?: string;
  whatsapp_contact?: string;
  push_notifications_enabled?: boolean;
}
