# Roblox Rank Sync Bot

A production-quality Discord bot that syncs Roblox group ranks to Discord roles and nicknames across multiple servers and groups with a unified verification system.

## Features

✅ **Multi-Server Support** - One bot handles multiple Discord servers  
✅ **Multi-Group Support** - Each server can be linked to a different Roblox group  
✅ **Unified Verification** - Verify once, work across all servers  
✅ **Automatic Rank Syncing** - Keeps roles and nicknames up to date  
✅ **Custom Nickname Formats** - Different formats per server (rank-based or custom)  
✅ **Background Sync** - Optional scheduled syncing per server  
✅ **Rate Limiting** - Built-in protection against API rate limits  
✅ **Admin Commands** - Force sync, reload config, and more  
✅ **Detailed Logging** - Optional rank change logging per server  

## Requirements

- Node.js 16.9.0 or higher
- A Discord bot account with the following permissions:
  - Manage Roles
  - Manage Nicknames
  - Send Messages
  - Use Slash Commands
- Roblox group(s) that you want to sync

## Installation

### 1. Clone or Download

Download this project to your server or computer.

### 2. Install Dependencies

```bash
cd roblox-rank-bot
npm install
```

### 3. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` and add your bot token:

```env
DISCORD_TOKEN=your_discord_bot_token_here
CLIENT_ID=your_bot_client_id_here
```

**Getting your bot token:**
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application or select an existing one
3. Go to the "Bot" section
4. Copy the token
5. The CLIENT_ID is your Application ID found in "General Information"

### 4. Configure Servers

Edit `config/servers.json` to add your Discord servers and Roblox groups.

See the **Configuration Guide** section below for detailed instructions.

### 5. Deploy Commands

Deploy slash commands to Discord:

```bash
node src/deploy-commands.js
```

### 6. Start the Bot

```bash
npm start
```

For development with auto-restart:

```bash
npm run dev
```

## Configuration Guide

### Adding a New Server

Edit `config/servers.json` and add a new server configuration:

```json
{
  "servers": [
    {
      "guildId": "YOUR_DISCORD_SERVER_ID",
      "guildName": "My Server Name",
      "robloxGroupId": 123456,
      "nicknameFormat": "rank",
      "rankMappings": {
        "1": {
          "roleName": "Member",
          "nicknamePrefix": "[M] "
        },
        "5": {
          "roleName": "Officer",
          "nicknamePrefix": "[O] "
        },
        "255": {
          "roleName": "Owner",
          "nicknamePrefix": "[OWNER] "
        }
      },
      "syncSettings": {
        "backgroundSyncEnabled": true,
        "syncIntervalMinutes": 30,
        "syncOnJoin": true,
        "syncOnVerify": true
      },
      "loggingChannelId": "CHANNEL_ID_FOR_LOGS"
    }
  ]
}
```

### Configuration Fields Explained

#### Required Fields

- **guildId**: Your Discord server ID (enable Developer Mode in Discord, right-click server, Copy ID)
- **robloxGroupId**: The Roblox group ID to sync with this server
- **rankMappings**: Maps Roblox ranks to Discord roles

#### Nickname Formats

**Option 1: Rank-based (different prefix per rank)**
```json
"nicknameFormat": "rank",
"rankMappings": {
  "1": {
    "roleName": "Civilian",
    "nicknamePrefix": "[L-0 ] "
  },
  "5": {
    "roleName": "Staff",
    "nicknamePrefix": "[L-2 ] "
  }
}
```
Result: `[L-0 ] RobloxUsername` or `[L-2 ] RobloxUsername`

**Option 2: Custom (same prefix for all ranks)**
```json
"nicknameFormat": "custom",
"customNicknamePrefix": "[GMT] ",
"rankMappings": {
  "1": {
    "roleName": "Member"
  },
  "5": {
    "roleName": "Admin"
  }
}
```
Result: `[GMT] RobloxUsername` for all users

#### Rank Mappings

The bot uses "closest rank" logic:
- If a user has rank 7 and you only defined ranks 1, 5, and 10
- The bot will use rank 5's settings (highest defined rank ≤ user's rank)

