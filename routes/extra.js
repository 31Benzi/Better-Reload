const express = require("express");
const app = express.Router();
const log = require("../structs/log.js");
const { verifyToken } = require("../tokenManager/tokenVerify.js");
const User = require("../model/user.js");

// Profile / Settings
app.put("/profile/play_region", verifyToken, (req, res) => {
    res.status(204).end();
});

app.put("/profile/languages", verifyToken, (req, res) => {
    res.status(204).end();
});

app.put("/profile/privacy_settings", verifyToken, (req, res) => {
    res.status(204).end();
});

app.get("/epic/friends/v1/:accountId/blocklist", verifyToken, (req, res) => {
    res.json({ accountId: req.params.accountId, blocklist: [] });
});

app.get("/api/v2/interactions/latest/Fortnite/:accountId", verifyToken, (req, res) => {
    res.json([]);
});

app.get("/api/v2/interactions/aggregated/Fortnite/:accountId", verifyToken, (req, res) => {
    res.json([]);
});

app.get("/api/v1/lfg/Fortnite/users/:accountId/settings", verifyToken, (req, res) => {
    res.json({});
});

app.get("/party/api/v1/Fortnite/user/:accountId/settings/privacy", verifyToken, (req, res) => {
    res.json({});
});

app.get("/content-controls/:accountId", verifyToken, (req, res) => {
    res.json({});
});

app.get("/socialban/api/public/v1/*", verifyToken, (req, res) => {
    res.json({ bans: [], warnings: [] });
});

// Content / General
app.get("/hotconfigs/v2/livefn.json", (req, res) => {
    res.json({});
});

app.get("/api/content/v2/launch-data", (req, res) => {
    res.json({});
});

app.get("/app_installation/status", (req, res) => {
    res.json({});
});

app.post("/api/v1/links/lock-status/:accountId/check", verifyToken, (req, res) => {
    res.json({ results: [] });
});

app.get("/api/v1/links/history/:accountId", verifyToken, (req, res) => {
    res.json({ results: [] });
});

app.post("/api/v1/links/history/:accountId/:mnemonic", verifyToken, (req, res) => {
    res.status(204).end();
});

app.get("/api/v1/access/fortnite/*", (req, res) => {
    res.status(204).end();
});

// Account Search by ID List
app.get("/api/v1/public/accounts", async (req, res) => {
    let accountIds = req.query.accountId;
    if (!accountIds) return res.json([]);
    if (!Array.isArray(accountIds)) accountIds = [accountIds];

    let users = await User.find({ accountId: { $in: accountIds } }).lean();
    let response = users.map(u => ({
        id: u.accountId,
        displayName: u.username,
        externalAuths: {}
    }));
    res.json(response);
});

// Surfaces / MOTD
app.post(["/fortnite/api/fortnite-br/surfaces/dmotd/target", "/api/v1/fortnite-br/surfaces/dmotd/target"], (req, res) => {
    res.json({});
});

// Ratings
app.get("/gameRating/gameRating/*", (req, res) => {
    res.redirect("https://i.imgur.com/ImIwpRm.png");
});

// OAuth Extras
app.post("/epic/oauth/v2/tokenInfo", (req, res) => {
    res.json({ active: true });
});

// Telemetry (Silent)
app.post(["/datarouter/api/v1/public/data", "/datarouter/api/v1/public/data/clients", "/telemetry/data/datarouter/api/v1/public/data"], (req, res) => {
    res.status(204).end();
});

// Playlist Tiles / Sales Events (Redirect to placeholder if not found)
app.get(["/salesEvent/salesEvent/*", "/*.jpg", "/*.png"], (req, res) => {
    res.redirect("https://i.imgur.com/ImIwpRm.png");
});

module.exports = app;
