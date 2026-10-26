import { DurableObject } from "cloudflare:workers";

interface Env {
	OPENWHATSAPP_CONTAINER: DurableObjectNamespace<OpenWhatsAppContainer>;
	SERVER_PORT: string;
	POSTGRES_AUTH_DB: string;
	POSTGRES_USERS_DB: string;
	GLOBAL_API_KEY: string;
	DATABASE_SAVE_MESSAGES: string;
	CLIENT_NAME: string;
	CONNECT_ON_STARTUP: string;
	MINIO_ENABLED: string;
	WEBHOOK_FILES: string;
	LOG_TYPE: string;
	DEBUG_ENABLED: string;
	OS_NAME?: string;
	WEBHOOK_URL?: string;
	AMQP_URL?: string;
	AMQP_GLOBAL_ENABLED?: string;
	NATS_URL?: string;
	NATS_GLOBAL_ENABLED?: string;
	MINIO_ENDPOINT?: string;
	MINIO_ACCESS_KEY?: string;
	MINIO_SECRET_KEY?: string;
	MINIO_BUCKET?: string;
	MINIO_USE_SSL?: string;
}

const API_INSTANCE_NAME = "openwhatsapp-primary";
const PORT = 8080;
const STARTUP_TIMEOUT_MS = 120_000;
const INACTIVITY_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export class OpenWhatsAppContainer extends DurableObject<Env> {
	private starting?: Promise<void>;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
	}

	async fetch(request: Request): Promise<Response> {
		this.starting ??= this.startAndWaitForHealth().finally(() => {
			this.starting = undefined;
		});
		await this.starting;

		const target = new URL(request.url);
		target.protocol = "http:";
		target.host = "container";
		const forwarded = new Request(target, request);
		forwarded.headers.delete("host");
		const container = this.ctx.container;
		if (!container) throw new Error("Cloudflare did not attach the API container");
		return container.getTcpPort(PORT).fetch(forwarded);
	}

	private async startAndWaitForHealth(): Promise<void> {
		const container = this.ctx.container;
		if (!container) throw new Error("Cloudflare did not attach the API container");
		if (!container.running) {
			const required = [
				["POSTGRES_AUTH_DB", this.env.POSTGRES_AUTH_DB],
				["POSTGRES_USERS_DB", this.env.POSTGRES_USERS_DB],
				["GLOBAL_API_KEY", this.env.GLOBAL_API_KEY],
			] as const;
			const missing = required.filter(([, value]) => !value).map(([name]) => name);
			if (missing.length > 0) {
				throw new Error(`Missing required Cloudflare secrets: ${missing.join(", ")}`);
			}

			container.start({
				image: container.images.base,
				instance: "basic",
				enableInternet: true,
				env: {
					SERVER_PORT: String(PORT),
					POSTGRES_AUTH_DB: this.env.POSTGRES_AUTH_DB,
					POSTGRES_USERS_DB: this.env.POSTGRES_USERS_DB,
					GLOBAL_API_KEY: this.env.GLOBAL_API_KEY,
					DATABASE_SAVE_MESSAGES: this.env.DATABASE_SAVE_MESSAGES || "true",
					CLIENT_NAME: this.env.CLIENT_NAME || "evolution",
					CONNECT_ON_STARTUP: this.env.CONNECT_ON_STARTUP || "true",
					MINIO_ENABLED: this.env.MINIO_ENABLED || "false",
					WEBHOOK_FILES: this.env.WEBHOOK_FILES || "false",
					LOG_TYPE: this.env.LOG_TYPE || "console",
					DEBUG_ENABLED: this.env.DEBUG_ENABLED || "INFO",
					...(this.env.OS_NAME ? { OS_NAME: this.env.OS_NAME } : {}),
					...(this.env.WEBHOOK_URL ? { WEBHOOK_URL: this.env.WEBHOOK_URL } : {}),
					...(this.env.AMQP_URL ? { AMQP_URL: this.env.AMQP_URL } : {}),
					...(this.env.AMQP_GLOBAL_ENABLED ? { AMQP_GLOBAL_ENABLED: this.env.AMQP_GLOBAL_ENABLED } : {}),
					...(this.env.NATS_URL ? { NATS_URL: this.env.NATS_URL } : {}),
					...(this.env.NATS_GLOBAL_ENABLED ? { NATS_GLOBAL_ENABLED: this.env.NATS_GLOBAL_ENABLED } : {}),
					...(this.env.MINIO_ENDPOINT ? { MINIO_ENDPOINT: this.env.MINIO_ENDPOINT } : {}),
					...(this.env.MINIO_ACCESS_KEY ? { MINIO_ACCESS_KEY: this.env.MINIO_ACCESS_KEY } : {}),
					...(this.env.MINIO_SECRET_KEY ? { MINIO_SECRET_KEY: this.env.MINIO_SECRET_KEY } : {}),
					...(this.env.MINIO_BUCKET ? { MINIO_BUCKET: this.env.MINIO_BUCKET } : {}),
					...(this.env.MINIO_USE_SSL ? { MINIO_USE_SSL: this.env.MINIO_USE_SSL } : {}),
				},
			});
		}

		await container.setInactivityTimeout(INACTIVITY_TIMEOUT_MS);
		const port = container.getTcpPort(PORT);
		const deadline = Date.now() + STARTUP_TIMEOUT_MS;
		let lastError: unknown;
		while (Date.now() < deadline) {
			try {
				const response = await port.fetch("http://container/health", {
					signal: AbortSignal.timeout(2_000),
				});
				await response.body?.cancel();
				if (response.ok) return;
				lastError = new Error(`API health check returned ${response.status}`);
			} catch (error) {
				lastError = error;
			}
			await new Promise((resolve) => setTimeout(resolve, 500));
		}

		throw new Error("OpenWhatsApp container did not become healthy within 120 seconds", {
			cause: lastError,
		});
	}
}

export default {
	fetch(request: Request, env: Env): Promise<Response> {
		return env.OPENWHATSAPP_CONTAINER.getByName(API_INSTANCE_NAME).fetch(request);
	},
} satisfies ExportedHandler<Env>;
