// Customer Account UI Extension — SSO Profile Sync
// Renders invisibly on the Profile page and runs once on mount (no polling).
// Sync is performed when the merchant setting "sync_enabled" is true (default: true).
//
//   Phase A (storage empty): Fetch SSO data via /userinfo, push to Customer Account API,
//                            cache the profile in storage, then navigate to refresh the page.
//   Phase B (storage present): Query current customer data, compare with cached SSO data,
//                              revert any customer-initiated changes by re-applying SSO data,
//                              then navigate to refresh the page.
//
// Navigation guard (sso_nav_guard) prevents an infinite loop after Phase A/B redirects.
// Toggle is controlled via the extension setting in the Shopify merchant admin (not customer-facing).

import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect } from "preact/hooks";

// Declare the global shopify object provided by the extension runtime
declare const shopify: {
  sessionToken: { get(): Promise<string> };
  storage: {
    read<T = unknown>(key: string): Promise<T | null>;
    write(key: string, data: unknown): Promise<void>;
    delete(key: string): Promise<void>;
  };
  navigation: { navigate(url: string): void };
  settings: { value: Record<string, string | number | boolean | undefined> | null };
  toast: { show(message: string, options?: { duration?: number }): void };
};

const STORAGE_KEY = "sso_profile_data";
const NAV_GUARD_KEY = "sso_nav_guard";
const SHOW_TOAST_KEY = "sso_show_toast";

const CUSTOMER_API_URL =
  "shopify://customer-account/api/2026-01/graphql.json";

// Replace with your deployed SSO server URL and redeploy the extension.
const SSO_BASE_URL = "https://open-id-connect-sso-sample.onrender.com";

// -- Types --

interface OidcAddress {
  street_address: string;
  locality: string;
  region: string;
  postal_code: string;
  country: string;
}

interface SsoProfile {
  sub: string;
  given_name: string;
  family_name: string;
  address: OidcAddress;
}

interface CustomerAddress {
  id: string;
  address1: string | null;
  address2: string | null;
  city: string | null;
  zoneCode: string | null;
  zip: string | null;
  territoryCode: string | null;
}

interface CustomerData {
  id: string;
  firstName: string | null;
  lastName: string | null;
  defaultAddress: CustomerAddress | null;
}

// -- Customer Account API helpers (global fetch is authenticated automatically) --

async function queryCustomer(): Promise<CustomerData | null> {
  const res = await fetch(CUSTOMER_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `query GetCustomer {
        customer {
          id firstName lastName
          defaultAddress { id address1 address2 city zoneCode zip territoryCode }
        }
      }`,
    }),
  });
  const json = await res.json();
  if (json?.errors) {
    console.error("[sso-sync] queryCustomer errors:", JSON.stringify(json.errors));
  }
  return json?.data?.customer ?? null;
}

async function updateCustomerName(
  firstName: string,
  lastName: string
): Promise<void> {
  await fetch(CUSTOMER_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `mutation CustomerUpdate($input: CustomerUpdateInput!) {
        customerUpdate(input: $input) {
          customer { id firstName lastName }
          userErrors { field message }
        }
      }`,
      variables: { input: { firstName, lastName } },
    }),
  });
}

async function upsertAddress(
  addressId: string | null,
  addr: OidcAddress
): Promise<void> {
  const lines = addr.street_address.split("\n");
  const address1 = lines[0] ?? "";
  const address2 = lines[1] ?? "";

  const addressInput = {
    address1,
    address2,
    city: addr.locality,
    zoneCode: addr.region,
    zip: addr.postal_code,
    territoryCode: addr.country,
  };

  if (addressId) {
    await fetch(CUSTOMER_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `mutation CustomerAddressUpdate($addressId: ID!, $address: CustomerAddressInput, $defaultAddress: Boolean) {
          customerAddressUpdate(addressId: $addressId, address: $address, defaultAddress: $defaultAddress) {
            customerAddress { id }
            userErrors { field message }
          }
        }`,
        variables: { addressId, address: addressInput, defaultAddress: true },
      }),
    });
  } else {
    await fetch(CUSTOMER_API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        query: `mutation CustomerAddressCreate($address: CustomerAddressInput!, $defaultAddress: Boolean) {
          customerAddressCreate(address: $address, defaultAddress: $defaultAddress) {
            customerAddress { id }
            userErrors { field message }
          }
        }`,
        variables: { address: addressInput, defaultAddress: true },
      }),
    });
  }
}

