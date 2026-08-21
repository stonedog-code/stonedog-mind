import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  /**
   * Both packages ship TypeScript SOURCE rather than a bundle, so Next has to
   * transpile them. See panda.config.ts for why they ship source at all.
   */
  transpilePackages: [
    "@stonedogcode/style",
    "@stonedogcode/mind-ui",
    "@stonedogcode/mind-core",
  ],

  /**
   * Point `styled-system/*` at THIS app's generated directory, for every module.
   *
   * The design-system components import bare `styled-system/jsx`,
   * `styled-system/css` and `styled-system/recipes`, which are generated per
   * CONSUMER by `panda codegen` — there is no such package to install. npm
   * hoists `@stonedogcode/style` to the repo-root `node_modules`, so a bare
   * specifier resolved from inside it cannot find this app's `styled-system/`
   * and the build fails with "Module not found: Can't resolve
   * 'styled-system/jsx'", pointing at a file inside node_modules that looks
   * untouchable.
   *
   * A prefix alias, so `styled-system/anything` resolves too. `tsconfig.json`
   * carries the matching `paths` entry for the type-checker, which does not
   * read webpack config.
   */
  webpack: (config) => {
    config.resolve.alias = {
      ...config.resolve.alias,
      "styled-system": path.join(appDir, "styled-system"),
    };
    return config;
  },
};

export default nextConfig;
