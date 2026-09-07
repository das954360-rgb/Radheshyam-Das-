const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

app.use(express.static(path.join(__dirname, 'public')));

// চ্যানেলের লেটেস্ট ফাইল ও থাম্বনেইল আইডি আনার API
app.get('/api/files', async (req, res) => {
  try {
    const response = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getUpdates`);
    const updates = response.data.result || [];
    
    const mediaFiles = [];
    updates.forEach(u => {
      const msg = u.channel_post || u.message;
      if (!msg) return;

      let fileData = null;
      if (msg.video) {
        // ভিডিওর নিজস্ব থাম্বনেইল থাকলে সেটি নেওয়া হবে, নয়তো ডিফল্ট ভিডিও আইকন
        const thumbId = msg.video.thumbnail ? msg.video.thumbnail.file_id : null;
        fileData = { 
          id: msg.video.file_id, 
          thumbId: thumbId,
          name: msg.video.file_name || 'Video.mp4', 
          size: (msg.video.file_size / (1024 * 1024)).toFixed(2) + ' MB', 
          type: 'video' 
        };
      } else if (msg.photo) {
        // ছবির ক্ষেত্রে সবচেয়ে ছোট সাইজটি থাম্বনেইল এবং বড়টি ডাউনলোডের জন্য
        const thumbPhoto = msg.photo[0];
        const bestPhoto = msg.photo[msg.photo.length - 1];
        fileData = { 
          id: bestPhoto.file_id, 
          thumbId: thumbPhoto.file_id,
          name: 'Photo.jpg', 
          size: (bestPhoto.file_size / (1024 * 1024)).toFixed(2) + ' MB', 
          type: 'photo' 
        };
      } else if (msg.document) {
        const thumbId = msg.document.thumbnail ? msg.document.thumbnail.file_id : null;
        fileData = { 
          id: msg.document.file_id, 
          thumbId: thumbId,
          name: msg.document.file_name || 'Document', 
          size: (msg.document.file_size / (1024 * 1024)).toFixed(2) + ' MB', 
          type: 'document' 
        };
      }

      if (fileData) mediaFiles.push(fileData);
    });

    res.json({ files: mediaFiles.reverse() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

// থাম্বনেইল সরাসরি শো করার এন্ডপয়েন্ট
app.get('/thumb/:fileId', async (req, res) => {
  try {
    const fileRes = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${req.params.fileId}`);
    const filePath = fileRes.data.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    const stream = await axios({
      method: 'get',
      url: downloadUrl,
      responseType: 'stream'
    });

    res.setHeader('Content-Type', 'image/jpeg');
    stream.data.pipe(res);
  } catch (err) {
    res.status(404).send('Thumb not found');
  }
});

// মূল ফাইল ডাউনলোড লিংক এন্ডপয়েন্ট
app.get('/download/:fileId', async (req, res) => {
  try {
    const fileRes = await axios.get(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${req.params.fileId}`);
    const filePath = fileRes.data.result.file_path;
    const downloadUrl = `https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`;

    const stream = await axios({
      method: 'get',
      url: downloadUrl,
      responseType: 'stream'
    });

    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(filePath)}"`);
    stream.data.pipe(res);
  } catch (err) {
    res.status(500).send('Error downloading file');
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
