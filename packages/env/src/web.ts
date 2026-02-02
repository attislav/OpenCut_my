import { z } from "zod";

const webEnvSchema = z.object({
	// Node
	NODE_ENV: z.enum(["development", "production", "test"]),
	ANALYZE: z.string().optional(),
	NEXT_RUNTIME: z.enum(["nodejs", "edge"]).optional(),

	// Public
	NEXT_PUBLIC_SITE_URL: z.url().default("http://localhost:3000"),
	NEXT_PUBLIC_MARBLE_API_URL: z.url(),

	// Server
	DATABASE_URL: z
		.string()
		.startsWith("postgres://")
		.or(z.string().startsWith("postgresql://")),

	BETTER_AUTH_SECRET: z.string(),
	UPSTASH_REDIS_REST_URL: z.url(),
	UPSTASH_REDIS_REST_TOKEN: z.string(),
	MARBLE_WORKSPACE_KEY: z.string(),
	FREESOUND_CLIENT_ID: z.string(),
	FREESOUND_API_KEY: z.string(),
	CLOUDFLARE_ACCOUNT_ID: z.string(),
	R2_ACCESS_KEY_ID: z.string(),
	R2_SECRET_ACCESS_KEY: z.string(),
	R2_BUCKET_NAME: z.string(),
	MODAL_TRANSCRIPTION_URL: z.url(),
});

export type WebEnv = z.infer<typeof webEnvSchema>;

// Lazy-parse: only validate when a property is actually accessed at runtime.
// This prevents the build from failing when env vars are not yet available
// (e.g. during static page generation on Vercel).
let _cachedEnv: WebEnv | null = null;

function getEnv(): WebEnv {
	if (!_cachedEnv) {
		_cachedEnv = webEnvSchema.parse(process.env);
	}
	return _cachedEnv;
}

export const webEnv: WebEnv = new Proxy({} as WebEnv, {
	get(_, prop: string) {
		return getEnv()[prop as keyof WebEnv];
	},
});
