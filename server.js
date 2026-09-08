const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
let CHANNEL_ID = process.env.CHANNEL_ID;

// চ্যানেল আইডি ঠিক করা
if (CHANNEL_ID && !CHANNEL_ID.startsWith('-100') && !CHANNEL_ID.startsWith('@')) {
  CHANNEL_ID = '-100' + CHANNEL_ID;
}

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// সব মিডিয়া ফাইল আনা
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

      let fileData = null;
      if (msg.video) {
        const thumbId = msg.video.thumbnail ? msg.video.thumbnail.file_id : null;
        const sizeMB = msg.video.file_size / (1024 * 1024);
        fileData = { 
          id: msg.video.file_id, 
          messageId: msg.message_id,
          thumbId: thumbId,
          name: displayName || msg.video.file_name || 'Video.mp4', 
          size: sizeMB.toFixed(2) + ' MB', 
          sizeBytes: msg.video.file_size,
          type: 'video',
          isPrivate: isPrivate
        };
      } else if (msg.photo) {
        const bestPhoto = msg.photo[msg.photo.length - 1];
        const sizeMB = bestPhoto.file_size / (1024 * 1024);
        fileData = { 
          id: bestPhoto.file_id, 
          messageId: msg.message_id,
          thumbId: bestPhoto.file_id,
          name: displayName || 'Photo.jpg', 
          size: sizeMB.toFixed(2) + ' MB', 
          sizeBytes: bestPhoto.file_size,
          type: 'photo',
          isPrivate: isPrivate
        };
      } else if (msg.document) {
        const thumbId = msg.document.thumbnail ? msg.document.thumbnail.file_id : null;
        const sizeMB = msg.document.file_size / (1024 * 1024);
        fileData = { 
          id: msg.document.file_id, 
          messageId: msg.message_id,
          thumbId: thumbId,
          name: displayName || msg.document.file_name || 'Document', 
          size: sizeMB.toFixed(2) + ' MB', 
          sizeBytes: msg.document.file_size,
          type: 'document',
          isPrivate: isPrivate
        };
      }

      if (fileData) mediaFiles.push(fileData);
    });

    res.json({ files: mediaFiles.reverse(), channelId: CHANNEL_ID });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

// থাম্বনেইল স্ট্রিম
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

// স্ট্রিমিং এন্ডপয়েন্ট
app.get('/stream/:fileId', async (req, res) => {
  try {
    const fileRes = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${req.params.fileId}`);
    const filePath = fileRes.data.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    const stream = await axios({ method: 'get', url: downloadUrl, responseType: 'stream' });
    res.setHeader('Content-Type', 'video/mp4');
    stream.data.pipe(res);
  } catch (err) {
    res.status(500).send('Streaming error or file exceeds 20MB limit');
  }
});

// ডাউনলোড এন্ডপয়েন্ট
app.get('/download/:fileId', async (req, res) => {
  try {
    const fileRes = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${req.params.fileId}`);
    const filePath = fileRes.data.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    const stream = await axios({ method: 'get', url: downloadUrl, responseType: 'stream' });
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
    stream.data.pipe(res);
  } catch (err) {
    res.status(500).send('Error downloading file: Telegram Bot API limit is 20MB.');
  }
});

// ডিলিট মেসেজ API
app.post('/api/delete', async (req, res) => {
  const { messageId } = req.body;
  if (!messageId) return res.status(400).json({ error: 'Message ID required' });

  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
      chat_id: CHANNEL_ID,
      message_id: Number(messageId)
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Delete error:', err.response?.data || err.message);
    res.status(500).json({ error: err.response?.data?.description || 'Failed to delete message' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
