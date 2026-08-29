import WsWebSocket from 'ws';

/**
 * Node's built-in WebSocket (undici) negotiates HTTP/2 with TLS proxies like
 * Caddy, where the classic websocket upgrade does not exist — so wss://
 * connections die with "non-101 status code". Every REAL client (browsers,
 * OkHttp on Android) speaks HTTP/1.1 for websockets; the `ws` package does
 * too. Imported first by the test tools so colyseus.js picks it up.
 */
(globalThis as unknown as { WebSocket: unknown }).WebSocket = WsWebSocket;
