import type { LoaderFunctionArgs, MetaFunction } from "@remix-run/node";
import { json } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { getBaseUrl, getClientId } from "~/lib/oidc.server";

export const meta: MetaFunction = () => [
  { title: "SSO Sample Provider" },
];

export async function loader({ request }: LoaderFunctionArgs) {
  const baseUrl = getBaseUrl();
  const clientId = getClientId();
  return json({ baseUrl, clientId });
}

export default function Index() {
  const { baseUrl, clientId } = useLoaderData<typeof loader>();

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 24, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ borderBottom: "2px solid #5c6ac4", paddingBottom: 12 }}>
        🔐 Shopify SSO Sample Provider
      </h1>
      <p>
        This service is a sample OpenID Connect Identity Provider for testing
        Shopify&apos;s Customer Account SSO integration.
      </p>

      <h2>OIDC Endpoints</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f4f6f8" }}>
            <th style={thStyle}>Endpoint</th>
            <th style={thStyle}>URL</th>
            <th style={thStyle}>Spec</th>
          </tr>
        </thead>
        <tbody>
          {(
            [
              ["Discovery",            `${baseUrl}/.well-known/openid-configuration`, "https://openid.net/specs/openid-connect-discovery-1_0.html#ProviderMetadata",       "OIDC Discovery 1.0 §3"],
              ["JWKS",                 `${baseUrl}/.well-known/jwks.json`,            "https://www.rfc-editor.org/rfc/rfc7517",                                            "RFC 7517 (JWK)"],
              ["Authorization",        `${baseUrl}/authorize`,                        "https://openid.net/specs/openid-connect-core-1_0.html#AuthorizationEndpoint",        "OIDC Core 1.0 §3.1.2"],
              ["Token",                `${baseUrl}/token`,                            "https://openid.net/specs/openid-connect-core-1_0.html#TokenEndpoint",                "OIDC Core 1.0 §3.1.3"],
              ["UserInfo",             `${baseUrl}/userinfo`,                         "https://openid.net/specs/openid-connect-core-1_0.html#UserInfo",                     "OIDC Core 1.0 §5.3"],
              ["End Session (Logout)", `${baseUrl}/logout`,                           "https://openid.net/specs/openid-connect-rpinitiated-1_0.html#RPLogout",              "OIDC RP-Initiated Logout 1.0"],
            ] as [string, string, string, string][]
          ).map(([label, url, specUrl, specLabel]) => (
            <tr key={label}>
              <td style={tdStyle}>{label}</td>
              <td style={tdStyle}>
                <a href={url} style={{ color: "#5c6ac4" }}>{url}</a>
              </td>
              <td style={tdStyle}>
                <a href={specUrl} target="_blank" rel="noreferrer" style={{ color: "#5c6ac4" }}>{specLabel}</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Configuration</h2>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={tdStyle}><strong>Issuer URL</strong></td>
            <td style={tdStyle}><code>{baseUrl}</code></td>
          </tr>
          <tr>
            <td style={tdStyle}><strong>Client ID</strong></td>
            <td style={tdStyle}><code>{clientId}</code></td>
          </tr>
          <tr>
            <td style={tdStyle}><strong>Token Endpoint Auth Methods</strong></td>
            <td style={tdStyle}><code>client_secret_basic</code>, <code>client_secret_post</code></td>
          </tr>
          <tr>
            <td style={tdStyle}><strong>Signing Algorithm</strong></td>
            <td style={tdStyle}><code>RS256</code></td>
          </tr>
        </tbody>
      </table>

      <h2>Dummy Authentication</h2>
      <div style={{ background: "#fef3cd", padding: 16, borderRadius: 8, border: "1px solid #ffc107" }}>
        <p style={{ margin: 0 }}>
          <strong>⚠️ For testing only:</strong>{" "}
          Any email address and password will be accepted. No real authentication is performed.
        </p>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "10px 12px",
  textAlign: "left",
  border: "1px solid #ddd",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  border: "1px solid #ddd",
  verticalAlign: "top",
};
