const express = require("express");
const app = express.Router();

const Friends = require("../model/friends");
const Profile = require("../model/profiles.js");
const User = require("../model/user.js");
const SACCodeModel = require('../model/saccodes.js');
const profileManager = require("../structs/profile.js");
const error = require("../structs/error.js");
const functions = require("../structs/functions.js");
const log = require("../structs/log.js");
const config = require('../Config/config.json')
const fs = require("fs");
const path = require("path");
const catalog = functions.getItemShop();

const { verifyToken, verifyClient } = require("../tokenManager/tokenVerify.js");

global.giftReceived = {};

app.post("/fortnite/api/game/v2/profileclient/ClientQuestLogin", verifyToken, async (req, res) => {
    const profiles = await Profile.findOne({ accountId: req.user.accountId });

    if (!await profileManager.validateProfile(req.query.profileId, profiles)) return error.createError(
        "errors.com.epicgames.modules.profiles.operation_forbidden",
        `Unable to find template configuration for profile ${req.query.profileId}`,
        [req.query.profileId], 12813, undefined, 403, res
    );

    let profile = profiles.profiles[req.query.profileId];
    let athena = profiles.profiles["athena"];
    var AthenaQuestIDS = JSON.parse(JSON.stringify(require("./../responses/quests.json")));
    const memory = functions.GetVersionInfo(req);

    var ApplyProfileChanges = [];
    var Notifications = [];
    var BaseRevision = profile.rvn || 0;
    var QueryRevision = req.query.rvn || -1;
    var StatChanged = false;

    var QuestCount = 0;
    var ShouldGiveQuest = true;
    var DateFormat = (new Date().toISOString()).split("T")[0];
    var DailyQuestIDS;
    var SeasonQuestIDS;

    const SeasonPrefix = memory.season < 10 ? `0${memory.season}` : memory.season;

    try {
        if (req.query.profileId == "profile0") {
            for (var key in profile.items) {
                if (profile.items[key].templateId.toLowerCase().startsWith("quest:daily")) {
                    QuestCount += 1;
                }
            }
        }

        if (req.query.profileId == "athena") {
            DailyQuestIDS = AthenaQuestIDS.Daily;

            if (AthenaQuestIDS.hasOwnProperty(`Season${SeasonPrefix}`)) {
                SeasonQuestIDS = AthenaQuestIDS[`Season${SeasonPrefix}`];
            }

            for (var key in profile.items) {
                if (profile.items[key].templateId.toLowerCase().startsWith("quest:athenadaily")) {
                    QuestCount += 1;
                }
            }
        }

        if (profile.stats.attributes.hasOwnProperty("quest_manager")) {
            if (profile.stats.attributes.quest_manager.hasOwnProperty("dailyLoginInterval")) {
                if (profile.stats.attributes.quest_manager.dailyLoginInterval.includes("T")) {
                    var DailyLoginDate = (profile.stats.attributes.quest_manager.dailyLoginInterval).split("T")[0];

                    if (DailyLoginDate == DateFormat) {
                        ShouldGiveQuest = false;
                    } else {
                        ShouldGiveQuest = true;
                        if (profile.stats.attributes.quest_manager.dailyQuestRerolls <= 0) {
                            profile.stats.attributes.quest_manager.dailyQuestRerolls += 1;
                        }
                    }
                }
            }
        }

        if (QuestCount < 3 && ShouldGiveQuest == true) {
            const selectedQuests = [];
            while (selectedQuests.length < 3) {
                const randomIndex = Math.floor(Math.random() * DailyQuestIDS.length);
                const quest = DailyQuestIDS[randomIndex];

                if (
                    !Object.values(profile.items).some(
                        (item) => item.templateId.toLowerCase() === quest.templateId.toLowerCase()
                    ) &&
                    !selectedQuests.includes(quest)
                ) {
                    selectedQuests.push(quest);
                }
            }

            for (const quest of selectedQuests) {
                const NewQuestID = functions.MakeID();

                profile.items[NewQuestID] = {
                    "templateId": quest.templateId,
                    "attributes": {
                        "creation_time": new Date().toISOString(),
                        "level": -1,
                        "item_seen": false,
                        "sent_new_notification": false,
                        "xp_reward_scalar": 1,
                        "quest_state": "Active",
                        "last_state_change_time": new Date().toISOString(),
                        "max_level_bonus": 0,
                        "xp": 0,
                        "favorite": false
                    },
                    "quantity": 1
                };

                for (var i in quest.objectives) {
                    profile.items[NewQuestID].attributes[`completion_${quest.objectives[i].toLowerCase()}`] = 0;
                }

                ApplyProfileChanges.push({
                    "changeType": "itemAdded",
                    "itemId": NewQuestID,
                    "item": profile.items[NewQuestID]
                });
            }

            profile.stats.attributes.quest_manager.dailyLoginInterval = new Date().toISOString();

            ApplyProfileChanges.push({
                "changeType": "statModified",
                "name": "quest_manager",
                "value": profile.stats.attributes.quest_manager
            });

            StatChanged = true;
        }
    } catch (err) { log.error(err); }

    for (var key in profile.items) {
        if (key.startsWith("QS") && Number.isInteger(Number(key[2])) && Number.isInteger(Number(key[3])) && key[4] === "-") {
            if (!key.startsWith(`QS${SeasonPrefix}-`)) {
                delete profile.items[key];

                ApplyProfileChanges.push({
                    "changeType": "itemRemoved",
                    "itemId": key
                });

                StatChanged = true;
            }
        }
    }

    if (SeasonQuestIDS) {
        var QuestsToAdd = [];

        if (req.query.profileId == "athena") {
            for (var ChallengeBundleScheduleID in SeasonQuestIDS.ChallengeBundleSchedules) {
                if (profile.items.hasOwnProperty(ChallengeBundleScheduleID)) {
                    ApplyProfileChanges.push({
                        "changeType": "itemRemoved",
                        "itemId": ChallengeBundleScheduleID
                    });
                }

                var ChallengeBundleSchedule = SeasonQuestIDS.ChallengeBundleSchedules[ChallengeBundleScheduleID];

                profile.items[ChallengeBundleScheduleID] = {
                    "templateId": ChallengeBundleSchedule.templateId,
                    "attributes": {
                        "unlock_epoch": new Date().toISOString(),
                        "max_level_bonus": 0,
                        "level": 1,
                        "item_seen": true,
                        "xp": 0,
                        "favorite": false,
                        "granted_bundles": ChallengeBundleSchedule.granted_bundles
                    },
                    "quantity": 1
                };

                ApplyProfileChanges.push({
                    "changeType": "itemAdded",
                    "itemId": ChallengeBundleScheduleID,
                    "item": profile.items[ChallengeBundleScheduleID]
                });

                StatChanged = true;
            }

            for (var ChallengeBundleID in SeasonQuestIDS.ChallengeBundles) {
                if (profile.items.hasOwnProperty(ChallengeBundleID)) {
                    ApplyProfileChanges.push({
                        "changeType": "itemRemoved",
                        "itemId": ChallengeBundleID
                    });
                }

                var ChallengeBundle = SeasonQuestIDS.ChallengeBundles[ChallengeBundleID];

                if (config.bCompletedSeasonalQuests == true && ChallengeBundle.hasOwnProperty("questStages")) {
                    ChallengeBundle.grantedquestinstanceids = ChallengeBundle.grantedquestinstanceids.concat(ChallengeBundle.questStages);
                }

                profile.items[ChallengeBundleID] = {
                    "templateId": ChallengeBundle.templateId,
                    "attributes": {
                        "has_unlock_by_completion": false,
                        "num_quests_completed": 0,
                        "level": 0,
                        "grantedquestinstanceids": ChallengeBundle.grantedquestinstanceids,
                        "item_seen": true,
                        "max_allowed_bundle_level": 0,
                        "num_granted_bundle_quests": 0,
                        "max_level_bonus": 0,
                        "challenge_bundle_schedule_id": ChallengeBundle.challenge_bundle_schedule_id,
                        "num_progress_quests_completed": 0,
                        "xp": 0,
                        "favorite": false
                    },
                    "quantity": 1
                };

                QuestsToAdd = QuestsToAdd.concat(ChallengeBundle.grantedquestinstanceids);
                profile.items[ChallengeBundleID].attributes.num_granted_bundle_quests = ChallengeBundle.grantedquestinstanceids.length;

                if (config.bCompletedSeasonalQuests == true) {
                    profile.items[ChallengeBundleID].attributes.num_quests_completed = ChallengeBundle.grantedquestinstanceids.length;
                    profile.items[ChallengeBundleID].attributes.num_progress_quests_completed = ChallengeBundle.grantedquestinstanceids.length;

                    if ((memory.season == 10 || memory.season == 11) && (ChallengeBundle.templateId.toLowerCase().includes("missionbundle_s10_0") || ChallengeBundle.templateId.toLowerCase() == "challengebundle:missionbundle_s11_stretchgoals2")) {
                        profile.items[ChallengeBundleID].attributes.level += 1;
                    }
                }

                ApplyProfileChanges.push({
                    "changeType": "itemAdded",
                    "itemId": ChallengeBundleID,
                    "item": profile.items[ChallengeBundleID]
                });

                StatChanged = true;
            }
        }
    }

    function ParseQuest(QuestID) {
        var Quest = SeasonQuestIDS.Quests[QuestID];
        if (!Quest) {
            return;
        }

        if (profile.items.hasOwnProperty(QuestID)) {
            ApplyProfileChanges.push({
                "changeType": "itemRemoved",
                "itemId": QuestID
            });
        }

        profile.items[QuestID] = {
            "templateId": Quest.templateId,
            "attributes": {
                "creation_time": new Date().toISOString(),
                "level": -1,
                "item_seen": true,
                "sent_new_notification": true,
                "challenge_bundle_id": Quest.challenge_bundle_id || "",
                "xp_reward_scalar": 1,
                "quest_state": "Active",
                "last_state_change_time": new Date().toISOString(),
                "max_level_bonus": 0,
                "xp": 0,
                "favorite": false
            },
            "quantity": 1
        };

        if (config.bCompletedSeasonalQuests == true) {
            profile.items[QuestID].attributes.quest_state = "Claimed";

            if (Quest.hasOwnProperty("rewards")) {
                for (var reward in Quest.rewards) {
                    if (Quest.rewards[reward].templateId.startsWith("Quest:")) {
                        for (var Q in SeasonQuestIDS.Quests) {
                            if (SeasonQuestIDS.Quests[Q].templateId == Quest.rewards[reward].templateId) {
                                SeasonQuestIDS.ChallengeBundles[SeasonQuestIDS.Quests[Q].challenge_bundle_id].grantedquestinstanceids.push(Q);
                                ParseQuest(Q);
                            }
                        }
                    }
                }
            }
        }

        for (var i in Quest.objectives) {
            if (config.bCompletedSeasonalQuests == true) {
                profile.items[QuestID].attributes[`completion_${i}`] = Quest.objectives[i];
            } else {
                profile.items[QuestID].attributes[`completion_${i}`] = 0;
            }
        }

        ApplyProfileChanges.push({
            "changeType": "itemAdded",
            "itemId": QuestID,
            "item": profile.items[QuestID]
        });

        StatChanged = true;
    }

    for (var Quest in QuestsToAdd) {
        ParseQuest(QuestsToAdd[Quest]);
    }

    if (StatChanged == true) {
        profile.rvn += 1;
        profile.commandRevision += 1;
        profile.updated = new Date().toISOString();

        await profiles.updateOne({ $set: { [`profiles.${req.query.profileId}`]: profile } });
    }

    if (req.query.profileId == "athena" || req.query.profileId == "common_core") {
        await functions.updateCosmeticCount(req.user.accountId);
    }



    if (QueryRevision != BaseRevision) {
        ApplyProfileChanges = [{
            "changeType": "fullProfileUpdate",
            "profile": profile
        }];
    }

    res.json({
        profileRevision: profile.rvn || 0,
        profileId: req.query.profileId,
        profileChangesBaseRevision: BaseRevision,
        profileChanges: ApplyProfileChanges,
        notifications: Notifications,
        profileCommandRevision: profile.commandRevision || 0,
        serverTime: new Date().toISOString(),
        responseVersion: 1
    });
});

