// Admin API helper — resolves a Shopify customer GID to an email address.
// Results are cached in-memory since GIDs are immutable.
import { getCachedEmail, setCachedEmail } from "~/lib/shop-token-cache.server";

export async function fetchEmailByGid(
  shop: string,
  accessToken: string,
  gid: string
): Promise<string | undefined> {
  const cached = getCachedEmail(gid);
  if (cached) {
    console.log("[admin-api] GID→email cache hit:", gid, "→", cached);
    return cached;
  }

  const query = `query GetCustomerEmail($id: ID!) {
        customer(id: $id) { email }
      }`;
  const variables = { id: gid };
  console.log("[admin-api] GraphQL request → shop:", shop, "| query:", query.replace(/\s+/g, " ").trim(), "| variables:", JSON.stringify(variables));

  const res = await fetch(`https://${shop}/admin/api/2026-04/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  console.log("[admin-api] GraphQL response status:", res.status);

  if (!res.ok) {
    const errBody = await res.text();
    console.error("[admin-api] GraphQL request failed:", res.status, "body:", errBody);
    return undefined;
  }

  const json = (await res.json()) as {
    data?: { customer?: { email?: string } };
    errors?: unknown[];
  };

  console.log("[admin-api] GraphQL response body:", JSON.stringify(json));

  if (json.errors) {
    console.error("[admin-api] GraphQL errors:", JSON.stringify(json.errors));
  }

  const email = json.data?.customer?.email;
  if (email) {
    setCachedEmail(gid, email);
    console.log("[admin-api] GID→email resolved:", gid, "→", email);
  } else {
    console.warn("[admin-api] customer not found for GID:", gid);
  }

  return email;
}
