
async function loadConnectionInfo() {
  try {
    const res = await fetch('/api/connection-info');
    const data = await res.json();

    const update = (prefix, info) => {
      document.getElementById(`${prefix}-vpn`).textContent = info.vpn;
      document.getElementById(`${prefix}-proxy`).textContent = info.proxy;
      document.getElementById(`${prefix}-tls`).textContent = info.tls;
      document.getElementById(`${prefix}-dns`).textContent = info.dns;
      document.getElementById(`${prefix}-udp-status`).textContent = info.udpStatus;
      document.getElementById(`${prefix}-udp-port`).textContent = info.udpPort;
      document.getElementById(`${prefix}-tcp`).textContent = info.tcp || 'N/A';
      document.getElementById(`${prefix}-keepalive`).textContent = info.keepAlive ? "Yes" : "No";
    };

    update('client', data.client);
    update('server', data.server);
  } catch (err) {
    console.error('Error fetching /api/connection-info:', err);
  }
}

async function loadConnectionLogs() {
  try {
    const res = await fetch('/api/vpn-connections');
    const { tcp, udp } = await res.json();

    const format = (list) =>
      list.map(conn =>
        `[${conn.protocol}] ${conn.status} - ${conn.ip}:${conn.port} at ${conn.time}`
      ).join('\n');

    document.getElementById('connection-log').textContent =
      `TCP Connections:\n${format(tcp)}\n\nUDP Requests:\n${format(udp)}`;
  } catch (err) {
    console.error('Error fetching /api/vpn-connections:', err);
  }
}

// Load initially and auto-refresh every 3 seconds
loadConnectionInfo();
loadConnectionLogs();
setInterval(() => {
  loadConnectionInfo();
  loadConnectionLogs();
}, 3000);
