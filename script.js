function startConnection() {
      document.getElementById('status').innerText = 'Connecting...';
      const socket = new WebSocket('ws://8fb7bf5c-7dc0-495e-abb8-0ab5e21e4bb4-00-2src2cbxstv0o.picard.replit.dev:8080');
      socket.onopen = () => {
        document.getElementById('status').innerText = 'WebSocket Connected';
        socket.send(document.getElementById('payload').value);
      };
      socket.onmessage = (e) => {
        document.getElementById('log').innerHTML += `<br>${e.data}`;
      };
      socket.onerror = () => {
        document.getElementById('status').innerText = 'Error in WebSocket';
      };
    }
