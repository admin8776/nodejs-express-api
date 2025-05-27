const net = require('net');
const http = require('http');
const fs = require('fs');
const tls = require('tls');
const WebSocket = require('ws');

// Configuration
const VPN_IP = '104.18.36.141';
const VPN_PORT = 8090;
const PROXY_PORT = 8080;

// TLS VPN Server (for demo/testing)
const tlsOptions = {
  key: fs.readFileSync('private-key.pem'), // generate with openssl if needed
  cert: fs.readFileSync('certificate.pem'),
};

tls.createServer(tlsOptions, (socket) => {
  console.log('🔐 TLS VPN client connected');
  socket.write('You are connected to a secure VPN tunnel\n');

  socket.on('data', (data) => {
    console.log('🔒 [VPN IN]:', data.toString());
  });
}).listen(VPN_PORT, () => {
  console.log(`🛡️ TLS VPN Server listening at ${VPN_IP}:${VPN_PORT}`);
});

// WebSocket HTTP CONNECT Proxy
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Proxy is running');
});

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  ws.on('message', (msg) => {
    if (msg.toString().startsWith('CONNECT')) {
      console.log('🌐 HTTP CONNECT received');

      const tlsSocket = tls.connect(
        {
          host: VPN_IP,
          port: VPN_PORT,
          rejectUnauthorized: false, // only for self-signed
        },
        () => {
          console.log('✅ TLS handshake with VPN server complete');
          ws.send('HTTP/1.1 200 Connection Established\r\n\r\n');

          // Pipe data both ways
          tlsSocket.on('data', (chunk) => {
            ws.send(chunk.toString());
          });

          ws.on('message', (data) => {
            if (!data.toString().startsWith('CONNECT')) {
              tlsSocket.write(data);
            }
          });

          tlsSocket.on('end', () => ws.send('[VPN disconnected]'));
        }
      );
    }
  });
});

server.listen(PROXY_PORT, () => {
  console.log(`🧩 Proxy server listening on ws://0.0.0.0:${PROXY_PORT}`);
});
