import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export type UserRole = 'visiteur' | 'locataire' | 'proprietaire' | 'admin';
export type PropertyType = 'chambre' | 'studio' | 'appartement' | 'maison' | 'bureau' | 'parcelle';
export type AvailabilityStatus = 'disponible' | 'reserve' | 'occupe';
export type LeaseStatus = 'actif' | 'termine' | 'suspendu';
export type RentPeriodStatus = 'en_cours' | 'solde' | 'retard';
export type PaymentStatus = 'en_attente' | 'valide' | 'echoue';
export type WithdrawalStatus = 'en_traitement' | 'complete' | 'echoue';
export type Operator = 'mtn' | 'moov' | 'celtiis';
export type ContactStatus = 'nouvelle' | 'traitee';
export type NotificationType =
  | 'rappel'
  | 'confirmation'
  | 'retard'
  | 'nouveau_versement'
  | 'nouveau_locataire'
  | 'nouvelle_demande_contact'
  | 'retrait_complete'
  | 'retrait_echoue';

export interface UserProfile {
  id: string;
  full_name: string;
  phone: string;
  email?: string;
  avatar_url?: string;
  role: UserRole;
  mobile_money_number?: string;
  preferred_operator?: Operator;
  phone_verified: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Listing {
  id: string;
  owner_id: string;
  title: string;
  city: string;
  neighborhood?: string;
  address: string;
  property_type: PropertyType;
  monthly_rent: number;
  deposit_amount?: number;
  advance_amount?: number;
  bedrooms?: number;
  description?: string;
  amenities: string[];
  house_rules?: string;
  availability_status: AvailabilityStatus;
  accepts_progressive_payment: boolean;
  is_published: boolean;
  created_at: string;
  listing_photos?: ListingPhoto[];
}

export interface ListingPhoto {
  id: string;
  listing_id: string;
  photo_url: string;
  room_label?: string;
  display_order: number;
  is_cover: boolean;
}

export interface Favorite {
  id: string;
  user_id: string;
  listing_id: string;
  created_at: string;
  listings?: Listing;
}

export interface ContactRequest {
  id: string;
  listing_id: string;
  requester_id: string;
  message: string;
  contact_phone: string;
  status: ContactStatus;
  created_at: string;
  listings?: Listing;
  users?: UserProfile;
}

export interface Property {
  id: string;
  listing_id?: string;
  owner_id: string;
  name: string;
  address: string;
  monthly_rent: number;
  payment_deadline_day: number;
  access_code: string;
  is_active: boolean;
  created_at: string;
}

export interface Lease {
  id: string;
  tenant_id: string;
  property_id: string;
  start_date: string;
  end_date?: string;
  status: LeaseStatus;
  created_at: string;
  properties?: Property;
  users?: UserProfile;
}

export interface RentPeriod {
  id: string;
  lease_id: string;
  period_month: number;
  period_year: number;
  amount_due: number;
  amount_paid: number;
  deadline_date: string;
  status: RentPeriodStatus;
}

export interface Payment {
  id: string;
  rent_period_id: string;
  tenant_id: string;
  amount: number;
  payment_method: string;
  operator?: Operator;
  status: PaymentStatus;
  fedapay_transaction_id: string;
  receipt_url?: string;
  created_at: string;
  validated_at?: string;
}

export interface Wallet {
  id: string;
  owner_id: string;
  available_balance: number;
  pending_balance: number;
  total_earned: number;
  total_withdrawn: number;
  created_at: string;
}

export interface Withdrawal {
  id: string;
  wallet_id: string;
  amount: number;
  operator: Operator;
  destination_phone: string;
  status: WithdrawalStatus;
  fedapay_payout_id?: string;
  estimated_completion?: string;
  created_at: string;
  completed_at?: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

export interface AppConfig {
  id: string;
  key: string;
  value: string;
  updated_at: string;
}
