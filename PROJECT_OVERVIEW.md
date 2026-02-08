# Roblox Rank Sync Bot - Project Overview

## 🎯 What This Bot Does

This is a **production-ready Discord bot** that syncs Roblox group ranks to Discord roles and nicknames across **multiple Discord servers** and **multiple Roblox groups** with a **unified verification system**.

### Key Features

✅ **Multi-Server, Multi-Group System**
- One bot handles unlimited Discord servers
- Each server can link to a different Roblox group
- Verify once, work everywhere

✅ **Intelligent Rank Syncing**
- Automatic role assignment based on Roblox rank
- Custom nickname formats per server
- Background sync with configurable intervals
- Rate-limited API calls

✅ **Flexible Configuration**
- Rank-based nickname prefixes (e.g., `[L-2 ] Username`)
- Custom static prefixes (e.g., `[GMT] Username`)
- Per-server sync settings
- Optional logging channels

✅ **Production-Ready**
- SQLite database for persistence
- Comprehensive error handling
- Rate limiting and API protection
- Graceful shutdown handling

---

## 📁 Project Structure

```
roblox-rank-bot/
├── config/
│   └── servers.json              # Server configurations (EDIT THIS)
│
├── src/
│   ├── commands/                 # Slash commands
│   │   ├── verify.js             # /verify - Link Roblox account
│   │   ├── reverify.js           # /reverify - Change linked account
│   │   ├── sync.js               # /sync - Manual sync
│   │   ├── rank.js               # /rank - Check rank
│   │   ├── forcesync.js          # /forcesync - Admin force sync all
│   │   └── reloadconfig.js       # /reloadconfig - Reload config
│   │
│   ├── events/                   # Discord events
│   │   ├── ready.js              # Bot startup
│   │   ├── interactionCreate.js  # Command handler
│   │   └── guildMemberAdd.js     # Auto-sync on join
│   │
│   ├── services/                 # Core business logic
│   │   ├── RobloxService.js              # Roblox API calls
│   │   ├── RankSyncService.js            # Role/nickname sync
│   │   └── BackgroundSyncScheduler.js    # Scheduled syncing
│   │
│   ├── database/
│   │   └── DatabaseManager.js    # SQLite operations
│   │
│   ├── config/
│   │   └── ConfigManager.js      # Config file management
│   │
│   ├── index.js                  # Main bot entry point
│   └── deploy-commands.js        # Deploy slash commands
│
├── data/                         # Database files (auto-created)
├── .env                          # Bot token & config (CREATE THIS)
├── .env.example                  # Example .env file
├── package.json                  # Dependencies
│
├── README.md                     # Full documentation
├── QUICKSTART.md                 # 5-minute setup guide
└── CONFIGURATION_EXAMPLES.md     # Config examples
```

---

## 🚀 Deployment Checklist

### Phase 1: Bot Setup (5 minutes)

- [ ] Create Discord bot at https://discord.com/developers/applications
- [ ] Copy bot token and client ID
- [ ] Copy `.env.example` to `.env`
- [ ] Add `DISCORD_TOKEN` and `CLIENT_ID` to `.env`
- [ ] Run `npm install`

### Phase 2: Server Configuration (10 minutes)

- [ ] Get Discord server ID (Developer Mode → Right-click server → Copy ID)
- [ ] Get Roblox group ID (from group URL)
- [ ] Edit `config/servers.json` with your server info
- [ ] Create Discord roles that match your `rankMappings`
- [ ] Ensure bot role is higher than managed roles

### Phase 3: Deployment (5 minutes)

- [ ] Run `node src/deploy-commands.js` to register commands
- [ ] Invite bot to server with proper permissions
- [ ] Run `npm start` to start the bot
- [ ] Check console for "✅ All systems operational!"

### Phase 4: Testing (5 minutes)

- [ ] Test `/verify YourRobloxUsername`
- [ ] Test `/rank` to check current rank
- [ ] Test `/sync` to sync roles
- [ ] Verify nickname was updated correctly
- [ ] Verify roles were assigned correctly

### Phase 5: Production (Optional)

- [ ] Set up PM2 or similar process manager
- [ ] Configure background sync intervals
- [ ] Set up logging channels
- [ ] Add additional servers if needed
- [ ] Configure firewall/security

---

## 🔑 Required Bot Permissions

When inviting the bot, use permissions integer: **268511296**

