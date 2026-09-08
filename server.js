const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
let CHANNEL_ID = process.env.CHANNEL_ID;

if (CHANNEL_ID && !CHANNEL_ID.startsWith('@') && !CHANNEL_ID.startsWith('-100')) {
  CHANNEL_ID = '-100' + CHANNEL_ID;
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// টেলিগ্রামের ব্যাকলগ ক্যাশ ড্রপ করার ফাংশন
async function flushTelegramQueue() {
  try {
    await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook?drop_pending_updates=true`);
  } catch (e) {
    console.error('Purge error:', e.message);
  }
}
flushTelegramQueue();

// মিডিয়া ফাইল ফেচ করা
app.get('/api/files', async (req, res) => {
  try {
    const response = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`);
    const updates = response.data.result || [];

    const mediaFiles = [];
    updates.forEach(u => {
      const msg = u.channel_post || u.message;
      if (!msg) return;

      const rawCaption = (msg.caption || '').trim();
      const isPrivate = rawCaption === '.' || rawCaption.endsWith('.');

      let displayName = rawCaption;
      if (rawCaption === '.') {
        displayName = '';
      } else if (rawCaption.endsWith('.')) {
        displayName = rawCaption.slice(0, -1).trim();
      }

      const originChatId = msg.chat ? msg.chat.id : CHANNEL_ID;

      // টেলিগ্রাম পোস্টের ডাইরেক্ট ডিপ-লিংক তৈরি
      let tgLink = '';
      if (msg.chat && msg.chat.username) {
        tgLink = `https://t.me/${msg.chat.username}/${msg.message_id}`;
      } else {
        const cleanId = String(originChatId).replace('-100', '');
        tgLink = `https://t.me/c/${cleanId}/${msg.message_id}`;
      }

      let fileData = null;
      if (msg.video) {
        const thumbId = msg.video.thumbnail ? msg.video.thumbnail.file_id : null;
        const sizeBytes = msg.video.file_size || 0;
        fileData = { 
          id: msg.video.file_id, 
          messageId: msg.message_id,
          chatId: originChatId,
          tgLink: tgLink,
          thumbId: thumbId,
          name: displayName || msg.video.file_name || 'Video.mp4', 
          size: (sizeBytes / (1024 * 1024)).toFixed(2) + ' MB', 
          isOver20MB: sizeBytes > 20 * 1024 * 1024,
          type: 'video',
          isPrivate: isPrivate
        };
      } else if (msg.photo) {
        const bestPhoto = msg.photo[msg.photo.length - 1];
        const sizeBytes = bestPhoto.file_size || 0;
        fileData = { 
          id: bestPhoto.file_id, 
          messageId: msg.message_id,
          chatId: originChatId,
          tgLink: tgLink,
          thumbId: bestPhoto.file_id,
          name: displayName || 'Photo.jpg', 
          size: (sizeBytes / (1024 * 1024)).toFixed(2) + ' MB', 
          isOver20MB: sizeBytes > 20 * 1024 * 1024,
          type: 'photo',
          isPrivate: isPrivate
        };
      } else if (msg.document) {
        const thumbId = msg.document.thumbnail ? msg.document.thumbnail.file_id : null;
        const sizeBytes = msg.document.file_size || 0;
        fileData = { 
          id: msg.document.file_id, 
          messageId: msg.message_id,
          chatId: originChatId,
          tgLink: tgLink,
          thumbId: thumbId,
          name: displayName || msg.document.file_name || 'Document', 
          size: (sizeBytes / (1024 * 1024)).toFixed(2) + ' MB', 
          isOver20MB: sizeBytes > 20 * 1024 * 1024,
          type: 'document',
          isPrivate: isPrivate
        };
      }

      if (fileData) mediaFiles.push(fileData);
    });

    res.json({ files: mediaFiles.reverse() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

// ক্যাশ ফ্ল্যাশ এন্ডপয়েন্ট
app.get('/api/clear-cache', async (req, res) => {
  try {
    await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/deleteWebhook?drop_pending_updates=true`);
    res.send('Success: Cache cleared!');
  } catch (err) {
    res.status(500).send('Error clearing cache');
  }
});

// থাম্বনেইল
app.get('/thumb/:fileId', async (req, res) => {
  try {
    const fileRes = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${req.params.fileId}`);
    const filePath = fileRes.data.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    const stream = await axios({ method: 'get', url: downloadUrl, responseType: 'stream' });
    res.setHeader('Content-Type', 'image/jpeg');
    stream.data.pipe(res);
  } catch (err) {
    res.status(404).send('Thumb not found');
  }
});

// ২০ MB-এর নিচের ভিডিও স্ট্রিমিং
app.get('/stream/:fileId', async (req, res) => {
  try {
    const fileRes = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${req.params.fileId}`);
    const filePath = fileRes.data.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    const stream = await axios({ method: 'get', url: downloadUrl, responseType: 'stream' });
    res.setHeader('Content-Type', 'video/mp4');
    stream.data.pipe(res);
  } catch (err) {
    res.status(500).send('File is too big or streaming error');
  }
});

// ডাউনলোড
app.get('/download/:fileId', async (req, res) => {
  try {
    const fileRes = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${req.params.fileId}`);
    const filePath = fileRes.data.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    const stream = await axios({ method: 'get', url: downloadUrl, responseType: 'stream' });
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
    stream.data.pipe(res);
  } catch (err) {
    res.status(500).send('Telegram API limit exceeded (Max 20MB)');
  }
});

// ডিলিট
app.post('/api/delete', async (req, res) => {
  const { messageId, chatId } = req.body;
  if (!messageId) return res.status(400).json({ error: 'Message ID required' });

  const targetChatId = chatId || CHANNEL_ID;

  try {
    const tgRes = await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
      chat_id: targetChatId,
      message_id: Number(messageId)
    });
    res.json({ success: true, data: tgRes.data });
  } catch (err) {
    const tgError = err.response?.data?.description || err.message;
    res.status(500).json({ success: false, error: tgError });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
