const { MessageEmbed } = require("discord.js");
const Users = require('../../../model/user.js');
const Profiles = require('../../../model/profiles.js');
const config = require('../../../Config/config.json');
const log = require("../../../structs/log.js");
const functions = require("../../../structs/functions.js");


module.exports = {
    commandInfo: {
        name: "remove",
        description: "Allows you to remove items from a user's locker.",
        options: [
            {
                name: "type",
                description: "What to remove",
                required: true,
                type: 3,
                choices: [
                    { name: "All Cosmetics", value: "all" },
                    { name: "Single Item", value: "item" }
                ]
            },
            {
                name: "user",
                description: "The user to remove items from",
                required: true,
                type: 6
            },
            {
                name: "itemname",
                description: "The name of the item to remove (required if Single Item is selected)",
                required: false,
                type: 3
            }
        ]
    },
    execute: async (interaction) => {
        if (!config.moderators.includes(interaction.user.id)) {
            return interaction.reply({ content: "You do not have moderator permissions.", ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });

        const type = interaction.options.getString('type');
        const selectedUser = interaction.options.getUser('user');
        const itemname = interaction.options.getString('itemname');
        const selectedUserId = selectedUser?.id;

        try {
            const targetUser = await Users.findOne({ discordId: selectedUserId });
            if (!targetUser) {
                return interaction.editReply({ content: "That user does not own an account" });
            }

            const profile = await Profiles.findOne({ accountId: targetUser.accountId });
            if (!profile) {
                return interaction.editReply({ content: "That user does not have a profile" });
            }

            const athena = profile.profiles.athena;

            if (type === "all") {
                athena.items = {};

                await Profiles.updateOne(
                    { accountId: targetUser.accountId },
                    { $set: { "profiles.athena.items": {} } }
                );

                await functions.updateCosmeticCount(targetUser.accountId);


                const embed = new MessageEmbed()
                    .setTitle("Cosmetics Removed")
                    .setDescription(`Successfully removed all cosmetics from **${selectedUser.username}**'s account.`)
                    .setColor("RED")
                    .setFooter({ text: "Reload Backend", iconURL: "https://i.imgur.com/2RImwlb.png" })
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

            if (type === "item") {
                if (!itemname) {
                    return interaction.editReply({ content: "Please provide an item name." });
                }

                const response = await fetch(`https://fortnite-api.com/v2/cosmetics/br/search?name=${encodeURIComponent(itemname)}`);
                const json = await response.json();

                if (json.status !== 200 || !json.data) {
                    return interaction.editReply({ content: `Could not find the item "${itemname}".` });
                }

                const itemData = json.data;
                const itemKeys = Object.keys(athena.items);
                const foundKey = itemKeys.find(key => key.toLowerCase().includes(itemData.id.toLowerCase()));

                if (!foundKey) {
                    return interaction.editReply({ content: `User does not own the item "${itemData.name}".` });
                }

                delete athena.items[foundKey];

                await Profiles.updateOne(
                    { accountId: targetUser.accountId },
                    { $set: { "profiles.athena.items": athena.items } }
                );

                await functions.updateCosmeticCount(targetUser.accountId);


                const embed = new MessageEmbed()
                    .setTitle("Item Removed")
                    .setDescription(`Successfully removed **${itemData.name}** from **${selectedUser.username}**'s account.`)
                    .setThumbnail(itemData.images.icon)
                    .setColor("RED")
                    .setFooter({ text: "Reload Backend", iconURL: "https://i.imgur.com/2RImwlb.png" })
                    .setTimestamp();

                return await interaction.editReply({ embeds: [embed] });
            }

        } catch (error) {
            log.error("An error occurred:", error);
            interaction.editReply({ content: "An error occurred while processing the request." });
        }
    }
};
