require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const sharp = require('sharp');
const axios = require('axios');
const http = require('http');
const { t, getKeyboard, toggleLang, i18n } = require('./i18n');

const token = process.env.BOT_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;

const bot = new Telegraf(token);

const githubApi = axios.create({
    baseURL: `https://api.github.com/repos/${OWNER}/${REPO}`,
    headers: {
        'Authorization': `token ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json'
    }
});

console.log('Бот успішно запущений і чекає на пости...');

const botStartTime = Date.now();
let sessionUploadedCount = 0;

function getUptime() {
    const totalSeconds = Math.floor((Date.now() - botStartTime) / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return { hours, minutes, seconds };
}

// Глобальний об'єкт для зберігання стану між повідомленнями (фото -> PDF)
let activeBooks = {};

// Черга для послідовного завантаження на GitHub (щоб уникнути помилок конфлікту SHA)
const githubQueue = [];
let isProcessingQueue = false;

async function processGithubQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    while (githubQueue.length > 0) {
        const task = githubQueue.shift();
        try {
            await task();
        } catch (e) {
            console.error("Помилка в черзі GitHub:", e);
        }
        // Затримка 1 секунда між збереженнями, щоб GitHub не блокував за спам
        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    isProcessingQueue = false;
}

async function handlePost(ctx, next) {
    const msg = ctx.message || ctx.channelPost;
    if (!msg) {
        if (next) return next();
        return;
    }

    const chatId = msg.chat.id;

    // Захист від чужаків (якщо в .env вказано ADMIN_CHAT_ID)
    const ALLOWED_ID = process.env.ADMIN_CHAT_ID ? parseInt(process.env.ADMIN_CHAT_ID) : null;
    if (ALLOWED_ID && chatId !== ALLOWED_ID && msg.chat.type === 'private') {
        console.log(`[-] Ігнорую повідомлення від чужого: ${chatId}`);
        return;
    }

    // 1. ЯКЩО ПРИЙШЛО ФОТО (Перевіряємо хештеги і запам'ятовуємо)
    if (msg.photo && msg.photo.length > 0) {
        const text = msg.caption || msg.text || '';
        const allTags = text.toLowerCase();

        // Перевіряємо чи є хоч якісь хештеги, щоб не реагувати на випадкові фото
        if (!allTags.includes('#')) {
            if (next) return next();
            return;
        }

        let currentPublisher = 'Other';
        let currentLevel = 'Unknown';

        // Визначаємо видавництво (точна копія твого парсера)
        if (allTags.includes('penguin_young_reader')) currentPublisher = 'Penguin Readers';
        else if (allTags.includes('penguin_kids')) currentPublisher = 'Penguin Readers';
        else if (allTags.includes('penguin')) currentPublisher = 'Penguin Readers';
        else if (allTags.includes('cambridge')) currentPublisher = 'Cambridge Reader';
        else if (allTags.includes('macmillan_literature_collections')) currentPublisher = 'Macmillan Reader';
        else if (allTags.includes('macmillan')) currentPublisher = 'Macmillan Reader';
        else if (allTags.includes('black_cat')) currentPublisher = 'Black Cat';
        else if (allTags.includes('national_geographic')) currentPublisher = 'National Geographic';
        else if (allTags.includes('step_into_reading')) currentPublisher = 'Step Into Reading';
        else if (allTags.includes('oxford_bookworms')) currentPublisher = 'Oxford Bookworms';
        else if (allTags.includes('all_aboard_reading')) currentPublisher = 'All Aboard Reading';
        else if (allTags.includes('easy_classic')) currentPublisher = 'Easy Classic';
        else if (allTags.includes('who_hq_reader')) currentPublisher = 'Who HQ Reader';

        // Визначаємо рівень з урахуванням видавництва
        if (allTags.includes('penguin_young_reader')) currentLevel = 'Penguin Young Reader';
        else if (allTags.includes('penguin_kids')) currentLevel = 'Penguin Kids';
        else if (allTags.includes('macmillan_literature_collections')) currentLevel = 'Macmillan Literature Collections';
        else if (allTags.includes('footprint_reader')) currentLevel = 'Footprint Reader';
        else if (allTags.includes('page_turners_reader')) currentLevel = 'Page Turners';
        else if (allTags.includes('foundation_reader')) currentLevel = 'Foundation Reader';
        else if (allTags.includes('windows_on_literacy')) currentLevel = 'Windows on Literacy';
        else if (allTags.includes('reading_expedition')) currentLevel = 'Reading Expedition';
        else if (allTags.includes('theme_sets')) currentLevel = 'Theme Sets';
        else if (allTags.includes('early_read')) currentLevel = 'Early Read';
        else if (allTags.includes('green_apple')) currentLevel = 'Green Apple';
        else if (allTags.includes('reading_n_training')) currentLevel = 'Reading N Training';

        // CEFR Levels
        else if (allTags.includes('a2-b1')) currentLevel = 'A2-B1';
        else if (allTags.includes('a0-a1')) currentLevel = 'A0-A1';
        else if (allTags.includes('a1')) currentLevel = 'A1';
        else if (allTags.includes('a2')) currentLevel = 'A2';
        else if (allTags.includes('b1')) currentLevel = 'B1';
        else if (allTags.includes('b2')) currentLevel = 'B2';
        else if (allTags.includes('c1')) currentLevel = 'C1';

        // Custom Levels
        else if (allTags.includes('level_0')) {
            if (currentPublisher === 'All Aboard Reading' || currentPublisher === 'Oxford Bookworms') currentLevel = 'A0-A1';
            else currentLevel = 'A0-A1';
        }
        else if (allTags.includes('level_1')) {
            if (currentPublisher === 'Macmillan Reader' || currentPublisher === 'Step Into Reading') currentLevel = 'A0-A1';
            else if (currentPublisher === 'Who HQ Reader') currentLevel = 'A1-A2';
            else currentLevel = 'A1';
        }
        else if (allTags.includes('level_2')) {
            if (currentPublisher === 'Macmillan Reader' || currentPublisher === 'Step Into Reading' || currentPublisher === 'All Aboard Reading') currentLevel = 'A1';
            else if (currentPublisher === 'Who HQ Reader') currentLevel = 'B1';
            else currentLevel = 'A2';
        }
        else if (allTags.includes('level_3')) {
            if (currentPublisher === 'Macmillan Reader' || currentPublisher === 'Step Into Reading' || currentPublisher === 'All Aboard Reading') currentLevel = 'A2';
            else currentLevel = 'A2-B1';
        }
        else if (allTags.includes('level_4')) {
            if (currentPublisher === 'Macmillan Reader' || currentPublisher === 'Step Into Reading' || currentPublisher === 'All Aboard Reading') currentLevel = 'A2-B1';
            else currentLevel = 'B1';
        }
        else if (allTags.includes('level_5')) {
            if (currentPublisher === 'Macmillan Reader' || currentPublisher === 'Step Into Reading') currentLevel = 'B1';
            else currentLevel = 'B2';
        }
        else if (allTags.includes('level_6')) {
            if (currentPublisher === 'Macmillan Reader') currentLevel = 'B2';
            else currentLevel = 'C1';
        }
        else if (allTags.includes('starter')) currentLevel = 'A0-A1';
        else if (allTags.includes('beginner')) currentLevel = 'A1';
        else if (allTags.includes('elementary') || allTags.includes('pre_intermediate')) currentLevel = 'A2';
        else if (allTags.includes('lower_intermediate')) currentLevel = 'A2-B1';
        else if (allTags.includes('intermediate')) currentLevel = 'B1';
        else if (allTags.includes('upper')) currentLevel = 'B2';
        else if (allTags.includes('advanced')) currentLevel = 'C1';

        // Витягуємо ID оригінального повідомлення (фото-посту) для books.json
        const forwardedMessageId = (msg.forward_origin && msg.forward_origin.message_id) || msg.forward_from_message_id || msg.message_id;

        // Зберігаємо в пам'ять (додаємо в масив, як у чергу)
        if (!activeBooks[chatId]) {
            activeBooks[chatId] = [];
        }

        activeBooks[chatId].push({
            photoId: msg.photo[msg.photo.length - 1].file_id,
            publisher: currentPublisher,
            level: currentLevel,
            originalMessageId: forwardedMessageId, // ЗБЕРІГАЄМО ID ФОТО для books.json
            localPhotoMessageId: msg.message_id // ЗБЕРІГАЄМО локальний ID ФОТО для reply
        });
        console.log(`[+] Фото збережено. Визначено: ${currentPublisher} | ${currentLevel}. Очікую PDF...`);
        return;
    }

    // 2. ЯКЩО ПРИЙШОВ PDF (Беремо найстаріше фото з черги і пушимо на сайт)
    if (msg.document && msg.document.mime_type === 'application/pdf') {
        if (!activeBooks[chatId] || activeBooks[chatId].length === 0) {
            console.log('[-] Прийшов PDF, але перед ним не було фотографії з хештегами. Ігнорую.');
            return;
        }

        // Беремо найперше фото, яке було надіслане (FIFO)
        const state = activeBooks[chatId].shift();

        const title = msg.document.file_name.replace('.pdf', '').replace(/_/g, ' ').trim();

        // Беремо ID оригінального повідомлення для збереження в books.json
        const messageId = state.originalMessageId;
        // Беремо локальний ID ФОТО-посту для відповіді на нього в поточному чаті
        const replyMessageId = state.localPhotoMessageId;

        console.log(`[+] Прийшов PDF: "${title}". Додаю в чергу завантаження на GitHub...`);

        try {
            const statusMsg = await ctx.reply(`⏳ Додаю книгу "${title}" в чергу на завантаження...`, { reply_to_message_id: replyMessageId });

            // Додаємо задачу в загальну чергу
            githubQueue.push(async () => {
                try {
                    await ctx.telegram.editMessageText(chatId, statusMsg.message_id, undefined, `🔄 Завантажую "${title}" на сайт (GitHub)...`);

                    // 1. Завантаження та стиснення фото
                    const fileLink = await ctx.telegram.getFileLink(state.photoId);
                    const imageResponse = await axios({ url: fileLink.href, responseType: 'arraybuffer' });

                    const compressedBuffer = await sharp(imageResponse.data)
                        .resize(400)
                        .webp({ quality: 75 })
                        .toBuffer();

                    const fileName = `assets/photos/cover_${messageId}.webp`;

                    // 2. Пуш фото на GitHub
                    await githubApi.put(`/contents/${fileName}`, {
                        message: `Add cover for ${title}`,
                        content: compressedBuffer.toString('base64')
                    });

                    // 3. Оновлення books.json
                    const jsonResponse = await githubApi.get(`/contents/data/books.json`);
                    const jsonContent = Buffer.from(jsonResponse.data.content, 'base64').toString('utf-8');
                    let booksArray = JSON.parse(jsonContent);

                    booksArray.push({
                        title: title,
                        publisher: state.publisher,
                        level: state.level !== 'Unknown' ? state.level : 'B1',
                        coverUrls: [fileName],
                        message_id: messageId
                    });

                    await githubApi.put(`/contents/data/books.json`, {
                        message: `Add book: ${title}`,
                        content: Buffer.from(JSON.stringify(booksArray, null, 2)).toString('base64'),
                        sha: jsonResponse.data.sha
                    });

                    sessionUploadedCount++;
                    await ctx.telegram.deleteMessage(chatId, statusMsg.message_id);
                    await ctx.reply(`🎉 Готово! Книга *"${title}"* завантажена на сайт.\nКатегорія: ${state.level}\nВидавництво: ${state.publisher}`, { parse_mode: 'Markdown', ...getKeyboard(chatId, activeBooks, Markup) });
                } catch (err) {
                    console.error(`Помилка під час обробки ${title}:`, err.message);
                    await ctx.telegram.editMessageText(chatId, statusMsg.message_id, undefined, `❌ Помилка завантаження "${title}": ${err.message}`);
                }
            });

            // Запускаємо конвеєр, якщо він ще не працює
            processGithubQueue();

        } catch (err) {
            console.error('Помилка додавання в чергу:', err.message);
            ctx.reply(`❌ Помилка: ${err.message}`);
        }
        return;
    }

    if (next) return next();
}

// ==========================================
// ОБРОБНИКИ КОМАНД ТА КНОПОК
// ==========================================

// Команда /start
bot.command('start', (ctx) => {
    const chatId = ctx.chat.id;
    ctx.reply(t(chatId, 'welcome'), getKeyboard(chatId, activeBooks, Markup));
});

// 📊 Статус / Status
bot.hears([i18n.uk.btn_status, i18n.en.btn_status], (ctx) => {
    const chatId = ctx.chat.id;
    const uptime = getUptime();
    const queueLength = (activeBooks[chatId] && activeBooks[chatId].length) || 0;
    const text = t(chatId, 'status_online', {
        hours: uptime.hours,
        minutes: uptime.minutes,
        seconds: uptime.seconds,
        queueLength: queueLength,
        sessionUploaded: sessionUploadedCount
    });
    ctx.reply(text, getKeyboard(chatId, activeBooks, Markup));
});

// 🌍 Language / Мова
bot.hears([i18n.uk.btn_lang, i18n.en.btn_lang], (ctx) => {
    const chatId = ctx.chat.id;
    toggleLang(chatId);
    ctx.reply(t(chatId, 'lang_changed'), getKeyboard(chatId, activeBooks, Markup));
});

// 🚀 Завантажити всі / Upload All
bot.hears([i18n.uk.btn_upload_all, i18n.en.btn_upload_all], (ctx) => {
    const chatId = ctx.chat.id;
    const count = (activeBooks[chatId] && activeBooks[chatId].length) || 0;
    if (count === 0) {
        return ctx.reply(t(chatId, 'queue_empty'), getKeyboard(chatId, activeBooks, Markup));
    }
    ctx.reply(`У черзі ${count} фото. Надішліть відповідні PDF-файли для кожної книги.`, getKeyboard(chatId, activeBooks, Markup));
});

// 🗑 Очистити чергу / Clear Queue
bot.hears([i18n.uk.btn_clear_queue, i18n.en.btn_clear_queue], (ctx) => {
    const chatId = ctx.chat.id;
    if (activeBooks[chatId] && activeBooks[chatId].length > 0) {
        activeBooks[chatId] = [];
        ctx.reply(t(chatId, 'queue_cleared'), getKeyboard(chatId, activeBooks, Markup));
    } else {
        ctx.reply(t(chatId, 'queue_empty'), getKeyboard(chatId, activeBooks, Markup));
    }
});

// 📈 Статистика сайту / Site Stats
bot.hears([i18n.uk.btn_stats, i18n.en.btn_stats], async (ctx) => {
    const chatId = ctx.chat.id;
    let loadingMsg;
    try {
        loadingMsg = await ctx.reply(t(chatId, 'stats_loading'));

        const response = await githubApi.get(`/contents/data/books.json`);
        const jsonContent = Buffer.from(response.data.content, 'base64').toString('utf-8');
        const books = JSON.parse(jsonContent);

        const total = books.length;
        const levels = {};
        books.forEach(b => {
            const lvl = b.level || 'Unknown';
            levels[lvl] = (levels[lvl] || 0) + 1;
        });

        // Сортуємо: спочатку стандартні CEFR рівні, далі підкатегорії за алфавітом
        const cefrOrder = ['A0-A1', 'A1', 'A2', 'A2-B1', 'B1', 'B2', 'C1'];
        const sortedLevels = Object.keys(levels).sort((a, b) => {
            const idxA = cefrOrder.indexOf(a);
            const idxB = cefrOrder.indexOf(b);
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.localeCompare(b);
        });

        const unit = t(chatId, 'unit_pcs') || 'шт.';
        let resultText = t(chatId, 'stats_result', { total });
        for (const lvl of sortedLevels) {
            resultText += `- ${lvl}: ${levels[lvl]} ${unit}\n`;
        }

        if (loadingMsg) {
            await ctx.telegram.editMessageText(chatId, loadingMsg.message_id, undefined, resultText);
        } else {
            await ctx.reply(resultText);
        }
    } catch (err) {
        console.error('Помилка отримання статистики:', err.message);
        const errMsg = t(chatId, 'stats_error', { error: err.message });
        if (loadingMsg) {
            await ctx.telegram.editMessageText(chatId, loadingMsg.message_id, undefined, errMsg).catch(() => { });
        } else {
            await ctx.reply(errMsg);
        }
    }
});

bot.on('message', handlePost);
bot.on('channel_post', handlePost);

// Обробка помилок Telegraf, щоб бот не падав від проблем з мережею (наприклад, при long polling)
bot.catch((err, ctx) => {
    console.error(`[Bot Error] Помилка для ${ctx.updateType}:`, err);
});

bot.launch().catch(err => {
    console.error('Помилка запуску або роботи бота (можливо, конфлікт версій):', err.message);
});

// Запускаємо міні-сервер, щоб Render.com міг пінг-увати бота і він не засинав
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is alive!');
});
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Keep-alive server is running on port ${PORT}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Глобальні обробники помилок, щоб запобігти падінню процесу Node.js
process.on('uncaughtException', (err) => {
    console.error('[Global Error] Неперехоплений виняток:', err);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[Global Error] Неперехоплена відмова промісу:', reason);
});