app.post("/fortnite/api/game/v2/profileclient/MarkNewQuestNotificationSent", verifyToken, async (req, res) => {
    log.debug(`MarkNewQuestNotificationSent: Request received with body: ${JSON.stringify(req.body)}`);

    const profiles = await Profile.findOne({ accountId: req.user.accountId });
    log.debug(`MarkNewQuestNotificationSent: Fetched profiles for accountId: ${req.user.accountId}`);

    if (!await profileManager.validateProfile(req.query.profileId, profiles)) {
        log.debug(`MarkNewQuestNotificationSent: Validation failed for profileId: ${req.query.profileId}`);
        return error.createError(
            "errors.com.epicgames.modules.profiles.operation_forbidden",
            `Unable to find template configuration for profile ${req.query.profileId}`,
            [req.query.profileId], 12813, undefined, 403, res
        );
    }

    let profile = profiles.profiles[req.query.profileId];
    log.debug(`MarkNewQuestNotificationSent: Validated profile for profileId: ${req.query.profileId}`);

    var ApplyProfileChanges = [];
    var Notifications = [];
    var BaseRevision = profile.rvn || 0;
    var QueryRevision = req.query.rvn || -1;
    var StatChanged = false;

    if (req.body.itemIds) {
        for (var i in req.body.itemIds) {
            var id = req.body.itemIds[i];

            if (profile.items[id]) {
                profile.items[id].attributes.sent_new_notification = true;
                ApplyProfileChanges.push({
                    "changeType": "itemAttrChanged",
                    "itemId": id,
                    "attributeName": "sent_new_notification",
                    "attributeValue": true
                });
                log.debug(`MarkNewQuestNotificationSent: Notification marked as sent for itemId: ${id}`);
            } else {
                log.debug(`MarkNewQuestNotificationSent: ItemId ${id} not found in profile`);
            }
        }

        StatChanged = true;
    }

    if (StatChanged == true) {
        profile.rvn += 1;
        profile.commandRevision += 1;
        profile.updated = new Date().toISOString();
        log.debug(`MarkNewQuestNotificationSent: Profile changes applied, revision updated to ${profile.rvn}`);

        await profiles.updateOne({ $set: { [`profiles.${req.query.profileId}`]: profile } });
        log.debug(`MarkNewQuestNotificationSent: Profile updated in database`);
    }

    if (QueryRevision != BaseRevision) {
        ApplyProfileChanges = [{
            "changeType": "fullProfileUpdate",
            "profile": profile
        }];
    }

    res.json({
        profileRevision: profile.rvn || 0,
        profileId: req.query.profileId,
        profileChangesBaseRevision: BaseRevision,
        profileChanges: ApplyProfileChanges,
        notifications: Notifications,
        profileCommandRevision: profile.commandRevision || 0,
        serverTime: new Date().toISOString(),
        responseVersion: 1
    });
    log.debug(`MarkNewQuestNotificationSent: Response sent with profile revision ${profile.rvn}`);
});