Example:
```json
"rankMappings": {
  "1": {
    "roleName": "Guest",
    "nicknamePrefix": "[G] "
  },
  "5": {
    "roleName": "Member", 
    "nicknamePrefix": "[M] "
  },
  "10": {
    "roleName": "Admin",
    "nicknamePrefix": "[A] "
  },
  "255": {
    "roleName": "Owner",
    "nicknamePrefix": "[OWNER] "
  }
}
```

- Rank 1-4: Gets "Guest" role
- Rank 5-9: Gets "Member" role
- Rank 10-254: Gets "Admin" role
- Rank 255: Gets "Owner" role

#### Sync Settings

```json
"syncSettings": {
  "backgroundSyncEnabled": true,    // Enable automatic syncing
  "syncIntervalMinutes": 30,        // How often to sync (in minutes)
  "syncOnJoin": true,               // Sync when verified user joins server
  "syncOnVerify": true              // Sync immediately when user verifies
}
```

#### Optional Fields

- **guildName**: Friendly name for logging (optional)
- **loggingChannelId**: Channel ID for rank change logs (optional, set to `null` to disable)

### Example Configurations

#### Example 1: Main Foundation Server

```json
{
  "guildId": "123456789012345678",
  "guildName": "SCP Foundation Main",
  "robloxGroupId": 123456,
  "nicknameFormat": "rank",
  "rankMappings": {
    "1": {
      "roleName": "D-Class Personnel",
      "nicknamePrefix": "[D] "
    },
    "50": {
      "roleName": "Researcher",
      "nicknamePrefix": "[RES] "
    },
    "100": {
      "roleName": "Senior Researcher",
      "nicknamePrefix": "[SR] "
    },
    "200": {
      "roleName": "O5 Council",
      "nicknamePrefix": "[O5] "
    }
  },
  "syncSettings": {
    "backgroundSyncEnabled": true,
    "syncIntervalMinutes": 30,
    "syncOnJoin": true,
    "syncOnVerify": true
  },
  "loggingChannelId": "987654321098765432"
}
```

#### Example 2: Department Server

```json
{
  "guildId": "876543210987654321",
  "guildName": "Engineering Department",
  "robloxGroupId": 789012,
  "nicknameFormat": "custom",
  "customNicknamePrefix": "[ENG] ",
  "rankMappings": {
    "1": {
      "roleName": "Trainee"
    },
    "50": {
      "roleName": "Engineer"
    },
    "100": {
      "roleName": "Senior Engineer"
    },
    "255": {
      "roleName": "Chief Engineer"
    }
  },
  "syncSettings": {
    "backgroundSyncEnabled": true,
    "syncIntervalMinutes": 60,
    "syncOnJoin": true,
    "syncOnVerify": true
  },
  "loggingChannelId": null
}
```

## Commands

### User Commands

- `/verify <username>` - Link your Roblox account
- `/reverify <username>` - Change your linked Roblox account
- `/sync` - Manually sync your rank and roles
- `/rank` - Check your current Roblox rank

### Admin Commands (Require Administrator permission)

- `/forcesync` - Force sync all verified users in the server
- `/reloadconfig` - Reload the server configuration file

## Setup Discord Roles

For each server, you need to create Discord roles that match your rank mappings.

### Steps:

1. Go to Server Settings → Roles
2. Create roles with the **exact names** specified in your `rankMappings`
3. Make sure the bot's role is **higher** than all the roles it needs to manage
4. Give the bot the **Manage Roles** and **Manage Nicknames** permissions

**Example:**
If your config has:
```json
"roleName": "Foundation Personnel"
```

You must create a Discord role called exactly `Foundation Personnel`

## Bot Permissions

When inviting the bot to your server, use this permissions integer: **268511296**

This includes:
- Manage Roles
- Manage Nicknames
- Send Messages
- Use Slash Commands

