const { MessageEmbed } = require("discord.js");
const User = require("../../../model/user.js");
const fs = require("fs");
const path = require("path");

module.exports = {
    commandInfo: {
        name: "appeal",
        description: "Appeal your ban from the backend.",
        options: [
            {
                name: "reason",
                description: "The reason why you should be unbanned.",
                required: true,
                type: 3
            }
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });

        const config = JSON.parse(fs.readFileSync("./Config/config.json").toString());
        const discordId = interaction.user.id;
        const appealReason = interaction.options.get("reason").value;


        const user = await User.findOne({ discordId: discordId });

        if (!user) {
            return interaction.editReply({ content: "You do not have an account linked to this Discord ID.", ephemeral: true });
        }

        if (!user.banned) {
            return interaction.editReply({ content: "Your account is not banned.", ephemeral: true });
        }

        if (!config.bAppealChannelId || config.bAppealChannelId.trim() === "") {
            return interaction.editReply({ content: "The appeal system is currently disabled (Appeal Channel ID not set).", ephemeral: true });
        }

        const appealChannel = interaction.client.channels.cache.get(config.bAppealChannelId);

        if (!appealChannel) {
            return interaction.editReply({ content: "Error: Could not find the appeal channel. Please contact an admin.", ephemeral: true });
        }

        const appealEmbed = new MessageEmbed()
            .setTitle("New Ban Appeal")
            .setColor("ORANGE")
            .setThumbnail(interaction.user.avatarURL({ dynamic: true }))
            .addFields(
                { name: "Username", value: user.username, inline: true },
                { name: "Discord Tag", value: interaction.user.tag, inline: true },
                { name: "Discord ID", value: interaction.user.id, inline: true },
                { name: "Original Ban Reason", value: user.banReason || "No reason specified", inline: false },
                { name: "Appeal Reason", value: appealReason, inline: false }
            )
            .setTimestamp()
            .setFooter({ text: "Reload Backend Appeals", iconURL: "https://i.imgur.com/2RImwlb.png" });

        try {
            await appealChannel.send({ embeds: [appealEmbed] });
            interaction.editReply({ content: "Your appeal has been successfully sent to the administrators!", ephemeral: true });
        } catch (err) {
            console.error(err);
            interaction.editReply({ content: "An error occurred while sending your appeal. Please try again later.", ephemeral: true });
        }
    }
}
