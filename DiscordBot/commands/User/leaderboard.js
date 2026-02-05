const { MessageEmbed } = require("discord.js");
const Arena = require("../../../model/arena.js");
const User = require("../../../model/user.js");


let cachedDescription = null;
let lastUpdate = 0;
const CACHE_DURATION = 60 * 60 * 1000;

module.exports = {
    commandInfo: {
        name: "leaderboard",
        description: "Shows the top 10 players with the most Arena Hype points (Updates every 1H).",
    },
    execute: async (interaction) => {
        await interaction.deferReply();

        const currentTime = Date.now();
        const timeUntilUpdate = lastUpdate + CACHE_DURATION - currentTime;

        if (cachedDescription && currentTime - lastUpdate < CACHE_DURATION) {
            const nextUpdateMinutes = Math.ceil(timeUntilUpdate / (60 * 1000));

            const embed = new MessageEmbed()
                .setTitle("Arena Leaderboard - Top 10")
                .setDescription(cachedDescription)
                .setColor("#FFD700")
                .setTimestamp(new Date(lastUpdate))
                .setFooter({
                    text: `Reload Backend • Next update in approx ${nextUpdateMinutes}m`
                });

            return interaction.editReply({ embeds: [embed] });
        }

        try {
            let topArenaPlayers = await Arena.find({}).sort({ hype: -1 }).limit(10);
            let isRandom = false;

            if (!topArenaPlayers || topArenaPlayers.length === 0) {
                const randomUsers = await User.aggregate([{ $sample: { size: 10 } }]);

                if (!randomUsers || randomUsers.length === 0) {
                    const noDataEmbed = new MessageEmbed()
                        .setTitle("Arena Leaderboard")
                        .setDescription("No players found in the database.")
                        .setColor("#3498db")
                        .setTimestamp();
                    return interaction.editReply({ embeds: [noDataEmbed] });
                }

                topArenaPlayers = randomUsers.map(u => ({
                    accountId: u.accountId,
                    hype: 0,
                    division: 1
                }));
                isRandom = true;
            }

            let description = "";
            for (let i = 0; i < topArenaPlayers.length; i++) {
                const entry = topArenaPlayers[i];
                const user = await User.findOne({ accountId: entry.accountId });
                const username = user ? user.username : "Unknown User";

                const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `**#${i + 1}**`;
                description += `${medal} **${username}**\n╰ Hype: \`${entry.hype.toLocaleString()}\` | Division: \`${entry.division || 1}\`\n\n`;
            }

            cachedDescription = description || "No players ranked yet.";
            lastUpdate = currentTime;

            const embed = new MessageEmbed()
                .setTitle(isRandom ? "Random Users (No Arena Data)" : "Arena Leaderboard - Top 10")
                .setDescription(cachedDescription)
                .setColor(isRandom ? "#3498db" : "#FFD700")
                .setTimestamp()
                .setFooter({
                    text: isRandom ? "Reload Backend • No leaderboard data found" : "Reload Backend • Results refresh every 1 hour"
                });

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error("Leaderboard Command Error:", error);
            await interaction.editReply("An error occurred while fetching the leaderboard.");
        }
    },
};
