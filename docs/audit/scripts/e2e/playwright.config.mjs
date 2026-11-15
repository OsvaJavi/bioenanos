// Configuración de las pruebas de auditoría (fuera del repo). BASE = URL del sitio (local o Pages).
import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: /audit_.*\.spec\.mjs/,
  timeout: 60_000,
  retries: 0, // una prueba intermitente es un hallazgo: nunca se reintenta
  workers: 3,
  reporter: [['line'], ['json', { outputFile: 'results.json' }]],
  use: { baseURL: process.env.BASE ?? 'http://127.0.0.1:4173/bioenanos/', viewport: { width: 1440, height: 900 } },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1440, height: 900 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
  ],
});
