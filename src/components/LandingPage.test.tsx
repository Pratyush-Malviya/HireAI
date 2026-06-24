import React from 'react';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { LandingPage } from './LandingPage';
import { vi } from 'vitest';

class IntersectionObserverMock {
  constructor(callback, options) {}
  disconnect() {}
  observe() {}
  takeRecords() { return []; }
  unobserve() {}
}

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: IntersectionObserverMock
});
Object.defineProperty(global, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: IntersectionObserverMock
});

// Mock components that might use heavy animations or external libraries
vi.mock('./magic-ui/particles', () => ({
  Particles: () => <div data-testid="mock-particles" />
}));

vi.mock('./magic-ui/meteors', () => ({
  Meteors: () => <div data-testid="mock-meteors" />
}));

describe('LandingPage', () => {
  const renderWithRouter = (ui: React.ReactElement) => {
    return render(<BrowserRouter>{ui}</BrowserRouter>);
  };

  it('renders the main hero section correctly', () => {
    renderWithRouter(<LandingPage />);
    
    // Check for primary heading
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    
    // Check for CTA buttons
    const ctaButtons = screen.getAllByText(/Start Free Trial/i);
    expect(ctaButtons.length).toBeGreaterThan(0);
    
    // Check for View Demo button
    expect(screen.getByText(/Watch Demo/i)).toBeInTheDocument();
  });

  it('renders feature sections', () => {
    renderWithRouter(<LandingPage />);
    
    // Features should be visible
    expect(screen.getByText(/AI-Powered Screening/i)).toBeInTheDocument();
    expect(screen.getByText(/Deep Candidate Research/i)).toBeInTheDocument();
    expect(screen.getByText(/Enterprise Grade/i)).toBeInTheDocument();
  });

  it('renders the trusted by section', () => {
    renderWithRouter(<LandingPage />);
    expect(screen.getByText(/TRUSTED BY INNOVATIVE TEAMS WORLDWIDE/i)).toBeInTheDocument();
  });
});
