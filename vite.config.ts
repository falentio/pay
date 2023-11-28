import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { version } from "./package.json";
export default defineConfig(({ command }) => ({
	esbuild: command === "build" && {
		drop: ["console"],
	},
	plugins: [
		dts({
			copyDtsFiles: true,
			include: ["./src"],
		}),
	],
	test: {
		environment: "edge-runtime",
	},
	define: {
		VERSION: JSON.stringify(version),
	},
	envPrefix: ["TRIPAY"],
	build: {
		lib: {
			entry: ["./src/index.ts"],
			formats: ["es", "cjs"],
			name: "pay",
			fileName: "index",
		},
	},
}));
