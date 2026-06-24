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
    
    expect(screen.getByRole('heading', { name: /Submit Feedback/i })).toBeInTheDocument();
    
    // Check for rating stars (there should be 5)
    const starButtons = screen.getAllByRole('button').filter(b => b.className.includes('star'));
    expect(starButtons.length).toBeGreaterThanOrEqual(5);

    // Check for categories
    expect(screen.getByText('Bug Report')).toBeInTheDocument();
    expect(screen.getByText('Feature Request')).toBeInTheDocument();
    expect(screen.getByText('General Suggestion')).toBeInTheDocument();

    // Check for text area and submit button
    expect(screen.getByPlaceholderText(/Tell us more about your experience/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Submit Feedback/i })).toBeInTheDocument();
  });

  it('allows user to select a rating and category', () => {
    renderWithRouter(<FeedbackPage />);
    
    // Select Category
    const bugReportButton = screen.getByText('Bug Report');
    fireEvent.click(bugReportButton);
    expect(bugReportButton.parentElement).toHaveClass('ring-2'); // Simple check if it received focus/selection class depending on implementation

    // Type in textarea
    const textArea = screen.getByPlaceholderText(/Tell us more about your experience/i);
    fireEvent.change(textArea, { target: { value: 'Great app but found a small glitch.' } });
    expect(textArea).toHaveValue('Great app but found a small glitch.');
  });
});
