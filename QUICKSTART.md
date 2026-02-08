# Quick Start Guide

Get your Roblox Rank Sync Bot running in 5 minutes!

## Prerequisites

- Node.js 16.9.0+ installed
- A Discord bot created at https://discord.com/developers/applications
- Your Roblox group ID(s)

## Step 1: Install

```bash
cd roblox-rank-bot
npm install
```

## Step 2: Configure Bot Token

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add:
   - Your Discord bot token (from Developer Portal → Bot → Token)
   - Your bot's Client ID (from Developer Portal → General Information → Application ID)

```env
DISCORD_TOKEN=your_token_here
CLIENT_ID=your_client_id_here
```

## Step 3: Configure Your Server

Edit `config/servers.json`:

```json
{
  "servers": [
    {
      "guildId": "YOUR_SERVER_ID",
      "guildName": "My Server",
      "robloxGroupId": YOUR_GROUP_ID,
      "nicknameFormat": "rank",
      "rankMappings": {
        "1": {
          "roleName": "Member",
          "nicknamePrefix": "[M] "
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
      "loggingChannelId": null
    }
  ]
}
```

**How to get your Discord Server ID:**
1. Enable Developer Mode in Discord (Settings → Advanced → Developer Mode)
2. Right-click your server → Copy ID

**How to get your Roblox Group ID:**
1. Go to your group page on Roblox
2. Look at the URL: `https://www.roblox.com/groups/123456/Group-Name`
3. The number (123456) is your group ID

## Step 4: Create Discord Roles

In your Discord server:

1. Go to Server Settings → Roles
2. Create roles that match your `rankMappings`
3. For the example above, create roles named:
   - "Member"
   - "Owner"

**Important:** 
- Role names must match exactly (case-sensitive)
- Bot's role must be higher than all roles it manages

## Step 5: Invite Bot to Server

Use this URL (replace YOUR_CLIENT_ID):

```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=268511296&scope=bot%20applications.commands
```

This gives the bot:
- Manage Roles
- Manage Nicknames  
- Send Messages
- Use Slash Commands

## Step 6: Deploy Commands

```bash
node src/deploy-commands.js
```

You should see:
```
✓ Loaded command: verify
✓ Loaded command: sync
✓ Loaded command: rank
✓ Loaded command: reverify
✓ Loaded command: forcesync
✓ Loaded command: reloadconfig
✅ Successfully reloaded 6 application (/) commands globally.
```

## Step 7: Start the Bot

```bash
npm start
```

You should see:
```
✅ Bot is ready! Logged in as YourBot#1234
📊 Database Stats:
   - Total Verifications: 0
   - Guild Rank Entries: 0
⚙️  Configured Servers: 1
   - My Server (Group ID: 123456)
✅ All systems operational!
```

## Step 8: Test It!

In Discord, try these commands:

1. `/verify YourRobloxUsername` - Link your account
2. `/rank` - Check your rank
3. `/sync` - Sync your roles

## Common First-Time Issues

### "Server not configured"
- Make sure your server ID in `servers.json` is correct
- Try `/reloadconfig`

### "Role not found"
- Create Discord roles with exact names from your config
- Check spelling and capitalization

### Commands not showing
- Wait 1-2 minutes after running deploy-commands.js
- Check that CLIENT_ID is correct
- Try kicking and re-inviting the bot

### Bot can't change roles/nicknames
- Bot's role must be higher than roles it manages
- Bot needs "Manage Roles" and "Manage Nicknames" permissions

## Next Steps

- Read the full README.md for advanced configuration
- Set up multiple servers
- Configure custom nickname formats
- Enable background syncing
- Set up logging channels

## Need Help?

Check the main README.md for:
- Detailed configuration examples
- Troubleshooting guide
- Advanced features
- Hosting instructions
