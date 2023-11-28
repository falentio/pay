import { Fee, Payment } from "./types";

export function paymentIs<
	T extends Payment = Payment,
	U extends T["name"] = T["name"],
	V extends T = Extract<T, { name: U }>,
>(
	payment: T,
	name: U,
	type?: V["type"],
): payment is V {
	return (
		payment.name === name
		&& (!type || payment.type === type)
	);
}

declare const VERSION: string;
export const USER_AGENT = "falentio-pay/" + VERSION;
