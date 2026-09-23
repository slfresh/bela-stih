import { createServer } from 'node:http';
import express, { type Request, type Response } from 'express';
import { Server } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { BelaRoom } from './BelaRoom';
import { ROOM_NAME, ROOM_NAME_MODES } from './protocol';

/**
 * The Bela game server.
 *
 * Deliberately tiny: all the rules live in `@belot/engine`, all the seat
 * handling in `@belot/table`, and this only wires them to a socket. The same
 * engine that runs on the phone decides every move here, which is what makes
 * "the server is authoritative" true rather than aspirational.
 *
 *   npm run start --workspace @belot/server
 *
 * The HTTP server must be an express app, not a bare request handler: Colyseus
 * mounts its `/matchmake/*` routes alongside it, and a catch-all handler
 * swallows them so every join fails with a 404.
 */

/**
 * Every room on this host shares one process, so an escaped throw from one
 * table's message handler ends every other table's match too. BelaRoom catches
 * per-message already; this is the backstop for anything that gets past it —
 * a timer callback, a promise nobody awaited. Log it and keep serving: one bad
 * room is a bug, a dead process is an outage.
 */
process.on('uncaughtException', (err) => {
  console.error('[bela] uncaught exception (server stays up):', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[bela] unhandled rejection (server stays up):', reason);
});

const PORT = Number(process.env.PORT ?? 2567);

const app = express();

// A health endpoint, so a host or uptime check has something to hit.
app.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true, room: ROOM_NAME });
});

const httpServer = createServer(app);
const gameServer = new Server({
  transport: new WebSocketTransport({ server: httpServer }),
});

gameServer.define(ROOM_NAME, BelaRoom);
// Tables for apps that know the three versions (protocol.ts): they say so.
gameServer.define(ROOM_NAME_MODES, BelaRoom, { modes: true });

gameServer
  .listen(PORT)
  .then(() => console.log(`[bela] listening on :${PORT}`))
  .catch((err: unknown) => {
    console.error('[bela] failed to start', err);
    process.exitCode = 1;
  });
