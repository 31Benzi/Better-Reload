const { createCanvas, loadImage, registerFont } = require('canvas');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

async function generateShopImage(itemShop) {
    const cardWidth = 200;
    const cardHeight = 280;
    const spacing = 20;
    const margin = 40;
    const headerHeight = 60;

    const maxItemsPerRow = 4;

    const featuredItems = itemShop.featured || [];
    const dailyItems = itemShop.daily || [];

    const featuredRows = Math.ceil(featuredItems.length / maxItemsPerRow);
    const dailyRows = Math.ceil(dailyItems.length / maxItemsPerRow);

    const totalRows = (featuredItems.length > 0 ? featuredRows + 1 : 0) + (dailyItems.length > 0 ? dailyRows + 1 : 0);

    const canvasWidth = (maxItemsPerRow * cardWidth) + ((maxItemsPerRow - 1) * spacing) + (margin * 2);
    const canvasHeight = (totalRows * cardHeight) + (margin * 2) + (totalRows * spacing);

    const canvas = createCanvas(canvasWidth, canvasHeight + 60);
    const ctx = canvas.getContext('2d');

    // Background
    ctx.fillStyle = '#0e1218';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight + 60);

    // Main Title
    const dateStr = new Date().toISOString().split('T')[0];
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 32px Arial';
    ctx.fillText(`Reload ItemShop for ${dateStr}`, margin, 50);

    let currentY = margin + 60;

    const drawSection = async (title, items) => {
        if (items.length === 0) return;

        // Draw Section Title
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 24px Arial';
        ctx.fillText(title.toUpperCase(), margin, currentY + 30);
        currentY += 50;

        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            const row = Math.floor(i / maxItemsPerRow);
            const col = i % maxItemsPerRow;

            const x = margin + (col * (cardWidth + spacing));
            const y = currentY + (row * (cardHeight + spacing));

            await drawItemCard(ctx, item, x, y, cardWidth, cardHeight);
        }

        const rows = Math.ceil(items.length / maxItemsPerRow);
        currentY += (rows * (cardHeight + spacing)) + 20;
    };

    await drawSection('Weekly', featuredItems);
    await drawSection('Daily', dailyItems);

    return canvas.toBuffer();
}

async function drawItemCard(ctx, item, x, y, width, height) {
    const rarity = item.rarity?.value?.toLowerCase() || 'common';
    const rarityColor = getRarityColor(rarity);

    // Card Background with rounded corners
    ctx.fillStyle = '#161d27';
    drawRoundedRect(ctx, x, y, width, height, 10);
    ctx.fill();

    // Rarity Bar at top
    ctx.fillStyle = rarityColor;
    drawRoundedRect(ctx, x, y, width, 5, { tl: 10, tr: 10, bl: 0, br: 0 });
    ctx.fill();

    // Load Item Image
    try {
        const imageUrl = item.images?.featured || item.images?.icon || item.images?.smallIcon;
        if (imageUrl) {
            const response = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            const img = await loadImage(Buffer.from(response.data));

            // Draw image centered
            const imgSize = Math.min(width - 40, height - 120);
            const imgX = x + (width - imgSize) / 2;
            const imgY = y + 30;
            ctx.drawImage(img, imgX, imgY, imgSize, imgSize);
        }
    } catch (err) {
        // console.error(`Failed to load image for ${item.name}:`, err.message);
    }

    // Name
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    const name = item.name || 'Unknown';
    ctx.fillText(name, x + 15, y + height - 65);

    // Rarity Text
    ctx.fillStyle = '#8e9297';
    ctx.font = '13px Arial';
    const rarityName = item.rarity?.displayValue || 'Unknown';
    ctx.fillText(rarityName, x + 15, y + height - 45);

    // Price
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px Arial';
    const price = `${item.price || 0} V-Bucks`;
    ctx.fillText(price, x + 15, y + height - 25);
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
    if (typeof radius === 'number') {
        radius = { tl: radius, tr: radius, br: radius, bl: radius };
    } else {
        radius = { ...{ tl: 0, tr: 0, br: 0, bl: 0 }, ...radius };
    }
    ctx.beginPath();
    ctx.moveTo(x + radius.tl, y);
    ctx.lineTo(x + width - radius.tr, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius.tr);
    ctx.lineTo(x + width, y + height - radius.br);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius.br, y + height);
    ctx.lineTo(x + radius.bl, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius.bl);
    ctx.lineTo(x, y + radius.tl);
    ctx.quadraticCurveTo(x, y, x + radius.tl, y);
    ctx.closePath();
}

function getRarityColor(rarity) {
    const colors = {
        'common': '#bebebe',
        'uncommon': '#60aa31',
        'rare': '#2dbcfd',
        'epic': '#b858ff',
        'legendary': '#d37841',
        'marvel': '#c53333',
        'dc': '#536dbd',
        'icon': '#2dbcfd',
        'starwars': '#2e5883',
        'lava': '#ff9b00'
    };
    return colors[rarity] || colors['common'];
}

module.exports = { generateShopImage };
