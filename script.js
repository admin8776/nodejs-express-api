 async function loadConnectionInfo() {
      try {
        // Simulated data from a backend (replace with real API call later)
        const connectionInfo = await fetch('/api/connection-info').then(res => res.json());

        const update = (prefix, info) => {
          document.getElementById(`${prefix}-vpn`).textContent = info.vpn || 'N/A';
          document.getElementById(`${prefix}-proxy`).textContent = info.proxy || 'N/A';
          document.getElementById(`${prefix}-tls`).textContent = info.tls || 'N/A';
          document.getElementById(`${prefix}-dns`).textContent = info.dns || 'N/A';
          document.getElementById(`${prefix}-udp-status`).textContent = info.udpStatus || 'Unknown';
          document.getElementById(`${prefix}-udp-port`).textContent = info.udpPort || '0';
          document.getElementById(`${prefix}-keepalive`).textContent = info.keepAlive ? 'Yes' : 'No';
        };

        update('client', connectionInfo.client);
        update('server', connectionInfo.server);
      } catch (error) {
        console.error('Error loading connection info:', error);
      }
    }

    // Load on page load
    loadConnectionInfo();
