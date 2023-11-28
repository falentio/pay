export function hmac(alg: string, secret: string) {
	let key: CryptoKey;

	async function getKey() {
		const params = { name: "hmac", hash: alg } as HmacImportParams;
		if (key) {
			return [key, params] as const;
		}
		const encoder = new TextEncoder();
		key = await crypto.subtle.importKey(
			"raw",
			encoder.encode(secret),
			params,
			false,
			["sign", "verify"],
		);
		return [key, params] as const;
	}
	async function sign(data: string) {
		const encoder = new TextEncoder();
		const [key, params] = await getKey();
		const buf = await crypto.subtle.sign(
			params,
			key,
			encoder.encode(data),
		);
		return toHex(buf);
	}

	async function verify(data: string, signature: string) {
		const encoder = new TextEncoder();
		const [key, params] = await getKey();
		return crypto.subtle.verify(
			params,
			key,
			fromHex(signature),
			encoder.encode(data),
		);
	}
	return { sign, verify };
}

export type HMAC = ReturnType<typeof hmac>;

export function fromHex(s: string) {
	const result = s
		.match(/.{0,2}/g)
		?.map(i => parseInt(i, 16))
		.filter(i => !isNaN(i));
	console.log({ result, arr: s.match(/.{0,2}/g), s });
	if (!result) {
		throw new Error("invalid hex received: " + s);
	}
	return new Uint8Array(result);
}

export function toHex(src: Uint8Array | ArrayBuffer) {
	if (!(src instanceof Uint8Array)) {
		src = new Uint8Array(src);
	}
	console.log({ src });
	return Array
		.from(src as Uint8Array)
		.map(i => i.toString(16).padStart(2, "0"))
		.join("");
}