**Invite Link Format:**
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=268511296&scope=bot%20applications.commands
```

Replace `YOUR_CLIENT_ID` with your bot's client ID.

## How It Works

### Verification System

1. User runs `/verify RobloxUsername`
2. Bot fetches Roblox user ID
3. Stores verification in database (Discord ID → Roblox ID)
4. This verification works across **all servers** the bot is in

### Rank Syncing

When a user is synced:

1. Bot fetches their current rank from the configured Roblox group
2. Finds the appropriate Discord role based on rank mappings
3. Removes all other managed roles
4. Adds the correct role
5. Updates nickname with the configured format
6. Logs changes if logging is enabled

### Background Sync

If enabled, the bot will:

1. Automatically sync all verified users at the configured interval
2. Check for rank changes
3. Update roles and nicknames as needed
4. Log any changes

## Troubleshooting

### Bot can't change nicknames

**Problem**: "Missing MANAGE_NICKNAMES permission" or "Cannot change server owner nickname"

**Solutions**:
- Ensure bot has "Manage Nicknames" permission
- Bot cannot change the server owner's nickname (Discord limitation)
- Bot's role must be higher than the user's highest role

### Roles not updating

**Problem**: Roles aren't being added/removed

**Solutions**:
- Check that Discord roles exist with exact names from config
- Ensure bot has "Manage Roles" permission
- Bot's role must be higher than roles it's trying to manage
- Check bot logs for errors

### "Server not configured"

**Problem**: Commands return "server not configured"

**Solutions**:
- Add server to `config/servers.json`
- Run `/reloadconfig` after editing config
- Restart the bot
- Check that guild ID is correct

### Rank not found / User not in group

**Problem**: User shows rank 0 or "Guest"

**Solutions**:
- Verify user is actually in the Roblox group
- Check that Roblox group ID is correct in config
- Ensure Roblox group is public or user has proper visibility settings

### Commands not showing up

**Problem**: Slash commands don't appear

**Solutions**:
- Run `node src/deploy-commands.js` to deploy commands
- Wait a few minutes for Discord to update
- Check that CLIENT_ID is correct in .env
- Make sure bot has "applications.commands" scope

## Advanced Configuration

### Changing Background Sync Interval

Edit the server config:
```json
"syncIntervalMinutes": 60  // Sync every hour
```

Then run `/reloadconfig` or restart the bot.

### Multiple Servers with Same Group

You can have multiple Discord servers pointing to the same Roblox group but with different nickname formats:

**Server 1:**
```json
"nicknameFormat": "rank",
"nicknamePrefix": "[L-1 ] "
```

**Server 2:**
```json
"nicknameFormat": "custom",
"customNicknamePrefix": "[GMT] "
```

### Disabling Background Sync

```json
"backgroundSyncEnabled": false
```

Users can still manually sync with `/sync`, and auto-sync on join/verify will still work if enabled.

## Hosting

This bot can be hosted on:

- VPS (Ubuntu, Debian, etc.)
- Dedicated server
- Hosting services (Heroku, Railway, etc.)
- Your local computer (for testing)

### Hosting Requirements:

- Node.js 16.9.0+
- Persistent file system (for SQLite database)
- Ability to keep process running (use PM2 or similar)

### Using PM2 (Recommended for production):

```bash
npm install -g pm2
pm2 start src/index.js --name roblox-bot
pm2 save
pm2 startup
```

## File Structure

```
roblox-rank-bot/
├── config/
│   └── servers.json          # Server configurations
├── src/
│   ├── commands/             # Slash commands
│   │   ├── verify.js
│   │   ├── sync.js
│   │   ├── rank.js
│   │   ├── reverify.js
│   │   ├── forcesync.js
│   │   └── reloadconfig.js
│   ├── events/               # Event handlers
│   │   ├── ready.js
│   │   ├── interactionCreate.js
│   │   └── guildMemberAdd.js
│   ├── services/             # Core services
│   │   ├── RobloxService.js
│   │   ├── RankSyncService.js
│   │   └── BackgroundSyncScheduler.js
│   ├── database/
│   │   └── DatabaseManager.js
│   ├── config/
│   │   └── ConfigManager.js
│   ├── deploy-commands.js    # Command deployment
│   └── index.js              # Main bot file
├── data/                     # Database files (created automatically)
├── .env                      # Environment variables
├── .env.example              # Example environment file
├── package.json
└── README.md
```

## Database

The bot uses SQLite for data storage. The database is automatically created in the `data/` folder.

### Tables:

**verifications**
- discord_id (Primary Key)
- roblox_id
- roblox_username
- verified_at

**guild_ranks**
- discord_id, guild_id (Composite Primary Key)
- last_known_rank
- last_synced_at

## Support

If you encounter issues:

1. Check bot logs in console
2. Verify configuration in `servers.json`
3. Ensure all Discord roles are created correctly
4. Check bot permissions and role hierarchy
5. Review this README for common issues

## License

MIT License - Feel free to modify and use for your own servers.

## Credits

Built with discord.js v14 and love ❤️