This includes:
- ✅ Manage Roles
- ✅ Manage Nicknames
- ✅ Send Messages
- ✅ Use Slash Commands

**Invite URL Format:**
```
https://discord.com/api/oauth2/authorize?client_id=YOUR_CLIENT_ID&permissions=268511296&scope=bot%20applications.commands
```

---

## 📊 Database Schema

### `verifications` Table
| Column | Type | Description |
|--------|------|-------------|
| discord_id | TEXT (PK) | Discord user ID |
| roblox_id | TEXT | Roblox user ID |
| roblox_username | TEXT | Roblox username |
| verified_at | INTEGER | Timestamp |

### `guild_ranks` Table
| Column | Type | Description |
|--------|------|-------------|
| discord_id | TEXT (PK) | Discord user ID |
| guild_id | TEXT (PK) | Discord server ID |
| last_known_rank | INTEGER | Last synced rank |
| last_synced_at | INTEGER | Timestamp |

---

## 🎮 User Commands

| Command | Description | Example |
|---------|-------------|---------|
| `/verify` | Link Roblox account | `/verify BuilderMan123` |
| `/reverify` | Change linked account | `/reverify NewUsername` |
| `/sync` | Manually sync roles | `/sync` |
| `/rank` | Check current rank | `/rank` |

## 👑 Admin Commands

| Command | Description | Permission |
|---------|-------------|------------|
| `/forcesync` | Sync all verified users | Administrator |
| `/reloadconfig` | Reload server config | Administrator |

---

## 🔄 How Syncing Works

### Verification Flow
```
User runs /verify RobloxUsername
    ↓
Bot fetches Roblox user ID
    ↓
Stores in database (Discord ID → Roblox ID)
    ↓
Verification works across ALL servers
    ↓
Auto-syncs if syncOnVerify = true
```

### Rank Sync Flow
```
Get user's Roblox rank from group
    ↓
Find matching Discord role from config
    ↓
Remove all other managed roles
    ↓
Add correct role
    ↓
Update nickname with format
    ↓
Log change (if logging enabled)
```

### Background Sync Flow
```
Every X minutes (configurable per server)
    ↓
Get all verified users in server
    ↓
Check each user's current Roblox rank
    ↓
Update roles/nicknames if changed
    ↓
Log changes
```

---

## 🌐 Multi-Server Examples

### Example 1: Main + Department Servers

**Main Server:**
- Group ID: 123456 (Main Foundation)
- Nickname: `[L-2 ] RobloxUsername`
- Roles: Based on foundation rank

**Department Server:**
- Group ID: 789012 (Engineering Dept)
- Nickname: `[GMT] RobloxUsername`
- Roles: Based on department rank

**Same User Result:**
- In Main: `[L-2 ] BuilderMan` with "Senior Researcher" role
- In Dept: `[GMT] BuilderMan` with "Engineer" role

### Example 2: Multiple Timezone Departments

**US Server:**
- Nickname: `[EST] RobloxUsername`

**EU Server:**
- Nickname: `[GMT] RobloxUsername`

**APAC Server:**
- Nickname: `[AEST] RobloxUsername`

---

## ⚙️ Configuration Tips

### Choosing Nickname Format

**Use `"nicknameFormat": "rank"`** when:
- Different ranks need different prefixes
- Example: `[L-0 ]`, `[L-1 ]`, `[L-2 ]`, etc.

**Use `"nicknameFormat": "custom"`** when:
- All users get same prefix
- Example: All users are `[GMT] Username`

### Rank Mapping Strategy

**Define every rank (more control):**
```json
"rankMappings": {
  "1": { "roleName": "Rank1" },
  "2": { "roleName": "Rank2" },
  "3": { "roleName": "Rank3" }
}
```

**Define key ranks only (simpler):**
```json
"rankMappings": {
  "1": { "roleName": "Junior" },
  "50": { "roleName": "Senior" },
  "255": { "roleName": "Lead" }
}
```
- Rank 1-49 gets "Junior"
- Rank 50-254 gets "Senior"
- Rank 255 gets "Lead"

### Sync Interval Recommendations

| Server Size | Activity | Recommended Interval |
|-------------|----------|---------------------|
| Small (<100) | Low | 60 minutes |
| Medium (100-500) | Medium | 30 minutes |
| Large (500-1000) | High | 20 minutes |
| Very Large (1000+) | Very High | 15 minutes |

