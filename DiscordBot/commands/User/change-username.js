const { MessageEmbed } = require("discord.js");
const User = require("../../../model/user.js");
const Badwords = require("bad-words");
const functions = require("../../../structs/functions.js");

const badwords = new Badwords();

module.exports = {
    commandInfo: {
        name: "change-username",
        description: "Change your username.",
        options: [
            {
                name: "username",
                description: "Your new username.",
                required: true,
                type: 3
            }
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });

        const user = await User.findOne({ discordId: interaction.user.id });
        if (!user)
            return interaction.editReply({ content: "You are not registered!", ephemeral: true });

        const username = interaction.options.getString('username');


        if (user.lastUsernameChange) {
            const oneWeek = 7 * 24 * 60 * 60 * 1000;
            const timeElapsed = Date.now() - new Date(user.lastUsernameChange).getTime();

            if (timeElapsed < oneWeek) {
                const timeLeft = oneWeek - timeElapsed;
                const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
                const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));

                return interaction.editReply({
                    content: `You can only change your username once a week. Please wait **${days}d ${hours}h ${minutes}m** before trying again.`,
                    ephemeral: true
                });
            }
        }

        if (badwords.isProfane(username)) {
            return interaction.editReply({ content: "Invalid username. Username must not contain inappropriate language." });
        }

        const existingUser = await User.findOne({ username_lower: username.toLowerCase() });
        if (existingUser) {
            return interaction.editReply({ content: "Username already exists. Please choose a different one.", ephemeral: true });
        }
        if (username.length > 20) {
            return interaction.editReply({ content: "Your username must be 20 characters or less.", ephemeral: true });
        }
        if (username.length < 3) {
            return interaction.editReply({ content: "Your username must be at least 3 characters long.", ephemeral: true });
        }

        await user.updateOne({ $set: { username: username, username_lower: username.toLowerCase(), lastUsernameChange: new Date() } });

        const refreshTokenIndex = global.refreshTokens.findIndex(i => i.accountId == user.accountId);
        if (refreshTokenIndex != -1) global.refreshTokens.splice(refreshTokenIndex, 1);

        const accessTokenIndex = global.accessTokens.findIndex(i => i.accountId == user.accountId);
        if (accessTokenIndex != -1) {
            global.accessTokens.splice(accessTokenIndex, 1);

            const xmppClient = global.Clients.find(client => client.accountId == user.accountId);
            if (xmppClient) xmppClient.client.close();
        }

        if (accessTokenIndex != -1 || refreshTokenIndex != -1) {
            await functions.UpdateTokens();
        }

        const embed = new MessageEmbed()
            .setTitle("Username changed")
            .setDescription(`Your account username has been changed to **${username}**.`)
            .setColor("GREEN")
            .setFooter({
                text: "Reload Backend",
                iconURL: "https://i.imgur.com/2RImwlb.png",
            })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed], ephemeral: true });
    }
};