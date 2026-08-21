/**
 * `.cjs`, not `.js`. This workspace is `"type": "module"`, so a
 * `postcss.config.js` containing `module.exports` throws "module is not defined
 * in ES module scope" — during the CSS build, where the message does not
 * obviously point at this file.
 *
 * Without this plugin Panda generates its `styled-system/` directory happily
 * and emits NO stylesheet into the app: the page renders, every class name is
 * in the DOM, and there are zero rules behind them. Which is the exact silent
 * failure the include globs are also guarding against, arriving by a different
 * route.
 */
module.exports = {
  plugins: {
    "@pandacss/dev/postcss": {},
  },
};
