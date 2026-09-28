const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
const defaultRewriteRequestUrl = config.server?.rewriteRequestUrl;

config.resolver.unstable_enablePackageExports = false;
config.resolver.extraNodeModules = {
  react: path.resolve(__dirname, "node_modules/react"),
  "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
  "react-native": path.resolve(__dirname, "node_modules/react-native"),
  "react-native-web": path.resolve(__dirname, "node_modules/react-native-web")
};

config.server = {
  ...config.server,
  rewriteRequestUrl(url) {
    const rewritten = defaultRewriteRequestUrl ? defaultRewriteRequestUrl(url) : url;

    if (process.env.CYANEA_DISABLE_HERMES_BYTECODE !== "1") {
      return rewritten;
    }

    const baseUrl = rewritten.startsWith("/") ? "https://cyanea.local" : undefined;
    const parsed = new URL(rewritten, baseUrl);
    parsed.searchParams.delete("transform.bytecode");

    return rewritten.startsWith("/") ? `${parsed.pathname}${parsed.search}` : parsed.toString();
  }
};

module.exports = config;
