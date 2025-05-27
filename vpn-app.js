const net = require('net');
const http = require('http');
const fs = require('fs');
const tls = require('tls');
const dgram = require('dgram');
const WebSocket = require('ws');

// VPN Config
const VPN_HOST = 'qptyzt-8080.csb.app'; // VPN server hostname
const VPN_PORT = 8090;
const PROXY_PORT = 8080;

// DNS resolution
const resolveDNS = (hostname, callback) => {
  const dns = require('dns');
  dns.lookup(hostname, (err, address) => {
    if (err) return callback(err);
    callback(null, address);
  });
};

// TLS Server (VPN)
const tlsOptions = {
  key: fs.readFileSync('private-key.pem'),
  cert: fs.readFileSync('certificate.pem'),
};

tls.createServer(tlsOptions, (socket) => {
  console.log('✅ TLS VPN client connected');

  socket.write('Secure VPN tunnel established\n');

  socket.on('data', (data) => {
    console.log('🔒 Received data in VPN tunnel:', data.toString());
  });
}).listen(VPN_PORT, () => {
  console.log(`🔐 TLS VPN Server is running on port ${VPN_PORT}`);
});

// WebSocket Proxy to receive HTTP CONNECT
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('VPN Proxy Active');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    if (msg.toString().startsWith('CONNECT')) {
      console.log('🌐 Received CONNECT payload from client');

      resolveDNS(VPN_HOST, (err, ip) => {
        if (err) return ws.send('DNS Resolution Failed');

        const tlsSocket = tls.connect(
          {
            host: ip,
            port: VPN_PORT,
            rejectUnauthorized: false, // for self-signed certs
          },
          () => {
            console.log('🔐 TLS connection established to VPN server');
            ws.send('HTTP/1.1 200 Connection Established\r\n\r\n');
            tlsSocket.write('Tunnel initiated from proxy\n');

            tlsSocket.on('data', (data) => {
              ws.send('From VPN: ' + data.toString());
            });

            ws.on('message', (clientData) => {
              if (!clientData.toString().startsWith('CONNECT')) {
                tlsSocket.write(clientData);
              }
            });

            tlsSocket.on('end', () => ws.send('VPN disconnected'));
          }
        );
      });
    }
  });
});

server.listen(PROXY_PORT, () => {
  console.log(`🧩 Proxy WebSocket server listening on ws://localhost:${PROXY_PORT}`);
});
