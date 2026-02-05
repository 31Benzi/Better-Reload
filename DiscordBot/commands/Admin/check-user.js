const { MessageEmbed } = require("discord.js");
const User = require("../../../model/user.js");
const fs = require("fs");
const path = require("path");

module.exports = {
    commandInfo: {
        name: "check-user",
        description: "Fetch information about a user account.",
        options: [
            {
                name: "query",
                description: "Search by Username, Discord ID, or Account ID.",
                required: true,
                type: 3
            }
        ]
    },
    execute: async (interaction) => {
        try {
            await interaction.deferReply({ ephemeral: true });

            const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());
            if (!config.moderators.includes(interaction.user.id)) {
                return interaction.editReply({ content: "You do not have moderator permissions.", ephemeral: true });
            }

            const query = interaction.options.get("query")?.value;
            if (!query) return interaction.editReply({ content: "Please provide a search query.", ephemeral: true });


            let targetUser = await User.findOne({
                $or: [
                    { username_lower: query.toLowerCase() },
                    { discordId: query },
                    { accountId: query }
                ]
            });


            if (!targetUser) {
                const mentionMatch = query.match(/^<@!?(\d+)>$/);
                if (mentionMatch) {
                    targetUser = await User.findOne({ discordId: mentionMatch[1] });
                }
            }

            if (!targetUser) {
                return interaction.editReply({ content: `Could not find any user matching: \`${query}\``, ephemeral: true });
            }

            const embed = new MessageEmbed()
                .setTitle(`User Information: ${targetUser.username}`)
                .setColor(targetUser.banned ? "#ff0000" : "#56ff00")
                .addFields(
                    { name: "Display Name", value: `\`${targetUser.username}\``, inline: true },
                    { name: "Email", value: `\`${targetUser.email}\``, inline: true },
                    { name: "Account ID", value: `\`${targetUser.accountId}\``, inline: true },
                    { name: "Discord ID", value: targetUser.discordId ? `<@${targetUser.discordId}> (\`${targetUser.discordId}\`)` : "Not Linked", inline: false },
                    { name: "Creation Date", value: `<t:${Math.floor(new Date(targetUser.created).getTime() / 1000)}:R>`, inline: true },
                    { name: "Status", value: targetUser.banned ? "🔴 Banned" : "🟢 Active", inline: true },
                    { name: "SAC Code", value: targetUser.currentSACCode ? `\`${targetUser.currentSACCode}\`` : "None", inline: true }
                )
                .setTimestamp()
                .setFooter({ text: "Reload Backend Administration", iconURL: "https://i.imgur.com/2RImwlb.png" });

            if (targetUser.banned) {
                embed.addField("Ban Reason", targetUser.banReason || "No reason provided", false);
                if (targetUser.banExpires) {
                    embed.addField("Ban Expires", `<t:${Math.floor(new Date(targetUser.banExpires) / 1000)}:R>`, true);
                } else {
                    embed.addField("Ban Type", "Permanent", true);
                }
            }

            interaction.editReply({ embeds: [embed], ephemeral: true });
        } catch (err) {
            console.error("Error in check-user command:", err);
            if (interaction.deferred) {
                interaction.editReply({ content: "An error occurred while fetching user data.", ephemeral: true });
            } else {
                interaction.reply({ content: "An error occurred while fetching user data.", ephemeral: true });
            }
        }
    }
}
