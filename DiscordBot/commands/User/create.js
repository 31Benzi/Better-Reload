const { MessageEmbed } = require("discord.js");
const User = require("../../../model/user.js")
const functions = require("../../../structs/functions.js");
const crypto = require("crypto");

module.exports = {
    commandInfo: {
        name: "create",
        description: "Creates an account on Reload Backend.",
        options: [
            {
                name: "username",
                description: "Your username.",
                required: true,
                type: 3
            }
        ],
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });

        const { options } = interaction;

        const discordId = interaction.user.id;
        const username = options.get("username").value;
        const email = `${interaction.user.username}@reload.com`.toLowerCase();
        const password = crypto.randomBytes(6).toString('hex');

        const existingEmail = await User.findOne({ email });
        const existingUser = await User.findOne({ username_lower: username.toLowerCase() });

        if (username.length < 3) {
            return interaction.editReply({ content: "Your username must be at least 3 characters long.", ephemeral: true });
        }
        if (username.length > 20) {
            return interaction.editReply({ content: "Your username must be 20 characters or less.", ephemeral: true });
        }
        if (existingEmail) {
            return interaction.editReply({ content: "An account with your Discord username already exists!", ephemeral: true });
        }
        if (existingUser) {
            return interaction.editReply({ content: "Username already exists. Please choose a different one.", ephemeral: true });
        }

        await functions.registerUser(discordId, username, email, password).then(async resp => {
            const isError = resp.status >= 400;

            let embed = new MessageEmbed()
                .setColor(isError ? "#ff0000" : "#56ff00")
                .addFields({
                    name: "Username",
                    value: username,
                    inline: true
                }, {
                    name: "Email",
                    value: email,
                    inline: true
                }, {
                    name: "Password",
                    value: isError ? "N/A" : `||${password}||`,
                    inline: true
                })
                .setTimestamp()
                .setFooter({
                    text: "Reload Backend",
                    iconURL: "https://i.imgur.com/2RImwlb.png"
                });

            if (isError) return interaction.editReply({ embeds: [embed], ephemeral: true });


            let dmSent = true;
            await interaction.user.send({
                content: `Hello ${interaction.user.username}, here are your account details for Reload Backend:`,
                embeds: [embed]
            }).catch(() => {
                dmSent = false;
            });


            const replyContent = dmSent
                ? "Account created successfully! I have also sent your details to your DMs."
                : "Account created successfully! (⚠️ Note: I couldn't DM you, please make sure your DMs are open next time)";

            interaction.editReply({ content: replyContent, ephemeral: true });

        });
    }
}