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
    const ctaButtons = screen.getAllByText(/Get Started/i);
    expect(ctaButtons.length).toBeGreaterThan(0);
    
    // Check for View Demo button or secondary CTA
    expect(screen.getAllByText(/Start Screening Now/i).length).toBeGreaterThan(0);
  });

  it('renders feature sections', () => {
    renderWithRouter(<LandingPage />);
    
    // Features should be visible
    expect(screen.getAllByText(/AI-Powered Screening/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Autonomous Interviews/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Integrity Monitoring/i).length).toBeGreaterThan(0);
  });

  it('renders the stats section', () => {
    renderWithRouter(<LandingPage />);
    expect(screen.getAllByText(/Candidates Screened/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Accuracy Rate/i).length).toBeGreaterThan(0);
  });
});
