const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

class DatabaseManager {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.db = null;
        
        // Ensure data directory exists
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.initialize();
    }

    async initialize() {
        const SQL = await initSqlJs();
        
        // Load existing database or create new one
        if (fs.existsSync(this.dbPath)) {
            const buffer = fs.readFileSync(this.dbPath);
            this.db = new SQL.Database(buffer);
        } else {
            this.db = new SQL.Database();
        }
        
        this.initializeTables();
        this.save();
    }

    initializeTables() {
        // Global verification table - stores one verification per Discord user
        this.db.run(`
            CREATE TABLE IF NOT EXISTS verifications (
                discord_id TEXT PRIMARY KEY,
                roblox_id TEXT NOT NULL,
                roblox_username TEXT NOT NULL,
                verified_at INTEGER NOT NULL
            )
        `);

        // Pending verifications table - for profile code verification
        this.db.run(`
            CREATE TABLE IF NOT EXISTS pending_verifications (
                discord_id TEXT PRIMARY KEY,
                roblox_id TEXT NOT NULL,
                roblox_username TEXT NOT NULL,
                verification_code TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
        `);

        // Per-guild rank tracking
        this.db.run(`
            CREATE TABLE IF NOT EXISTS guild_ranks (
                discord_id TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                last_known_rank INTEGER NOT NULL,
                last_synced_at INTEGER NOT NULL,
                PRIMARY KEY (discord_id, guild_id)
            )
        `);

        // Create indexes for performance
        this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_verifications_roblox_id 
            ON verifications(roblox_id)
        `);

        this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_guild_ranks_guild 
            ON guild_ranks(guild_id)
        `);

        this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_pending_verifications_roblox_id 
            ON pending_verifications(roblox_id)
        `);

        console.log('[Database] Tables initialized successfully');
    }

    save() {
        const data = this.db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(this.dbPath, buffer);
    }

    // Verification methods
    getVerification(discordId) {
        const stmt = this.db.prepare('SELECT * FROM verifications WHERE discord_id = ?');
        stmt.bind([discordId]);
        const result = stmt.step() ? stmt.getAsObject() : null;
        stmt.free();
        return result;
    }

    getVerificationByRobloxId(robloxId) {
        const stmt = this.db.prepare('SELECT * FROM verifications WHERE roblox_id = ?');
        stmt.bind([robloxId]);
        const result = stmt.step() ? stmt.getAsObject() : null;
        stmt.free();
        return result;
    }

    setVerification(discordId, robloxId, robloxUsername) {
        this.db.run(
            `INSERT OR REPLACE INTO verifications (discord_id, roblox_id, roblox_username, verified_at)
             VALUES (?, ?, ?, ?)`,
            [discordId, robloxId, robloxUsername, Date.now()]
        );
        this.save();
        return { changes: 1 };
    }

    deleteVerification(discordId) {
        this.db.run('DELETE FROM verifications WHERE discord_id = ?', [discordId]);
        // Also delete all guild ranks for this user
        this.db.run('DELETE FROM guild_ranks WHERE discord_id = ?', [discordId]);
        this.save();
        return { changes: 1 };
    }

    // Pending verification methods
    getPendingVerification(discordId) {
        const stmt = this.db.prepare('SELECT * FROM pending_verifications WHERE discord_id = ?');
        stmt.bind([discordId]);
        const result = stmt.step() ? stmt.getAsObject() : null;
        stmt.free();
        return result;
    }

    getPendingVerificationByRobloxId(robloxId) {
        const stmt = this.db.prepare('SELECT * FROM pending_verifications WHERE roblox_id = ?');
        stmt.bind([robloxId]);
        const result = stmt.step() ? stmt.getAsObject() : null;
        stmt.free();
        return result;
    }

    setPendingVerification(discordId, robloxId, robloxUsername, verificationCode) {
        this.db.run(
            `INSERT OR REPLACE INTO pending_verifications 
             (discord_id, roblox_id, roblox_username, verification_code, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [discordId, robloxId, robloxUsername, verificationCode, Date.now()]
        );
        this.save();
        return { changes: 1 };
    }

    deletePendingVerification(discordId) {
        this.db.run('DELETE FROM pending_verifications WHERE discord_id = ?', [discordId]);
        this.save();
        return { changes: 1 };
    }

    // Clean up expired pending verifications (older than 15 minutes)
    cleanupExpiredPendingVerifications() {
        const expirationTime = Date.now() - (15 * 60 * 1000); // 15 minutes ago
        this.db.run('DELETE FROM pending_verifications WHERE created_at < ?', [expirationTime]);
        this.save();
    }

    // Guild rank methods
    getGuildRank(discordId, guildId) {
        const stmt = this.db.prepare(`
            SELECT * FROM guild_ranks 
            WHERE discord_id = ? AND guild_id = ?
        `);
        stmt.bind([discordId, guildId]);
        const result = stmt.step() ? stmt.getAsObject() : null;
        stmt.free();
        return result;
    }

    setGuildRank(discordId, guildId, rank) {
        this.db.run(
            `INSERT OR REPLACE INTO guild_ranks (discord_id, guild_id, last_known_rank, last_synced_at)
             VALUES (?, ?, ?, ?)`,
            [discordId, guildId, rank, Date.now()]
        );
        this.save();
        return { changes: 1 };
    }

    getAllVerifiedUsersInGuild(guildId) {
        const stmt = this.db.prepare(`
            SELECT v.discord_id, v.roblox_id, v.roblox_username, gr.last_known_rank
            FROM verifications v
            LEFT JOIN guild_ranks gr ON v.discord_id = gr.discord_id AND gr.guild_id = ?
        `);
        stmt.bind([guildId]);
        
        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
    }

    getAllVerifiedUsers() {
        const stmt = this.db.prepare('SELECT * FROM verifications');
        const results = [];
        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }
        stmt.free();
        return results;
    }

    // Stats
    getStats() {
        const stmt1 = this.db.prepare('SELECT COUNT(*) as count FROM verifications');
        stmt1.step();
        const verificationCount = stmt1.getAsObject();
        stmt1.free();
        
        const stmt2 = this.db.prepare('SELECT COUNT(*) as count FROM guild_ranks');
        stmt2.step();
        const guildRankCount = stmt2.getAsObject();
        stmt2.free();

        const stmt3 = this.db.prepare('SELECT COUNT(*) as count FROM pending_verifications');
        stmt3.step();
        const pendingCount = stmt3.getAsObject();
        stmt3.free();
        
        return {
            totalVerifications: verificationCount.count,
            totalGuildRankEntries: guildRankCount.count,
            totalPendingVerifications: pendingCount.count
        };
    }

    close() {
        if (this.db) {
            this.save();
            this.db.close();
        }
    }
}

module.exports = DatabaseManager;