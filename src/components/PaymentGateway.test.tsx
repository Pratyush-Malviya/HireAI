import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PaymentGateway } from './PaymentGateway';
import { vi } from 'vitest';

// Mock context and dependencies
vi.mock('../lib/appContext', () => ({
  useNotification: () => ({
    notify: vi.fn()
  }),
  useProfile: () => ({
    profile: { uid: 'user123', email: 'test@example.com' }
  })
}));

describe('PaymentGateway', () => {
  it('renders correctly when open', () => {
    render(
      <PaymentGateway 
        isOpen={true} 
        onClose={vi.fn()} 
        planId="pro" 
        planName="Pro Plan" 
        price={49} 
      />
    );
    
    // Check if modal title is present
    expect(screen.getByText(/Complete Your Upgrade/i)).toBeInTheDocument();
    
    // Check if plan details are rendered
    expect(screen.getByText(/Pro Plan/i)).toBeInTheDocument();
    expect(screen.getByText(/\$49/i)).toBeInTheDocument();
    
    // Check if Stripe checkout button exists
    expect(screen.getByRole('button', { name: /Proceed to Secure Checkout/i })).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    const { container } = render(
      <PaymentGateway 
        isOpen={false} 
        onClose={vi.fn()} 
        planId="pro" 
        planName="Pro Plan" 
        price={49} 
      />
    );
    
    expect(container).toBeEmptyDOMElement();
  });

  it('calls onClose when the close button is clicked', () => {
    const mockOnClose = vi.fn();
    render(
      <PaymentGateway 
        isOpen={true} 
        onClose={mockOnClose} 
        planId="pro" 
        planName="Pro Plan" 
        price={49} 
      />
    );
    
    // The close button is usually an X icon, often represented with a button containing 'Close' text or accessible name
    const closeButtons = screen.getAllByRole('button');
    // The first button is typically the 'X' button in the top right
    fireEvent.click(closeButtons[0]);
    
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });
});
