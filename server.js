require('dotenv').config();
const express = require('express');
const path = require('path');
const multer = require('multer');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const fetch = require('node-fetch');
const cors = require('cors');
const puppeteer = require('puppeteer');
const app = express();
app.use(cors());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });
app.post('/upload', upload.single('image'), async (req, res) => {
    if (!req.file) return res.status(400).json({ success: false, error: '画像ファイルがありません。' });
    try {
        const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);
        const message = await channel.send({ files: [{ attachment: req.file.buffer, name: req.file.originalname }] });
        const attachment = message.attachments.first();
        if (!attachment) return res.status(500).json({ success: false, error: 'Discordへのアップロードに失敗しました。' });
        const proxyUrl = attachment.url.replace(`https://cdn.discordapp.com/attachments/${process.env.DISCORD_CHANNEL_ID}/`, "https://pic.yexe.xyz/");
        const shortenResponse = await fetch(`https://xgd.io/V1/shorten?url=${encodeURIComponent(proxyUrl)}&key=${process.env.XGD_API_KEY}`);
        const shortenData = await shortenResponse.json();
        res.status(200).json({ success: true, short_url: shortenData.shorturl || '短縮に失敗', original_url: proxyUrl });
    } catch (error) {
        console.error(`[Upload] アップロードエラー: ${error.message}`);
        res.status(500).json({ success: false, error: 'サーバー内部でエラーが発生しました。' });
    }
});

app.get('/:messageId/:fileName', async (req, res) => {
    const { messageId, fileName } = req.params;
    const discordChannelId = process.env.DISCORD_CHANNEL_ID;
    const query = new URLSearchParams(req.query).toString();
    const discordCdnUrl = `https://cdn.discordapp.com/attachments/${discordChannelId}/${messageId}/${fileName}?${query}`;
    let browser = null;
    try {
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36');
        const response = await page.goto(discordCdnUrl, { waitUntil: 'networkidle0' });
        if (!response.ok()) throw new Error(`画像が見つかりません: ${response.status()}`);
        const imageBuffer = await response.buffer();
        res.setHeader('Content-Type', response.headers()['content-type']);
        res.send(imageBuffer);
    } catch (error) {
        console.error(`[Proxy] プロキシエラー: ${error.message}`);
        res.status(404).send('Not Found');
    } finally {
        if (browser) await browser.close();
    }
});

const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
    partials: [Partials.Channel]
});
client.login(process.env.DISCORD_BOT_TOKEN);
client.once('ready', () => console.log(`✅ Discord Bot [${client.user.tag}] としてログインしました。`));

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`✅ 完全自己完結型サーバーがポート ${PORT} で起動しました。`);
    console.log(`   テスト用URL: http://localhost:${PORT}`);
});
