// Full Node.js VPN server code would go here
// Import required modules
const express = require('express');
const app = express(); 
const fs = require('fs');
const http = require('http');
const https = require('https');
const tls = require('tls');
const net = require('net');
const httpProxy = require('http-proxy');
const dgram = require('dgram');
const WebSocket = require('ws');
const path = require('path');
const url = require('url');
const dns = require('dns');

// Configuration
const VPN_IP = 'localhost';
const PORT = 8050;
const PROXY_PORT = 8060;
const DNS_PORT = 53;
const TLS_PORT = 8070;
const WS_PORT = 8080;
const DNS_FORWARDER = '8.8.8.8';

// Serve static files (including index.html)
app.use(express.static(path.join(__dirname)));

// HTTP Server (serving index.html)
http.createServer(app, (req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    fs.readFile(path.join(__dirname, 'index.html'), (err, data) => {
      if (err) return res.end('Error loading page.');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  }
}).listen(PORT, () => {
  console.log(`HTTP VPN server running at http://${VPN_IP}:${PORT}`);
});

// API for connection info
app.get('/api/connection-info', (req, res) => {
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'];
  const tlsInfo = req.socket.getCipher ? req.socket.getCipher() : { name: 'N/A', version: 'N/A' };

  const info = {
    client: {
      vpn: "Unknown",
      proxy: "Unknown",
      tls: `${tlsInfo.name} (${tlsInfo.version})`,
      dns: "Unknown",
      udpStatus: "Unavailable",
      udpPort: "N/A",
      keepAlive: req.headers.connection === 'keep-alive'
    },
    server: {
      vpn: `${VPN_IP}:${PORT}`,
      proxy: `${VPN_IP}:${PROXY_PORT}`,
      tls: `${VPN_IP}:${TLS_PORT}`,
      dns: `${DNS_FORWARDER}:${DNS_PORT}`,
      udpStatus: "Connected",
      udpPort: `${DNS_PORT}`,
      keepAlive: true
    }
  };

  res.json(info);
});


// TLS VPN Secure Server
const tlsOptions = {
  key: fs.readFileSync('private-key.pem'),
  cert: fs.readFileSync('certificate.pem'),
};
tls.createServer(tlsOptions, (socket) => {
  console.log('TLS client connected.');
  socket.write('Welcome to TLS VPN\n');
  socket.on('data', data => console.log('TLS data:', data.toString()));
}).listen(TLS_PORT, () => {
  console.log(`TLS VPN server on ${VPN_IP}:${TLS_PORT}`);
});


// Create a proxy server instance
const proxy = httpProxy.createProxyServer({});

// Create HTTPS server
const server = https.createServer(tlsOptions, (req, res) => {
  const parsedUrl = url.parse(req.url);
  const hostname = parsedUrl.hostname || req.headers.host;

  // Resolve DNS for the target hostname
  dns.lookup(hostname, (err, address) => {
    if (err) {
      console.error(`DNS resolution error for ${hostname}:`, err);
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      res.end('DNS resolution failed');
      return;
    }

    const target = `${parsedUrl.protocol || 'http:'}//${address}`;

    console.log(`Proxying ${req.method} request for ${hostname} (${address}) to ${target}`);

    proxy.web(req, res, { target, changeOrigin: true }, (proxyErr) => {
      console.error('Proxy error:', proxyErr);
      res.writeHead(500);
      res.end('Proxy error');
    });
  });
}).listen(PROXY_PORT, () => {
  console.log(`HTTP Proxy running on ${VPN_IP}:${PROXY_PORT}`);
});

// DNS Resolver
const dnsServer = dgram.createSocket('udp4');
dnsServer.on('message', (msg, rinfo) => {
  const forwardSocket = dgram.createSocket('udp4');
  forwardSocket.send(msg, 0, msg.length, DNS_PORT, DNS_FORWARDER, () => {});
  forwardSocket.on('message', (response) => {
    dnsServer.send(response, 0, response.length, rinfo.port, rinfo.address);
    forwardSocket.close();
  });
});
dnsServer.bind(DNS_PORT, () => {
  console.log(`DNS server running on ${VPN_IP}:${DNS_PORT}`);
});

// WebSocket Server
const wss = new WebSocket.Server({ port: WS_PORT }, () => {
  console.log(`WebSocket server running on ws://${VPN_IP}:${WS_PORT}`);
});
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({ status: 'Connected to VPN WebSocket' }));
  ws.on('message', msg => console.log('WebSocket message:', msg));
});

const tcpConnections = [];

const tcpServer = net.createServer((socket) => {
  const remoteAddress = `${socket.remoteAddress}:${socket.remotePort}`;
  console.log(`📥 New TCP connection from ${remoteAddress}`);

  // Store connection details
  tcpConnections.push({
    ip: socket.remoteAddress,
    port: socket.remotePort,
    time: new Date().toISOString(),
    protocol: 'TCP',
    status: 'Connected'
  });

  socket.on('data', (data) => {
    console.log(`📝 TCP data from ${remoteAddress}: ${data}`);
  });

  socket.on('end', () => {
    console.log(`📴 TCP client disconnected: ${remoteAddress}`);
    // Mark as disconnected
    const conn = tcpConnections.find(c => c.ip === socket.remoteAddress && c.port === socket.remotePort);
    if (conn) conn.status = 'Disconnected';
  });

  socket.on('error', (err) => {
    console.error(`❌ TCP error from ${remoteAddress}:`, err.message);
  });

  socket.write('Welcome to the TCP VPN server.\n');
});

