module.exports = function apiConfig(api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
  };
};