app.post("/fortnite/api/game/v2/profileclient/GiftCatalogEntry", verifyToken, async (req, res) => {
    log.debug(`GiftCatalogEntry: Request received with body: ${JSON.stringify(req.body)}`);

    const profiles = await Profile.findOne({ accountId: req.user.accountId });
    log.debug(`GiftCatalogEntry: Fetched profiles for accountId: ${req.user.accountId}`);

    if (!await profileManager.validateProfile(req.query.profileId, profiles)) {
        log.debug(`GiftCatalogEntry: Validation failed for profileId: ${req.query.profileId}`);
        return error.createError(
            "errors.com.epicgames.modules.profiles.operation_forbidden",
            `Unable to find template configuration for profile ${req.query.profileId}`,
            [req.query.profileId], 12813, undefined, 403, res
        );
    }

    let profile = profiles.profiles[req.query.profileId];
    let profile0 = profiles.profiles["profile0"];
    log.debug(`GiftCatalogEntry: Validated profile for profileId: ${req.query.profileId}`);

    if (req.query.profileId != "common_core") {
        log.debug(`GiftCatalogEntry: Invalid profileId: ${req.query.profileId} for GiftCatalogEntry`);
        return error.createError(
            "errors.com.epicgames.modules.profiles.invalid_command",
            `GiftCatalogEntry is not valid on ${req.query.profileId} profile`,
            ["GiftCatalogEntry", req.query.profileId], 12801, undefined, 400, res
        );
    }

    const memory = functions.GetVersionInfo(req);
    log.debug(`GiftCatalogEntry: Retrieved version info: ${JSON.stringify(memory)}`);

    let Notifications = [];
    let ApplyProfileChanges = [];
    let BaseRevision = profile.rvn;
    let ProfileRevisionCheck = (memory.build >= 12.20) ? profile.commandRevision : profile.rvn;
    let QueryRevision = req.query.rvn || -1;
    let validGiftBoxes = [
        "GiftBox:gb_default",
        "GiftBox:gb_giftwrap1",
        "GiftBox:gb_giftwrap2",
        "GiftBox:gb_giftwrap3"
    ];

    let missingFields = checkFields(["offerId", "receiverAccountIds", "giftWrapTemplateId"], req.body);

    if (missingFields.fields.length > 0) {
        log.debug(`GiftCatalogEntry: Missing fields: ${missingFields.fields.join(", ")}`);
        return error.createError(
            "errors.com.epicgames.validation.validation_failed",
            `Validation Failed. [${missingFields.fields.join(", ")}] field(s) is missing.`,
            [`[${missingFields.fields.join(", ")}]`], 1040, undefined, 400, res
        );
    }

    if (typeof req.body.offerId != "string") {
        log.debug(`GiftCatalogEntry: Invalid value for offerId: ${req.body.offerId}`);
        return ValidationError("offerId", "a string", res);
    }
    if (!Array.isArray(req.body.receiverAccountIds)) {
        log.debug(`GiftCatalogEntry: Invalid value for receiverAccountIds: ${req.body.receiverAccountIds}`);
        return ValidationError("receiverAccountIds", "an array", res);
    }
    if (typeof req.body.giftWrapTemplateId != "string") {
        log.debug(`GiftCatalogEntry: Invalid value for giftWrapTemplateId: ${req.body.giftWrapTemplateId}`);
        return ValidationError("giftWrapTemplateId", "a string", res);
    }
    if (typeof req.body.personalMessage != "string") {
        log.debug(`GiftCatalogEntry: Invalid value for personalMessage: ${req.body.personalMessage}`);
        return ValidationError("personalMessage", "a string", res);
    }

    if (req.body.personalMessage.length > 100) {
        log.debug(`GiftCatalogEntry: Personal message exceeds 100 characters: ${req.body.personalMessage.length}`);
        return error.createError(
            "errors.com.epicgames.string.length_check",
            `The personalMessage you provided is longer than 100 characters, please make sure your personal message is less than 100 characters long and try again.`,
            undefined, 16027, undefined, 400, res
        );
    }

    if (!validGiftBoxes.includes(req.body.giftWrapTemplateId)) {
        log.debug(`GiftCatalogEntry: Invalid giftWrapTemplateId: ${req.body.giftWrapTemplateId}`);
        return error.createError(
            "errors.com.epicgames.giftbox.invalid",
            `The giftbox you provided is invalid, please provide a valid giftbox and try again.`,
            undefined, 16027, undefined, 400, res
        );
    }

    if (req.body.receiverAccountIds.length < 1 || req.body.receiverAccountIds.length > 5) {
        log.debug(`GiftCatalogEntry: Invalid number of receiverAccountIds: ${req.body.receiverAccountIds.length}`);
        return error.createError(
            "errors.com.epicgames.item.quantity.range_check",
            `You need to atleast gift to 1 person and can not gift to more than 5 people.`,
            undefined, 16027, undefined, 400, res
        );
    }

    if (checkIfDuplicateExists(req.body.receiverAccountIds)) {
        log.debug(`GiftCatalogEntry: Duplicate receiverAccountIds found`);
        return error.createError(
            "errors.com.epicgames.array.duplicate_found",
            `There are duplicate accountIds in receiverAccountIds, please remove the duplicates and try again.`,
            undefined, 16027, undefined, 400, res
        );
    }

    let sender = await Friends.findOne({ accountId: req.user.accountId }).lean();
    log.debug(`GiftCatalogEntry: Fetched friends list for accountId: ${req.user.accountId}`);

    for (let receiverId of req.body.receiverAccountIds) {
        if (typeof receiverId != "string") {
            log.debug(`GiftCatalogEntry: Non-string value found in receiverAccountIds: ${receiverId}`);
            return error.createError(
                "errors.com.epicgames.array.invalid_string",
                `There is a non-string object inside receiverAccountIds, please provide a valid value and try again.`,
                undefined, 16027, undefined, 400, res
            );
        }

        if (!sender.list.accepted.find(i => i.accountId == receiverId) && receiverId != req.user.accountId) {
            log.debug(`GiftCatalogEntry: User ${req.user.accountId} is not friends with ${receiverId}`);
            return error.createError(
                "errors.com.epicgames.friends.no_relationship",
                `User ${req.user.accountId} is not friends with ${receiverId}`,
                [req.user.accountId, receiverId], 28004, undefined, 403, res
            );
        }
    }

    if (!profile.items) profile.items = {};

    let findOfferId = functions.getOfferID(req.body.offerId);
    if (!findOfferId) {
        log.debug(`GiftCatalogEntry: Invalid offerId: ${req.body.offerId}`);
        return error.createError(
            "errors.com.epicgames.fortnite.id_invalid",
            `Offer ID (id: '${req.body.offerId}') not found`,
            [req.body.offerId], 16027, undefined, 400, res
        );
    }

    log.debug(`GiftCatalogEntry: OfferId ${req.body.offerId} found`);

    switch (true) {
        case /^BR(Daily|Weekly)Storefront$/.test(findOfferId.name):
            if (findOfferId.offerId.prices[0].currencyType.toLowerCase() == "mtxcurrency") {
                let paid = false;
                let price = (findOfferId.offerId.prices[0].finalPrice) * req.body.receiverAccountIds.length;

                for (let key in profile.items) {
                    if (!profile.items[key].templateId.toLowerCase().startsWith("currency:mtx")) continue;

                    let currencyPlatform = profile.items[key].attributes.platform;
                    if ((currencyPlatform.toLowerCase() != profile.stats.attributes.current_mtx_platform.toLowerCase()) && (currencyPlatform.toLowerCase() != "shared")) continue;

                    if (profile.items[key].quantity < price) {
                        log.debug(`GiftCatalogEntry: Insufficient currency: required ${price}, available ${profile.items[key].quantity}`);
                        return error.createError(
                            "errors.com.epicgames.currency.mtx.insufficient",
                            `You can not afford this item (${price}), you only have ${profile.items[key].quantity}.`,
                            [`${price}`, `${profile.items[key].quantity}`], 1040, undefined, 400, res
                        );
                    }

                    profile.items[key].quantity -= price;
                    profile0.items[key].quantity -= price;

                    ApplyProfileChanges.push(
                        {
                            "changeType": "itemQuantityChanged",
                            "itemId": key,
                            "quantity": profile.items[key].quantity
                        },
                        {
                            "changeType": "itemQuantityChanged",
                            "itemId": key,
                            "quantity": profile0.items[key].quantity
                        }
                    );

                    paid = true;
                    log.debug(`GiftCatalogEntry: Currency deducted: ${price}, remaining ${profile.items[key].quantity}`);
                    break;
                }

                if (!paid && price > 0) {
                    log.debug(`GiftCatalogEntry: Insufficient currency: required ${price}, no currency available`);
                    return error.createError(
                        "errors.com.epicgames.currency.mtx.insufficient",
                        `You can not afford this item.`,
                        [], 1040, undefined, 400, res
                    );
                }
            }

            for (let receiverId of req.body.receiverAccountIds) {
                const receiverProfiles = await Profile.findOne({ accountId: receiverId });
                let athena = receiverProfiles.profiles["athena"];
                let common_core = receiverProfiles.profiles["common_core"];

                if (!athena.items) athena.items = {};

                if (!common_core.stats.attributes.allowed_to_receive_gifts) {
                    log.debug(`GiftCatalogEntry: User ${receiverId} has disabled receiving gifts`);
                    return error.createError(
                        "errors.com.epicgames.user.gift_disabled",
                        `User ${receiverId} has disabled receiving gifts.`,
                        [receiverId], 28004, undefined, 403, res
                    );
                }

                for (let itemGrant of findOfferId.offerId.itemGrants) {
                    for (let itemId in athena.items) {
                        if (itemGrant.templateId.toLowerCase() == athena.items[itemId].templateId.toLowerCase()) {
                            log.debug(`GiftCatalogEntry: User ${receiverId} already owns item ${itemGrant.templateId}`);
                            return error.createError(
                                "errors.com.epicgames.modules.gamesubcatalog.purchase_not_allowed",
                                `User ${receiverId} already owns this item.`,
                                [receiverId], 28004, undefined, 403, res
                            );
                        }
                    }
                }
            }

            for (let receiverId of req.body.receiverAccountIds) {
                const receiverProfiles = await Profile.findOne({ accountId: receiverId });
                let athena = receiverProfiles.profiles["athena"];
                let common_core = ((receiverId == req.user.accountId) ? profile : receiverProfiles.profiles["common_core"]);

                let giftBoxItemID = functions.MakeID();
                let giftBoxItem = {
                    "templateId": req.body.giftWrapTemplateId,
                    "attributes": {
                        "fromAccountId": req.user.accountId,
                        "lootList": [],
                        "params": {
                            "userMessage": req.body.personalMessage
                        },
                        "level": 1,
                        "giftedOn": new Date().toISOString()
                    },
                    "quantity": 1
                };

                if (!athena.items) athena.items = {};
                if (!common_core.items) common_core.items = {};

                for (let value of findOfferId.offerId.itemGrants) {
                    const ID = functions.MakeID();

                    const Item = {
                        "templateId": value.templateId,
                        "attributes": {
                            "item_seen": false,
                            "variants": [],
                        },
                        "quantity": 1
                    };

                    athena.items[ID] = Item;

                    giftBoxItem.attributes.lootList.push({
                        "itemType": Item.templateId,
                        "itemGuid": ID,
                        "itemProfile": "athena",
                        "quantity": 1
                    });
                }

                common_core.items[giftBoxItemID] = giftBoxItem;
                profile0.items[giftBoxItemID] = giftBoxItem;

                if (receiverId == req.user.accountId) {
                    ApplyProfileChanges.push(
                        {
                            "changeType": "itemAdded",
                            "itemId": giftBoxItemID,
                            "item": common_core.items[giftBoxItemID]
                        },
                        {
                            "changeType": "itemAdded",
                            "itemId": giftBoxItemID,
                            "item": profile0.items[giftBoxItemID]
                        }
                    );
                }

                athena.rvn += 1;
                athena.commandRevision += 1;
                athena.updated = new Date().toISOString();

                common_core.rvn += 1;
                common_core.commandRevision += 1;
                common_core.updated = new Date().toISOString();

                profile0.rvn += 1;
                profile0.commandRevision += 1;
                profile0.updated = new Date().toISOString();

                await receiverProfiles.updateOne({
                    $set: {
                        [`profiles.athena`]: athena,
                        [`profiles.common_core`]: common_core,
                        [`profiles.profile0`]: profile0
                    }
                });

                await functions.updateCosmeticCount(receiverId);


                global.giftReceived[receiverId] = true;

                functions.sendXmppMessageToId({
                    type: "com.epicgames.gift.received",
                    payload: {},
                    timestamp: new Date().toISOString()
                }, receiverId);
                log.debug(`GiftCatalogEntry: Gift sent to receiver ${receiverId}`);
            }
            break;
    }

    if (ApplyProfileChanges.length > 0 && !req.body.receiverAccountIds.includes(req.user.accountId)) {
        profile.rvn += 1;
        profile.commandRevision += 1;
        profile.updated = new Date().toISOString();

        await profiles.updateOne({
            $set: {
                [`profiles.${req.query.profileId}`]: profile,
                [`profiles.profile0`]: profile0
            }
        });
    }

    if (QueryRevision != ProfileRevisionCheck) {
        ApplyProfileChanges = [{
            "changeType": "fullProfileUpdate",
            "profile": profile
        }];
    }

    res.json({
        profileRevision: profile.rvn || 0,
        profileId: req.query.profileId,
        profileChangesBaseRevision: BaseRevision,
        profileChanges: ApplyProfileChanges,
        notifications: Notifications,
        profileCommandRevision: profile.commandRevision || 0,
        serverTime: new Date().toISOString(),
        responseVersion: 1
    });
    log.debug(`GiftCatalogEntry: Response sent with profile revision ${profile.rvn}`);
});

