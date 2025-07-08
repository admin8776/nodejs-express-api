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
const cors = require('cors');

// Configuration
const VPN_IP = 'localhost';         // Or your server's public IP
const PORT = 80;                    // HTTP (for payloads or tunneling tricks)
const PROXY_PORT = 443;            // HTTPS (used in TLS/SNI injection and OverVPN)
const DNS_PORT = 53;               // DNS tunneling (UDP)
const TLS_PORT = 992;              // TLS over TCP (commonly used for VPN fallback)
const WS_PORT = 8080;              // WebSocket fallback or control
const UDP_PORT = 1194;     // Default UDP VPN port
const DNS_FORWARDER = '8.8.8.8';

// Serve static files (including index.html)
app.use(express.static(path.join(__dirname)));

app.use(cors({
  origin: 'http://localhost:8000', // Or your specific allowed origin(s)
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  allowedHeaders: ['Content-Type', 'Authorization', 'x-target-host'] // Add 'x-target-host' here
}));


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

// TLS VPN Secure Server with CA support
const tlsOptions = {
  key: fs.readFileSync('private-key.pem'),     // Your server's private key
  cert: fs.readFileSync('certificate.pem'),    // Your server's certificate
  ca: fs.readFileSync('ca.cer'),               // The CA certificate to verify clients (optional)
  requestCert: true,                           // Ask client to send a certificate
  rejectUnauthorized: false                    // Accept even if client doesn’t provide a valid cert
};

const tlsServer = tls.createServer(tlsOptions, (socket) => {
  const authorized = socket.authorized ? '✅ authorized' : '❌ unauthorized';
  console.log(`TLS client connected: ${authorized}`);

  socket.write('Welcome to TLS VPN\n');
  if (!socket.authorized) {
    console.log('⚠️  TLS client was not authorized:', socket.authorizationError);
  }
  socket.on('data', data => console.log('TLS data:', data.toString()));
});
tlsServer.listen(TLS_PORT, () => {
  console.log(`🔒 TLS VPN server running on ${VPN_IP}:${TLS_PORT}`);
});

// Create a proxy server instance
const proxy = httpProxy.createProxyServer({});

// Create HTTPS server
const proxyServer = http.createServer(tlsOptions, (req, res) => {
  const parsedUrl = url.parse(req.url);
  const targetHost = req.headers['x-target-host'] || req.headers.host;

  if (!targetHost) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Missing target host');
  }

  dns.lookup(targetHost, (err, address) => {
    if (err) {
      console.error(`❌ DNS lookup failed for ${targetHost}:`, err);
      res.writeHead(502, { 'Content-Type': 'text/plain' });
      return res.end('DNS resolution failed');
    }

    const targetUrl = `${parsedUrl.protocol || 'http:'}//${address}`;
    console.log(`🌍 Proxying ${req.method} to ${targetUrl}`);

    proxy.web(req, res, { target: targetUrl, changeOrigin: true }, (err) => {
      console.error('Proxy error:', err);
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('Proxy failed');
    });
  });
});

// 2. Support du CONNECT (pour tunnel TLS/VPN)
proxyServer.on('connect', (req, clientSocket, head) => {
  const [targetHost, targetPort] = req.url.split(':');
  const port = parseInt(targetPort, 10) || 443;

  const serverSocket = net.connect(port, targetHost, () => {
    clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
    serverSocket.write(head);
    serverSocket.pipe(clientSocket);
    clientSocket.pipe(serverSocket);
  });

  serverSocket.on('error', (err) => {
    console.error('Tunnel error:', err.message);
    clientSocket.end('HTTP/1.1 500 Tunnel Error\r\n');
  });
});

proxyServer.on('request', (req, res) => {
  if (req.method === 'POST' && req.url === '/start-connect') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        const payload = data.payload || '';
        const targetHost = req.headers['x-target-host'] || 'localhost';
        const targetPort = data.port || 80;

        console.log(`📡 Received /start-connect for ${targetHost}:${targetPort}`);
        console.log('Payload:', payload);

        const socket = net.connect(targetPort, targetHost, () => {
          socket.write(payload + '\n');
        });

        let response = '';
        socket.on('data', (chunk) => {
          response += chunk.toString();
        });

        socket.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end(response || '✅ Connection completed with no data');
        });

        socket.on('error', (err) => {
          console.error('❌ Socket error:', err.message);
          res.writeHead(502, { 'Content-Type': 'text/plain' });
          res.end('Connection failed: ' + err.message);
        });
      } catch (err) {
        console.error('❌ Invalid JSON:', err.message);
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Invalid JSON');
      }
    });
  }
});


// 3. Lancer le serveur proxy
proxyServer.listen(PROXY_PORT, () => {
  console.log(`🛡️  Proxy HTTP+CONNECT listening on ${VPN_IP}:${PROXY_PORT}`);
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

const udpVpnServer = dgram.createSocket('udp4');

udpVpnServer.on('listening', () => {
  const address = udpVpnServer.address();
  console.log(`✅ OpenVPN UDP server is running on ${address.address}:${address.port}`);
});

udpVpnServer.on('message', (msg, rinfo) => {
  console.log(`📨 OpenVPN UDP packet received from ${rinfo.address}:${rinfo.port}`);
  
  // Log and store this connection
  udpConnections.push({
    ip: rinfo.address,
    port: rinfo.port,
    time: new Date().toISOString(),
    protocol: 'UDP',
    status: 'Active'
  });

  // Send a basic response (this would normally be OpenVPN protocol data)
  const response = Buffer.from('Welcome to the UDP VPN port (1194)');
  udpVpnServer.send(response, 0, response.length, rinfo.port, rinfo.address);
});

udpVpnServer.bind(UDP_PORT, () => {
  console.log(`🔒 UDP VPN server bound to port ${UDP_PORT}`);
});

app.get('/api/vpn-connections', (req, res) => {
  res.json({
    tcp: tcpConnections,
    udp: udpConnections
  });
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

const udpConnections = [];

dnsServer.on('message', (msg, rinfo) => {
  console.log(`📡 UDP DNS request from ${rinfo.address}:${rinfo.port}`);

  udpConnections.push({
    ip: rinfo.address,
    port: rinfo.port,
    time: new Date().toISOString(),
    protocol: 'UDP',
    status: 'Received'
  });

  const forwardSocket = dgram.createSocket('udp4');
  forwardSocket.send(msg, 0, msg.length, 53, DNS_FORWARDER);
  forwardSocket.on('message', (response) => {
    dnsServer.send(response, 0, response.length, rinfo.port, rinfo.address);
    forwardSocket.close();
  });
});


