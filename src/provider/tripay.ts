import { PaymentError } from "../error";
import { HMAC, hmac } from "../hash";
import {
	Channel,
	ChannelCategory,
	CreateTransaction,
	Payment,
	PaymentGateway,
	Transaction,
	TransactionItem,
	TransactionState,
} from "../types";
import { USER_AGENT } from "../utils";

export class TripayError extends PaymentError {}

export type TripayOptions = {
	feeItemSku?: string;
	baseUrl?: URL | string;
	production?: boolean;
	/** apikey for authenticaing each requests */
	apikey: string;
	/** privateKey for verify callback signature and signing request */
	privateKey: string;
	merchantCode: string;
};

const TRIPAY_SANDBOX_URL = new URL("https://tripay.co.id/api-sandbox/");
const TRIPAY_PRODUCTION_URL = new URL("https://tripay.co.id/api/");

/**
 * only supporting tripay closed payment and customer only fee
 */
export class Tripay extends PaymentGateway {
	#baseUrl: URL;
	#apikey: string;
	#merchantCode: string;
	#hmac: HMAC;

	constructor(options: TripayOptions) {
		super(options.feeItemSku);
		if (options.baseUrl) {
			this.#baseUrl = new URL(options.baseUrl.toString());
		} else if (options.production) {
			this.#baseUrl = TRIPAY_PRODUCTION_URL;
		} else {
			this.#baseUrl = TRIPAY_SANDBOX_URL;
		}
		this.#apikey = options.apikey;
		this.#merchantCode = options.merchantCode;
		this.#hmac = hmac("SHA-256", options.privateKey);
	}

	async #fetch<T>(
		path: string,
		init: RequestInit & { json?: any; params?: Record<string, string> } = {},
	): Promise<T> {
		init = { ...init };
		const url = new URL(path, this.#baseUrl);
		const h = init.headers = new Headers(init.headers);
		h.set("Authorization", `Bearer ${this.#apikey}`);
		h.set("user-agent", USER_AGENT);
		if (init.json) {
			init.method ||= "POST";
			init.body = JSON.stringify(init.json);
			h.set("content-type", "application/json");
		} else if (init.params) {
			for (const [k, v] of Object.entries(init.params)) {
				url.searchParams.set(k, v);
			}
		}
		const res = await fetch(url.href, init);
		const body = await res.json();
		console.log(body);
		console.log(init);
		if (!res.ok && !body.success) {
			throw new TripayError(body.message || "unknown error");
		}
		return body.data;
	}

	#channelCategory(group: string): ChannelCategory {
		if (group === "Virtual Account") {
			return "virtual account";
		}
		if (group === "Convenience Store") {
			return "store";
		}
		if (group === "E-Wallet") {
			return "e-wallet";
		}
		return "unknown";
	}

	#transformTripayTransaction(tx: TripayTransaction): Transaction {
		const payments = [] as Payment[];
		if (tx.payment_method.toLowerCase().includes("qris")) {
			payments.push({
				name: "qris",
				type: "url",
				data: tx.qr_url!,
			});
		} else if (tx.pay_url) {
			payments.push({
				name: tx.payment_method.toLowerCase(),
				type: "url",
				data: tx.pay_url,
			});
		} else {
			payments.push({
				name: tx.payment_method.toLowerCase(),
				type: "code",
				data: tx.pay_code,
			});
		}
		return {
			id: tx.merchant_ref,
			items: tx.order_items.map<TransactionItem>(t => ({
				price: t.price,
				quantity: t.quantity,
				sku: t.name,
			})),
			paymentId: tx.reference,
			state: tx.status as TransactionState,
			payments,
			amount: tx.amount,
			customer: {
				email: tx.customer_email,
				name: tx.customer_name,
				phone: tx.customer_phone,
			},
		};
	}

	async channels(): Promise<Channel[]> {
		const channels = await this.#fetch<TripayChannel[]>("merchant/payment-channel");
		return channels.map<Channel>(ch => ({
			category: this.#channelCategory(ch.group),
			fee: {
				flat: ch.fee_customer.flat || 0,
				percent: ch.fee_customer.percent || 0,
				min: ch.minimum_fee || 0,
				max: ch.maximum_fee || 0,
			},
			id: ch.code,
			imageUrl: ch.icon_url,
			name: ch.name,
		}));
	}

	async create(transaction: CreateTransaction): Promise<Transaction> {
		const amount = transaction.items.reduce((p, i) => p + (i.price * i.quantity), 0);
		const signature = await this.#hmac.sign(`${this.#merchantCode}${transaction.id}${amount}`);
		const tripayTransaction: TripayTransactionCreate = {
			amount,
			method: transaction.channel,
			order_items: transaction.items.map<TripayTransactionItem>((t) => ({
				name: t.sku,
				price: t.price,
				quantity: t.quantity,
			})),
			signature,
			customer_email: transaction.customer?.email,
			customer_name: transaction.customer?.name,
			customer_phone: transaction.customer?.phone,
			merchant_ref: transaction.id,
		};
		return this.#fetch<TripayTransaction>("transaction/create", {
			json: tripayTransaction,
		})
			.then(this.#transformTripayTransaction);
	}

	async get(transactionId: string): Promise<Transaction> {
		return this.#fetch<TripayTransaction>("transaction/detail", {
			params: {
				reference: transactionId,
			},
		})
			.then(this.#transformTripayTransaction);
	}

	async verifyCallback(body: string, headers: Headers): Promise<Transaction> {
		const signature = headers.get("X-Callback-Signature");
		if (!signature) {
			throw new TripayError("missing signature in \"X-Callback-Signature\" header");
		}
		const ok = await this.#hmac.verify(body, signature);
		if (!ok) {
			throw new TripayError("invalid signature in \"X-Callback-Signature\" header");
		}
		const json = JSON.parse(body) as TripayTransaction;
		return this.#transformTripayTransaction(json);
	}
}