---

## 🐛 Common Issues & Solutions

### Issue: "Server not configured"
**Solution:**
- Add server to `config/servers.json`
- Run `/reloadconfig`
- Restart bot

### Issue: Roles not updating
**Solution:**
- Check role names match exactly (case-sensitive)
- Ensure bot's role is higher than managed roles
- Verify bot has "Manage Roles" permission

### Issue: Can't change nickname
**Solution:**
- Bot can't change server owner (Discord limitation)
- Bot's role must be higher than user's highest role
- Bot needs "Manage Nicknames" permission

### Issue: Commands not showing
**Solution:**
- Run `node src/deploy-commands.js`
- Wait 1-2 minutes
- Check `CLIENT_ID` is correct

### Issue: Roblox API errors
**Solution:**
- Check Roblox group is public
- Verify group ID is correct
- Wait and retry (API might be down)

---

## 🎯 Use Cases

### ✅ Perfect For:
- SCP Foundation roleplay servers
- Military roleplay groups
- Corporation/company roleplay
- Gaming clans with departments
- Any group with rank hierarchies
- Multi-region/timezone organizations

### ❌ Not Designed For:
- Simple verification only (overengineered)
- Single small server with no rank system
- Groups not using Roblox

---

## 🔐 Security Considerations

- ✅ Bot token is stored in `.env` (not in code)
- ✅ Database is local SQLite (no external DB required)
- ✅ Rate limiting prevents API abuse
- ✅ Permissions are properly scoped
- ✅ No storage of sensitive Roblox data
- ✅ Uses Roproxy to avoid CORS issues

---

## 📈 Scalability

**This bot can handle:**
- ✅ Unlimited Discord servers
- ✅ Thousands of verified users
- ✅ Hundreds of syncs per hour (with rate limiting)
- ✅ Multiple concurrent operations
- ✅ Long-running background sync processes

**Resource Requirements:**
- **RAM:** ~100-200MB
- **CPU:** Minimal (mostly idle)
- **Disk:** ~10MB + database growth
- **Network:** Low (bursts during sync)

---

## 🚀 Hosting Options

### Option 1: VPS (Recommended)
- DigitalOcean, Linode, Vultr
- Ubuntu/Debian server
- Use PM2 for process management
- Cost: $5-10/month

### Option 2: Free Hosting
- Railway.app (free tier)
- Render.com (free tier)
- Limitations: May sleep when inactive

### Option 3: Local/Home Server
- Your own computer
- Raspberry Pi
- Must stay online 24/7

---

## 📚 Documentation Files

| File | Purpose |
|------|---------|
| `README.md` | Complete documentation |
| `QUICKSTART.md` | 5-minute setup guide |
| `CONFIGURATION_EXAMPLES.md` | Real-world config examples |
| `PROJECT_OVERVIEW.md` | This file |

---

## 🔄 Updating the Bot

To add a new server:
1. Edit `config/servers.json`
2. Run `/reloadconfig` in Discord
3. Test with `/verify` and `/sync`

To modify existing server:
1. Edit `config/servers.json`
2. Run `/reloadconfig` in Discord
3. Optionally run `/forcesync` to update all users

To update code:
1. Pull latest changes
2. Run `npm install` (if dependencies changed)
3. Restart bot

---

## 🎓 Learning Resources

**Discord.js:**
- https://discord.js.org/
- https://discordjs.guide/

**Roblox API:**
- https://groups.roproxy.com (proxy)
- https://users.roproxy.com (proxy)

**SQLite:**
- https://www.sqlite.org/
- better-sqlite3 package docs

---

## ✨ Credits

Built with:
- discord.js v14 - Discord API wrapper
- better-sqlite3 - Fast SQLite database
- bottleneck - Rate limiting
- axios - HTTP requests
- dotenv - Environment variables

---

## 📞 Support

If you encounter issues:

1. **Check the logs** - Console output has detailed errors
2. **Read the docs** - README.md has troubleshooting
3. **Verify config** - Use a JSON validator
4. **Test permissions** - Ensure bot has proper roles
5. **Check examples** - CONFIGURATION_EXAMPLES.md

---

## 🎉 You're Ready!

This bot is production-ready and fully functional. Follow the deployment checklist and you'll be up and running in 25 minutes.

**Happy Syncing!** 🚀
