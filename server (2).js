import express from "express";
import admin from "firebase-admin";

const app = express();
app.use(express.json({ limit: "32kb" }));

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

let firebaseReady = false;
try {
  const privateKey = required("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: required("FIREBASE_PROJECT_ID"),
      clientEmail: required("FIREBASE_CLIENT_EMAIL"),
      privateKey
    })
  });
  firebaseReady = true;
} catch (error) {
  console.error(`Firebase is not configured: ${error.message}`);
}

app.get("/health", (_req, res) => {
  res.json({ ok: true, firebaseReady });
});

// This endpoint is intentionally protected. Only an authorized server-side
// integration/webhook should call it; never expose Firebase Admin credentials.
app.post("/sync-user", async (req, res) => {
  if (req.get("x-sync-secret") !== process.env.SYNC_SECRET) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  if (!firebaseReady) return res.status(503).json({ error: "Firebase is not configured" });

  const phone = String(req.body.phone || "").replace(/\D/g, "");
  const registered = req.body.registered === true;
  const balance = Number(req.body.balance);
  if (phone.length < 10 || !Number.isFinite(balance)) {
    return res.status(400).json({ error: "phone and numeric balance are required" });
  }

  await admin.database().ref(`users/${phone}`).update({
    registered,
    balance,
    updatedAt: admin.database.ServerValue.TIMESTAMP
  });
  res.json({ ok: true, phone, registered, balance });
});

const port = Number(process.env.PORT || 10000);
app.listen(port, "0.0.0.0", () => console.log(`Server listening on ${port}`));
