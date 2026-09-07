const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;

app.use(express.static(path.join(__dirname, 'public')));

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
        fileData = { id: msg.video.file_id, name: msg.video.file_name || 'Video.mp4', size: (msg.video.file_size / (1024 * 1024)).toFixed(2) + ' MB', type: 'video' };
      } else if (msg.photo) {
        const bestPhoto = msg.photo[msg.photo.length - 1];
        fileData = { id: bestPhoto.file_id, name: 'Photo.jpg', size: (bestPhoto.file_size / (1024 * 1024)).toFixed(2) + ' MB', type: 'photo' };
      } else if (msg.document) {
        fileData = { id: msg.document.file_id, name: msg.document.file_name || 'Document', size: (msg.document.file_size / (1024 * 1024)).toFixed(2) + ' MB', type: 'document' };
      }

      if (fileData) mediaFiles.push(fileData);
    });

    res.json({ files: mediaFiles.reverse() });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch media' });
  }
});

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
