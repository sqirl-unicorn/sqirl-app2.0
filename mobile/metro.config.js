/**
 * Metro config — resolves @sqirl/shared to the shared source tree.
 *
 * Metro doesn't honour tsconfig paths at runtime, so we must tell it
 * explicitly where to find the shared package.
 */

const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const sharedRoot = path.resolve(__dirname, '../shared/src');
const projectRoot = __dirname;

// Teach Metro to resolve '@sqirl/shared' as a virtual package.
config.resolver.extraNodeModules = {
  ...config.resolver.extraNodeModules,
  '@sqirl/shared': sharedRoot,
};

// Watch the shared folder for changes during development.
config.watchFolders = [...(config.watchFolders ?? []), path.resolve(__dirname, '../shared')];

// Ensure node_modules from the mobile project are preferred for shared deps (e.g. zustand).
config.resolver.nodeModulesPaths = [
  ...(config.resolver.nodeModulesPaths ?? []),
  path.resolve(projectRoot, 'node_modules'),
];

module.exports = config;
