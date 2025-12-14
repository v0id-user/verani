import { Elysia } from "elysia";
import { CloudflareAdapter } from "elysia/adapter/cloudflare-worker";
import { docsRoutes } from "./routes/docs.js";

export default new Elysia({
	adapter: CloudflareAdapter,
})
	.use(docsRoutes)
	.compile();
