import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { PaymentGateway } from './PaymentGateway';
import { vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import * as firestore from 'firebase/firestore';

// Mock context and dependencies
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual as any,
    useParams: () => ({ orgId: 'testOrg123' })
  };
});

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  setDoc: vi.fn(),
  serverTimestamp: vi.fn()
}), { virtual: true });

vi.mock('../lib/firebase', () => ({
  db: {},
  auth: { currentUser: null }
}));

describe('PaymentGateway', () => {
  const renderWithRouter = (ui: React.ReactElement) => {
    return render(<BrowserRouter>{ui}</BrowserRouter>);
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    // Mock getDoc to never resolve so we can see loading state
    (firestore.getDoc as any).mockReturnValue(new Promise(() => {}));
    
    renderWithRouter(<PaymentGateway />);
    expect(screen.getByText(/Securing Invoice.../i)).toBeInTheDocument();
  });

  it('renders organization details when loaded successfully', async () => {
    // Mock successful getDoc
    (firestore.getDoc as any).mockResolvedValue({
      exists: () => true,
      id: 'testOrg123',
      data: () => ({ name: 'Test Org', status: 'pending_payment', tier: 'pro', seatCount: 2 })
    });
    
    renderWithRouter(<PaymentGateway />);
    
    // Wait for the organization name to appear
    await waitFor(() => {
      expect(screen.getByText('Test Org')).toBeInTheDocument();
    });
    
    expect(screen.getByText(/Pro/i)).toBeInTheDocument();
    expect(screen.getByText(/2 seats/i)).toBeInTheDocument();
    const priceElements = screen.getAllByText(/\$198/i);
    expect(priceElements.length).toBeGreaterThan(0);
  });
});
