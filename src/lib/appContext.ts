import { createContext, useContext } from 'react';
import type { UserProfile, Organization } from '../types';

// ─── Notification Context ────────────────────────────────────────────────────

export interface NotificationContextType {
  confirm: (msg: string) => Promise<boolean>;
  notify: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const NotificationContext = createContext<NotificationContextType | null>(null);

export function useNotification() {
  const context = useContext(NotificationContext);
  if (!context) throw new Error('useNotification must be used within a NotificationProvider');
  return context;
}

// ─── Profile Context ─────────────────────────────────────────────────────────

export interface ProfileContextType {
  profile: UserProfile | null;
  organization: Organization | null;
  isAdmin: boolean;
  refreshProfile: () => Promise<void>;
  whiteLabelBrandingName: string;
  setWhiteLabelBrandingName: (name: string) => void;
  whiteLabelMarkupFactor: number;
  setWhiteLabelMarkupFactor: (factor: number) => void;
  whiteLabelLogoUrl: string;
  setWhiteLabelLogoUrl: (url: string) => void;
  stripeModalOpen: boolean;
  setStripeModalOpen: (open: boolean) => void;
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
}

export const ProfileContext = createContext<ProfileContextType | null>(null);

export function useProfile() {
  const context = useContext(ProfileContext);
  if (!context) throw new Error('useProfile must be used within a ProfileProvider');
  return context;
}

// ─── Page Title Context ──────────────────────────────────────────────────────

export interface PageTitleContextType {
  pageTitle: string;
  setPageTitle: (title: string) => void;
}

export const PageTitleContext = createContext<PageTitleContextType | null>(null);

export function usePageTitle() {
  const context = useContext(PageTitleContext);
  if (!context) throw new Error('usePageTitle must be used within a PageTitleProvider');
  return context;
}
