import "dotenv/config";

const base = process.env.APP_URL ?? "http://localhost:3847";
const email = process.env.SEED_ADMIN_EMAIL ?? "admin@guesthouse.local";
const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMeOnFirstLogin!";

const jar = new Map();
let csrf = "";

function storeCookies(res) {
  for (const line of res.headers.getSetCookie?.() ?? []) {
    const [pair] = line.split(";");
    const [name, value] = pair.split("=");
    if (name && value) jar.set(name.trim(), value.trim());
  }
}
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

async function request(path, { method = "GET", body, formData } = {}) {
  const headers = { cookie: cookieHeader() };
  if (formData) {
    headers["x-csrf-token"] = csrf;
  } else if (body) {
    headers["content-type"] = "application/json";
    headers["x-csrf-token"] = csrf;
  }
  const res = await fetch(`${base}${path}`, {
    method,
    headers,
    body: formData ?? (body ? JSON.stringify(body) : undefined),
  });
  storeCookies(res);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${path} ${res.status} ${json?.error?.message ?? ""}`);
  return json;
}

csrf = (await request("/api/v1/csrf")).data.csrfToken;
await request("/api/v1/auth/login", { method: "POST", body: { email, password } });

const inv = await request("/api/v1/inventory");
const item = await request("/api/v1/inventory", {
  method: "POST",
  body: {
    name: `E2E Item ${Date.now()}`,
    categoryId: inv.data.categories[0].id,
    quantity: 5,
    minimumThreshold: 2,
    unit: "pieces",
  },
});
await request(`/api/v1/inventory?id=${item.data.item.id}`, {
  method: "PUT",
  body: { name: item.data.item.name + " Updated" },
});

const rooms = (await request("/api/v1/rooms")).data.rooms;
const checkIn = new Date();
checkIn.setFullYear(checkIn.getFullYear() + 2);
checkIn.setMonth(Math.floor(Math.random() * 12));
checkIn.setDate(10 + Math.floor(Math.random() * 10));
checkIn.setHours(14, 0, 0, 0);
const checkOut = new Date(checkIn);
checkOut.setDate(checkOut.getDate() + 2);
checkOut.setHours(11, 0, 0, 0);
const booking = await request("/api/v1/bookings", {
  method: "POST",
  body: {
    guest: { fullName: "E2E Guest" },
    checkIn: checkIn.toISOString(),
    checkOut: checkOut.toISOString(),
    guestCount: 2,
    source: "DIRECT",
    isWholeHouse: false,
    roomIds: [rooms[0].id],
    amountTotal: 1000,
  },
});
await request("/api/v1/bookings", {
  method: "PATCH",
  body: {
    id: booking.data.id,
    guest: { fullName: "E2E Guest Updated" },
    checkIn: checkIn.toISOString(),
    checkOut: checkOut.toISOString(),
    guestCount: 2,
    source: "DIRECT",
    status: "CONFIRMED",
    isWholeHouse: false,
    roomIds: [rooms[0].id],
    amountTotal: 1200,
  },
});

const tasks = (await request("/api/v1/cleaning/tasks")).data.tasks;
const pending = tasks.find((t) => t.status === "PENDING");
if (pending) {
  await request("/api/v1/cleaning/tasks", { method: "PATCH", body: { action: "start", taskId: pending.id } });
  const jpeg = Buffer.from(
    "/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDAREAAhEBAxEB/8QAFwABAQEBAAAAAAAAAAAAAAAAAAUGB//EABQBAQAAAAAAAAAAAAAAAAAAAAD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//Z",
    "base64",
  );
  const form = new FormData();
  form.append("file", new Blob([jpeg], { type: "image/jpeg" }), "e2e.jpg");
  form.append("purpose", "CLEANING_PHOTO");
  const up = await request("/api/v1/files", { method: "POST", formData: form });
  await request("/api/v1/cleaning/tasks", {
    method: "PATCH",
    body: { action: "attach_photo", taskId: pending.id, fileId: up.data.fileId },
  });
  await request("/api/v1/cleaning/tasks", {
    method: "PATCH",
    body: { action: "complete", taskId: pending.id },
  });
}

console.log("E2E_OK", { booking: booking.data.reference, item: item.data.item.id, cleaning: !!pending });
