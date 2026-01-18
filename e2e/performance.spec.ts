/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * E2E Performance Tests
 *
 * Browser-based performance tests using Playwright.
 */

import { test, expect } from '@playwright/test';

test.describe('Performance', () => {
  // ==========================================
  // Page Load Performance
  // ==========================================

  test.describe('Page Load', () => {
    test('should load home page in under 3 seconds', async ({ page }) => {
      const start = Date.now();

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const loadTime = Date.now() - start;

      expect(loadTime).toBeLessThan(3000);
    });

    test('should load project page in under 3 seconds', async ({ page }) => {
      await page.goto('/');

      const start = Date.now();
      await page.goto('/projects/1').catch(() => page.goto('/'));
      await page.waitForLoadState('networkidle');

      const loadTime = Date.now() - start;

      expect(loadTime).toBeLessThan(3000);
    });

    test('should have good Core Web Vitals', async ({ page }) => {
      await page.goto('/');

      // Measure Largest Contentful Paint (LCP)
      const lcp = await page.evaluate(() => {
        return new Promise<number>((resolve) => {
          let lcpValue = 0;

          const observer = new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const lastEntry = entries[entries.length - 1] as PerformanceEntry & { startTime: number };
            lcpValue = lastEntry?.startTime || 0;
          });

          observer.observe({ type: 'largest-contentful-paint', buffered: true });

          setTimeout(() => {
            observer.disconnect();
            resolve(lcpValue);
          }, 5000);
        });
      });

      // LCP should be under 2.5 seconds for "good" rating
      expect(lcp).toBeLessThan(2500);
    });

    test('should have minimal layout shifts', async ({ page }) => {
      await page.goto('/');

      // Measure Cumulative Layout Shift (CLS)
      const cls = await page.evaluate(() => {
        return new Promise<number>((resolve) => {
          let clsValue = 0;

          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries() as (PerformanceEntry & { value: number })[]) {
              if (!(entry as any).hadRecentInput) {
                clsValue += entry.value || 0;
              }
            }
          });

          observer.observe({ type: 'layout-shift', buffered: true });

          setTimeout(() => {
            observer.disconnect();
            resolve(clsValue);
          }, 5000);
        });
      });

      // CLS should be under 0.1 for "good" rating
      expect(cls).toBeLessThan(0.1);
    });
  });

  // ==========================================
  // Kanban Board Performance
  // ==========================================

  test.describe('Kanban Board', () => {
    test('should render kanban board quickly', async ({ page }) => {
      await page.goto('/projects/1').catch(() => page.goto('/'));

      const boardSelector = '[data-testid="kanban-board"], [class*="kanban"]';

      const start = Date.now();
      await page.waitForSelector(boardSelector, { timeout: 5000 }).catch(() => {});
      const renderTime = Date.now() - start;

      // Board should render in under 2 seconds
      expect(renderTime).toBeLessThan(2000);
    });

    test('should handle task drag smoothly', async ({ page }) => {
      await page.goto('/projects/1').catch(() => page.goto('/'));

      const taskCard = page.locator('[data-task-id], [class*="task-card"]').first();
      const targetColumn = page.locator('[data-column="in_progress"], [class*="column"]').first();

      if ((await taskCard.isVisible()) && (await targetColumn.isVisible())) {
        const start = Date.now();

        await taskCard.dragTo(targetColumn);

        const dragTime = Date.now() - start;

        // Drag operation should feel instant
        expect(dragTime).toBeLessThan(500);
      }
    });

    test('should filter tasks quickly', async ({ page }) => {
      await page.goto('/projects/1').catch(() => page.goto('/'));

      const searchInput = page.locator('input[type="search"], input[placeholder*="Search"], input[placeholder*="검색"]');

      if (await searchInput.isVisible()) {
        const start = Date.now();

        await searchInput.fill('test');
        await page.waitForTimeout(100); // Debounce

        const filterTime = Date.now() - start;

        // Filtering should be near instant
        expect(filterTime).toBeLessThan(500);
      }
    });
  });

  // ==========================================
  // Navigation Performance
  // ==========================================

  test.describe('Navigation', () => {
    test('should navigate between pages quickly', async ({ page }) => {
      await page.goto('/');

      const navigationTimes: number[] = [];
      const routes = ['/projects', '/projects/new', '/settings', '/'];

      for (const route of routes) {
        const start = Date.now();

        await page.goto(route).catch(() => page.goto('/'));
        await page.waitForLoadState('domcontentloaded');

        navigationTimes.push(Date.now() - start);
      }

      const avgNavTime =
        navigationTimes.reduce((a, b) => a + b, 0) / navigationTimes.length;

      // Average navigation should be under 1 second
      expect(avgNavTime).toBeLessThan(1000);
    });

    test('should have fast back/forward navigation', async ({ page }) => {
      await page.goto('/');
      await page.goto('/projects').catch(() => page.goto('/'));
      await page.goto('/settings').catch(() => page.goto('/'));

      const start = Date.now();
      await page.goBack();
      await page.waitForLoadState('domcontentloaded');
      const backTime = Date.now() - start;

      // Back navigation should be very fast (cached)
      expect(backTime).toBeLessThan(500);
    });
  });

  // ==========================================
  // Interaction Performance
  // ==========================================

  test.describe('Interactions', () => {
    test('should respond to clicks quickly', async ({ page }) => {
      await page.goto('/');

      const button = page.locator('button').first();

      if (await button.isVisible()) {
        const start = Date.now();
        await button.click();
        const clickResponseTime = Date.now() - start;

        // Click should respond instantly
        expect(clickResponseTime).toBeLessThan(100);
      }
    });

    test('should handle form input without lag', async ({ page }) => {
      await page.goto('/projects/new').catch(() => page.goto('/'));

      const input = page.locator('input, textarea').first();

      if (await input.isVisible()) {
        const testString = 'This is a test input string for performance testing';

        const start = Date.now();
        await input.fill(testString);
        const inputTime = Date.now() - start;

        // Input should be smooth
        expect(inputTime).toBeLessThan(500);
      }
    });

    test('should open modals quickly', async ({ page }) => {
      await page.goto('/projects/1').catch(() => page.goto('/'));

      const addButton = page.locator('[data-testid="add-task"], button:has-text("Add"), button:has-text("추가")').first();

      if (await addButton.isVisible()) {
        const start = Date.now();
        await addButton.click();

        // Wait for modal
        await page.waitForSelector('[role="dialog"], [class*="modal"]', { timeout: 2000 }).catch(() => {});

        const modalOpenTime = Date.now() - start;

        // Modal should open quickly
        expect(modalOpenTime).toBeLessThan(500);
      }
    });
  });

  // ==========================================
  // Resource Loading
  // ==========================================

  test.describe('Resource Loading', () => {
    test('should have acceptable bundle size', async ({ page }) => {
      const resources: { name: string; size: number }[] = [];

      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('.js') || url.includes('.css')) {
          const size = parseInt(response.headers()['content-length'] || '0');
          resources.push({
            name: url.split('/').pop() || url,
            size,
          });
        }
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const totalJsSize = resources
        .filter((r) => r.name.includes('.js'))
        .reduce((sum, r) => sum + r.size, 0);

      const totalCssSize = resources
        .filter((r) => r.name.includes('.css'))
        .reduce((sum, r) => sum + r.size, 0);

      // Total JS should be under 2MB (uncompressed)
      expect(totalJsSize).toBeLessThan(2 * 1024 * 1024);

      // Total CSS should be under 500KB
      expect(totalCssSize).toBeLessThan(500 * 1024);
    });

    test('should have minimal number of requests', async ({ page }) => {
      let requestCount = 0;

      page.on('request', () => {
        requestCount++;
      });

      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Should not have excessive requests
      expect(requestCount).toBeLessThan(50);
    });
  });

  // ==========================================
  // Memory Usage
  // ==========================================

  test.describe('Memory', () => {
    test('should not have memory leaks on navigation', async ({ page }) => {
      await page.goto('/');

      // Get initial memory
      const initialMemory = await page.evaluate(() => {
        return (performance as any).memory?.usedJSHeapSize || 0;
      });

      // Navigate back and forth
      for (let i = 0; i < 10; i++) {
        await page.goto('/projects/1').catch(() => page.goto('/'));
        await page.waitForLoadState('domcontentloaded');
        await page.goto('/').catch(() => {});
        await page.waitForLoadState('domcontentloaded');
      }

      // Get final memory
      const finalMemory = await page.evaluate(() => {
        return (performance as any).memory?.usedJSHeapSize || 0;
      });

      // Memory should not grow significantly (allow 50MB growth)
      const memoryGrowth = (finalMemory - initialMemory) / 1024 / 1024;

      // Skip assertion if memory API not available
      if (initialMemory > 0) {
        expect(memoryGrowth).toBeLessThan(50);
      }
    });
  });

  // ==========================================
  // Animation Performance
  // ==========================================

  test.describe('Animations', () => {
    test('should have smooth animations (60fps target)', async ({ page }) => {
      await page.goto('/');

      // Measure frame rate during animation
      const fps = await page.evaluate(() => {
        return new Promise<number>((resolve) => {
          let frameCount = 0;
          const startTime = performance.now();

          const countFrame = () => {
            frameCount++;

            if (performance.now() - startTime < 1000) {
              requestAnimationFrame(countFrame);
            } else {
              resolve(frameCount);
            }
          };

          requestAnimationFrame(countFrame);
        });
      });

      // Should maintain reasonable frame rate (at least 30fps)
      expect(fps).toBeGreaterThan(30);
    });
  });

  // ==========================================
  // Stress Tests
  // ==========================================

  test.describe('Stress Tests', () => {
    test('should handle rapid interactions', async ({ page }) => {
      await page.goto('/');

      const buttons = page.locator('button');
      const count = await buttons.count();

      if (count > 0) {
        const start = Date.now();

        // Rapid clicks
        for (let i = 0; i < Math.min(20, count); i++) {
          await buttons.nth(i % count).click({ force: true }).catch(() => {});
        }

        const duration = Date.now() - start;

        // Should handle rapid interactions without hanging
        expect(duration).toBeLessThan(5000);
      }
    });

    test('should handle repeated search queries', async ({ page }) => {
      await page.goto('/projects/1').catch(() => page.goto('/'));

      const searchInput = page.locator('input[type="search"], input[placeholder*="Search"]');

      if (await searchInput.isVisible()) {
        const start = Date.now();

        // Rapid search queries
        for (let i = 0; i < 20; i++) {
          await searchInput.fill(`search query ${i}`);
          await page.waitForTimeout(50);
        }

        const duration = Date.now() - start;

        // Should handle rapid searches without freezing
        expect(duration).toBeLessThan(5000);
      }
    });
  });

  // ==========================================
  // Large Project Performance
  // ==========================================

  test.describe('Large Projects', () => {
    test('should handle project with many tasks', async ({ page }) => {
      // This test assumes a large project exists at /projects/large-project
      // In real scenario, this would be seeded via API or test fixtures

      const start = Date.now();

      await page.goto('/projects/large-project').catch(() => page.goto('/'));
      await page.waitForLoadState('networkidle');

      // Wait for kanban board
      await page.waitForSelector('[data-testid="kanban-board"], [class*="kanban"]', {
        timeout: 5000,
      }).catch(() => {});

      const loadTime = Date.now() - start;

      // Even large projects should load in under 5 seconds
      expect(loadTime).toBeLessThan(5000);
    });
  });
});
