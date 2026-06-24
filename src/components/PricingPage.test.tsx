import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PricingPage } from './PricingPage';
import { vi } from 'vitest';

// Mock the PricingStep component to isolate PricingPage's test
vi.mock('./PricingStep', () => ({
  PricingStep: () => <div data-testid="mock-pricing-step">Pricing Step</div>
}));

describe('PricingPage', () => {
  it('renders the navigation and logo text', () => {
    render(
      <MemoryRouter>
        <PricingPage />
      </MemoryRouter>
    );

    // Verify logo text is present
    expect(screen.getByText('HireNow')).toBeInTheDocument();

    // Verify navigation links are present
    expect(screen.getAllByText('Features').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pricing').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Testimonials').length).toBeGreaterThan(0);
    
    // Verify Get Started button is rendered
    expect(screen.getAllByText('Get Started').length).toBeGreaterThan(0);
  });

  it('renders the PricingStep component', () => {
    render(
      <MemoryRouter>
        <PricingPage />
      </MemoryRouter>
    );

    expect(screen.getByTestId('mock-pricing-step')).toBeInTheDocument();
  });
});
