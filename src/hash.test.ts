import { describe, expect, it } from "vitest";
import { fromHex, toHex } from "./hash";

describe("hash", () => {
	describe("hex encoding", () => {
		it("should able to encode hex", () => {
			const b = new Uint8Array(16);
			crypto.getRandomValues(b);
			const hex = toHex(b);
			expect(hex).toEqual(toHex(b));
			expect(hex).toEqual(toHex(fromHex(hex)));
		});
	});
});
