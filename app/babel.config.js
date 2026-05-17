// Reanimated v4 + react-native-worklets require the worklets babel plugin
// to be the LAST entry in `plugins`. Skia animations and any `'worklet'`
// function in this codebase rely on it.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
  };
};