app.post("/fortnite/api/game/v2/profileclient/UnlockRewardNode", verifyToken, async (req, res) => {
    const profiles = await Profile.findOne({ accountId: req.user.accountId });
    let profile = profiles.profiles[req.query.profileId];
    let common_core = profiles.profiles["common_core"];
    const WinterFestIDS = require("./../responses/winterfestRewards.json");
    const memory = functions.GetVersionInfo(req);


    var ApplyProfileChanges = [];
    var MultiUpdate = [];
    var BaseRevision = profile.rvn;
    var ProfileRevisionCheck = (memory.build >= 19.01) ? profile.commandRevision : profile.rvn;
    var QueryRevision = req.query.rvn || -1;
    var StatChanged = false;
    var CommonCoreChanged = false;
    var ItemExists = false;
    var Season = "Season" + memory.season;

    const GiftID = functions.MakeID();
    profile.items[GiftID] = { "templateId": "GiftBox:gb_winterfestreward", "attributes": { "max_level_bonus": 0, "fromAccountId": "", "lootList": [], "level": 1, "item_seen": false, "xp": 0, "giftedOn": new Date().toISOString(), "params": { "SubGame": "Athena", "winterfestGift": "true" }, "favorite": false }, "quantity": 1 };

    if (req.body.nodeId && req.body.rewardGraphId) {
        for (var i = 0; i < WinterFestIDS[Season][req.body.nodeId].length; i++) {
            var ID = functions.MakeID();
            Reward = WinterFestIDS[Season][req.body.nodeId][i]

            if (Reward.toLowerCase().startsWith("homebasebannericon:")) {
                if (CommonCoreChanged == false) {
                    MultiUpdate.push({
                        "profileRevision": common_core.rvn || 0,
                        "profileId": "common_core",
                        "profileChangesBaseRevision": common_core.rvn || 0,
                        "profileChanges": [],
                        "profileCommandRevision": common_core.commandRevision || 0,
                    })

                    CommonCoreChanged = true;
                }

                for (var key in common_core.items) {
                    if (common_core.items[key].templateId.toLowerCase() == Reward.toLowerCase()) {
                        common_core.items[key].attributes.item_seen = false;
                        ID = key;
                        ItemExists = true;

                        MultiUpdate[0].profileChanges.push({
                            "changeType": "itemAttrChanged",
                            "itemId": key,
                            "attributeName": "item_seen",
                            "attributeValue": common_core.items[key].attributes.item_seen
                        })
                    }
                }

                if (ItemExists == false) {
                    common_core.items[ID] = {
                        "templateId": Reward,
                        "attributes": {
                            "max_level_bonus": 0,
                            "level": 1,
                            "item_seen": false,
                            "xp": 0,
                            "variants": [],
                            "favorite": false
                        },
                        "quantity": 1
                    };

                    MultiUpdate[0].profileChanges.push({
                        "changeType": "itemAdded",
                        "itemId": ID,
                        "item": common_core.items[ID]
                    })
                }

                ItemExists = false;

                common_core.rvn += 1;
                common_core.commandRevision += 1;

                MultiUpdate[0].profileRevision = common_core.rvn || 0;
                MultiUpdate[0].profileCommandRevision = common_core.commandRevision || 0;

                profile.items[GiftID].attributes.lootList.push({ "itemType": Reward, "itemGuid": ID, "itemProfile": "common_core", "attributes": { "creation_time": new Date().toISOString() }, "quantity": 1 })
            }

            if (!Reward.toLowerCase().startsWith("homebasebannericon:")) {
                for (var key in profile.items) {
                    if (profile.items[key].templateId.toLowerCase() == Reward.toLowerCase()) {
                        profile.items[key].attributes.item_seen = false;
                        ID = key;
                        ItemExists = true;

                        ApplyProfileChanges.push({
                            "changeType": "itemAttrChanged",
                            "itemId": key,
                            "attributeName": "item_seen",
                            "attributeValue": profile.items[key].attributes.item_seen
                        })
                    }
                }

                if (ItemExists == false) {
                    profile.items[ID] = {
                        "templateId": Reward,
                        "attributes": {
                            "max_level_bonus": 0,
                            "level": 1,
                            "item_seen": false,
                            "xp": 0,
                            "variants": [],
                            "favorite": false
                        },
                        "quantity": 1
                    };

                    ApplyProfileChanges.push({
                        "changeType": "itemAdded",
                        "itemId": ID,
                        "item": profile.items[ID]
                    })
                }

                ItemExists = false;

                profile.items[GiftID].attributes.lootList.push({ "itemType": Reward, "itemGuid": ID, "itemProfile": "athena", "attributes": { "creation_time": new Date().toISOString() }, "quantity": 1 })
            }
        }
        profile.items[req.body.rewardGraphId].attributes.reward_keys[0].unlock_keys_used += 1;
        profile.items[req.body.rewardGraphId].attributes.reward_nodes_claimed.push(req.body.nodeId);

        StatChanged = true;
    }

    if (StatChanged == true) {
        profile.rvn += 1;
        profile.commandRevision += 1;

        ApplyProfileChanges.push({
            "changeType": "itemAdded",
            "itemId": GiftID,
            "item": profile.items[GiftID]
        })

        ApplyProfileChanges.push({
            "changeType": "itemAttrChanged",
            "itemId": req.body.rewardGraphId,
            "attributeName": "reward_keys",
            "attributeValue": profile.items[req.body.rewardGraphId].attributes.reward_keys
        })

        ApplyProfileChanges.push({
            "changeType": "itemAttrChanged",
            "itemId": req.body.rewardGraphId,
            "attributeName": "reward_nodes_claimed",
            "attributeValue": profile.items[req.body.rewardGraphId].attributes.reward_nodes_claimed
        })

        if (memory.season == 19) {
            profile.items.S19_GIFT_KEY.quantity -= 1;

            ApplyProfileChanges.push({
                "changeType": "itemQuantityChanged",
                "itemId": "S19_GIFT_KEY",
                "quantity": profile.items.S19_GIFT_KEY.quantity
            })
        }

        if (memory.season == 11) {
            profile.items.S11_GIFT_KEY.quantity -= 1;

            ApplyProfileChanges.push({
                "changeType": "itemQuantityChanged",
                "itemId": "S11_GIFT_KEY",
                "quantity": profile.items.S11_GIFT_KEY.quantity
            })
        }

        if (CommonCoreChanged == true) {
            await profiles.updateOne({ $set: { [`profiles.${req.query.profileId}`]: profile } });
        }

        await profiles.updateOne({ $set: { [`profiles.${req.query.profileId}`]: profile } });
    }

    if (QueryRevision != ProfileRevisionCheck) {
        ApplyProfileChanges = [{
            "changeType": "fullProfileUpdate",
            "profile": profile
        }];
    }

    res.json({
        profileRevision: profile.rvn || 0,
        profileId: req.query.profileId,
        profileChangesBaseRevision: BaseRevision,
        profileChanges: ApplyProfileChanges,
        profileCommandRevision: profile.commandRevision || 0,
        serverTime: new Date().toISOString(),
        multiUpdate: MultiUpdate,
        responseVersion: 1
    })
});

app.post("/fortnite/api/game/v2/profileclient/SetPartyAssistQuest", verifyToken, async (req, res) => {
    const profiles = await Profile.findOne({ accountId: req.user.accountId });
    let profile = profiles.profiles[req.query.profileId];

    const memory = functions.GetVersionInfo(req);


    var ApplyProfileChanges = [];
    var BaseRevision = profile.rvn;
    var ProfileRevisionCheck = (memory.build >= 12.20) ? profile.commandRevision : profile.rvn;
    var QueryRevision = req.query.rvn || -1;
    var StatChanged = false;

    if (profile.stats.attributes.hasOwnProperty("party_assist_quest")) {
        profile.stats.attributes.party_assist_quest = req.body.questToPinAsPartyAssist || "";
        StatChanged = true;
    }

    if (StatChanged == true) {
        profile.rvn += 1;
        profile.commandRevision += 1;

        ApplyProfileChanges.push({
            "changeType": "statModified",
            "name": "party_assist_quest",
            "value": profile.stats.attributes.party_assist_quest
        })

        await profiles.updateOne({ $set: { [`profiles.${req.query.profileId}`]: profile } });
    }

    if (QueryRevision != ProfileRevisionCheck) {
        ApplyProfileChanges = [{
            "changeType": "fullProfileUpdate",
            "profile": profile
        }];
    }

    res.json({
        profileRevision: profile.rvn || 0,
        profileId: req.query.profileId,
        profileChangesBaseRevision: BaseRevision,
        profileChanges: ApplyProfileChanges,
        profileCommandRevision: profile.commandRevision || 0,
        serverTime: new Date().toISOString(),
        responseVersion: 1
    })
});

