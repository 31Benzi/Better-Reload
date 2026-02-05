const { MessageEmbed } = require("discord.js");
const fs = require("fs");
const path = require("path");
const Users = require('../../../model/user.js');
const Profiles = require('../../../model/profiles.js');
const SACCodes = require('../../../model/saccodes.js');
const Friends = require('../../../model/friends.js');
const log = require("../../../structs/log.js");
const config = require('../../../Config/config.json');

module.exports = {
    commandInfo: {
        name: "delete",
        description: "Deletes a user's account",
        options: [
            {
                name: "user",
                description: "The user you want to delete.",
                required: true,
                type: 6
            }
        ]
    },
    execute: async (interaction) => {
        await interaction.deferReply({ ephemeral: true });

        if (!config.moderators.includes(interaction.user.id)) {
            return interaction.editReply({ content: "You do not have moderator permissions.", ephemeral: true });
        }

        const targetUser = interaction.options.getUser('user');
        const deleteAccount = await Users.findOne({ discordId: targetUser.id });

        if (!deleteAccount) {
            await interaction.editReply({ content: "The selected user does not have **an account**", ephemeral: true });
            return;
        }

        const accountId = deleteAccount.accountId;
        const username = deleteAccount.username;
        let somethingDeleted = false;

        await Users.deleteOne({ discordId: targetUser.id }).then(() => {
            somethingDeleted = true;
        }).catch(error => {
            log.error('Error deleting from Users:', error);
        });

        await Profiles.deleteOne({ accountId: accountId }).then(() => {
            somethingDeleted = true;
        }).catch(error => {
            log.error('Error deleting from Profiles:', error);
        });

        await Friends.deleteOne({ accountId: accountId }).then(() => {
            somethingDeleted = true;
        }).catch(error => {
            log.error('Error deleting from Friends:', error);
        });

        await SACCodes.deleteOne({ owneraccountId: accountId }).then(() => {
            somethingDeleted = true;
        }).catch(error => {
            log.error('Error deleting from SACCodes:', error);
        });

        const clientSettingsPath = path.join(__dirname, '../../../ClientSettings', accountId);
        if (fs.existsSync(clientSettingsPath)) {
            fs.rmSync(clientSettingsPath, { recursive: true, force: true });
            somethingDeleted = true;
        }

        if (!somethingDeleted) {
            await interaction.editReply({ content: `No data found to delete for **${username}**.`, ephemeral: true });
            return;
        }

        const embed = new MessageEmbed()
            .setTitle("Account deleted")
            .setDescription(`The account for **${username}** has been **deleted**`)
            .setColor("GREEN")
            .setFooter({
                text: "Reload Backend",
                iconURL: "https://i.imgur.com/2RImwlb.png"
            })
            .setTimestamp();

        await interaction.editReply({ embeds: [embed], ephemeral: true });
    }
};