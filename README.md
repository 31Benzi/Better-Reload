# Updates

# Update 4

## Cosmetics
Fixed the issue where skin styles (like Superhero skins) aren't saving.

## Database
Added automatic tracking for skin and pickaxe counts in the database.

---

# Update 3

## Bot
Bot now sends an image of the item shop every 24H.

## Bot Commands

### New
/add: Add V-Bucks/item/all + OG Pack in one place.  
/remove: Remove all/items in one place.

## API's
Fixed 20+ APIs in V27.11.

## Settings
Settings are now saved.

## Matchmaker
Matchmaker now shows players in queue and the timer is fixed.

---

# Update 2

## Bot Commands

### New
/leaderboard: New command for Top 10 Arena players with 1-hour auto-caching.

## Comp
Tournament: Added "Reload Tournament".

## Backend
Stability: Fixed server crash caused by viewing players with 0 stats.  
Database: Upgraded schema to track ban expiry times and username change history.

---

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
allathena now gives skins above C4S2.

### Arena
Added Arena — credits to Ducki67.