app.post("/fortnite/api/game/v2/profileclient/RequestRestedStateIncrease", async (req, res) => {
    const profiles = await Profile.findOne({ accountId: req.params[0] });
    let profile = profiles.profiles[req.query.profileId];
    const memory = functions.GetVersionInfo(req);


    let ApplyProfileChanges = [];
    let BaseRevision = profile.rvn;
    let ProfileRevisionCheck = (memory.build >= 12.20) ? profile.commandRevision : profile.rvn;
    let QueryRevision = req.query.rvn || -1;
    let StatChanged = false;
    let xp = profile.stats.attributes["book_xp"] + req.body.restedXpGenAccumulated;

    if (xp !== profile.stats.attributes["book_xp"]) {
        StatChanged = true;
        profile.stats.attributes["book_xp"] = xp;
        profile.stats.attributes["xp"] = xp;
    }

    if (StatChanged == true) {
        profile.rvn += 1;
        profile.commandRevision += 1;
        ApplyProfileChanges.push({
            "changeType": "statModified",
            "name": "book_xp",
            "value": profile.stats.attributes.book_xp
        },
            {
                "changeType": "statModified",
                "name": "xp",
                "value": profile.stats.attributes.xp
            });
        await profiles.updateOne({ $set: { [`profiles.${req.query.profileId}`]: profile } });
    }

    if (QueryRevision != ProfileRevisionCheck) {
        ApplyProfileChanges = [{
            "changeType": "fullProfileUpdate",
            "profile": profile
        }];
    }

    res.json({
        profileRevision: profile.rvn || 0,
        profileId: req.query.profileId,
        profileChangesBaseRevision: BaseRevision,
        profileChanges: ApplyProfileChanges,
        profileCommandRevision: profile.commandRevision || 0,
        serverTime: new Date().toISOString(),
        responseVersion: 1
    });
});

app.post("/fortnite/api/game/v2/profileclient/IncrementNamedCounterStat", async (req, res) => {
    const profiles = await Profile.findOne({ accountId: req.params[0] });
    let profile = profiles.profiles[req.query.profileId];


    var ApplyProfileChanges = [];
    var BaseRevision = profile.rvn || 0;
    var QueryRevision = req.query.rvn || -1;
    var StatChanged = false;

    if (req.body.counterName && profile.stats.attributes.hasOwnProperty("named_counters")) {
        if (profile.stats.attributes.named_counters.hasOwnProperty(req.body.counterName)) {
            profile.stats.attributes.named_counters[req.body.counterName].current_count += 1;
            profile.stats.attributes.named_counters[req.body.counterName].last_incremented_time = new Date().toISOString();

            StatChanged = true;
        }
    }

    if (StatChanged == true) {
        profile.rvn += 1;
        profile.commandRevision += 1;

        ApplyProfileChanges.push({
            "changeType": "statModified",
            "name": "named_counters",
            "value": profile.stats.attributes.named_counters
        })

        await profiles.updateOne({ $set: { [`profiles.${req.query.profileId}`]: profile } });
    }


    if (QueryRevision != BaseRevision) {
        ApplyProfileChanges = [{
            "changeType": "fullProfileUpdate",
            "profile": profile
        }];
    }

    res.json({
        profileRevision: profile.rvn || 0,
        profileId: req.query.profileId,
        profileChangesBaseRevision: BaseRevision,
        profileChanges: ApplyProfileChanges,
        profileCommandRevision: profile.commandRevision || 0,
        serverTime: new Date().toISOString(),
        responseVersion: 1
    })
});

app.post("/fortnite/api/game/v2/profileclient/SetItemArchivedStatusBatch", async (req, res) => {
    const profiles = await Profile.findOne({ accountId: req.user.accountId });
    let profile = profiles.profiles[req.query.profileId];


    var ApplyProfileChanges = [];
    var BaseRevision = profile.rvn;
    var ProfileRevisionCheck = (memory.build >= 12.20) ? profile.commandRevision : profile.rvn;
    var QueryRevision = req.query.rvn || -1;
    var StatChanged = false;

    if (req.body.itemIds) {
        for (var i in req.body.itemIds) {
            profile.items[req.body.itemIds[i]].attributes.archived = req.body.archived || false;

            ApplyProfileChanges.push({
                "changeType": "itemAttrChanged",
                "itemId": req.body.itemIds[i],
                "attributeName": "archived",
                "attributeValue": profile.items[req.body.itemIds[i]].attributes.archived
            })
        }
        StatChanged = true;
    }

    if (StatChanged == true) {
        profile.rvn += 1;
        profile.commandRevision += 1;

        await profiles.updateOne({ $set: { [`profiles.${req.query.profileId}`]: profile } });
    }

    if (QueryRevision != ProfileRevisionCheck) {
        ApplyProfileChanges = [{
            "changeType": "fullProfileUpdate",
            "profile": profile
        }];
    }

    res.json({
        profileRevision: profile.rvn || 0,
        profileId: req.query.profileId,
        profileChangesBaseRevision: BaseRevision,
        profileChanges: ApplyProfileChanges,
        profileCommandRevision: profile.commandRevision || 0,
        serverTime: new Date().toISOString(),
        responseVersion: 1
    })
});

app.post("/fortnite/api/game/v2/profileclient/SetItemFavoriteStatusBatch", verifyToken, async (req, res) => {
    const profiles = await Profile.findOne({ accountId: req.user.accountId });

    if (!await profileManager.validateProfile(req.query.profileId, profiles)) return error.createError(
        "errors.com.epicgames.modules.profiles.operation_forbidden",
        `Unable to find template configuration for profile ${req.query.profileId}`,
        [req.query.profileId], 12813, undefined, 403, res
    );

    if (req.query.profileId != "athena") return error.createError(
        "errors.com.epicgames.modules.profiles.invalid_command",
        `SetItemFavoriteStatusBatch is not valid on ${req.query.profileId} profile`,
        ["SetItemFavoriteStatusBatch", req.query.profileId], 12801, undefined, 400, res
    );

    let profile = profiles.profiles[req.query.profileId];

    const memory = functions.GetVersionInfo(req);

    if (req.query.profileId == "athena") profile.stats.attributes.season_num = memory.season;

    let ApplyProfileChanges = [];
    let BaseRevision = profile.rvn;
    let ProfileRevisionCheck = (memory.build >= 12.20) ? profile.commandRevision : profile.rvn;
    let QueryRevision = req.query.rvn || -1;

    let missingFields = checkFields(["itemIds", "itemFavStatus"], req.body);

    if (missingFields.fields.length > 0) return error.createError(
        "errors.com.epicgames.validation.validation_failed",
        `Validation Failed. [${missingFields.fields.join(", ")}] field(s) is missing.`,
        [`[${missingFields.fields.join(", ")}]`], 1040, undefined, 400, res
    );

    if (!Array.isArray(req.body.itemIds)) return ValidationError("itemIds", "an array", res);
    if (!Array.isArray(req.body.itemFavStatus)) return ValidationError("itemFavStatus", "an array", res);

    if (!profile.items) profile.items = {};

    for (let i in req.body.itemIds) {
        if (!profile.items[req.body.itemIds[i]]) continue;
        if (typeof req.body.itemFavStatus[i] != "boolean") continue;

        profile.items[req.body.itemIds[i]].attributes.favorite = req.body.itemFavStatus[i];

        ApplyProfileChanges.push({
            "changeType": "itemAttrChanged",
            "itemId": req.body.itemIds[i],
            "attributeName": "favorite",
            "attributeValue": profile.items[req.body.itemIds[i]].attributes.favorite
        });
    }

    if (ApplyProfileChanges.length > 0) {
        profile.rvn += 1;
        profile.commandRevision += 1;
        profile.updated = new Date().toISOString();

        await profiles.updateOne({ $set: { [`profiles.${req.query.profileId}`]: profile } });
    }

    if (QueryRevision != ProfileRevisionCheck) {
        ApplyProfileChanges = [{
            "changeType": "fullProfileUpdate",
            "profile": profile
        }];
    }

    res.json({
        profileRevision: profile.rvn || 0,
        profileId: req.query.profileId,
        profileChangesBaseRevision: BaseRevision,
        profileChanges: ApplyProfileChanges,
        profileCommandRevision: profile.commandRevision || 0,
        serverTime: new Date().toISOString(),
        responseVersion: 1
    });
});

