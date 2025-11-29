/**
 * Vitest Test Setup
 *
 * Global test configuration, mocks, and utilities.
 */

import { vi, beforeAll, afterAll, afterEach } from 'vitest';
import { config } from '@vue/test-utils';

// ==========================================
// Global Mocks
// ==========================================

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
  root: null,
  rootMargin: '',
  thresholds: [],
}));

// Mock window.scrollTo
Object.defineProperty(window, 'scrollTo', {
  writable: true,
  value: vi.fn(),
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => Object.keys(store)[index] || null,
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock sessionStorage
Object.defineProperty(window, 'sessionStorage', {
  value: localStorageMock,
});

// Mock crypto.randomUUID
Object.defineProperty(globalThis, 'crypto', {
  value: {
    randomUUID: () => 'test-uuid-' + Math.random().toString(36).substring(7),
    getRandomValues: (arr: Uint8Array) => {
      for (let i = 0; i < arr.length; i++) {
        arr[i] = Math.floor(Math.random() * 256);
      }
      return arr;
    },
  },
});

// Mock fetch globally
global.fetch = vi.fn().mockImplementation(() =>
  Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    blob: () => Promise.resolve(new Blob()),
    headers: new Headers(),
  })
);

// ==========================================
// Vue Test Utils Configuration
// ==========================================

config.global.stubs = {
  // Stub router-link and router-view
  'router-link': {
    template: '<a><slot /></a>',
  },
  'router-view': {
    template: '<div />',
  },
  // Stub transitions
  transition: false,
  'transition-group': false,
};

config.global.mocks = {
  $t: (key: string) => key, // i18n mock
  $route: {
    path: '/',
    params: {},
    query: {},
  },
  $router: {
    push: vi.fn(),
    replace: vi.fn(),
    go: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  },
};

// ==========================================
// Electron API Mock
// ==========================================

const electronMock = {
  ipcRenderer: {
    invoke: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn(),
  },
  store: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    has: vi.fn().mockResolvedValue(false),
  },
  shell: {
    openExternal: vi.fn(),
    openPath: vi.fn(),
  },
  dialog: {
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] }),
    showSaveDialog: vi.fn().mockResolvedValue({ canceled: true, filePath: undefined }),
    showMessageBox: vi.fn().mockResolvedValue({ response: 0 }),
  },
};

Object.defineProperty(window, 'electron', {
  value: electronMock,
  writable: true,
});

// ==========================================
// Test Lifecycle Hooks
// ==========================================

beforeAll(() => {
  // Setup that runs once before all tests
  console.log('Starting test suite...');
});

afterAll(() => {
  // Cleanup that runs once after all tests
  console.log('Test suite complete.');
});

afterEach(() => {
  // Reset mocks after each test
  vi.clearAllMocks();
  localStorage.clear();
});

// ==========================================
// Global Test Utilities
// ==========================================

/**
 * Wait for a specified duration
 */
export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Wait for Vue component to update
 */
export const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Create a mock function that resolves after a delay
 */
export const createDelayedMock = <T>(value: T, delay = 100) =>
  vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(value), delay)));

/**
 * Create a mock function that rejects after a delay
 */
export const createDelayedRejectMock = (error: Error, delay = 100) =>
  vi.fn().mockImplementation(() => new Promise((_, reject) => setTimeout(() => reject(error), delay)));

/**
 * Mock console methods to suppress output during tests
 */
export const mockConsole = () => {
  const originalConsole = { ...console };

  beforeAll(() => {
    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
    console.info = vi.fn();
    console.debug = vi.fn();
  });

  afterAll(() => {
    Object.assign(console, originalConsole);
  });
};

// ==========================================
// Custom Matchers
// ==========================================

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Vi {
    interface Assertion {
      toBeWithinRange(min: number, max: number): void;
      toHaveBeenCalledWithMatch(...args: unknown[]): void;
    }
  }
}

// Export for use in test files
export { electronMock };
