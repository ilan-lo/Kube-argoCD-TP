import express from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// BUG: Memory leak - token cache that never gets cleaned up
// This simulates a poorly implemented cache
const tokenCache = [];

export function requestLogger(req, res, next) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;

    console.log(
      `[${new Date().toISOString()}] ` +
      `${req.method} ${req.originalUrl} ` +
      `${res.statusCode} ` +
      `${duration}ms ` +
      `from ${req.ip}`+
      `on auth-service`
    );
  });

  next();
}
app.use(requestLogger); // 👈 logs globaux

// Health endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'auth-service',
        cacheSize: tokenCache.length
    });
});

const MAX_CACHE_SIZE = 100;

if (tokenCache.length >= MAX_CACHE_SIZE) {
  tokenCache.shift(); // FIFO
}

// Validate token endpoint
app.post('/auth/validate', (req, res) => {
    const token = req.body.token || 'anonymous';

    console.log(`Validating token: ${token.substring(0, 10)}...`);

    // BUG: Add to cache without ever cleaning up (memory leak!)
    // Each entry allocates ~100KB
    tokenCache.push({
        token: token,
        timestamp: Date.now(),
        userId: `user-${Math.random().toString(36).substring(7)}`,
        // Simulate storing session data (causes memory leak)
        sessionData: Buffer.alloc(1024 * 100), // 100KB per request
        metadata: {
            ip: '10.0.0.1',
            userAgent: 'CloudMart-Client/1.0',
            permissions: ['read', 'write', 'admin']
        }
    });

    // Always return valid (simple auth for demo)
    res.json({
        valid: true,
        userId: `user-${Math.random().toString(36).substring(7)}`,
        cacheSize: tokenCache.length,
        message: 'Token validated successfully'
    });
});

// Debug endpoint to see memory usage
app.get('/debug/memory', (req, res) => {
    const usage = process.memoryUsage();
    res.json({
        cacheEntries: tokenCache.length,
        memoryUsage: {
            rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
            heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
            heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
            external: `${Math.round(usage.external / 1024 / 1024)}MB`
        }
    });
});

app.listen(PORT, () => {
    console.log(JSON.stringify({
        msg: 'Auth Service started',
        port: PORT,
        warning: 'Memory leak present in token cache!'
    }));
});