app.post("/fortnite/api/game/v2/profileclient/EquipBattleRoyaleCustomization", verifyToken, async (req, res) => {
    const profiles = await Profile.findOne({ accountId: req.user.accountId });

    if (!await profileManager.validateProfile(req.query.profileId, profiles)) return error.createError(
        "errors.com.epicgames.modules.profiles.operation_forbidden",
        `Unable to find template configuration for profile ${req.query.profileId}`,
        [req.query.profileId], 12813, undefined, 403, res
    );

    if (req.query.profileId != "athena") return error.createError(
        "errors.com.epicgames.modules.profiles.invalid_command",
        `EquipBattleRoyaleCustomization is not valid on ${req.query.profileId} profile`,
        ["EquipBattleRoyaleCustomization", req.query.profileId], 12801, undefined, 400, res
    );

    let profile = profiles.profiles[req.query.profileId];

    const memory = functions.GetVersionInfo(req);

    if (req.query.profileId == "athena") profile.stats.attributes.season_num = memory.season;

    let ApplyProfileChanges = [];
    let BaseRevision = profile.rvn;
    let ProfileRevisionCheck = (memory.build >= 12.20) ? profile.commandRevision : profile.rvn;
    let QueryRevision = req.query.rvn || -1;
    let specialCosmetics = [
        "AthenaCharacter:cid_random",
        "AthenaBackpack:bid_random",
        "AthenaPickaxe:pickaxe_random",
        "AthenaGlider:glider_random",
        "AthenaSkyDiveContrail:trails_random",
        "AthenaItemWrap:wrap_random",
        "AthenaMusicPack:musicpack_random",
        "AthenaLoadingScreen:lsid_random"
    ];

    let missingFields = checkFields(["slotName"], req.body);

    if (missingFields.fields.length > 0) return error.createError(
        "errors.com.epicgames.validation.validation_failed",
        `Validation Failed. [${missingFields.fields.join(", ")}] field(s) is missing.`,
        [`[${missingFields.fields.join(", ")}]`], 1040, undefined, 400, res
    );

    if (typeof req.body.itemToSlot != "string") return ValidationError("itemToSlot", "a string", res);
    if (typeof req.body.slotName != "string") return ValidationError("slotName", "a string", res);

    if (!profile.items) profile.items = {};

    if (!profile.items[req.body.itemToSlot] && req.body.itemToSlot) {
        let item = req.body.itemToSlot;

        if (!specialCosmetics.includes(item)) {
            return error.createError(
                "errors.com.epicgames.fortnite.id_invalid",
                `Item (id: '${req.body.itemToSlot}') not found`,
                [req.body.itemToSlot], 16027, undefined, 400, res
            );
        } else {
            if (!item.startsWith(`Athena${req.body.slotName}:`)) return error.createError(
                "errors.com.epicgames.fortnite.id_invalid",
                `Cannot slot item of type ${item.split(":")[0]} in slot of category ${req.body.slotName}`,
                [item.split(":")[0], req.body.slotName], 16027, undefined, 400, res
            );
        }
    }

    if (profile.items[req.body.itemToSlot]) {
        if (!profile.items[req.body.itemToSlot].templateId.startsWith(`Athena${req.body.slotName}:`)) return error.createError(
            "errors.com.epicgames.fortnite.id_invalid",
            `Cannot slot item of type ${profile.items[req.body.itemToSlot].templateId.split(":")[0]} in slot of category ${req.body.slotName}`,
            [profile.items[req.body.itemToSlot].templateId.split(":")[0], req.body.slotName], 16027, undefined, 400, res
        );

        let Variants = req.body.variantUpdates;

        if (Array.isArray(Variants)) {
            for (let i in Variants) {
                if (typeof Variants[i] != "object") continue;
                if (!Variants[i].channel) continue;
                if (!Variants[i].active) continue;

                let index = profile.items[req.body.itemToSlot].attributes.variants.findIndex(x => x.channel == Variants[i].channel);

                if (index == -1) continue;
                if (!profile.items[req.body.itemToSlot].attributes.variants[index].owned.includes(Variants[i].active)) continue;

                profile.items[req.body.itemToSlot].attributes.variants[index].active = Variants[i].active;
            }

            ApplyProfileChanges.push({
                "changeType": "itemAttrChanged",
                "itemId": req.body.itemToSlot,
                "attributeName": "variants",
                "attributeValue": profile.items[req.body.itemToSlot].attributes.variants
            });
        }
    }

    let slotNames = ["Character", "Backpack", "Pickaxe", "Glider", "SkyDiveContrail", "MusicPack", "LoadingScreen"];

    let activeLoadoutId = profile.stats.attributes.loadouts[profile.stats.attributes.active_loadout_index];
    let templateId = profile.items[req.body.itemToSlot] ? profile.items[req.body.itemToSlot].templateId : req.body.itemToSlot;

    switch (req.body.slotName) {
        case "Dance":
            if (!profile.items[activeLoadoutId].attributes.locker_slots_data.slots[req.body.slotName]) break;

            if (typeof req.body.indexWithinSlot != "number") return ValidationError("indexWithinSlot", "a number", res);

            if (req.body.indexWithinSlot >= 0 && req.body.indexWithinSlot <= 5) {
                profile.stats.attributes.favorite_dance[req.body.indexWithinSlot] = req.body.itemToSlot;
                profile.items[activeLoadoutId].attributes.locker_slots_data.slots.Dance.items[req.body.indexWithinSlot] = templateId;

                ApplyProfileChanges.push({
                    "changeType": "statModified",
                    "name": "favorite_dance",
                    "value": profile.stats.attributes["favorite_dance"]
                });
            }
            break;

        case "ItemWrap":
            if (!profile.items[activeLoadoutId].attributes.locker_slots_data.slots[req.body.slotName]) break;

            if (typeof req.body.indexWithinSlot != "number") return ValidationError("indexWithinSlot", "a number", res);

            switch (true) {
                case req.body.indexWithinSlot >= 0 && req.body.indexWithinSlot <= 7:
                    profile.stats.attributes.favorite_itemwraps[req.body.indexWithinSlot] = req.body.itemToSlot;
                    profile.items[activeLoadoutId].attributes.locker_slots_data.slots.ItemWrap.items[req.body.indexWithinSlot] = templateId;

                    ApplyProfileChanges.push({
                        "changeType": "statModified",
                        "name": "favorite_itemwraps",
                        "value": profile.stats.attributes["favorite_itemwraps"]
                    });
                    break;

                case req.body.indexWithinSlot == -1:
                    for (let i = 0; i < 7; i++) {
                        profile.stats.attributes.favorite_itemwraps[i] = req.body.itemToSlot;
                        profile.items[activeLoadoutId].attributes.locker_slots_data.slots.ItemWrap.items[i] = templateId;
                    }

                    ApplyProfileChanges.push({
                        "changeType": "statModified",
                        "name": "favorite_itemwraps",
                        "value": profile.stats.attributes["favorite_itemwraps"]
                    });
                    break;
            }
            break;

        default:
            if (!slotNames.includes(req.body.slotName)) break;
            if (!profile.items[activeLoadoutId].attributes.locker_slots_data.slots[req.body.slotName]) break;

            if (req.body.slotName == "Pickaxe" || req.body.slotName == "Glider") {
                if (!req.body.itemToSlot) return error.createError(
                    "errors.com.epicgames.fortnite.id_invalid",
                    `${req.body.slotName} can not be empty.`,
                    [req.body.slotName], 16027, undefined, 400, res
                );
            }

            profile.stats.attributes[(`favorite_${req.body.slotName}`).toLowerCase()] = req.body.itemToSlot;
            profile.items[activeLoadoutId].attributes.locker_slots_data.slots[req.body.slotName].items = [templateId];

            ApplyProfileChanges.push({
                "changeType": "statModified",
                "name": (`favorite_${req.body.slotName}`).toLowerCase(),
                "value": profile.stats.attributes[(`favorite_${req.body.slotName}`).toLowerCase()]
            });
            break;
    }

    if (ApplyProfileChanges.length > 0) {
        profile.rvn += 1;
        profile.commandRevision += 1;
        profile.updated = new Date().toISOString();

        await profiles.updateOne({ $set: { [`profiles.${req.query.profileId}`]: profile } });
    }

    if (QueryRevision != ProfileRevisionCheck) {
        ApplyProfileChanges = [{
            "changeType": "fullProfileUpdate",
            "profile": profile
        }];
    }

    res.json({
        profileRevision: profile.rvn || 0,
        profileId: req.query.profileId,
        profileChangesBaseRevision: BaseRevision,
        profileChanges: ApplyProfileChanges,
        profileCommandRevision: profile.commandRevision || 0,
        serverTime: new Date().toISOString(),
        responseVersion: 1
    });
});

