const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

class DatabaseManager {
    constructor(dbPath) {
        this.dbPath = dbPath;
        this.db = null;
        this.ready = false;
        this.initPromise = null;

        // Ensure data directory exists
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.initPromise = this.initialize();
    }

    async initialize() {
        try {
            const SQL = await initSqlJs();

            // Load existing database or create new one
            if (fs.existsSync(this.dbPath)) {
                const buffer = fs.readFileSync(this.dbPath);
                this.db = new SQL.Database(buffer);
                console.log('[Database] Loaded existing database');
            } else {
                this.db = new SQL.Database();
                console.log('[Database] Created new database');
            }

            this.initializeTables();
            this.save();

            this.ready = true;

            console.log('[Database] Database initialization complete');
        } catch (error) {
            console.error('[Database] Initialization error:', error);
            throw error;
        }
    }

    async waitForReady() {
        if (this.ready) return;
        await this.initPromise;
    }

    initializeTables() {
        // ============================================================
        // Global verification table
        // Stores one Roblox/Discord verification per Discord user
        // ============================================================

        this.db.run(`
            CREATE TABLE IF NOT EXISTS verifications (
                discord_id TEXT PRIMARY KEY,
                roblox_id TEXT NOT NULL,
                roblox_username TEXT NOT NULL,
                verified_at INTEGER NOT NULL
            )
        `);

        // ============================================================
        // Age verification table
        //
        // This is intentionally separate from normal Roblox/Discord
        // verification.
        //
        // verifications = account is linked
        // age_verifications = account has passed the 18+ check
        // ============================================================

        this.db.run(`
            CREATE TABLE IF NOT EXISTS age_verifications (
                discord_id TEXT PRIMARY KEY,
                roblox_id TEXT NOT NULL,
                roblox_username TEXT NOT NULL,
                verified_at INTEGER NOT NULL
            )
        `);

        // ============================================================
        // Pending verifications
        // ============================================================

        this.db.run(`
            CREATE TABLE IF NOT EXISTS pending_verifications (
                discord_id TEXT PRIMARY KEY,
                roblox_id TEXT NOT NULL,
                roblox_username TEXT NOT NULL,
                verification_code TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
        `);

        // ============================================================
        // Per-guild rank tracking
        // ============================================================

        this.db.run(`
            CREATE TABLE IF NOT EXISTS guild_ranks (
                discord_id TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                last_known_rank INTEGER NOT NULL,
                last_synced_at INTEGER NOT NULL,
                PRIMARY KEY (discord_id, guild_id)
            )
        `);

        // Only explicit choices are stored. No row means notifications are
        // enabled by default, so existing and new members are opted in.
        this.db.run(`
            CREATE TABLE IF NOT EXISTS session_notification_preferences (
                discord_id TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                enabled INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (discord_id, guild_id)
            )
        `);

        // ============================================================
        // Indexes
        // ============================================================

        this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_verifications_roblox_id
            ON verifications(roblox_id)
        `);

        this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_age_verifications_roblox_id
            ON age_verifications(roblox_id)
        `);

