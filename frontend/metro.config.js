const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const projectRoot = __dirname;
const config = getDefaultConfig(projectRoot);
const defaultRewriteRequestUrl = config.server?.rewriteRequestUrl;

config.projectRoot = projectRoot;
config.watchFolders = [];
config.resolver = {
  ...config.resolver,
  nodeModulesPaths: [path.resolve(projectRoot, "node_modules")],
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
