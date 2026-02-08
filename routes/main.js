const express = require("express");
const functions = require("../structs/functions.js");
const fs = require("fs");
const app = express.Router();
const log = require("../structs/log.js");
const path = require("path");
const { getAccountIdData, addEliminationHypePoints, addVictoryHypePoints, deductBusFareHypePoints } = require("./../structs/functions.js");
const { verifyToken, verifyClient } = require("../tokenManager/tokenVerify.js");
const User = require("../model/user.js");
const Arena = require("../model/arena.js");
const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());


app.post("/fortnite/api/game/v2/chat*/pc", (req, res) => {
    log.debug("POST /fortnite/api/game/v2/chat*/pc called");
    let resp = config.chat.EnableGlobalChat ? { "GlobalChatRooms": [{ "roomName": "reloadbackendglobal" }] } : {};

    res.json(resp);
});

app.post("/fortnite/api/game/v2/tryPlayOnPlatform/accountEU/WindowsClient", (req, res) => {
    log.debug("GET /fortnite/api/game/v2/events/tournamentandhistoryrecommendGeneralChatRooms/pc", (req, res) => {
    log.debug("POST /fortnite/api/game/v2/chatlast-online", async (req, res) => {
    log.debug("GET /presence/api/v1/_receipts", (req, res) => {
    log.debug("GET /fortnite/api/receipts/v1/account*", async (req, res) => {
    log.debug("POST /api/v1/assets/Fortnitevalues", async (req, res) => {
    const epicsettings = require("./../responses/epic-settings.json");
    res.json(epicsettings)
})

app.get("/fortnite/api/game/v2/br-inventory/account/:accountId", async (req, res) => {
    log.debug(`GET /fortnite/api/game/v2/br-inventory/account/${req.params.accountId} called`);
    res.json({
        "stash": {
            "globalcash": 0
        }
    })
})

app.post("/datarouter/api/v1/public/data", async (req, res) => {
    try {
        const accountId = getAccountIdData(req.query.UserID);
        const data = req.body.Events;

        if (Array.isArray(data) && data.length > 0) {
            const findUser = await User.findOne({ accountId });

            if (findUser) {
                for (const event of data) {
                    const { EventName, ProviderType, PlayerKilledPlayerEventCount } = event;

                    if (EventName && ProviderType === "Client") {
                        const playerKills = Number(PlayerKilledPlayerEventCount) || 0;

                        switch (EventName) {
                            case "Athena.ClientWonMatch":

                                await addVictoryHypePoints(findUser);




                                break;
                            case "Combat.AthenaClientEngagement":

                                for (let i = 0; i < playerKills; i++) {
                                    await addEliminationHypePoints(findUser);

                                }

                                break;

                            case "Combat.ClientPlayerDeath":

                                await deductBusFareHypePoints(findUser);



                                break;
                            default:
                                log.debug(`Event List: ${EventName}`);
                                break;
                        }
                    }
                }
            } else {

            }
        }

        res.status(204).end();
    } catch (error) {
        log.error("Error processing data:", error);
        console.log("Error processing data:", error);
        res.status(500).send("Internal Server Error");
    }
});

module.exports = app;