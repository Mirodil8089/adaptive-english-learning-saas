import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeDatabase } from './server/db.ts';
import { adminRouter } from './server/routes/admin.ts';
import { authRouter } from './server/routes/auth.ts';
import { billingRouter, webhookRouter } from './server/routes/billing.ts';
import { learningRouter } from './server/routes/learning.ts';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function createMindQuestApp(options?: { skipVite?: boolean }) {
  initializeDatabase();

  const app = express();

  // Security response headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  app.use(cookieParser());

  // Mount signed payment webhooks BEFORE global JSON parser so Stripe raw body verification succeeds
  app.use('/api/webhooks', webhookRouter);

  app.use(express.json({ limit: '8mb' }));

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', product: 'MINDQUEST AI', timestamp: new Date().toISOString() });
  });

  // Structured API routes
  app.use('/api/auth', authRouter);
  app.use('/api/billing', billingRouter);
  app.use('/api/learning', learningRouter);
  app.use('/api/admin', adminRouter);

  // API 404 guard
  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  if (!options?.skipVite) {
    if (process.env.NODE_ENV !== 'production') {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa',
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(__dirname, 'dist');
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
  }

  return app;
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename);

if (isDirectRun) {
  const PORT = Number(process.env.PORT || 3000);
  createMindQuestApp().then((app) => {
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`MINDQUEST AI SaaS Server running at http://0.0.0.0:${PORT}`);
    });
  });
}
