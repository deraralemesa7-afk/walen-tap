require("dotenv").config();
const express = require("express");
const crypto = require("crypto");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const db = new Database(process.env.DB_FILE || "walen-tap.sqlite");
const PORT = Number(process.env.PORT || 3000);
const BOT_TOKEN = process.env.BOT_TOKEN || "";

db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS players (
  telegram_id TEXT PRIMARY KEY, username TEXT, first_name TEXT,
  coins INTEGER NOT NULL DEFAULT 0, energy INTEGER NOT NULL DEFAULT 1000,
  max_energy INTEGER NOT NULL DEFAULT 1000, tap_power INTEGER NOT NULL DEFAULT 1,
  last_energy_at INTEGER NOT NULL, last_daily_at INTEGER NOT NULL DEFAULT 0,
  referred_by TEXT, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS referrals (
  id INTEGER PRIMARY KEY AUTOINCREMENT, inviter_id TEXT NOT NULL,
  invitee_id TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL
);
`);
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "public")));

function verifyTelegramInitData(initData) {
  if (!BOT_TOKEN || !initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  if (!hash) return null;
  params.delete("hash");
  const dataCheckString = [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`).join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  const calculated = crypto.createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const a = Buffer.from(calculated, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const authDate = Number(params.get("auth_date") || 0);
  if (!authDate || Date.now() / 1000 - authDate > 86400) return null;
  try { return JSON.parse(params.get("user") || "null"); } catch { return null; }
}

function auth(req, res, next) {
  const user = verifyTelegramInitData(req.get("X-Telegram-Init-Data") || "");
  if (!user || !user.id) return res.status(401).json({ error: "Open WALEN TAP from your Telegram bot." });
  req.tgUser = user;
  next();
}
function refreshEnergy(player) {
  const now = Math.floor(Date.now() / 1000);
  const elapsed = Math.max(0, now - player.last_energy_at);
  const energy = Math.min(player.max_energy, player.energy + Math.floor(elapsed / 3));
  if (energy !== player.energy || player.last_energy_at < now - 3) {
    db.prepare("UPDATE players SET energy=?, last_energy_at=? WHERE telegram_id=?")
      .run(energy, now, player.telegram_id);
  }
  return { ...player, energy, last_energy_at: now };
}
function getPlayer(id) {
  const p = db.prepare("SELECT * FROM players WHERE telegram_id=?").get(String(id));
  return p ? refreshEnergy(p) : null;
}
function publicPlayer(p) {
  return {
    id: p.telegram_id, username: p.username, firstName: p.first_name,
    coins: p.coins, energy: p.energy, maxEnergy: p.max_energy,
    tapPower: p.tap_power, lastDailyAt: p.last_daily_at
  };
}
app.post("/api/start", auth, (req, res) => {
  const u = req.tgUser, id = String(u.id), now = Math.floor(Date.now()/1000);
  let p = getPlayer(id);
  if (!p) {
    const startParam = req.body && String(req.body.startParam || "");
    const inviter = startParam.startsWith("ref_") ? startParam.slice(4) : null;
    const validInviter = inviter && inviter !== id && db.prepare("SELECT telegram_id FROM players WHERE telegram_id=?").get(inviter) ? inviter : null;
    db.prepare(`INSERT INTO players (telegram_id,username,first_name,last_energy_at,referred_by,created_at)
      VALUES (?,?,?,?,?,?)`).run(id, u.username || "", u.first_name || "Player", now, validInviter, now);
    if (validInviter) {
      db.prepare("INSERT OR IGNORE INTO referrals(inviter_id,invitee_id,created_at) VALUES(?,?,?)").run(validInviter,id,now);
      db.prepare("UPDATE players SET coins=coins+500 WHERE telegram_id=?").run(validInviter);
      db.prepare("UPDATE players SET coins=coins+250 WHERE telegram_id=?").run(id);
    }
    p = getPlayer(id);
  } else {
    db.prepare("UPDATE players SET username=?,first_name=? WHERE telegram_id=?").run(u.username || "",u.first_name || "Player",id);
    p = getPlayer(id);
  }
  const referralCount = db.prepare("SELECT COUNT(*) AS n FROM referrals WHERE inviter_id=?").get(id).n;
  res.json({ player: publicPlayer(p), referralCount, botUsername: process.env.BOT_USERNAME || "" });
});
app.post("/api/tap", auth, (req,res) => {
  const id=String(req.tgUser.id), p=getPlayer(id);
  if(!p) return res.status(404).json({error:"Player not found"});
  const taps=Math.max(1,Math.min(20,Number(req.body.taps)||1));
  const allowed=Math.min(taps,p.energy);
  if(allowed<1) return res.status(400).json({error:"Not enough energy",player:publicPlayer(p)});
  const earned=allowed*p.tap_power;
  db.prepare("UPDATE players SET coins=coins+?,energy=energy-?,last_energy_at=? WHERE telegram_id=?")
    .run(earned,allowed,Math.floor(Date.now()/1000),id);
  res.json({player:publicPlayer(getPlayer(id)),earned});
});
app.post("/api/daily", auth, (req,res) => {
  const id=String(req.tgUser.id), p=getPlayer(id), now=Math.floor(Date.now()/1000);
  if(!p) return res.status(404).json({error:"Player not found"});
  if(now-p.last_daily_at<86400) return res.status(400).json({error:"Daily reward already claimed",player:publicPlayer(p)});
  db.prepare("UPDATE players SET coins=coins+1000,last_daily_at=? WHERE telegram_id=?").run(now,id);
  res.json({player:publicPlayer(getPlayer(id)),earned:1000});
});
app.get("/api/leaderboard", auth, (req,res) => {
  const rows=db.prepare("SELECT first_name,username,coins FROM players ORDER BY coins DESC LIMIT 20").all();
  res.json({leaders:rows});
});
app.get("/api/referrals", auth, (req,res) => {
  const id=String(req.tgUser.id);
  res.json({count:db.prepare("SELECT COUNT(*) AS n FROM referrals WHERE inviter_id=?").get(id).n});
});
app.get("/api/health", (req,res)=>res.json({ok:true,app:"WALEN TAP"}));
app.get("*",(req,res)=>res.sendFile(path.join(__dirname,"public","index.html")));
app.listen(PORT,()=>console.log(`WALEN TAP running on port ${PORT}`));
