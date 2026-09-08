const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// সব মিডিয়া ফাইল ফেচ করা
app.get('/api/files', async (req, res) => {
  try {
    const response = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`);
    const updates = response.data.result || [];
    
    const mediaFiles = [];
    updates.forEach(u => {
      const msg = u.channel_post || u.message;
      if (!msg) return;

      const rawCaption = (msg.caption || '').trim();

      // শর্ত: ক্যাপশন শুধু একটি ডট (.) হলে অথবা ক্যাপশনের একদম শেষে ডট (.) থাকলে My space-এ যাবে
      const isPrivate = rawCaption === '.' || rawCaption.endsWith('.');

      // নাম নির্ধারণ: ক্যাপশন থাকলে সেটাই ফাইলের নাম হবে (পেছনের ডট সরিয়ে সুন্দর দেখাবে), না থাকলে ডিফল্ট নাম
      let displayName = rawCaption;
      if (rawCaption === '.') {
        displayName = ''; // শুধু ডট দিলে ফাইলের ডিফল্ট নাম থাকবে
      } else if (rawCaption.endsWith('.')) {
        displayName = rawCaption.slice(0, -1).trim(); // নামের শেষের ডট বাদ দিয়ে নাম দেখাবে
      }

      let fileData = null;
      if (msg.video) {
        const thumbId = msg.video.thumbnail ? msg.video.thumbnail.file_id : null;
        fileData = { 
          id: msg.video.file_id, 
          messageId: msg.message_id,
          thumbId: thumbId,
          name: displayName || msg.video.file_name || 'Video.mp4', 
          size: (msg.video.file_size / (1024 * 1024)).toFixed(2) + ' MB', 
          type: 'video',
          isPrivate: isPrivate
        };
      } else if (msg.photo) {
        const bestPhoto = msg.photo[msg.photo.length - 1];
        fileData = { 
          id: bestPhoto.file_id, 
          messageId: msg.message_id,
          thumbId: bestPhoto.file_id,
          name: displayName || 'Photo.jpg', 
          size: (bestPhoto.file_size / (1024 * 1024)).toFixed(2) + ' MB', 
          type: 'photo',
          isPrivate: isPrivate
        };
      } else if (msg.document) {
        const thumbId = msg.document.thumbnail ? msg.document.thumbnail.file_id : null;
        fileData = { 
          id: msg.document.file_id, 
          messageId: msg.message_id,
          thumbId: thumbId,
          name: displayName || msg.document.file_name || 'Document', 
          size: (msg.document.file_size / (1024 * 1024)).toFixed(2) + ' MB', 
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

// ভিডিও বা অডিও স্ট্রিমিং এন্ডপয়েন্ট
app.get('/stream/:fileId', async (req, res) => {
  try {
    const fileRes = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${req.params.fileId}`);
    const filePath = fileRes.data.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    const stream = await axios({ method: 'get', url: downloadUrl, responseType: 'stream' });
    res.setHeader('Content-Type', 'video/mp4');
    stream.data.pipe(res);
  } catch (err) {
    res.status(500).send('Streaming error');
  }
});

// ফাইল ডাউনলোড এন্ডপয়েন্ট
app.get('/download/:fileId', async (req, res) => {
  try {
    const fileRes = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${req.params.fileId}`);
    const filePath = fileRes.data.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    const stream = await axios({ method: 'get', url: downloadUrl, responseType: 'stream' });
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
    stream.data.pipe(res);
  } catch (err) {
    res.status(500).send('Error downloading file');
  }
});

// চ্যানেল থেকে মেসেজ ডিলিট করার API
app.post('/api/delete', async (req, res) => {
  const { messageId } = req.body;
  if (!messageId) return res.status(400).json({ error: 'Message ID required' });

  try {
    await axios.post(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
      chat_id: CHANNEL_ID,
      message_id: messageId
    });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
