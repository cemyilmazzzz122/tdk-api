declare const __PKG_VERSION__: string;

/** This package's version, injected from `package.json` at build time (see `tsup.config.ts`). */
export const VERSION: string = typeof __PKG_VERSION__ === "string" ? __PKG_VERSION__ : "0.0.0-dev";
