import { describe, expect, it } from "vitest";
import { hmac } from "../hash";
import { Channel, Payment, Transaction } from "../types";
import { Tripay, TripayError } from "./tripay";

describe("tripay", () => {
	const tripay = new Tripay({
		merchantCode: process.env.TRIPAY_MERCHANT_CODE!,
		apikey: process.env.TRIPAY_APIKEY!,
		privateKey: process.env.TRIPAY_PRIVATE_KEY!,
	});

	const h = hmac("SHA-256", process.env.TRIPAY_PRIVATE_KEY!);

	describe("channels", () => {
		it("should able to get channels", async () => {
			const channels = tripay.channels();
			await expect(channels).resolves.toEqual(expect.any(Array));
			await expect(channels).resolves.toContainEqual(
				expect.objectContaining({
					name: expect.any(String),
					id: expect.any(String),
					category: expect.any(String),
					fee: {
						flat: expect.any(Number),
						max: expect.any(Number),
						min: expect.any(Number),
						percent: expect.any(Number),
					},
				}),
			);
		});
	});

	describe("create", () => {
		it("should able to create transaction", async () => {
			const id = Math.random().toString(16);
			const items = [{ price: 100, quantity: 100, sku: "123123" }];
			const customer = {
				email: "testing@gmail.com",
				name: "testing",
				phone: "0" + Math.abs(Math.random() * 1e10 | 0),
			};
			const tx = tripay.create({
				channel: "QRIS2",
				id,
				items,
				customer,
			});

			await expect(tx).resolves.toMatchObject(
				{
					amount: 1e4 + 820,
					id,
					items,
					paymentId: expect.any(String),
					payments: expect.arrayContaining(
						[
							expect.objectContaining({
								name: expect.any(String),
								type: expect.any(String),
								data: expect.any(String),
							}),
						],
					),
					state: "UNPAID",
					customer,
				} as Transaction,
			);
		});
	});

	describe("get", () => {
		it("should be able to get", async () => {
			const expected = await tripay.create({
				channel: "QRIS2",
				id: Math.random().toString(16),
				items: [{ price: 100, quantity: 100, sku: "123123" }],
				customer: {
					name: "testing",
					email: "testing@gmail.com",
				},
			});
			const received = tripay.get(expected.paymentId);
			await expect(received).resolves.toEqual(expected);
		});
	});

	describe("verifyCallback", () => {
		it("should able to verify", async () => {
			const body = JSON.stringify({
				reference: "DEV-T20878131827IPTJY",
				merchant_ref: "0.5a1e34bb967b7",
				payment_selection_type: "static",
				payment_method: "QRIS2",
				payment_name: "QRIS",
				customer_name: "testing",
				customer_email: "testing@gmail.com",
				customer_phone: null,
				callback_url: "https://falentio-topup.loca.lt/callback/tripay",
				return_url: null,
				amount: 10820,
				fee_merchant: 0,
				fee_customer: 820,
				total_fee: 820,
				amount_received: 10000,
				pay_code: null,
				pay_url: null,
				checkout_url: "https://tripay.co.id/checkout/DEV-T20878131827IPTJY",
				status: "PAID",
				paid_at: null,
				expired_time: 1701155955,
				order_items: [],
				instructions: [],
				qr_string: "SANDBOX MODE",
				qr_url: "https://tripay.co.id/qr/DEV-T20878131827IPTJY",
			});
			const hash = await h.sign(body);
			const result = tripay.verifyCallback(
				body,
				new Headers({
					"X-Callback-Signature": hash,
				}),
			);
			await expect(result).resolves.toMatchObject({
				amount: 10820,
				customer: {
					name: "testing",
					email: "testing@gmail.com",
				},
				id: "0.5a1e34bb967b7",
				paymentId: "DEV-T20878131827IPTJY",
				payments: expect.arrayContaining([
					{
						name: "qris",
						type: "url",
						data: "https://tripay.co.id/qr/DEV-T20878131827IPTJY",
					} as Payment,
				]),
				items: [],
				state: "PAID",
			} as Transaction);
		});
	});
});
