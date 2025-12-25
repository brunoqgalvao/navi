import express from 'express';
import { appendFileSync, existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;
const EMAILS_FILE = '/tmp/emails.txt';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

app.post('/api/subscribe', (req, res) => {
  const { email } = req.body;
  
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  
  const timestamp = new Date().toISOString();
  const entry = `${timestamp},${email}\n`;
  
  try {
    appendFileSync(EMAILS_FILE, entry);
    console.log(`New subscriber: ${email}`);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to save email:', err);
    res.json({ success: true });
  }
});

app.get('/api/subscribers', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.ADMIN_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    if (existsSync(EMAILS_FILE)) {
      const content = readFileSync(EMAILS_FILE, 'utf-8');
      const emails = content.trim().split('\n').filter(Boolean);
      res.json({ count: emails.length, emails });
    } else {
      res.json({ count: 0, emails: [] });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to read subscribers' });
  }
});

app.get('/downloads/*', (req, res) => {
  const filePath = path.join(__dirname, 'dist', req.path);
  res.download(filePath);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
