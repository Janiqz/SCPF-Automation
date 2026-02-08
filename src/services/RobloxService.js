const axios = require('axios');
const Bottleneck = require('bottleneck');

class RobloxService {
    constructor() {
        // Use direct Roblox APIs instead of proxy
        this.apiBase = 'https://groups.roblox.com';
        this.usersApi = 'https://users.roblox.com';
        
        // More conservative rate limiter
        const maxPerMinute = parseInt(process.env.ROBLOX_RATE_LIMIT_PER_MINUTE) || 30;
        this.limiter = new Bottleneck({
            reservoir: maxPerMinute,
            reservoirRefreshAmount: maxPerMinute,
            reservoirRefreshInterval: 60 * 1000,
            maxConcurrent: 2,
            minTime: 1000 // Minimum 1 second between requests
        });

        // Axios instance with proper headers
        this.axios = axios.create({
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json'
            },
            timeout: 10000
        });

        console.log('[RobloxService] Initialized with rate limit:', maxPerMinute, 'requests/minute');
    }

    /**
     * Retry logic for failed requests
     */
    async retryRequest(requestFn, maxRetries = 3, delayMs = 2000) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await requestFn();
            } catch (error) {
                const isLastAttempt = attempt === maxRetries;
                const statusCode = error.response?.status;

                // Don't retry on 404 (not found)
                if (statusCode === 404) {
                    throw error;
                }

                // Log retry attempts
                if (!isLastAttempt) {
                    console.log(`[RobloxService] Request failed (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms... Status: ${statusCode || 'unknown'}`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                    delayMs *= 2; // Exponential backoff
                } else {
                    throw error;
                }
            }
        }
    }

    /**
     * Get Roblox User ID from username
     */
    async getUserIdFromUsername(username) {
        try {
            const result = await this.retryRequest(async () => {
                return await this.limiter.schedule(() =>
                    this.axios.post(`${this.usersApi}/v1/usernames/users`, {
                        usernames: [username],
                        excludeBannedUsers: false
                    })
                );
            });

            if (result.data && result.data.data && result.data.data.length > 0) {
                return {
                    success: true,
                    userId: result.data.data[0].id.toString(),
                    username: result.data.data[0].name
                };
            }

            return {
                success: false,
                error: 'User not found'
            };
        } catch (error) {
            const statusCode = error.response?.status;
            const errorMsg = error.response?.data?.errors?.[0]?.message || error.message;
            
            console.error('[RobloxService] Error getting user ID:', {
                status: statusCode,
                message: errorMsg,
                username: username
            });

            if (statusCode === 404 || statusCode === 400) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            return {
                success: false,
                error: `Roblox API error (${statusCode || 'unknown'}). Please try again in a moment.`
            };
        }
    }

    /**
     * Get username from User ID
     */
    async getUsernameFromId(userId) {
        try {
            const result = await this.retryRequest(async () => {
                return await this.limiter.schedule(() =>
                    this.axios.get(`${this.usersApi}/v1/users/${userId}`)
                );
            });

            if (result.data && result.data.name) {
                return {
                    success: true,
                    username: result.data.name,
                    userId: userId
                };
            }

            return {
                success: false,
                error: 'User not found'
            };
        } catch (error) {
            const statusCode = error.response?.status;
            console.error('[RobloxService] Error getting username:', {
                status: statusCode,
                userId: userId
            });

            if (statusCode === 404) {
                return {
                    success: false,
                    error: 'User not found'
                };
            }

            return {
                success: false,
                error: 'Failed to fetch username from Roblox'
            };
        }
    }

    /**
     * Get user's profile description (for verification)
     */
    async getUserProfile(userId) {
        try {
            const result = await this.retryRequest(async () => {
                return await this.limiter.schedule(() =>
                    this.axios.get(`${this.usersApi}/v1/users/${userId}`)
                );
            });

            if (result.data) {
                return {
                    success: true,
                    description: result.data.description || '',
                    username: result.data.name,
                    userId: userId
                };
            }

            return {
                success: false,
                error: 'User profile not found'
            };
        } catch (error) {
            const statusCode = error.response?.status;
            console.error('[RobloxService] Error getting user profile:', {
                status: statusCode,
                userId: userId
            });

            if (statusCode === 404) {
                return {
                    success: false,
                    error: 'User profile not found'
                };
            }

            return {
                success: false,
                error: 'Failed to fetch user profile from Roblox'
            };
        }
    }

    /**
     * Get user's rank in a specific group
     */
    async getUserRankInGroup(userId, groupId) {
        try {
            const result = await this.retryRequest(async () => {
                return await this.limiter.schedule(() =>
                    this.axios.get(`${this.apiBase}/v1/users/${userId}/groups/roles`)
                );
            });

            if (result.data && result.data.data) {
                // Find the specific group in the user's groups
                const groupData = result.data.data.find(g => g.group.id === parseInt(groupId));
                
                if (groupData && groupData.role) {
                    return {
                        success: true,
                        rank: groupData.role.rank,
                        roleName: groupData.role.name
                    };
                }
            }

            // User not in group
            return {
                success: true,
                rank: 0,
                roleName: 'Guest'
            };
        } catch (error) {
            const statusCode = error.response?.status;
            
            // 400 or 404 typically means user is not in the group
            if (statusCode === 400 || statusCode === 404) {
                return {
                    success: true,
                    rank: 0,
                    roleName: 'Guest'
                };
            }

            console.error('[RobloxService] Error getting user rank:', {
                status: statusCode,
                userId: userId,
                groupId: groupId
            });

            return {
                success: false,
                error: 'Failed to fetch group rank from Roblox'
            };
        }
    }

    /**
     * Get group information
     */
    async getGroupInfo(groupId) {
        try {
            const result = await this.retryRequest(async () => {
                return await this.limiter.schedule(() =>
                    this.axios.get(`${this.apiBase}/v1/groups/${groupId}`)
                );
            });

            if (result.data) {
                return {
                    success: true,
                    name: result.data.name,
                    memberCount: result.data.memberCount || 0
                };
            }

            return {
                success: false,
                error: 'Group not found'
            };
        } catch (error) {
            const statusCode = error.response?.status;
            console.error('[RobloxService] Error getting group info:', {
                status: statusCode,
                groupId: groupId
            });

            if (statusCode === 404) {
                return {
                    success: false,
                    error: 'Group not found'
                };
            }

            return {
                success: false,
                error: 'Failed to fetch group info from Roblox'
            };
        }
    }

    /**
     * Validate if a user exists
     */
    async validateUser(userId) {
        try {
            const result = await this.retryRequest(async () => {
                return await this.limiter.schedule(() =>
                    this.axios.get(`${this.usersApi}/v1/users/${userId}`)
                );
            });

            return {
                success: true,
                exists: !!result.data
            };
        } catch (error) {
            if (error.response && error.response.status === 404) {
                return {
                    success: true,
                    exists: false
                };
            }

            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = RobloxService;