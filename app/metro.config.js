const { getDefaultConfig } = require('expo/metro-config');
const fs = require('fs');
const path = require('path');

const appRoot = __dirname;
const monorepoRoot = path.resolve(appRoot, '..');

// Use the monorepo root as Metro's project root so that bundle paths like
// /app/index.ts resolve correctly (Expo CLI generates them relative to the
// monorepo root when running from a workspace).
const config = getDefaultConfig(monorepoRoot);

config.watchFolders = [monorepoRoot];

// Bun stores transitive deps in node_modules/.bun/<pkg@ver>/node_modules/
// rather than hoisting them to root node_modules. Metro's nodeModulesPaths
// must include these virtual-store dirs so synthetically-injected requires
// (e.g. metro-runtime) and nested peer deps are resolvable.
const bunStorePath = path.resolve(monorepoRoot, 'node_modules', '.bun');
const bunNodeModulesPaths = fs.existsSync(bunStorePath)
  ? fs.readdirSync(bunStorePath)
      .map(entry => path.join(bunStorePath, entry, 'node_modules'))
      .filter(p => fs.existsSync(p))
  : [];

config.resolver.nodeModulesPaths = [
  path.resolve(appRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
  ...bunNodeModulesPaths,
];

module.exports = config;
