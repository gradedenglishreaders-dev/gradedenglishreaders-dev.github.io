const i18n = {
    uk: {
        btn_upload_all: '🚀 Завантажити всі',
        btn_clear_queue: '🗑 Очистити чергу',
        btn_status: '📊 Статус',
        btn_stats: '📈 Статистика сайту',
        btn_lang: '🌍 Language: UK',
        welcome: 'Привіт! Відправ мені фото з хештегами, а потім PDF, щоб я зібрав книгу.',
        status_online: '✅ Бот онлайн і працює!\n⏱ Uptime: {hours}г {minutes}хв {seconds}с\n📚 Книг у локальній черзі: {queueLength}\n📤 Завантажено за цю сесію: {sessionUploaded}',
        stats_loading: '⏳ Збираю статистику з GitHub...',
        stats_result: '📈 Статистика вашої бібліотеки:\n\n📚 Всього книг на сайті: {total}\n\n📊 По рівнях:\n',
        stats_error: '❌ Не вдалося отримати статистику: {error}',
        queue_cleared: '🗑 Чергу очищено. Можете починати спочатку!',
        queue_empty: 'Черга порожня!',
        upload_start: '⏳ Починаю завантаження {count} книг на сайт... Це може зайняти певний час.',
        upload_photo: '🔄 Обробляю фото для книги {current} з {total}: "{title}"...',
        upload_db: '🔄 Оновлюю базу даних (books.json)...',
        upload_success: '🎉 Успіх! Всі {count} книг успішно завантажені на сайт.',
        upload_error: '❌ Помилка завантаження: {error}',
        photo_received: '✅ Книгу "{title}" зібрано!\nВсього в черзі: {queueLength} шт.\n\nНатисніть "{btn_upload_all}", коли закінчите.',
        error_add_queue: '❌ Помилка: {error}',
        lang_changed: '✅ Мову змінено на Українську',
        unit_pcs: 'шт.'
    },
    en: {
        btn_upload_all: '🚀 Upload All',
        btn_clear_queue: '🗑 Clear Queue',
        btn_status: '📊 Status',
        btn_stats: '📈 Site Stats',
        btn_lang: '🌍 Мова: EN',
        welcome: 'Hello! Send me photos with hashtags, and then a PDF to assemble the book.',
        status_online: '✅ Bot is online!\n⏱ Uptime: {hours}h {minutes}m {seconds}s\n📚 Books in local queue: {queueLength}\n📤 Uploaded this session: {sessionUploaded}',
        stats_loading: '⏳ Fetching statistics from GitHub...',
        stats_result: '📈 Your library statistics:\n\n📚 Total books on site: {total}\n\n📊 By levels:\n',
        stats_error: '❌ Failed to fetch stats: {error}',
        queue_cleared: '🗑 Queue cleared. You can start over!',
        queue_empty: 'Queue is empty!',
        upload_start: '⏳ Starting upload of {count} books... This may take a while.',
        upload_photo: '🔄 Processing photos for book {current} of {total}: "{title}"...',
        upload_db: '🔄 Updating database (books.json)...',
        upload_success: '🎉 Success! All {count} books have been uploaded.',
        upload_error: '❌ Upload error: {error}',
        photo_received: '✅ Book "{title}" assembled!\nTotal in queue: {queueLength} pcs.\n\nPress "{btn_upload_all}" when you are done.',
        error_add_queue: '❌ Error: {error}',
        lang_changed: '✅ Language changed to English',
        unit_pcs: 'pcs.'
    }
};

let userLang = {};

function t(chatId, key, params = {}) {
    const lang = userLang[chatId] || 'uk';
    let text = i18n[lang][key] || key;
    for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, v);
    }
    return text;
}

function getKeyboard(chatId, pendingUploads, Markup) {
    const lang = userLang[chatId] || 'uk';
    let buttons = [
        [i18n[lang].btn_status, i18n[lang].btn_stats],
        [i18n[lang].btn_lang]
    ];

    if (pendingUploads[chatId] && pendingUploads[chatId].length > 0) {
        buttons.unshift([i18n[lang].btn_upload_all, i18n[lang].btn_clear_queue]);
    }

    return Markup.keyboard(buttons).resize();
}

function toggleLang(chatId) {
    userLang[chatId] = (userLang[chatId] === 'en') ? 'uk' : 'en';
}

module.exports = { t, getKeyboard, toggleLang, i18n };
