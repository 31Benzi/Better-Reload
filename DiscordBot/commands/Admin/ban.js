const { MessageEmbed } = require("discord.js");
const User = require("../../../model/user.js");
const functions = require("../../../structs/functions.js");
const fs = require("fs");
const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());

module.exports = {
    commandInfo: {
        name: "ban",
        description: "Ban a user from the backend by their username.",
        options: [
            {
                name: "username",
                description: "Target username.",
                required: true,
                type: 3
            },
            {
                name: "duration",
                description: "Duration (e.g., 1h, 2h, 1d, 7d). Leave empty for permanent.",
                required: false,
                type: 3
            },
            {
                name: "reason",
                description: "Reason for the ban.",
                required: false,
                type: 3
            }
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });

        if (!config.moderators.includes(interaction.user.id)) {
            return interaction.editReply({ content: "You do not have moderator permissions.", ephemeral: true });
        }

        const { options } = interaction;
        const username = options.get("username").value;
        const durationStr = options.get("duration")?.value;
        const reason = options.get("reason")?.value || "No reason provided";

        const targetUser = await User.findOne({ username_lower: username.toLowerCase() });

        if (!targetUser) return interaction.editReply({ content: "The account username you entered does not exist.", ephemeral: true });

        let banExpires = null;
        let durationDisplay = "permanently";

        if (durationStr) {
            const match = durationStr.match(/^(\d+)([hdm])$/);
            if (!match) {
                return interaction.editReply({ content: "Invalid duration format! Use e.g., 1h, 2h, 1d, 7d.", ephemeral: true });
            }

            const amount = parseInt(match[1]);
            const unit = match[2];
            banExpires = new Date();

            if (unit === 'h') {
                banExpires.setHours(banExpires.getHours() + amount);
                durationDisplay = `for ${amount} hour(s)`;
            } else if (unit === 'd') {
                banExpires.setDate(banExpires.getDate() + amount);
                durationDisplay = `for ${amount} day(s)`;
            } else if (unit === 'm') {
                banExpires.setMinutes(banExpires.getMinutes() + amount);
                durationDisplay = `for ${amount} minute(s)`;
            }
        }

        if (targetUser.banned && !targetUser.banExpires) {
            return interaction.editReply({ content: "This account is already permanently banned.", ephemeral: true });
        }

        await targetUser.updateOne({ $set: { banned: true, banExpires: banExpires, banReason: reason } });

        let refreshToken = global.refreshTokens.findIndex(i => i.accountId == targetUser.accountId);
        if (refreshToken != -1) global.refreshTokens.splice(refreshToken, 1);

        let accessToken = global.accessTokens.findIndex(i => i.accountId == targetUser.accountId);
        if (accessToken != -1) {
            global.accessTokens.splice(accessToken, 1);

            let xmppClient = global.Clients.find(client => client.accountId == targetUser.accountId);
            if (xmppClient) xmppClient.client.close();
        }

        if (accessToken != -1 || refreshToken != -1) functions.UpdateTokens();


        let dmStatus = "";
        if (targetUser.discordId) {
            try {
                const discordUser = await interaction.client.users.fetch(targetUser.discordId);
                const banEmbed = new MessageEmbed()
                    .setTitle("Account Banned")
                    .setDescription(`Your account **${targetUser.username}** has been banned from **Reload Backend**.`)
                    .setColor("#ff0000")
                    .addFields({
                        name: "Reason",
                        value: reason,
                        inline: true
                    }, {
                        name: "Duration",
                        value: durationDisplay,
                        inline: true
                    })
                    .setTimestamp()
                    .setFooter({
                        text: "Reload Backend Admin Team",
                        iconURL: "https://i.imgur.com/2RImwlb.png"
                    });

                if (banExpires) {
                    banEmbed.addField("Expires on", banExpires.toUTCString());
                }

                banEmbed.addField("How to Appeal", "If you believe this was a mistake, you can use the `/appeal` command in our Discord server or this chat.");

                await discordUser.send({ embeds: [banEmbed] });
                dmStatus = " (User notified via DM)";
            } catch (err) {
                dmStatus = " (Could not DM user - DMs closed or user not found)";
            }
        } else {
            dmStatus = " (User has no linked Discord ID)";
        }

        interaction.editReply({ content: `Successfully banned **${targetUser.username}** ${durationDisplay}.${dmStatus}`, ephemeral: true });
    }
}