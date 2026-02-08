# Configuration Examples

This file contains real-world configuration examples for different use cases.

## Table of Contents

1. [Single Server Setup](#single-server-setup)
2. [Multi-Server Setup (Same Group)](#multi-server-setup-same-group)
3. [Multi-Server Setup (Different Groups)](#multi-server-setup-different-groups)
4. [SCP Foundation Example](#scp-foundation-example)
5. [Military RP Example](#military-rp-example)
6. [Custom Timezone Nicknames](#custom-timezone-nicknames)

---

## Single Server Setup

Basic setup for one Discord server and one Roblox group.

```json
{
  "servers": [
    {
      "guildId": "123456789012345678",
      "guildName": "My Gaming Community",
      "robloxGroupId": 123456,
      "nicknameFormat": "rank",
      "rankMappings": {
        "1": {
          "roleName": "Guest",
          "nicknamePrefix": ""
        },
        "5": {
          "roleName": "Member",
          "nicknamePrefix": "[M] "
        },
        "50": {
          "roleName": "Moderator",
          "nicknamePrefix": "[MOD] "
        },
        "100": {
          "roleName": "Admin",
          "nicknamePrefix": "[ADMIN] "
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
      "loggingChannelId": "987654321098765432"
    }
  ]
}
```

---

## Multi-Server Setup (Same Group)

Two servers using the same Roblox group but different nickname formats.

```json
{
  "servers": [
    {
      "guildId": "111111111111111111",
      "guildName": "Main Server",
      "robloxGroupId": 123456,
      "nicknameFormat": "rank",
      "rankMappings": {
        "1": {
          "roleName": "Recruit",
          "nicknamePrefix": "[RCT] "
        },
        "50": {
          "roleName": "Soldier",
          "nicknamePrefix": "[SLD] "
        },
        "100": {
          "roleName": "Officer",
          "nicknamePrefix": "[OFC] "
        },
        "255": {
          "roleName": "General",
          "nicknamePrefix": "[GEN] "
        }
      },
      "syncSettings": {
        "backgroundSyncEnabled": true,
        "syncIntervalMinutes": 30,
        "syncOnJoin": true,
        "syncOnVerify": true
      },
      "loggingChannelId": "222222222222222222"
    },
    {
      "guildId": "333333333333333333",
      "guildName": "Training Server",
      "robloxGroupId": 123456,
      "nicknameFormat": "custom",
      "customNicknamePrefix": "[TRAINEE] ",
      "rankMappings": {
        "1": {
          "roleName": "Trainee"
        },
        "50": {
          "roleName": "Graduate"
        },
        "100": {
          "roleName": "Instructor"
        },
        "255": {
          "roleName": "Training Director"
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
  ]
}
```

---

## Multi-Server Setup (Different Groups)

Main group server + department server with different groups.

```json
{
  "servers": [
    {
      "guildId": "444444444444444444",
      "guildName": "Corporation Main",
      "robloxGroupId": 111111,
      "nicknameFormat": "rank",
      "rankMappings": {
        "1": {
          "roleName": "Employee",
          "nicknamePrefix": "[E] "
        },
        "50": {
          "roleName": "Manager",
          "nicknamePrefix": "[MGR] "
        },
        "100": {
          "roleName": "Director",
          "nicknamePrefix": "[DIR] "
        },
        "255": {
          "roleName": "CEO",
          "nicknamePrefix": "[CEO] "
        }
      },
      "syncSettings": {
        "backgroundSyncEnabled": true,
        "syncIntervalMinutes": 30,
        "syncOnJoin": true,
        "syncOnVerify": true
      },
      "loggingChannelId": "555555555555555555"
    },
    {
      "guildId": "666666666666666666",
      "guildName": "HR Department",
      "robloxGroupId": 222222,
      "nicknameFormat": "custom",
      "customNicknamePrefix": "[HR] ",
      "rankMappings": {
        "1": {
          "roleName": "HR Intern"
        },
        "50": {
          "roleName": "HR Specialist"
        },
        "100": {
          "roleName": "HR Manager"
        },
        "255": {
          "roleName": "HR Director"
        }
      },
      "syncSettings": {
        "backgroundSyncEnabled": true,
        "syncIntervalMinutes": 45,
        "syncOnJoin": true,
        "syncOnVerify": true
      },
      "loggingChannelId": "777777777777777777"
    }
  ]
}
```

---

## SCP Foundation Example

Full SCP Foundation setup with detailed ranks.

```json
{
  "servers": [
    {
      "guildId": "888888888888888888",
      "guildName": "SCP Foundation Main Site",
      "robloxGroupId": 333333,
      "nicknameFormat": "rank",
      "rankMappings": {
        "1": {
          "roleName": "D-Class Personnel",
          "nicknamePrefix": "[L-0 ] "
        },
        "10": {
          "roleName": "Class-D Supervisor",
          "nicknamePrefix": "[L-1 ] "
        },
        "20": {
          "roleName": "Junior Researcher",
          "nicknamePrefix": "[L-2 ] "
        },
        "30": {
          "roleName": "Researcher",
          "nicknamePrefix": "[L-2 ] "
        },
        "40": {
          "roleName": "Senior Researcher",
          "nicknamePrefix": "[L-3 ] "
        },
        "50": {
          "roleName": "Lead Researcher",
          "nicknamePrefix": "[L-3 ] "
        },
        "60": {
          "roleName": "Site Director",
          "nicknamePrefix": "[L-4 ] "
        },
        "100": {
          "roleName": "O5 Council",
          "nicknamePrefix": "[L-5 ] "
        },
        "255": {
          "roleName": "O5 Council Member",
          "nicknamePrefix": "[L-5 ] "
        }
      },
      "syncSettings": {
        "backgroundSyncEnabled": true,
        "syncIntervalMinutes": 30,
        "syncOnJoin": true,
        "syncOnVerify": true
      },
      "loggingChannelId": "999999999999999999"
    },
    {
      "guildId": "101010101010101010",
      "guildName": "Mobile Task Force Server",
      "robloxGroupId": 444444,
      "nicknameFormat": "custom",
      "customNicknamePrefix": "[MTF] ",
      "rankMappings": {
        "1": {
          "roleName": "Recruit"
        },
        "25": {
          "roleName": "Operative"
        },
        "50": {
          "roleName": "Specialist"
        },
        "75": {
          "roleName": "Team Leader"
        },
        "100": {
          "roleName": "Commander"
        },
        "255": {
          "roleName": "MTF Director"
        }
      },
      "syncSettings": {
        "backgroundSyncEnabled": true,
        "syncIntervalMinutes": 20,
        "syncOnJoin": true,
        "syncOnVerify": true
      },
      "loggingChannelId": "121212121212121212"
    }
  ]
}
```

---

## Military RP Example

Realistic military ranking system.

```json
{
  "servers": [
    {
      "guildId": "131313131313131313",
      "guildName": "Military Base Alpha",
      "robloxGroupId": 555555,
      "nicknameFormat": "rank",
      "rankMappings": {
        "1": {
          "roleName": "Civilian",
          "nicknamePrefix": "[CIV] "
        },
        "10": {
          "roleName": "Private",
          "nicknamePrefix": "[PVT] "
        },
        "20": {
          "roleName": "Private First Class",
          "nicknamePrefix": "[PFC] "
        },
        "30": {
          "roleName": "Corporal",
          "nicknamePrefix": "[CPL] "
        },
        "40": {
          "roleName": "Sergeant",
          "nicknamePrefix": "[SGT] "
        },
        "50": {
          "roleName": "Staff Sergeant",
          "nicknamePrefix": "[SSG] "
        },
        "75": {
          "roleName": "Lieutenant",
          "nicknamePrefix": "[LT] "
        },
        "100": {
          "roleName": "Captain",
          "nicknamePrefix": "[CPT] "
        },
        "150": {
          "roleName": "Major",
          "nicknamePrefix": "[MAJ] "
        },
        "200": {
          "roleName": "Colonel",
          "nicknamePrefix": "[COL] "
        },
        "255": {
          "roleName": "General",
          "nicknamePrefix": "[GEN] "
        }
      },
      "syncSettings": {
        "backgroundSyncEnabled": true,
        "syncIntervalMinutes": 25,
        "syncOnJoin": true,
        "syncOnVerify": true
      },
      "loggingChannelId": "141414141414141414"
    }
  ]
}
```

---

## Custom Timezone Nicknames

Using custom prefixes for timezone-based departments.

```json
{
  "servers": [
    {
      "guildId": "151515151515151515",
      "guildName": "US Department",
      "robloxGroupId": 666666,
      "nicknameFormat": "custom",
      "customNicknamePrefix": "[EST] ",
      "rankMappings": {
        "1": {
          "roleName": "Member"
        },
        "50": {
          "roleName": "Senior Member"
        },
        "100": {
          "roleName": "Department Lead"
        },
        "255": {
          "roleName": "Department Director"
        }
      },
      "syncSettings": {
        "backgroundSyncEnabled": true,
        "syncIntervalMinutes": 60,
        "syncOnJoin": true,
        "syncOnVerify": true
      },
      "loggingChannelId": null
    },
    {
      "guildId": "161616161616161616",
      "guildName": "EU Department",
      "robloxGroupId": 777777,
      "nicknameFormat": "custom",
      "customNicknamePrefix": "[GMT] ",
      "rankMappings": {
        "1": {
          "roleName": "Member"
        },
        "50": {
          "roleName": "Senior Member"
        },
        "100": {
          "roleName": "Department Lead"
        },
        "255": {
          "roleName": "Department Director"
        }
      },
      "syncSettings": {
        "backgroundSyncEnabled": true,
        "syncIntervalMinutes": 60,
        "syncOnJoin": true,
        "syncOnVerify": true
      },
      "loggingChannelId": null
    },
    {
      "guildId": "171717171717171717",
      "guildName": "APAC Department",
      "robloxGroupId": 888888,
      "nicknameFormat": "custom",
      "customNicknamePrefix": "[AEST] ",
      "rankMappings": {
        "1": {
          "roleName": "Member"
        },
        "50": {
          "roleName": "Senior Member"
        },
        "100": {
          "roleName": "Department Lead"
        },
        "255": {
          "roleName": "Department Director"
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
  ]
}
```

---

## Tips for Configuration

### Nickname Prefix Formatting

**With spaces inside brackets:**
```json
"nicknamePrefix": "[L-5 ] "
```
Result: `[L-5 ] Username`

**Without spaces:**
```json
"nicknamePrefix": "[L-5]"
```
Result: `[L-5]Username`

**With space after:**
```json
"nicknamePrefix": "[L-5] "
```
Result: `[L-5] Username`

### Rank Mapping Strategy

**Option 1: Define every rank**
- More control
- More configuration
- Exact role for each rank

**Option 2: Define key ranks only**
- Less configuration
- Uses "closest rank" logic
- Works well for hierarchies

Example of "closest rank" logic:
```json
"rankMappings": {
  "1": { "roleName": "Junior" },
  "50": { "roleName": "Senior" },
  "255": { "roleName": "Lead" }
}
```
- Ranks 1-49 → "Junior"
- Ranks 50-254 → "Senior"
- Rank 255 → "Lead"

### Background Sync Recommendations

**High-activity servers:**
```json
"syncIntervalMinutes": 15
```

**Medium-activity servers:**
```json
"syncIntervalMinutes": 30
```

**Low-activity servers:**
```json
"syncIntervalMinutes": 60
```

**Very large groups (1000+ members):**
```json
"syncIntervalMinutes": 120
```

### Logging Best Practices

**Enable logging for:**
- Main servers
- Promotion tracking
- Audit trails

**Disable logging for:**
- Department servers (if not needed)
- Test servers
- Low-activity servers

```json
"loggingChannelId": null  // Disabled
"loggingChannelId": "123456789012345678"  // Enabled
```

---

## Testing Your Configuration

After editing `servers.json`:

1. **Validate JSON syntax** - Use a JSON validator
2. **Check guild IDs** - Ensure they're correct
3. **Verify group IDs** - Test on Roblox
4. **Create Discord roles** - Match rank mappings exactly
5. **Reload config** - Use `/reloadconfig` command
6. **Test with one user** - Use `/verify` and `/sync`
7. **Check logs** - Look for errors in console

## Common Mistakes

❌ **Wrong:**
```json
"roleName": "admin"  // Lowercase
```
✅ **Correct:**
```json
"roleName": "Admin"  // Must match Discord role exactly
```

❌ **Wrong:**
```json
"nicknamePrefix": "[OWNER]"  // No space after
```
✅ **Better:**
```json
"nicknamePrefix": "[OWNER] "  // Space after for readability
```

❌ **Wrong:**
```json
"guildId": 123456789012345678  // No quotes
```
✅ **Correct:**
```json
"guildId": "123456789012345678"  // Must be string
```