app.post("/fortnite/api/game/v2/profile/:accountId/client/CopyCosmeticLoadout", verifyToken, async (req, res) => {
    const profiles = await Profile.findOne({ accountId: req.user.accountId });
    var profile = profiles.profiles[req.query.profileId];

    const memory = functions.GetVersionInfo(req);

    if (!await profileManager.validateProfile(req.query.profileId, profiles)) return error.createError(
        "errors.com.epicgames.modules.profiles.operation_forbidden",
        `Unable to find template configuration for profile ${req.query.profileId}`,
        [req.query.profileId], 12813, undefined, 403, res
    );

    let ApplyProfileChanges = [];
    let BaseRevision = profile.rvn;
    let ProfileRevisionCheck = (memory.build >= 12.20) ? profile.commandRevision : profile.rvn;
    let QueryRevision = req.query.rvn || -1;
    let item;

    if (req.body.sourceIndex == 0) {
        item = profile.items[`Fortnite${req.body.targetIndex}-loadout`];
        profile.items[`Fortnite${req.body.targetIndex}-loadout`] = profile.items["sandbox_loadout"];
        profile.items[`Fortnite${req.body.targetIndex}-loadout`].attributes["locker_name"] = req.body.optNewNameForTarget;
        profile.stats.attributes.loadouts[req.body.targetIndex] = `Fortnite${req.body.targetIndex}-loadout`;
        ApplyProfileChanges = [{
            "changeType": "fullProfileUpdate",
            "profile": profile
        }];
    } else {
        item = profile.items[`Fortnite${req.body.sourceIndex}-loadout`];
        if (!item) return error.createError(
            "errors.com.epicgames.modules.profiles.operation_forbidden",
            `Locker item {0} not found`,
            [req.query.profileId], 12813, undefined, 403, res
        );

        profile.stats.attributes["active_loadout_index"] = req.body.sourceIndex;
        profile.stats.attributes["last_applied_loadout"] = `Fortnite${req.body.sourceIndex}-loadout`;
        profile.items["sandbox_loadout"].attributes["locker_slots_data"] = item.attributes["locker_slots_data"];
        ApplyProfileChanges = [{
            "changeType": "fullProfileUpdate",
            "profile": profile
        }];

    }

    if (ApplyProfileChanges.length > 0) {
        profile.rvn += 1;
        profile.commandRevision += 1;
        profile.updated = new Date().toISOString();
        await profiles.updateOne({ $set: { [`profiles.${req.query.profileId}`]: profile } });
    }

    if (QueryRevision != ProfileRevisionCheck) {
        ApplyProfileChanges = [{
            "changeType": "fullProfileUpdate",
            "profile": profile
        }];
    }

    res.json({
        profileRevision: profile.rvn || 0,
        profileId: req.query.profileId,
        profileChangesBaseRevision: BaseRevision,
        profileChanges: ApplyProfileChanges,
        profileCommandRevision: profile.commandRevision || 0,
        serverTime: new Date().toISOString(),
        responseVersion: 1
    });
})
app.post("/fortnite/api/game/v2/profile/:accountId/client/SetCosmeticLockerName", verifyToken, async (req, res) => {
    const profiles = await Profile.findOne({ accountId: req.user.accountId });
    var profile = profiles.profiles[req.query.profileId];

    const memory = functions.GetVersionInfo(req);

    if (!await profileManager.validateProfile(req.query.profileId, profiles)) return error.createError(
        "errors.com.epicgames.modules.profiles.operation_forbidden",
        `Unable to find template configuration for profile ${req.query.profileId}`,
        [req.query.profileId], 12813, undefined, 403, res
    );

    let ApplyProfileChanges = [];
    let BaseRevision = profile.rvn;
    let ProfileRevisionCheck = (memory.build >= 12.20) ? profile.commandRevision : profile.rvn;
    let QueryRevision = req.query.rvn || -1;
    let item = profile.items[req.body.lockerItem];
    if (!item) return error.createError(
        "errors.com.epicgames.modules.profiles.operation_forbidden",
        `Locker item {0} not found`,
        [req.query.profileId], 12813, undefined, 403, res
    );
    if (typeof req.body.name === "string" && item.attributes.locker_name != req.body.name) {

        item.attributes["locker_name"] = req.body.name;
        ApplyProfileChanges = [{
            "changeType": "itemAttrChanged",
            "itemId": req.body.lockerItem,
            "itemName": item.templateId,
            "item": item
        }];
        ApplyProfileChanges = [{
            "changeType": "fullProfileUpdate",
            "profile": profile
        }];
    };

    if (ApplyProfileChanges.length > 0) {
        profile.rvn += 1;
        profile.commandRevision += 1;
        profile.updated = new Date().toISOString();
        await profiles.updateOne({ $set: { [`profiles.${req.query.profileId}`]: profile } });
    }
    if (QueryRevision != ProfileRevisionCheck) {
        ApplyProfileChanges = [{
            "changeType": "fullProfileUpdate",
            "profile": profile
        }];
    }
    res.json({
        profileRevision: profile.rvn || 0,
        profileId: req.query.profileId,
        profileChangesBaseRevision: BaseRevision,
        profileChanges: ApplyProfileChanges,
        profileCommandRevision: profile.commandRevision || 0,
        serverTime: new Date().toISOString(),
        responseVersion: 1
    });
});

app.post("/fortnite/api/game/v2/profileclient/SetCosmeticLockerBanner", verifyToken, async (req, res) => {
    const profiles = await Profile.findOne({ accountId: req.user.accountId });

    if (!await profileManager.validateProfile(req.query.profileId, profiles)) return error.createError(
        "errors.com.epicgames.modules.profiles.operation_forbidden",
        `Unable to find template configuration for profile ${req.query.profileId}`,
        [req.query.profileId], 12813, undefined, 403, res
    );

    if (req.query.profileId != "athena") return error.createError(
        "errors.com.epicgames.modules.profiles.invalid_command",
        `SetCosmeticLockerBanner is not valid on ${req.query.profileId} profile`,
        ["SetCosmeticLockerBanner", req.query.profileId], 12801, undefined, 400, res
    );

    let profile = profiles.profiles[req.query.profileId];

    const memory = functions.GetVersionInfo(req);

    if (req.query.profileId == "athena") profile.stats.attributes.season_num = memory.season;

    let ApplyProfileChanges = [];
    let BaseRevision = profile.rvn;
    let ProfileRevisionCheck = (memory.build >= 12.20) ? profile.commandRevision : profile.rvn;
    let QueryRevision = req.query.rvn || -1;

    let missingFields = checkFields(["bannerIconTemplateName", "bannerColorTemplateName", "lockerItem"], req.body);

    if (missingFields.fields.length > 0) return error.createError(
        "errors.com.epicgames.validation.validation_failed",
        `Validation Failed. [${missingFields.fields.join(", ")}] field(s) is missing.`,
        [`[${missingFields.fields.join(", ")}]`], 1040, undefined, 400, res
    );

    if (typeof req.body.lockerItem != "string") return ValidationError("lockerItem", "a string", res);
    if (typeof req.body.bannerIconTemplateName != "string") return ValidationError("bannerIconTemplateName", "a string", res);
    if (typeof req.body.bannerColorTemplateName != "string") return ValidationError("bannerColorTemplateName", "a string", res);

    if (!profile.items) profile.items = {};

    if (!profile.items[req.body.lockerItem]) return error.createError(
        "errors.com.epicgames.fortnite.id_invalid",
        `Item (id: '${req.body.lockerItem}') not found`,
        [req.body.lockerItem], 16027, undefined, 400, res
    );

    if (profile.items[req.body.lockerItem].templateId.toLowerCase() != "cosmeticlocker:cosmeticlocker_athena") return error.createError(
        "errors.com.epicgames.fortnite.id_invalid",
        `lockerItem id is not a cosmeticlocker`,
        ["lockerItem"], 16027, undefined, 400, res
    );

    let bannerProfileId = "common_core";

    let HomebaseBannerIconID = "";
    let HomebaseBannerColorID = "";

    if (!profiles.profiles[bannerProfileId].items) profiles.profiles[bannerProfileId].items = {};

    for (let itemId in profiles.profiles[bannerProfileId].items) {
        let templateId = profiles.profiles[bannerProfileId].items[itemId].templateId;

        if (templateId.toLowerCase() == `HomebaseBannerIcon:${req.body.bannerIconTemplateName}`.toLowerCase()) { HomebaseBannerIconID = itemId; continue; }
        if (templateId.toLowerCase() == `HomebaseBannerColor:${req.body.bannerColorTemplateName}`.toLowerCase()) { HomebaseBannerColorID = itemId; continue; }

        if (HomebaseBannerIconID && HomebaseBannerColorID) break;
    }

    if (!HomebaseBannerIconID) return error.createError(
        "errors.com.epicgames.fortnite.item_not_found",
        `Banner template 'HomebaseBannerIcon:${req.body.bannerIconTemplateName}' not found in profile`,
        [`HomebaseBannerIcon:${req.body.bannerIconTemplateName}`], 16006, undefined, 400, res
    );

    if (!HomebaseBannerColorID) return error.createError(
        "errors.com.epicgames.fortnite.item_not_found",
        `Banner template 'HomebaseBannerColor:${req.body.bannerColorTemplateName}' not found in profile`,
        [`HomebaseBannerColor:${req.body.bannerColorTemplateName}`], 16006, undefined, 400, res
    );

    profile.items[req.body.lockerItem].attributes.banner_icon_template = req.body.bannerIconTemplateName;
    profile.items[req.body.lockerItem].attributes.banner_color_template = req.body.bannerColorTemplateName;

    profile.stats.attributes.banner_icon = req.body.bannerIconTemplateName;
    profile.stats.attributes.banner_color = req.body.bannerColorTemplateName;

    ApplyProfileChanges.push({
        "changeType": "itemAttrChanged",
        "itemId": req.body.lockerItem,
        "attributeName": "banner_icon_template",
        "attributeValue": profile.items[req.body.lockerItem].attributes.banner_icon_template
    });

    ApplyProfileChanges.push({
        "changeType": "itemAttrChanged",
        "itemId": req.body.lockerItem,
        "attributeName": "banner_color_template",
        "attributeValue": profile.items[req.body.lockerItem].attributes.banner_color_template
    });

    if (ApplyProfileChanges.length > 0) {
        profile.rvn += 1;
        profile.commandRevision += 1;
        profile.updated = new Date().toISOString();

        await profiles.updateOne({ $set: { [`profiles.${req.query.profileId}`]: profile } });
    }

    if (QueryRevision != ProfileRevisionCheck) {
        ApplyProfileChanges = [{
            "changeType": "fullProfileUpdate",
            "profile": profile
        }];
    }

    res.json({
        profileRevision: profile.rvn || 0,
        profileId: req.query.profileId,
        profileChangesBaseRevision: BaseRevision,
        profileChanges: ApplyProfileChanges,
        profileCommandRevision: profile.commandRevision || 0,
        serverTime: new Date().toISOString(),
        responseVersion: 1
    });
});

