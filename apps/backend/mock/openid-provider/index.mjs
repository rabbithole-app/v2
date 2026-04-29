import express from 'express';
import { importJWK, SignJWT } from 'jose';

const ISSUER = process.env.OPENID_ISSUER ?? 'https://openid.localhost';
const CLIENT_ID = 'internet_identity';
const PORT = 11105;

const app = express();
const accounts = new Map();

const publicJwk = {
  alg: 'RS256',
  e: 'AQAB',
  kid: 'de469c90b37707c953820de60364d5a1dfc79884',
  kty: 'RSA',
  n: 'xlTPtK8pWljOaeumwnCFNOaz4hxuAyHIROAuLD8cc7k5q4TJKK7yFBLSxUwHrEKNCKa90b7PN-RYK54uYoLRvaZqf5qRpIlrp_O9qJppMiMyyHK3fRguNz6sewp_Hcwjg0dTPcPva0nzfg6FRDltgXbbeyLhXf8UK47GycT5ZEkBQS-5quX440j8fjLYmjAt8djSEW_X2MB2F_tbLoM4mz61qF7LrUq2hux6wwOwZmMRifnQnqRG-eZJRwCn6A2V3rHNTcUXUV7U-1G6Y9o55WYZarD6SX7jdYNZ217gfsYY2NvzMkxQN2AUJvIe2bQ7sfTqiq6rvZ-6rHp5OU7hRw',
  use: 'sig',
};
const privateKey = await importJWK({
  ...publicJwk,
  d: 'PkHsS5c6n3JGJWjEWcARiJgs-nsbK5-Eqt5GkDwldcw8prNRpBQ6yINaJ3Xk6LWhaQhSiM9hY_WpmdOXUvQm2-YsAy9lraU3pqq0LAOApyz2aYbdQ4b-JvhlE2Cpo5Rrx29x2W8yrlax-S2cttxiHCRP5HkADs4eKkgw7bCH6usUJqtLgPG5e5m-igjknglOqFsTRCgqN7cejQmwvGxLsZwML-Xulu8ICSpueYVBGvBsLXYJnnkFVxihHXJCl2IPm0TFoSkiZxtqjlWj9YXZwvZlD1dstwDv3WSQE_Tpo8ZOXHlgZnkn8v3X6Q6WEv3LDbJc7zDd3GH6lUTd-6w_kQ',
  dp: 'HbPiyUFAgSfDl99SOlfsQQZlcQLGLPgq4fvXIm8wAFZjfm5Ugr9Kit_UNwA7k9D8ooh6mOTYDvwocV2nwFGUsm9lVglu6nNm0HkwdXEv4kFH6HcF13lDVXSaGfEJIoTvD2VzUjqoNYLUFmqPSf4UX12ObLiRE00jXSpawyoc_3M',
  dq: 'H-CuADsFUkArZcLUvSbMCPxRUMaQCGzErYNjY3J6DQs8LYpzgP0H-czEKSJtqLyswP5w3K02g6HHxVjtbsILO5CcyOSqdWRUXycJ0aQE6tt_tJ3KgOfB20GeplVsrk35Nt2mvKW4Ol59AOwq0kl1-J2fFUKOXIKgPQwo8Qz3k6E',
  p: '7rQEDdBG5Tsyb2ghM7T-DVSdkXHlLvEFf5FI7oZe2d8IiGxUyqi9bFg-vzCk3wZi_p9RQO6bgnCNj98i8DBgDzJQWFxSXk-WJJpZ7Qc697e9wV8IVZvSoUn5_WYWpqE3Ckf49UtyvgQBa5mXO0d9lMNwTA_gusmuhDaek4GPGfc',
  q: '1LPj3-p1ojVsAdSXK55ykkevBZMS5WIvfu7fmSXvno3shj7kuPaxucA_H9A4LA6HyNPlZEvF2OlpvqZcQhWiANR7emHGZnOqZHy3Fz6sGNLfNu3-MZSVlM-6Jb4VrZpWjdzNpvo8kyz4UmR-8Xazr9ETujD9hpFaHt69_EvqHzE',
  qi: 'v4uQF8Qe2gm2a2v8W3BROWwPCwE0gWZj-5GWzECO4owtBTt4aMmTdk9kRns44mL92epjbxKIy-VplAezVhUv9CziQJT4l6lDatUk0qhW7VMSsnpyiqYlzwHKn3ow9AOTyVMCF9vumnC9jKkUGnZNz7yqIyVheJALdZJB3X9iqz8',
}, 'RS256');

