import "dotenv/config";

const hostHeader = process.env.DIAG_HOST ?? "192.168.0.107:3847";
const base = process.env.APP_URL ?? "http://127.0.0.1:3847";
const email = process.env.SEED_ADMIN_EMAIL ?? "admin@guesthouse.local";
const password = process.env.SEED_ADMIN_PASSWORD ?? "";

if (!password) {
  console.error("SEED_ADMIN_PASSWORD not set");
  process.exit(1);
}

const jar = new Map();
function store(res) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}
const cookie = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

const csrfRes = await fetch(`${base}/api/v1/csrf`, {
  headers: { Host: hostHeader },
});
store(csrfRes);
const csrfJson = await csrfRes.json();
const csrf = csrfJson.data.csrfToken;

const loginRes = await fetch(`${base}/api/v1/auth/login`, {
  method: "POST",
  headers: {
    Host: hostHeader,
    Origin: `http://${hostHeader}`,
    "content-type": "application/json",
    "x-csrf-token": csrf,
    cookie: cookie(),
    "user-agent": "diag-lan-login/1.0",
  },
  body: JSON.stringify({
    email,
    password,
    clientDiag: {
      emailLength: email.length,
      passwordLength: password.length,
      passwordHadWhitespace: password !== password.trim(),
      emailStateMatchesDom: true,
      passwordStateMatchesDom: true,
    },
  }),
});
store(loginRes);
const loginJson = await loginRes.json().catch(() => ({}));
console.log(
  JSON.stringify(
    {
      hostHeader,
      status: loginRes.status,
      loginOk: loginRes.ok,
      statusField: loginJson?.data?.status ?? null,
      errorCode: loginJson?.error?.code ?? null,
      setSessionCookie: (loginRes.headers.getSetCookie?.() ?? []).some((c) =>
        c.startsWith("ghms_session="),
      ),
    },
    null,
    2,
  ),
);
