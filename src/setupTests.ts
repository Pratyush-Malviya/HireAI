import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock IntersectionObserver for framer-motion and other libraries
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