        this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_guild_ranks_guild
            ON guild_ranks(guild_id)
        `);

        this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_pending_verifications_roblox_id
            ON pending_verifications(roblox_id)
        `);

        // ============================================================
        // Applications
        // ============================================================

        this.db.run(`
            CREATE TABLE IF NOT EXISTS applications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                guild_id TEXT NOT NULL,
                application_id TEXT NOT NULL,
                roblox_username TEXT NOT NULL,
                roblox_id TEXT NOT NULL,
                submitted_at INTEGER NOT NULL,
                status TEXT NOT NULL,
                reviewer_id TEXT,
                reviewed_at INTEGER,
                response_data TEXT NOT NULL
            )
        `);

        // ============================================================
        // Application message tracking
        // ============================================================

        this.db.run(`
            CREATE TABLE IF NOT EXISTS application_messages (
                guild_id TEXT PRIMARY KEY,
                channel_id TEXT NOT NULL,
                message_id TEXT NOT NULL,
                last_updated INTEGER NOT NULL
            )
        `);

        // ============================================================
        // Application indexes
        // ============================================================

        this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_applications_user_guild
            ON applications(user_id, guild_id)
        `);

        this.db.run(`
            CREATE INDEX IF NOT EXISTS idx_applications_status
            ON applications(status)
        `);

        console.log('[Database] Tables initialized successfully');
    }

    save() {
        const data = this.db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(this.dbPath, buffer);
    }

    // ============================================================
    // Verification methods
    // ============================================================

    getVerification(discordId) {
        const stmt = this.db.prepare(
            'SELECT * FROM verifications WHERE discord_id = ?'
        );

        stmt.bind([discordId]);

        const result = stmt.step()
            ? stmt.getAsObject()
            : null;

        stmt.free();

        return result;
    }

    getVerificationByRobloxId(robloxId) {
        const stmt = this.db.prepare(
            'SELECT * FROM verifications WHERE roblox_id = ?'
        );

        stmt.bind([robloxId]);

        const result = stmt.step()
            ? stmt.getAsObject()
            : null;

        stmt.free();

        return result;
    }

    setVerification(discordId, robloxId, robloxUsername) {
        this.db.run(
            `INSERT OR REPLACE INTO verifications
             (discord_id, roblox_id, roblox_username, verified_at)
             VALUES (?, ?, ?, ?)`,
            [
                discordId,
                robloxId,
                robloxUsername,
                Date.now()
            ]
        );

        this.save();

        return { changes: 1 };
    }

    deleteVerification(discordId) {
        this.db.run(
            'DELETE FROM verifications WHERE discord_id = ?',
            [discordId]
        );

        // Remove age verification too.
        this.db.run(
            'DELETE FROM age_verifications WHERE discord_id = ?',
            [discordId]
        );

        // Also delete all guild ranks for this user.
        this.db.run(
            'DELETE FROM guild_ranks WHERE discord_id = ?',
            [discordId]
        );

        this.save();

        return { changes: 1 };
    }

    // ============================================================
    // AGE VERIFICATION METHODS
    // ============================================================

    /**
     * Get the age verification record for a Discord user.
     *
     * Returns the record if the user has passed the 18+ check.
     * Returns null if they have not.
     */
    getAgeVerification(discordId) {
        const stmt = this.db.prepare(
            'SELECT * FROM age_verifications WHERE discord_id = ?'
        );

        stmt.bind([discordId]);

        const result = stmt.step()
            ? stmt.getAsObject()
            : null;

        stmt.free();

        return result;
    }

    /**
     * Check whether a Discord user has passed age verification.
     *
     * Returns true or false.
     */
    isAgeVerified(discordId) {
        const stmt = this.db.prepare(
            'SELECT 1 FROM age_verifications WHERE discord_id = ? LIMIT 1'
        );

        stmt.bind([discordId]);

        const verified = stmt.step();

        stmt.free();

        return verified;
    }

    /**
     * Get an age verification by Roblox ID.
     */
    getAgeVerificationByRobloxId(robloxId) {
        const stmt = this.db.prepare(
            'SELECT * FROM age_verifications WHERE roblox_id = ?'
        );

        stmt.bind([robloxId]);

        const result = stmt.step()
            ? stmt.getAsObject()
            : null;

        stmt.free();

        return result;
    }

    /**
     * Mark a Discord user as having passed the 18+ age verification.
     */
    setAgeVerification(discordId, robloxId, robloxUsername) {
        this.db.run(
            `INSERT OR REPLACE INTO age_verifications
             (discord_id, roblox_id, roblox_username, verified_at)
             VALUES (?, ?, ?, ?)`,
            [
                discordId,
                robloxId,
                robloxUsername,
                Date.now()
            ]
        );

        this.save();

        console.log(
            `[Database] Age verification recorded for Discord ${discordId} / Roblox ${robloxUsername}`
        );

        return { changes: 1 };
    }

    /**
     * Remove a user's age verification.
     */
    deleteAgeVerification(discordId) {
        this.db.run(
            'DELETE FROM age_verifications WHERE discord_id = ?',
            [discordId]
        );

        this.save();

        console.log(
            `[Database] Age verification removed for Discord ${discordId}`
        );

        return { changes: 1 };
    }

    /**
     * Remove age verification by Roblox ID.
     */
    deleteAgeVerificationByRobloxId(robloxId) {
        this.db.run(
            'DELETE FROM age_verifications WHERE roblox_id = ?',
            [robloxId]
        );

        this.save();

        return { changes: 1 };
    }

    /**
     * Get every user who has passed age verification.
     */
    getAllAgeVerifiedUsers() {
        const stmt = this.db.prepare(
            'SELECT * FROM age_verifications ORDER BY verified_at DESC'
        );

        const results = [];

        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }

        stmt.free();

        return results;
    }

    // ============================================================
    // Pending verification methods
    // ============================================================

    getPendingVerification(discordId) {
        const stmt = this.db.prepare(
            'SELECT * FROM pending_verifications WHERE discord_id = ?'
        );

        stmt.bind([discordId]);

        const result = stmt.step()
            ? stmt.getAsObject()
            : null;

        stmt.free();

        return result;
    }

    getPendingVerificationByRobloxId(robloxId) {
        const stmt = this.db.prepare(
            'SELECT * FROM pending_verifications WHERE roblox_id = ?'
        );

        stmt.bind([robloxId]);

        const result = stmt.step()
            ? stmt.getAsObject()
            : null;

        stmt.free();

        return result;
    }

    setPendingVerification(
        discordId,
        robloxId,
        robloxUsername,
        verificationCode
    ) {
        this.db.run(
            `INSERT OR REPLACE INTO pending_verifications
             (discord_id, roblox_id, roblox_username, verification_code, created_at)
             VALUES (?, ?, ?, ?, ?)`,
            [
                discordId,
                robloxId,
                robloxUsername,
                verificationCode,
                Date.now()
            ]
        );

        this.save();

        return { changes: 1 };
    }

    deletePendingVerification(discordId) {
        this.db.run(
            'DELETE FROM pending_verifications WHERE discord_id = ?',
            [discordId]
        );

        this.save();

        return { changes: 1 };
    }

    cleanupExpiredPendingVerifications() {
        const expirationTime = Date.now() - (15 * 60 * 1000);

        this.db.run(
            'DELETE FROM pending_verifications WHERE created_at < ?',
            [expirationTime]
        );

        this.save();
    }

    // ============================================================
    // Guild rank methods
    // ============================================================

    getGuildRank(discordId, guildId) {
        const stmt = this.db.prepare(`
            SELECT * FROM guild_ranks
            WHERE discord_id = ? AND guild_id = ?
        `);

        stmt.bind([discordId, guildId]);

        const result = stmt.step()
            ? stmt.getAsObject()
            : null;

        stmt.free();

        return result;
    }

    setGuildRank(discordId, guildId, rank) {
        this.db.run(
            `INSERT OR REPLACE INTO guild_ranks
             (discord_id, guild_id, last_known_rank, last_synced_at)
             VALUES (?, ?, ?, ?)`,
            [
                discordId,
                guildId,
                rank,
                Date.now()
            ]
        );

        this.save();

        return { changes: 1 };
    }

    getAllVerifiedUsersInGuild(guildId) {
        const stmt = this.db.prepare(`
            SELECT
                v.discord_id,
                v.roblox_id,
                v.roblox_username,
                gr.last_known_rank
            FROM verifications v
            LEFT JOIN guild_ranks gr
                ON v.discord_id = gr.discord_id
                AND gr.guild_id = ?
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
        const stmt = this.db.prepare(
            'SELECT * FROM verifications'
        );

        const results = [];

        while (stmt.step()) {
            results.push(stmt.getAsObject());
        }

        stmt.free();

        return results;
    }

    // ============================================================
    // Session notification preferences
    // ============================================================

    areSessionNotificationsEnabled(discordId, guildId) {
        const stmt = this.db.prepare(`
            SELECT enabled FROM session_notification_preferences
            WHERE discord_id = ? AND guild_id = ?
        `);
        stmt.bind([discordId, guildId]);
        const enabled = stmt.step() ? Number(stmt.getAsObject().enabled) === 1 : true;
        stmt.free();
        return enabled;
    }

    setSessionNotificationsEnabled(discordId, guildId, enabled) {
        this.db.run(
            `INSERT OR REPLACE INTO session_notification_preferences
             (discord_id, guild_id, enabled, updated_at)
             VALUES (?, ?, ?, ?)`,
            [discordId, guildId, enabled ? 1 : 0, Date.now()]
        );
        this.save();
    }

    // ============================================================
    // Stats
    // ============================================================

    getStats() {
        const stmt1 = this.db.prepare(
            'SELECT COUNT(*) as count FROM verifications'
        );

        stmt1.step();

        const verificationCount = stmt1.getAsObject();

        stmt1.free();

        const stmt2 = this.db.prepare(
            'SELECT COUNT(*) as count FROM age_verifications'
        );

        stmt2.step();

        const ageVerificationCount = stmt2.getAsObject();

        stmt2.free();

        const stmt3 = this.db.prepare(
            'SELECT COUNT(*) as count FROM guild_ranks'
        );

        stmt3.step();

        const guildRankCount = stmt3.getAsObject();

        stmt3.free();

        const stmt4 = this.db.prepare(
            'SELECT COUNT(*) as count FROM pending_verifications'
        );

        stmt4.step();

        const pendingCount = stmt4.getAsObject();

        stmt4.free();

        return {
            totalVerifications: verificationCount.count,
            totalAgeVerifications: ageVerificationCount.count,
            totalGuildRankEntries: guildRankCount.count,
            totalPendingVerifications: pendingCount.count
        };
    }

    // ============================================================
    // Application methods
    // ============================================================

    setApplicationMessage(guildId, channelId, messageId) {
        this.db.run(
            `INSERT OR REPLACE INTO application_messages
             (guild_id, channel_id, message_id, last_updated)
             VALUES (?, ?, ?, ?)`,
            [
                guildId,
                channelId,
                messageId,
                Date.now()
            ]
        );

        this.save();
    }

    getApplicationMessage(guildId) {
        const stmt = this.db.prepare(
            'SELECT * FROM application_messages WHERE guild_id = ?'
        );

        stmt.bind([guildId]);

        const result = stmt.step()
            ? stmt.getAsObject()
            : null;

        stmt.free();

        return result;
    }

    submitApplication(
        userId,
        guildId,
        applicationId,
        robloxUsername,
        robloxId,
        responseData
    ) {
        this.db.run(
            `INSERT INTO applications
             (user_id, guild_id, application_id, roblox_username, roblox_id, submitted_at, status, response_data)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                userId,
                guildId,
                applicationId,
                robloxUsername,
                robloxId,
                Date.now(),
                'pending',
                JSON.stringify(responseData)
            ]
        );

        const result = this.db.exec(
            'SELECT last_insert_rowid() as id'
        );

        const insertedId = result[0].values[0][0];

        this.save();

        console.log(
            '[Database] Submitted application with ID:',
            insertedId
        );

        return insertedId;
    }

    getApplication(applicationDbId) {
        const stmt = this.db.prepare(
            'SELECT * FROM applications WHERE id = ?'
        );

        stmt.bind([applicationDbId]);

        const result = stmt.step()
            ? stmt.getAsObject()
            : null;

        stmt.free();

        if (result && result.response_data) {
            result.response_data = JSON.parse(result.response_data);
        }

        return result;
    }

    getLastApplication(userId, guildId, applicationId) {
        const stmt = this.db.prepare(`
            SELECT * FROM applications
            WHERE user_id = ?
            AND guild_id = ?
            AND application_id = ?
            ORDER BY submitted_at DESC
            LIMIT 1
        `);

        stmt.bind([
            userId,
            guildId,
            applicationId
        ]);

        const result = stmt.step()
            ? stmt.getAsObject()
            : null;

        stmt.free();

        if (result && result.response_data) {
            result.response_data = JSON.parse(result.response_data);
        }

        return result;
    }

    getUserApplications(userId, guildId) {
        const stmt = this.db.prepare(`
            SELECT * FROM applications
            WHERE user_id = ?
            AND guild_id = ?
            ORDER BY submitted_at DESC
        `);

        stmt.bind([
            userId,
            guildId
        ]);

        const results = [];

        while (stmt.step()) {
            const row = stmt.getAsObject();

            if (row.response_data) {
                row.response_data = JSON.parse(row.response_data);
            }

            results.push(row);
        }

        stmt.free();

        return results;
    }

    getPendingApplications(guildId) {
        const stmt = this.db.prepare(`
            SELECT * FROM applications
            WHERE guild_id = ?
            AND status = 'pending'
            ORDER BY submitted_at ASC
        `);

        stmt.bind([guildId]);

        const results = [];

        while (stmt.step()) {
            const row = stmt.getAsObject();

            if (row.response_data) {
                row.response_data = JSON.parse(row.response_data);
            }

            results.push(row);
        }

        stmt.free();

        return results;
    }

    updateApplicationStatus(
        applicationDbId,
        status,
        reviewerId
    ) {
        this.db.run(
            `UPDATE applications
             SET status = ?,
                 reviewer_id = ?,
                 reviewed_at = ?
             WHERE id = ?`,
            [
                status,
                reviewerId,
                Date.now(),
                applicationDbId
            ]
        );

        this.save();

        console.log(
            '[Database] Updated application',
            applicationDbId,
            'to status:',
            status
        );
    }

    getApplicationStats(guildId) {
        const stmt = this.db.prepare(
            `SELECT COUNT(*) as count
             FROM applications
             WHERE guild_id = ?
             AND status = ?`
        );

        stmt.bind([
            guildId,
            'pending'
        ]);

        stmt.step();

        const pending = stmt.getAsObject().count;

        stmt.reset();

        stmt.bind([
            guildId,
            'accepted'
        ]);

        stmt.step();

        const accepted = stmt.getAsObject().count;

        stmt.reset();

        stmt.bind([
            guildId,
            'denied'
        ]);

        stmt.step();

        const denied = stmt.getAsObject().count;

        stmt.free();

        return {
            pending,
            accepted,
            denied
        };
    }

    // ============================================================
    // Close database
    // ============================================================

    close() {
        if (this.db) {
            this.save();
            this.db.close();
        }
    }
}

module.exports = DatabaseManager;