// -- Diff helper --

function profileMatchesCustomer(
  profile: SsoProfile,
  customer: CustomerData
): boolean {
  if (customer.firstName !== profile.given_name) return false;
  if (customer.lastName !== profile.family_name) return false;

  const addr = customer.defaultAddress;
  if (!addr) return false;

  const lines = profile.address.street_address.split("\n");
  const address1 = lines[0] ?? "";
  const address2 = lines[1] ?? "";

  return (
    addr.address1 === address1 &&
    addr.address2 === address2 &&
    addr.city === profile.address.locality &&
    addr.zoneCode === profile.address.region &&
    addr.zip === profile.address.postal_code &&
    addr.territoryCode === profile.address.country
  );
}

// -- Extension component --

function SsoProfileSync() {
  useEffect(() => {
    void run();

    async function run() {
      try {
        // Check merchant setting — defaults to enabled if not set
        const syncEnabled = shopify.settings.value?.sync_enabled ?? true;
        if (!syncEnabled) {
          console.log("[sso-sync] sync disabled by merchant setting");
          return;
        }

        // Check nav guard — cleared once after each sync-triggered navigation
        const guard = await shopify.storage.read(NAV_GUARD_KEY);
        if (guard) {
          await shopify.storage.delete(NAV_GUARD_KEY);
          // Show toast if sync just completed
          const showToast = await shopify.storage.read(SHOW_TOAST_KEY);
          if (showToast) {
            await shopify.storage.delete(SHOW_TOAST_KEY);
            shopify.toast.show(
              "Your name and address have been updated from the SSO server.",
              { duration: 5000 }
            );
          }
          return;
        }

        const stored = await shopify.storage.read<SsoProfile>(STORAGE_KEY);

        if (!stored) {
          // ── Phase A: Initial sync ─────────────────────────────────────────
          const token = await shopify.sessionToken.get();

          const res = await fetch(`${SSO_BASE_URL}/userinfo`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) {
            console.error("[sso-sync] userinfo fetch failed:", res.status);
            return;
          }
          const profile: SsoProfile = await res.json();

          const customer = await queryCustomer();
          if (!customer) {
            console.error("[sso-sync] failed to query customer");
            return;
          }

          await updateCustomerName(profile.given_name, profile.family_name);
          await upsertAddress(customer.defaultAddress?.id ?? null, profile.address);

          await shopify.storage.write(STORAGE_KEY, profile);
          await shopify.storage.write(NAV_GUARD_KEY, "1");
          await shopify.storage.write(SHOW_TOAST_KEY, "1");
          shopify.navigation.navigate("shopify:customer-account/profile");
        } else {
          // ── Phase B: Revert if customer edited profile ────────────────────
          const customer = await queryCustomer();
          if (!customer) {
            console.error("[sso-sync] failed to query customer");
            return;
          }

          if (!profileMatchesCustomer(stored, customer)) {
            console.log("[sso-sync] drift detected — reverting to SSO data");
            await updateCustomerName(stored.given_name, stored.family_name);
            await upsertAddress(
              customer.defaultAddress?.id ?? null,
              stored.address
            );
            await shopify.storage.write(NAV_GUARD_KEY, "1");
            await shopify.storage.write(SHOW_TOAST_KEY, "1");
            shopify.navigation.navigate("shopify:customer-account/profile");
          }
        }
      } catch (err) {
        console.error("[sso-sync] unexpected error:", err);
      }
    }
  }, []);

  // Render nothing — this extension is purely behavioral
  return null;
}

export default async () => {
  render(<SsoProfileSync />, document.body);
};
