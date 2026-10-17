const express = require('express');
const path = require('path');
const http = require('http');
const app = express();

const BACKEND_PORT = process.env.BACKEND_PORT || 4000;
const BACKEND_HOST = process.env.BACKEND_HOST || 'localhost';

// Reverse proxy /api/* to the backend on port 4000
app.use('/api', (req, res) => {
  const options = {
    hostname: BACKEND_HOST,
    port: BACKEND_PORT,
    path: req.originalUrl,
    method: req.method,
    headers: {
      ...req.headers,
      host: `${BACKEND_HOST}:${BACKEND_PORT}`
    }
  };

  const proxyReq = http.request(options, (proxyRes) => {
    res.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.warn(`[Frontend Proxy] Backend unreachable on port ${BACKEND_PORT}:`, err.message);
    if (!res.headersSent) {
      res.status(502).json({
        success: false,
        message: 'Backend API service is currently unreachable on port 4000',
        error: err.message
      });
    }
  });

  req.pipe(proxyReq, { end: true });
});

app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Frontend server running on http://localhost:${PORT}`);
});