app.post("/fortnite/api/game/v2/profileclient/PutModularCosmeticLoadout", async (req, res) => {
    const profiles = await Profile.findOne({ accountId: req.user.accountId });
    let profile = profiles.profiles[req.query.profileId];


    var ApplyProfileChanges = [];
    var BaseRevision = profile.rvn || 0;
    var QueryRevision = req.query.rvn || -1;
    var StatChanged = false;

    if (!profile.stats.attributes.hasOwnProperty("loadout_presets")) {
        profile.stats.attributes.loadout_presets = {};

        ApplyProfileChanges.push({
            "changeType": "statModified",
            "name": "loadout_presets",
            "value": {}
        })

        StatChanged = true;
    }

    if (!profile.stats.attributes.loadout_presets.hasOwnProperty(req.body.loadoutType)) {
        const NewLoadoutID = functions.MakeID();

        profile.items[NewLoadoutID] = {
            "templateId": req.body.loadoutType,
            "attributes": {},
            "quantity": 1
        }

        ApplyProfileChanges.push({
            "changeType": "itemAdded",
            "itemId": NewLoadoutID,
            "item": profile.items[NewLoadoutID]
        })

        profile.stats.attributes.loadout_presets[req.body.loadoutType] = {
            [req.body.presetId]: NewLoadoutID
        };

        ApplyProfileChanges.push({
            "changeType": "statModified",
            "name": "loadout_presets",
            "value": profile.stats.attributes.loadout_presets
        })

        StatChanged = true;
    }

    var LoadoutGUID = [];

    try {
        LoadoutGUID = profile.stats.attributes.loadout_presets[req.body.loadoutType][req.body.presetId];
        profile.items[LoadoutGUID].attributes = JSON.parse(req.body.loadoutData);

        ApplyProfileChanges.push({
            "changeType": "itemAttrChanged",
            "itemId": LoadoutGUID,
            "attributeName": "slots",
            "attributeValue": profile.items[LoadoutGUID].attributes.slots
        })

        StatChanged = true;

    } catch (err) { }

    if (StatChanged == true) {
        profile.rvn += 1;
        profile.commandRevision += 1;

        await profiles.updateOne({ $set: { [`profiles.${req.query.profileId}`]: profile } });
    }


    if (QueryRevision != BaseRevision) {
        ApplyProfileChanges = [{
            "changeType": "fullProfileUpdate",
            "profile": profile
        }];
    }

    res.json({
        profileRevision: profile.rvn || 0,
        profileId: req.query.profileId,
        profileChangesBaseRevision: BaseRevision,
        profileChanges: ApplyProfileChanges,
        profileCommandRevision: profile.commandRevision || 0,
        serverTime: new Date().toISOString(),
        responseVersion: 1
    })
});

app.post("/fortnite/api/game/v2/profile/*/client/:operation", verifyToken, async (req, res) => {
    const profiles = await Profile.findOne({ accountId: req.user.accountId });

    if (!await profileManager.validateProfile(req.query.profileId, profiles)) return error.createError(
        "errors.com.epicgames.modules.profiles.operation_forbidden",
        `Unable to find template configuration for profile ${req.query.profileId}`,
        [req.query.profileId], 12813, undefined, 403, res
    );

    let profile = profiles.profiles[req.query.profileId];

    if (profile.rvn == profile.commandRevision) {
        profile.rvn += 1;

        if (req.query.profileId == "athena") {
            if (!profile.stats.attributes.last_applied_loadout) profile.stats.attributes.last_applied_loadout = profile.stats.attributes.loadouts[0];
        }

        await profiles.updateOne({ $set: { [`profiles.${req.query.profileId}`]: profile } });
    }

    const memory = functions.GetVersionInfo(req);

    if (req.query.profileId == "athena") profile.stats.attributes.season_num = memory.season;

    let MultiUpdate = [];

    if ((req.query.profileId == "common_core") && global.giftReceived[req.user.accountId]) {
        global.giftReceived[req.user.accountId] = false;

        let athena = profiles.profiles["athena"];

        MultiUpdate = [{
            "profileRevision": athena.rvn || 0,
            "profileId": "athena",
            "profileChangesBaseRevision": athena.rvn || 0,
            "profileChanges": [{
                "changeType": "fullProfileUpdate",
                "profile": athena
            }],
            "profileCommandRevision": athena.commandRevision || 0,
        }];
    }

    let ApplyProfileChanges = [];
    let BaseRevision = profile.rvn;
    let ProfileRevisionCheck = (memory.build >= 12.20) ? profile.commandRevision : profile.rvn;
    let QueryRevision = req.query.rvn || -1;
    let StatChanged = false;

    switch (req.params.operation) {
        case "QueryProfile": break;
        case "ClientQuestLogin": break;
        case "RefreshExpeditions": break;
        case "GetMcpTimeForLogin": break;
        case "IncrementNamedCounterStat": break;
        case "BulkEquipBattleRoyaleCustomization": break;
        case "RedeemRealMoneyPurchases": break;
        case "SetCosmeticLockerSlots": break;
        case "SetRandomCosmeticLoadoutFlag": break;
        case "SetSetting":
            if (req.body.key && req.body.value) {
                if (!profile.stats.attributes.settings) profile.stats.attributes.settings = {};
                profile.stats.attributes.settings[req.body.key] = req.body.value;
                ApplyProfileChanges.push({
                    "changeType": "statModified",
                    "name": "settings",
                    "value": profile.stats.attributes.settings
                });
                StatChanged = true;
            }
            break;
        case "SetClientQuestLoginParameters": break;
        case "RedeemRealMoneyPurchases": break;

        case "SetItemVariant":
            if (profile.items[req.body.itemToModify]) {
                let item = profile.items[req.body.itemToModify];
                if (!item.attributes.variants) item.attributes.variants = [];

                let index = item.attributes.variants.findIndex(x => x.channel == req.body.variantChannel);

                if (index == -1) {
                    item.attributes.variants.push({
                        "channel": req.body.variantChannel,
                        "active": req.body.variantTag,
                        "owned": [req.body.variantTag]
                    });
                } else {
                    item.attributes.variants[index].active = req.body.variantTag;
                    if (!item.attributes.variants[index].owned.includes(req.body.variantTag)) {
                        item.attributes.variants[index].owned.push(req.body.variantTag);
                    }
                }

                ApplyProfileChanges.push({
                    "changeType": "itemAttrChanged",
                    "itemId": req.body.itemToModify,
                    "attributeName": "variants",
                    "attributeValue": item.attributes.variants
                });
                StatChanged = true;
            }
            break;

        default:
            log.debug(`Unhandled MCP operation: ${req.params.operation}`);
            break;
    }

    if (StatChanged) {
        profile.rvn += 1;
        profile.commandRevision += 1;
        profile.updated = new Date().toISOString();

        await profiles.updateOne({ $set: { [`profiles.${req.query.profileId}`]: profile } });
    }

    if (QueryRevision != ProfileRevisionCheck) {
        ApplyProfileChanges = [{
            "changeType": "fullProfileUpdate",
            "profile": profile
        }];
    }

    res.json({
        profileRevision: profile.rvn || 0,
        profileId: req.query.profileId,
        profileChangesBaseRevision: BaseRevision,
        profileChanges: ApplyProfileChanges,
        profileCommandRevision: profile.commandRevision || 0,
        serverTime: new Date().toISOString(),
        multiUpdate: MultiUpdate,
        responseVersion: 1
    });
});

app.post("/fortnite/api/game/v2/profile/:accountId/dedicated_server/:operation", async (req, res) => {
    const profiles = await Profile.findOne({ accountId: req.params.accountId }).lean();
    if (!profiles) return res.status(404).json({});

    if (!await profileManager.validateProfile(req.query.profileId, profiles)) return error.createError(
        "errors.com.epicgames.modules.profiles.operation_forbidden",
        `Unable to find template configuration for profile ${req.query.profileId}`,
        [req.query.profileId], 12813, undefined, 403, res
    );

    let profile = profiles.profiles[req.query.profileId];

    let ApplyProfileChanges = [];
    let BaseRevision = profile.rvn;
    let QueryRevision = req.query.rvn || -1;

    if (QueryRevision != BaseRevision) {
        ApplyProfileChanges = [{
            "changeType": "fullProfileUpdate",
            "profile": profile
        }];
    }

    res.json({
        profileRevision: profile.rvn || 0,
        profileId: req.query.profileId,
        profileChangesBaseRevision: BaseRevision,
        profileChanges: ApplyProfileChanges,
        profileCommandRevision: profile.commandRevision || 0,
        serverTime: new Date().toISOString(),
        responseVersion: 1
    });
});

function checkFields(fields, body) {
    let missingFields = { fields: [] };

    fields.forEach(field => {
        if (!body[field]) missingFields.fields.push(field);
    });

    return missingFields;
}

function ValidationError(field, type, res) {
    return error.createError(
        "errors.com.epicgames.validation.validation_failed",
        `Validation Failed. '${field}' is not ${type}.`,
        [field], 1040, undefined, 400, res
    );
}

function checkIfDuplicateExists(arr) {
    return new Set(arr).size !== arr.length
}

module.exports = app;