import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthPage } from './AuthPage';
import { vi } from 'vitest';

// Mock the Firebase imports
vi.mock('../lib/firebase', () => ({
  auth: {},
  db: {}
}));

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  sendPasswordResetEmail: vi.fn()
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn(),
  getDoc: vi.fn()
}));

vi.mock('../lib/appContext', () => ({
  useNotification: () => ({
    notify: vi.fn(),
    confirm: vi.fn()
  }),
  useProfile: () => ({
    refreshProfile: vi.fn()
  })
}));

describe('AuthPage', () => {
  const renderWithRouter = (ui: React.ReactElement) => {
    return render(<BrowserRouter>{ui}</BrowserRouter>);
  };

  it('renders the login form by default', () => {
    renderWithRouter(<AuthPage />);
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/email address/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/password/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('toggles to sign up mode when link is clicked', () => {
    renderWithRouter(<AuthPage />);
    
    // Click 'Sign up' link
    const signUpLink = screen.getByText(/sign up/i);
    fireEvent.click(signUpLink);

    // Verify it changed to signup mode
    expect(screen.getByRole('heading', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/full name/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create account/i })).toBeInTheDocument();
  });

  it('allows user to type in input fields', () => {
    renderWithRouter(<AuthPage />);
    const emailInput = screen.getByPlaceholderText(/email address/i);
    
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    expect(emailInput).toHaveValue('test@example.com');
  });

  it('shows reset password view when forgot password is clicked', () => {
    renderWithRouter(<AuthPage />);
    
    const forgotPasswordLink = screen.getByText(/forgot password\?/i);
    fireEvent.click(forgotPasswordLink);
    
    expect(screen.getByRole('heading', { name: /reset password/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /send reset link/i })).toBeInTheDocument();
  });
});
