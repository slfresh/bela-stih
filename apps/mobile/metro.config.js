const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

/**
 * Expo already handles monorepo resolution, so this exists for exactly one
 * reason: getting `colyseus.js` to bundle for React Native.
 *
 * Its package exports map a `browser` condition, but that condition points at
 * the same CommonJS build as `require` — which pulls in `@colyseus/httpie`'s
 * node variant and the `ws` package, and those need `https` and `stream`.
 * Neither exists in React Native.
 *
 * `dist/colyseus.js` is the real browser bundle: a UMD file with httpie and the
 * schema serializer already inlined, talking to the global `WebSocket` and
 * `XMLHttpRequest` that React Native does provide. Pointing at it directly is
 * both simpler and more predictable than trying to steer export conditions.
 *
 * Scoped to this one package on purpose — switching resolution globally would
 * change how every other dependency resolves.
 */
const config = getDefaultConfig(__dirname);

// The package's `exports` map blocks deep subpaths, so resolve `package.json`
// (which it does export) and build the path from its directory.
const colyseusRoot = path.dirname(
  require.resolve('colyseus.js/package.json', {
    paths: [__dirname, path.resolve(__dirname, '../..')],
  }),
);
const COLYSEUS_BROWSER_BUNDLE = path.join(colyseusRoot, 'dist', 'colyseus.js');

if (!require('fs').existsSync(COLYSEUS_BROWSER_BUNDLE)) {
  throw new Error(`colyseus.js browser bundle missing at ${COLYSEUS_BROWSER_BUNDLE}`);
}

const defaultResolve = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'colyseus.js') {
    return { type: 'sourceFile', filePath: COLYSEUS_BROWSER_BUNDLE };
  }
  return defaultResolve
    ? defaultResolve(context, moduleName, platform)
    : context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