type TripayChannel = {
	"group": string;
	"code": string;
	"name": string;
	"type": string;
	"fee_merchant": {
		"flat": number;
		"percent": number;
	};
	"fee_customer": {
		"flat": number;
		"percent": number;
	};
	"total_fee": {
		"flat": number;
		"percent": string;
	};
	"minimum_fee": 4000;
	"maximum_fee": 4500;
	"icon_url": string;
	"active": true;
};

type TripayTransaction = {
	"reference": string;
	"merchant_ref": string;
	"payment_selection_type": string;
	"payment_method": string;
	"payment_name": string;
	"customer_name": string;
	"customer_email": string;
	"customer_phone": string;
	"callback_url": string;
	"return_url": string;
	"amount": number;
	"fee_merchant": number;
	"fee_customer": number;
	"total_fee": number;
	"amount_received": number;
	"pay_code": string;
	"pay_url": null | string;
	"checkout_url": string;
	"status": string;
	"expired_time": number;
	"order_items": TripayTransactionItem[];
	"instructions": [
		{
			"title": string;
			"steps": [
				"Login ke internet banking Bank BRI Anda",
				"Pilih menu <b>Pembayaran</b> lalu klik menu <b>BRIVA</b>",
				"Pilih rekening sumber dan masukkan Kode Bayar (<b>57585748548596587</b>) lalu klik <b>Kirim</b>",
				"Detail transaksi akan ditampilkan, pastikan data sudah sesuai",
				"Masukkan kata sandi ibanking lalu klik <b>Request</b> untuk mengirim m-PIN ke nomor HP Anda",
				"Periksa HP Anda dan masukkan m-PIN yang diterima lalu klik <b>Kirim</b>",
				"Transaksi sukses, simpan bukti transaksi Anda",
			];
		},
	];
	"qr_string": null | string;
	"qr_url": null | string;
};

type TripayTransactionCreate = {
	method: string;
	merchant_ref?: string;
	amount: number;
	customer_name?: string;
	customer_email?: string;
	customer_phone?: string;
	order_items: TripayTransactionItem[];
	signature: string;
};

type TripayTransactionItem = {
	name: string;
	price: number;
	quantity: number;
} & Record<string, any>;
