# Updates

# Update 1
## Bot Commands

### New
/appeal: New command for banned users. Sends their appeal to a logs channel.

/check-user: New admin command to lookup users by Name, Discord, or ID. Shows full profile and ban status.

### Updated
/create: Now auto-generates email (@reload.com) and a random 12-char password. Details are DMed to the user.

/ban: Added durations (1h, 1d, etc.) and reasons. Banned players see the reason and a countdown timer in-game.

/unban: Now sends a DM notification to the user when they are unbanned.

/change-username: Added a 1-week cooldown with a countdown timer.

### Removed
/lookup

/change-password

/change-email

### Other
Backend: Added automatic unbanning logic and expanded the database to track ban reasons and timestamps.

### Athena

allathena - now gives skins above C4S2

### Arena

Added Arena - credits to Ducki67

# Update 2

## Bot Commands

### New

/leaderboard: New command for Top 10 Arena players with 1-hour auto-caching.


## Comp

Tournament: Added "Reload Tournament"

## Backend

Stability: Fixed the server crash caused by viewing players with 0 stats

Database: Upgraded schema to track ban expiry times and username change history
