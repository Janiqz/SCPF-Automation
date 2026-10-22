const fs = require('fs');
const path = require('path');

function resolveEmbedImage(embedConfig = {}) {
    if (typeof embedConfig.imageFile === 'string' && embedConfig.imageFile.trim()) {
        const filePath = path.resolve(__dirname, '../..', embedConfig.imageFile.trim());
        if (fs.existsSync(filePath)) {
            const name = path.basename(filePath);
            return {
                url: `attachment://${name}`,
                files: [{ attachment: filePath, name }]
            };
        }
        console.warn(`[EmbedImage] Configured image file was not found: ${filePath}`);
    }
    if (typeof embedConfig.imageUrl === 'string' && /^https:\/\//.test(embedConfig.imageUrl)) {
        return { url: embedConfig.imageUrl, files: [] };
    }
    return { url: null, files: [] };
}

module.exports = { resolveEmbedImage };