app.use(express.urlencoded({ extended: false }));
app.use(express.json());
app.use((req, _res, next) => {
  console.log(`${req.method} ${req.originalUrl}`);
  next();
});

app.get('/health', (_req, res) => {
  res.status(200).send('ok');
});

app.get('/.well-known/openid-configuration', (_req, res) => {
  res.json({
    authorization_endpoint: `${ISSUER}/auth`,
    claims_supported: ['sub', 'name', 'email', 'preferred_username', 'email_verified'],
    id_token_signing_alg_values_supported: ['RS256'],
    issuer: ISSUER,
    jwks_uri: `${ISSUER}/jwks`,
    response_modes_supported: ['fragment'],
    response_types_supported: ['code id_token'],
    scopes_supported: ['openid', 'profile', 'email'],
    subject_types_supported: ['public'],
  });
});

app.get('/.well-known/ii-openid-configuration', (_req, res) => {
  res.json({
    client_id: CLIENT_ID,
    name: 'Dev OpenID',
    openid_configuration: `${ISSUER}/.well-known/openid-configuration`,
  });
});

app.get('/jwks', (_req, res) => {
  res.json({ keys: [publicJwk] });
});

app.post('/account/:id/claims', (req, res) => {
  accounts.set(req.params.id, req.body);
  res.status(201).send();
});

app.get('/auth', (req, res) => {
  const query = new URLSearchParams(
    Object.entries(req.query).flatMap(([key, value]) =>
      Array.isArray(value)
        ? value.map((item) => [key, String(item)])
        : [[key, String(value)]],
    ),
  );

  res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Dev OpenID</title>
    <style>
      body { font-family: system-ui, sans-serif; display: grid; min-height: 100vh; place-items: center; margin: 0; background: #f7f7f8; color: #18181b; }
      main { width: min(360px, calc(100vw - 32px)); }
      form { display: grid; gap: 12px; }
      label { display: grid; gap: 6px; font-size: 14px; font-weight: 600; }
      input, button { height: 42px; border-radius: 8px; border: 1px solid #d4d4d8; padding: 0 12px; font: inherit; }
      button { border-color: #18181b; background: #18181b; color: white; font-weight: 700; cursor: pointer; }
      p { color: #71717a; }
    </style>
  </head>
  <body>
    <main>
      <h1>Dev OpenID</h1>
      <p>Use any account id. Claims can be set through <code>POST /account/:id/claims</code>.</p>
      <form method="post" action="/auth?${escapeHtml(query.toString())}">
        <label>
          Account id
          <input name="account" value="local-dev-user" autofocus>
        </label>
        <label>
          Name
          <input name="name" value="Local Dev">
        </label>
        <label>
          Email
          <input name="email" value="dev@rabbithole.local" type="email">
        </label>
        <button type="submit">Sign in</button>
      </form>
    </main>
  </body>
</html>`);
});

app.post('/auth', async (req, res) => {
  const params = req.query;
  const accountId = req.body.account || 'local-dev-user';
  const accountClaims = accounts.get(accountId) ?? {};
  const redirectUri = getString(params.redirect_uri);
  const state = getString(params.state);
  const nonce = getString(params.nonce);
  const clientId = getString(params.client_id);

  if (!redirectUri || !isAllowedRedirectUri(redirectUri)) {
    res.status(400).send('Invalid redirect_uri');
    return;
  }
  if (clientId !== CLIENT_ID) {
    res.status(400).send('Invalid client_id');
    return;
  }
  if (!nonce) {
    res.status(400).send('Missing nonce');
    return;
  }

  const claims = {
    email: req.body.email || `dev+${accountId}@rabbithole.local`,
    email_verified: true,
    name: req.body.name || accountId,
    nonce,
    preferred_username: accountId,
    ...accountClaims,
  };
  const idToken = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid })
    .setIssuer(ISSUER)
    .setAudience(CLIENT_ID)
    .setSubject(accountId)
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(privateKey);

  const fragment = new URLSearchParams({
    code: 'dev-openid-code',
    id_token: idToken,
    state,
  });
  res.redirect(302, `${redirectUri}#${fragment.toString()}`);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Dev OpenID provider listening at ${ISSUER}`);
});

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function getString(value) {
  if (Array.isArray(value)) return value[0] ? String(value[0]) : undefined;
  return value == null ? undefined : String(value);
}

function isAllowedRedirectUri(value) {
  return /^https?:\/\/[a-z0-9-]+\.localhost(?::8000)?\/callback$/.test(value);
}
