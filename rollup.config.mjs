import resolve from "@rollup/plugin-node-resolve";
import typescript from "@rollup/plugin-typescript";
import terser from "@rollup/plugin-terser";

const dev = process.env.ROLLUP_WATCH === "true";

// HACS wants one .js file named like the repository, in dist/.
export default {
  input: "src/leva2mqtt-card.ts",
  output: {
    file: "dist/leva2mqtt-customcard.js",
    format: "es",
    sourcemap: dev,
  },
  plugins: [
    resolve(),
    typescript({ tsconfig: "./tsconfig.json", include: ["src/**/*.ts"], outDir: "dist", declaration: false }),
    !dev && terser({ format: { comments: false } }),
  ],
};
