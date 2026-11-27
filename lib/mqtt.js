// Klien MQTT 3.1.1 minimal di atas WebSocket.
//
// Cukup untuk kebutuhan lobby Pulau Kabut: CONNECT, SUBSCRIBE, PUBLISH QoS 0,
// dan PING. Ditulis sendiri supaya tidak menambah dependency — protokolnya
// hanya beberapa paket biner sederhana.

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function encodeVarint(value) {
  const bytes = [];
  let rest = value;
  do {
    let byte = rest % 128;
    rest = Math.floor(rest / 128);
    if (rest > 0) byte |= 0x80;
    bytes.push(byte);
  } while (rest > 0);
  return bytes;
}

function encodeText(text) {
  const bytes = encoder.encode(text);
  return [bytes.length >> 8, bytes.length & 0xff, ...bytes];
}

function buildPacket(type, flags, body) {
  return new Uint8Array([(type << 4) | flags, ...encodeVarint(body.length), ...body]);
}

export function createMqttClient({ url, clientId, keepalive = 30 }) {
  let socket = null;
  let disposed = false;
  let attempt = 0;
  let pingTimer = null;
  let retryTimer = null;

  const handlers = { open: [], message: [], status: [] };

  function emitStatus(status) {
    handlers.status.forEach((fn) => fn(status));
  }

  function send(bytes) {
    if (socket && socket.readyState === 1) socket.send(bytes);
  }

  function stopPing() {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = null;
  }

  function startPing() {
    stopPing();
    pingTimer = setInterval(() => send(new Uint8Array([0xc0, 0x00])), keepalive * 700);
  }

  function scheduleRetry() {
    if (disposed || retryTimer) return;
    attempt += 1;
    const delay = Math.min(15000, 1000 * 2 ** Math.min(attempt, 4));
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, delay);
  }

  function handleFrame(data) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    let offset = 0;

    while (offset < bytes.length) {
      const type = bytes[offset] >> 4;
      let multiplier = 1;
      let length = 0;
      let cursor = offset + 1;
      let byte = 0;

      do {
        byte = bytes[cursor];
        cursor += 1;
        length += (byte & 0x7f) * multiplier;
        multiplier *= 128;
      } while ((byte & 0x80) !== 0 && cursor < bytes.length);

      const start = cursor;
      const end = Math.min(start + length, bytes.length);

      if (type === 2) {
        // CONNACK
        const code = bytes[start + 1];
        if (code === 0) {
          attempt = 0;
          emitStatus('online');
          handlers.open.forEach((fn) => fn());
          startPing();
        } else {
          emitStatus('refused');
          if (socket) socket.close();
        }
      } else if (type === 3) {
        // PUBLISH, QoS 0
        const topicLength = (bytes[start] << 8) | bytes[start + 1];
        const topic = decoder.decode(bytes.subarray(start + 2, start + 2 + topicLength));
        const payload = decoder.decode(bytes.subarray(start + 2 + topicLength, end));
        handlers.message.forEach((fn) => fn(topic, payload));
      }

      offset = end;
    }
  }

  function connect() {
    if (disposed) return;
    emitStatus(attempt === 0 ? 'connecting' : 'reconnecting');

    try {
      socket = new WebSocket(url);
    } catch (error) {
      scheduleRetry();
      return;
    }

    socket.binaryType = 'arraybuffer';

    socket.onopen = () => {
      const body = [
        ...encodeText('MQTT'),
        4,
        0x02,
        (keepalive >> 8) & 0xff,
        keepalive & 0xff,
        ...encodeText(clientId),
      ];
      send(buildPacket(1, 0, body));
    };

    socket.onmessage = (event) => handleFrame(event.data);
    socket.onerror = () => {};
    socket.onclose = () => {
      stopPing();
      emitStatus('offline');
      scheduleRetry();
    };
  }

  return {
    connect,
    subscribe(topic) {
      send(buildPacket(8, 2, [0x00, 0x01, ...encodeText(topic), 0x00]));
    },
    publish(topic, payload) {
      send(buildPacket(3, 0, [...encodeText(topic), ...encoder.encode(payload)]));
    },
    onOpen(fn) {
      handlers.open.push(fn);
    },
    onMessage(fn) {
      handlers.message.push(fn);
    },
    onStatus(fn) {
      handlers.status.push(fn);
    },
    close() {
      disposed = true;
      stopPing();
      if (retryTimer) clearTimeout(retryTimer);
      retryTimer = null;
      if (socket) {
        try {
          socket.close();
        } catch (error) {
          // sudah tertutup
        }
      }
      socket = null;
    },
  };
}
