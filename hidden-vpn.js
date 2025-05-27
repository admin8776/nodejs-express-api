const net = require('net');
const fs = require('fs');
const http = require('http');
const httpProxy = require('http-proxy');
const dgram = require('dgram');
const tls = require('tls');
const path = require('path');

// VPN configuration
const VPN_IP = '192.168.43.197';
const VPN_PORT = 8090;

// DNS configuration
const DNS_PORT = 53;
const DNS_FORWARDER = '8.8.8.8'; // Google's public DNS server

// TLS configuration
const tlsOptions = {
  key: fs.readFileSync('private-key.pem'),
  cert: fs.readFileSync('certificate.pem'),
};

// Create a TLS server for secure VPN connections
const tlsServer = tls.createServer(tlsOptions, (socket) => {
  console.log('Secure connection established!');

  socket.write('Welcome to the secure VPN server!\n');

  // Handle incoming data
  socket.on('data', (data) => {
    console.log(`Encrypted data received: ${data.toString()}`);
    socket.write('Data received securely.\n');
  });

  // Handle disconnection
  socket.on('end', () => {
    console.log('Client disconnected.');
  });
});

// Start the TLS server for VPN traffic
tlsServer.listen(VPN_PORT, VPN_IP, () => {
  console.log(`TLS VPN server running on ${VPN_IP}:${VPN_PORT}`);
});

// Create an HTTP proxy for traffic routing
const proxy = httpProxy.createProxyServer({});

// Handle proxy errors
proxy.on('error', (err, req, res) => {
  console.error('Proxy error:', err);
  res.writeHead(500, { 'Content-Type': 'text/plain' });
  res.end('Proxy error occurred.');
});

// Serve index.html to check VPN status
const httpServer = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/index.html') {
    const filePath = path.join(__dirname, 'index.html');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500);
        return res.end('Error loading index.html');
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else {
    // Forward all other requests through the HTTP proxy
    console.log(`Proxying request: ${req.url}`);
    proxy.web(req, res, { target: 'http://example.com' }); // Change target dynamically based on req.url if needed
  }
});

// Start the HTTP server for serving status and routing traffic
httpServer.listen(8080, VPN_IP, () => {
  console.log(`HTTP server running on http://${VPN_IP}:8080`);
});

// DNS Server to handle DNS resolution
const dnsServer = dgram.createSocket('udp4');

// Handle incoming DNS requests and forward them to the external DNS server
dnsServer.on('message', (msg, rinfo) => {
  console.log(`Received DNS request from ${rinfo.address}`);

  // Forward the DNS query to Google's DNS server
  const forwardSocket = dgram.createSocket('udp4');
  forwardSocket.send(msg, 0, msg.length, DNS_PORT, DNS_FORWARDER, (err) => {
    if (err) console.error('DNS forwarding error:', err);
  });

  // Receive the DNS response from the forwarder
  forwardSocket.on('message', (response) => {
    dnsServer.send(response, 0, response.length, rinfo.port, rinfo.address);
    forwardSocket.close(); // Close the forwarder after sending the response
  });
});

// Start the DNS server
dnsServer.bind(DNS_PORT, VPN_IP, () => {
  console.log(`DNS server running on ${VPN_IP}:${DNS_PORT}`);
});
