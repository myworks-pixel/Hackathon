import type { NextConfig } from "next";
import { parseClientEnv, parseServerEnv } from "./src/lib/env/schema";

// Validate configuration at startup without requiring unused integrations.
parseServerEnv(process.env);
parseClientEnv({ NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL });

const nextConfig: NextConfig = {};

export default nextConfig;
