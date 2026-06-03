# Shopify Customer Account SSO / OIDC FAQ

This FAQ is written for merchants, partners, and implementation teams planning a Shopify Customer Account SSO integration with a third-party OpenID Connect (OIDC) identity provider.

It focuses on practical implementation questions that often come up when replacing Multipass, integrating an existing SSO system, syncing customer profile data, or supporting multiple storefronts.

## Migration from Multipass

### Can Customer Account SSO replace Multipass?

Yes, for many authentication use cases, but it is not a drop-in replacement.

Multipass signs a customer into legacy customer accounts by generating a Shopify-specific login token. Customer Account SSO uses an OIDC authorization code flow where Shopify redirects the customer to a third-party identity provider, receives an authorization code, and exchanges that code for tokens.

The main migration work is not just changing the login endpoint. You need to review customer identifiers, profile sync behavior, session duration, checkout behavior, and any integrations that previously depended on Multipass-specific fields.

Public references:

- [Shopify Customer authentication developer docs](https://shopify.dev/docs/api/customer-authentication)
- [Connect a third-party identity provider](https://help.shopify.com/en/manual/customers/customer-accounts/new-customer-accounts/identity-provider)

### Is there an equivalent to `multipassIdentifier`?

Not currently as a directly queryable customer field.

In OIDC, the stable external identity is represented by the `sub` claim. Shopify uses that subject during authentication, but partners should not assume there is a public Admin API field that can be queried the same way `multipassIdentifier` was used in some legacy integrations.

If your integration needs to look up Shopify customers by an external system ID, plan an explicit mapping strategy. Common approaches include storing the external ID in a customer metafield, maintaining an external mapping table, or designing the integration around Shopify customer IDs after the first login.

### Can we query Shopify customers by OIDC `sub`?

Do not design the integration around querying Shopify customers by OIDC `sub`.

Use `sub` as the identity provider's stable subject for authentication. For operational lookups, reconciliation, CRM sync, order history display, or customer service workflows, use a separate mapping that your integration owns.

### What should we use as the OIDC `sub`?

Use a stable, unique, non-recycled identifier for the customer in the identity provider.

The `sub` value should not be an email address if the identity provider allows email changes. It should not be reused for another customer after deletion. It should remain the same for the same person across logins unless the account has intentionally been migrated, merged, or re-created according to a controlled process.

### Can the same `sub` be reused for multiple customers?

No. Treat `sub` uniqueness as a security requirement.

Reusing the same `sub` for different people can cause account-linking problems. A production identity provider should guarantee that one subject represents one customer identity.

### What happens if a customer changes their email address?

The identity provider should continue returning the same `sub` for the same person, even if the email address changes.

Email is important because Shopify requires `email` and `email_verified` in the ID token, but email should not be the only permanent identity key in the identity provider.

If the SSO system needs to change the customer's email address in Shopify, do not rely on returning the same `sub` with a different `email` claim during the next login. Shopify can continue authenticating the customer as the account already linked to that `sub`, and the new email address can be ignored for account-linking purposes.

The recommended operational pattern is to detect the email change in the SSO system and update the corresponding Shopify customer through the Admin API. This keeps the Shopify customer record aligned before the next login and avoids treating email changes as an implicit relinking mechanism.

Public reference:

- [ID token claim import](https://shopify.dev/docs/api/customer-authentication/claim-import)
- [Admin GraphQL `customerUpdate`](https://shopify.dev/docs/api/admin-graphql/latest/mutations/customerUpdate)

## Customer Data Sync

### What personal information can be synced to Shopify?

Shopify can import supported customer profile fields from ID token claims when customer data sync is enabled for the identity provider.

Supported examples include:

- Email address
- Email verification status
- First name
- Last name
- Phone number
- Address data
- Customer tags

Only `email` and `email_verified` are required for authentication. Other supported claims are imported only when valid and when sync settings allow them.

Public references:

- [ID token claim import](https://shopify.dev/docs/api/customer-authentication/claim-import)
- [Sync customer data](https://help.shopify.com/en/manual/customers/customer-accounts/sign-in-options/identity-provider/sync-customer-data)

### Which ID token claims map to Shopify customer fields?

Common mappings include:

| ID token claim | Shopify customer data |
| --- | --- |
| `email` | Customer email |
| `email_verified` | Email ownership verification |
| `given_name` | First name |
| `family_name` | Last name |
| `phone_number` | Default phone number |
| `address` | One address |
| `urn:shopify:customer:addresses` | Customer addresses |
| `urn:shopify:customer:tags` | Customer tags |

Public reference:

- [Shopify Customer authentication developer docs](https://shopify.dev/docs/api/customer-authentication)

### Does Shopify sync customer data on every login?

Yes, when Sync customer data is enabled, Shopify maps supported OIDC claims to customer fields on sign-in.

The exact write behavior depends on the overwrite setting:

- If overwrite is disabled, Shopify updates only empty fields.
- If overwrite is enabled, Shopify updates fields from the latest ID token values on login.

Public reference:

- [ID token claim import](https://shopify.dev/docs/api/customer-authentication/claim-import)

### Does Shopify require `email_verified`?

Yes. The identity provider must verify that the customer owns the email address and return `email_verified: true`.

If `email_verified` is missing or false, Shopify can block the login.

Public reference:

- [ID token claim import](https://shopify.dev/docs/api/customer-authentication/claim-import)

### Can customer tags be synced?

Yes. Tags can be imported through the `urn:shopify:customer:tags` claim.

Be careful with overwrite behavior. If the identity provider becomes the source of truth for tags and overwrite is enabled, the ID token can replace existing Shopify tags. Merchants should decide whether tags are owned by the identity provider, Shopify Admin workflows, marketing tools, loyalty tools, or another integration.

Public reference:

- [ID token claim import](https://shopify.dev/docs/api/customer-authentication/claim-import)

### Can addresses be synced?

Yes. Address data can be imported through supported address claims.

However, address ownership should be planned carefully. If customers update addresses in Shopify and the identity provider overwrites them on the next login, the merchant might see unexpected changes. Decide which system is authoritative for billing, shipping, and profile addresses.

Public reference:

- [ID token claim import](https://shopify.dev/docs/api/customer-authentication/claim-import)

### Does `/userinfo` run during login-time profile sync?

For this sample, login-time profile sync is delivered through ID token claims returned from `/token`. Do not assume `/userinfo` will be called as part of the login-time import path.

If your implementation needs Shopify to receive profile data at login, put the supported claims in the ID token and enable Sync customer data in Shopify Admin.

## SSO Server, Domains, and Multi-Store Setup

### Does the SSO/OIDC server need to be hosted on the same server or domain as Shopify?

No. The identity provider is expected to be an external OIDC provider and can run on its own domain.

Shopify needs to reach the provider's discovery document and token-related endpoints over HTTPS. The customer's browser also needs to reach the authorization and login pages. The important requirement is not a shared domain with Shopify, but correct OIDC discovery, redirect URI configuration, HTTPS, token signing, and endpoint availability.

Public reference:

- [Connect a third-party identity provider](https://help.shopify.com/en/manual/customers/customer-accounts/new-customer-accounts/identity-provider)

### Do the OIDC endpoints and login UI need to be on the same server?

Not necessarily.

A production architecture can separate the OIDC server from the login UI, as long as the OIDC server can complete the protocol correctly and access the customer profile data needed to issue tokens. If the login UI runs on a separate domain, design a secure handoff between the login application and the OIDC token issuer.

For this sample, split-server mode demonstrates that `/authorize` can redirect to an external login server. In production, both systems need a reliable way to share or retrieve authentication state and customer profile data.

### Can multiple Shopify stores connect to a single OIDC server?

Yes, if the identity provider is designed for multi-tenant use.

Each Shopify store should have its own client configuration or equivalent tenant configuration. At minimum, isolate:

- Client ID and client secret
- Allowed redirect URIs
- Store-specific claim rules
- Logout redirect behavior
- Data ownership and overwrite rules

A single OIDC server can serve multiple stores, but it should not treat all stores as one undifferentiated client unless the business and security model truly allows it.

### If multiple stores use the same OIDC server, does the customer need to log in again for each store?

Not always. The answer depends on the identity provider session.

If the customer already has an active session with the identity provider, the provider can often complete the second store's OIDC authorization flow without asking for credentials again. Shopify will still run a separate OIDC flow for each store, and each store should have its own client and redirect URI configuration.

This means "single sign-on" is controlled primarily by the identity provider's session policy, cookie domain, MFA policy, risk checks, and tenant rules.

### Can one Shopify store use multiple identity providers?

Plan for one primary customer-account authentication strategy per store unless the merchant has confirmed that the Shopify configuration and customer experience support the intended setup.

If the merchant has multiple customer populations, such as retail customers, B2B buyers, employees, or loyalty members, the identity provider can usually route users internally after the OIDC flow starts. Keep the Shopify-facing OIDC configuration as simple as possible.

## Technology Choices

### Does Shopify require a specific programming language or framework for OIDC?

No. Shopify does not require a specific programming language or framework for the identity provider.

The implementation must satisfy Shopify's OIDC and OAuth requirements, including authorization code flow support, required endpoints, supported token signing behavior, HTTPS, refresh token behavior, and correct ID token claims.

Public references:

- [Third-party identity provider requirements](https://help.shopify.com/en/manual/customers/customer-accounts/sign-in-options/identity-provider/requirements)
- [Shopify Customer authentication developer docs](https://shopify.dev/docs/api/customer-authentication)

### Is custom development always required?

No. You do not always need to build an OIDC server from scratch.

Shopify provides public setup guides for common identity platforms such as Auth0, Okta, Microsoft Entra ID, and Amazon Cognito. These platforms can often handle the OIDC protocol, login UI, sessions, MFA, password reset, and user lifecycle features.

Custom development is usually needed only when the merchant has special requirements, such as custom customer identifiers, complex profile claim generation, integration with a legacy user database, custom consent flows, or store-specific business logic.

Public references:

- [Auth0 provider guide](https://shopify.dev/docs/api/customer-authentication/provider-guides/auth0)
- [Okta provider guide](https://shopify.dev/docs/api/customer-authentication/provider-guides/okta)
- [Microsoft Entra ID provider guide](https://shopify.dev/docs/api/customer-authentication/provider-guides/microsoft-entra-id)
- [Amazon Cognito provider guide](https://shopify.dev/docs/api/customer-authentication/provider-guides/amazon-cognito)

### Can we use an existing IaaS, PaaS, or identity platform?

Yes. The hosting model is flexible as long as the provider is publicly reachable where required, uses HTTPS, and implements the required OIDC behavior.

Common options include:

- Existing enterprise identity platforms
- Managed customer identity platforms
- Cloud identity services
- A custom application hosted on IaaS or PaaS
- A hybrid model where a managed IdP handles login and a custom service adds Shopify-specific claims

The platform choice matters less than protocol compliance, operational reliability, security controls, and maintainability.

### What are the main reasons to build custom middleware even when using Auth0, Okta, Entra ID, or Cognito?

Custom middleware is useful when the identity platform cannot directly produce the exact Shopify claims or business behavior required.

Examples include:

- Mapping a legacy customer ID to a stable OIDC subject
- Building `urn:shopify:customer:tags` dynamically
- Producing Shopify address claims from an external profile database
- Applying store-specific claim rules for multiple Shopify stores
- Keeping an external ID to Shopify customer ID mapping
- Enforcing merchant-specific account eligibility rules

## Token, Session, and Endpoint Behavior

### Which OIDC endpoints does Shopify need?

The identity provider needs a valid OIDC discovery document and the endpoints required by Shopify's third-party identity provider configuration.

This typically includes:

- Discovery endpoint
- Authorization endpoint
- Token endpoint
- JWKS endpoint
- User info endpoint, if required by the provider behavior or selected provider type
- Logout-related behavior, if configured

Public reference:

- [Third-party identity provider requirements](https://help.shopify.com/en/manual/customers/customer-accounts/sign-in-options/identity-provider/requirements)

### Why does Shopify call `/token` server-to-server?

After the customer authenticates and the browser returns to Shopify with an authorization code, Shopify exchanges that code for tokens from the identity provider's token endpoint.

That token exchange is a back-channel server-to-server request. This is why the token endpoint must be reachable by Shopify's backend, not just by the customer's browser.

### Why can `/token` use a client secret while `/authorize` cannot?

The token endpoint is called server-to-server, so Shopify can authenticate confidentially using the configured client credentials.

The authorization endpoint is reached through the customer's browser. Do not rely on a client secret at the browser-facing authorization endpoint. Instead, validate the redirect URI, state, client ID, and PKCE parameters as appropriate for the flow.

### Why does OIDC login feel slow?

Start by measuring the identity provider's `/token` response time. Shopify calls `/token` server-to-server while completing the login, so a slow token endpoint directly affects the customer experience.

If `/token` responds quickly, temporarily disable customer data sync and compare the login behavior. This helps isolate whether claim import, overwrite behavior, address/tag payload size, or downstream customer updates are contributing to the delay.

If the delay appears after Shopify returns the customer to the storefront or account surface, the bottleneck may be outside the OIDC exchange. Theme code, storefront customizations, third-party scripts, or account-page UI work can slow the first rendered page after login. Use browser DevTools or equivalent real-browser tracing to inspect redirects, network timing, JavaScript execution, and rendering.

Public reference:

- [Third-party identity provider requirements](https://help.shopify.com/en/manual/customers/customer-accounts/sign-in-options/identity-provider/requirements)

### Are refresh tokens required?

For a good customer session experience, yes.

Shopify's provider guides call out refresh token support and the `offline_access` scope for providers such as Auth0. Without refresh tokens, Shopify cannot renew the customer session after the access token expires, so customers may be asked to sign in more often.

Public reference:

- [Auth0 provider guide](https://shopify.dev/docs/api/customer-authentication/provider-guides/auth0)

### Can we force customers to sign in more often?

Yes, but treat that as a deliberate session policy.

The identity provider controls token lifetimes, refresh token behavior, MFA prompts, risk checks, and reauthentication rules. Shorter sessions can improve security for sensitive stores, but they can also increase friction for customers.

### Does Shopify require PKCE?

Shopify's public requirements for third-party identity providers include OAuth/OIDC requirements that should be followed carefully. For production implementations, partners should support and validate PKCE where required by Shopify's configuration and current documentation.

Public reference:

- [Third-party identity provider requirements](https://help.shopify.com/en/manual/customers/customer-accounts/sign-in-options/identity-provider/requirements)

## Security and Production Readiness

### Can `/authorize` be protected with `client_secret`?

No. `/authorize` is a front-channel browser endpoint, so a client secret is not a suitable protection mechanism there.

Protect `/authorize` through standard OAuth/OIDC controls:

- Exact redirect URI allowlisting
- State validation
- PKCE validation where required
- Client ID validation
- Rate limiting
- Abuse detection
- Secure login and session handling

### How strict should redirect URI validation be?

Very strict.

Only allow the exact Shopify callback URLs shown in the Shopify Admin identity provider settings for the relevant store or client. Avoid wildcard redirect URIs unless the identity platform and the merchant's security team have explicitly approved the risk.

Public references:

- [Auth0 provider guide](https://shopify.dev/docs/api/customer-authentication/provider-guides/auth0)
- [Okta provider guide](https://shopify.dev/docs/api/customer-authentication/provider-guides/okta)

### What signing keys should the identity provider use?

Use stable, securely stored signing keys and expose the public keys through JWKS.

Do not generate a new signing key on each server restart in production. Plan for key rotation, monitoring, and emergency rollback. If multiple servers issue or validate tokens, make sure they use a consistent key strategy.

### Is this sample production-ready?

No. This repository is a sample implementation for testing and education.

Before production use, add or replace:

- Real authentication and account recovery
- Email ownership verification
- Persistent user and profile storage
- Persistent authorization code and token strategy where needed
- Secure signing key management and rotation
- Exact redirect URI allowlisting
- PKCE validation where required
- Rate limiting and abuse protection
- Monitoring, logging, and alerting
- Audit trails for identity and profile changes
- Secure Admin API token storage if Shopify Admin API calls are used

## Headless, Checkout, and Login UX

### Does Customer Account SSO automatically sign customers into every surface?

Not necessarily.

Customer Account SSO authenticates customers into Shopify customer accounts through the configured identity provider. Headless storefronts, Shopify-hosted checkout, Customer Account API sessions, and custom application sessions can each have different session mechanics.

For headless builds, explicitly test:

- Storefront sign-in
- Account page access
- Checkout sign-in link behavior
- Checkout recognition of the signed-in customer
- Return URLs
- Market-specific domains
- Logout behavior

### Can Hydrogen or a headless storefront use Customer Account SSO?

Yes, but headless implementations require careful design.

Hydrogen and other headless storefronts commonly use the Customer Account API for customer-facing account experiences. If the merchant also uses a third-party identity provider, test how the storefront, customer account flow, and Shopify-hosted checkout behave together.

Public references:

- [Customer Account API](https://shopify.dev/docs/api/customer)
- [Customer authentication developer docs](https://shopify.dev/docs/api/customer-authentication)

### Can the login page be customized?

Yes, the login experience is usually controlled by the identity provider.

If you use a managed identity platform, customization depends on that platform's hosted login page and branding options. If you build a custom login application, you control the login UI, but you also own the security, account recovery, MFA, bot protection, and operational burden.

### Can a theme page collect registration fields before sending the customer to login?

Yes, but a theme page by itself should be treated as a handoff experience, not as authoritative profile storage.

For example, a theme can collect an email address and pass it into the customer account login flow as a hint. If the merchant wants to persist first name, last name, consent, tags, or preferences, that requires app-side logic, identity-provider-side profile storage, Admin API writes, Customer Account API flows, or another approved data model.

### Does `login_hint` authenticate the customer?

No. `login_hint` can help prefill or route the login experience, but it does not prove identity.

The customer must still authenticate through Shopify Customer Accounts and the configured identity provider.

### Should market or country context depend on the HTTP `Referer` header?

No. Do not make market, country, or login routing depend on `Referer`.

Browsers, privacy tools, security products, redirects, and interstitial pages can remove or change `Referer`. Use explicit, supported routing signals and configured redirect URIs instead.

## Data Ownership and Operational Design

### Which system should be the source of truth for customer profile data?

Decide this before implementation.

For each field, choose whether the source of truth is:

- The identity provider
- Shopify customer records
- A CRM
- An ERP
- A loyalty platform
- A custom customer database

Then configure claim import and overwrite behavior to match that decision. Most production issues come from unclear ownership, especially for email, phone, addresses, tags, and consent-related fields.

### Can Shopify customer data still be edited in Shopify Admin?

Yes, but edits can be overwritten later if the identity provider syncs the same fields with overwrite enabled.

Make sure merchant operations teams understand which fields they can safely edit in Shopify and which fields will be controlled by the identity provider on the next login.

### Can custom fields be synced through OIDC claims?

Only supported claims are imported into standard Shopify customer fields through the OIDC claim import flow.

For merchant-specific data, use an appropriate Shopify data model or integration pattern, such as customer metafields, metaobjects, an app backend, Customer Account API, Admin API, or an external system of record.

### Should we use webhooks or batch jobs for downstream sync?

It depends on volume and consistency requirements.

Webhooks are useful for near-real-time reactions to customer changes. Batch jobs can be safer for high-volume reconciliation, backfills, or periodic enforcement of an external source of truth.

For large merchants, consider a scheduled job that queries customers updated since the last run and applies changes in a controlled, observable way.

## Implementation Checklist

### What should partners confirm before starting an OIDC implementation?

Confirm the following with the merchant:

- Shopify Plus eligibility and Customer Accounts configuration
- Whether the merchant is migrating from Multipass
- The permanent customer identifier strategy
- Whether `sub` is stable, unique, and non-recycled
- Whether email ownership is verified before returning `email_verified: true`
- Which profile fields Shopify should import
- Whether Shopify should overwrite existing customer data
- Who owns tags, phone numbers, addresses, and consent-related fields
- Whether multiple Shopify stores will use the same identity provider
- Whether each store has separate client credentials and redirect URIs
- Whether customers should have SSO across stores
- Required session duration and reauthentication behavior
- Headless, Hydrogen, checkout, and account page expectations
- Whether an existing IdP can be used instead of custom development
- What custom middleware is needed for Shopify-specific claims or mappings
- Production monitoring, support ownership, and incident response

### What should be tested before launch?

Test at least:

- New customer login
- Existing customer login
- Email change behavior
- Same email with unexpected subject behavior
- Same subject with unexpected email behavior
- ID token claim import
- Sync with overwrite disabled
- Sync with overwrite enabled
- Tags and address sync
- Refresh token renewal
- Logout and return URL behavior
- Multiple stores, if applicable
- Multiple markets or domains, if applicable
- Headless storefront login, if applicable
- Shopify-hosted checkout login, if applicable
- Customer support lookup and reconciliation workflows
- Failure handling when the identity provider is unavailable
