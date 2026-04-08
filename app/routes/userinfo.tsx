// UserInfo Endpoint (OIDC Core 1.0, Section 5.3)
// Accepts both:
//   - Shopify session tokens (HS256, signed with SHOPIFY_API_SECRET)
//   - OIDC access tokens (RS256, signed with this server's RSA private key)
import type { LoaderFunctionArgs } from "@remix-run/node";
import { jwtVerify } from "jose";
import { getPublicKey } from "~/lib/keys.server";
import { getBaseUrl } from "~/lib/oidc.server";
import { getSsoTestProfile } from "~/lib/store.server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

function unauthorized() {
  return new Response(JSON.stringify({ error: "invalid_token" }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders,
      "WWW-Authenticate": 'Bearer error="invalid_token"',
    },
  });
}

export async function loader({ request }: LoaderFunctionArgs) {
  // CORS preflight
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const authHeader = request.headers.get("Authorization") || "";
  if (!authHeader.startsWith("Bearer ")) {
    return unauthorized();
  }

  const token = authHeader.slice(7);

  // Try Shopify session token (HS256) first, then fall back to OIDC access token (RS256)
  let sub: string | undefined;
  let email: string | undefined;

  // Path 1: Shopify session token — HS256 signed with SHOPIFY_API_SECRET
  const shopifySecret = process.env.SHOPIFY_API_SECRET;
  if (shopifySecret) {
    try {
      const secretKey = new TextEncoder().encode(shopifySecret);
      const { payload } = await jwtVerify(token, secretKey, {
        algorithms: ["HS256"],
      });
      // Shopify session tokens do not include a `sub` claim — use `jti` as identifier
      const p = payload as Record<string, unknown>;
      sub = (payload.sub ?? p.jti ?? p.aud) as string | undefined;
      const dest = p.dest as string | undefined;
      try {
        email = dest ? `customer@${new URL(dest).hostname}` : undefined;
      } catch {
        email = undefined;
      }
      console.log("[userinfo] verified via HS256 (Shopify session token) | payload:", JSON.stringify(payload));
    } catch (err) {
      console.log("[userinfo] HS256 verification failed, falling back to RS256 |", (err as Error).message);
    }
  } else {
    console.log("[userinfo] SHOPIFY_API_SECRET not set — skipping HS256 path");
  }

  // Path 2: OIDC access token — RS256 signed with this server's RSA key
  if (!sub) {
    try {
      const publicKey = await getPublicKey();
      const baseUrl = getBaseUrl();
      const { payload } = await jwtVerify(token, publicKey, {
        issuer: baseUrl,
      });
      sub = payload.sub;
      email = (payload as Record<string, unknown>).email as string | undefined;
      console.log("[userinfo] verified via RS256 (OIDC access token) | sub:", sub);
    } catch (err) {
      console.log("[userinfo] RS256 verification failed |", (err as Error).message);
      return unauthorized();
    }
  }

  if (!sub) {
    return unauthorized();
  }

  const profile = getSsoTestProfile(sub);

  const responseBody = {
    sub,
    email: email ?? `${sub}@test.invalid`,
    email_verified: true,
    given_name: profile.given_name,
    family_name: profile.family_name,
    address: profile.address,
  };
  console.log("[userinfo] response:", JSON.stringify(responseBody));

  return new Response(JSON.stringify(responseBody), {
    status: 200,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}
