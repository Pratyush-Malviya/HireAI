import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { FeedbackPage } from './FeedbackPage';
import { vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';

// Mock context and dependencies
vi.mock('../lib/appContext', () => ({
  useNotification: () => ({
    notify: vi.fn()
  }),
  useProfile: () => ({
    profile: { uid: 'user123', email: 'test@example.com' }
  })
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  addDoc: vi.fn(),
  serverTimestamp: vi.fn()
}));

vi.mock('../lib/firebase', () => ({
  db: {}
}));

describe('FeedbackPage', () => {
  const renderWithRouter = (ui: React.ReactElement) => {
    return render(<BrowserRouter>{ui}</BrowserRouter>);
  };

  it('renders the feedback form correctly', () => {
    renderWithRouter(<FeedbackPage />);
    
    expect(screen.getByRole('heading', { name: /Platform Feedback/i })).toBeInTheDocument();
    
    // Check for rating stars (there should be 5)
    // Stars are buttons within the 'Overall Experience' section
    const starButtons = screen.getAllByRole('button').filter(b => b.querySelector('svg.lucide-star'));
    expect(starButtons.length).toBe(5);

    // Check for text area and inputs
    expect(screen.getByPlaceholderText(/E.g., Feature request/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Tell us what you think/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Feedback/i })).toBeInTheDocument();
  });

  it('allows user to fill out the form', () => {
    renderWithRouter(<FeedbackPage />);
    
    // Type in Subject
    const subjectInput = screen.getByPlaceholderText(/E.g., Feature request/i);
    fireEvent.change(subjectInput, { target: { value: 'Bug Report' } });
    expect(subjectInput).toHaveValue('Bug Report');

    // Type in textarea
    const textArea = screen.getByPlaceholderText(/Tell us what you think/i);
    fireEvent.change(textArea, { target: { value: 'Great app but found a small glitch.' } });
    expect(textArea).toHaveValue('Great app but found a small glitch.');
    
    // Select rating
    const starButtons = screen.getAllByRole('button').filter(b => b.querySelector('svg.lucide-star'));
    fireEvent.click(starButtons[4]); // Click 5th star
  });
});
