import express from 'express';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 8080;
const EMAILS_FILE = '/tmp/emails.txt';
const FEEDBACK_FILE = '/tmp/feedback.json';

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

// Feedback endpoint
app.post('/api/feedback', (req, res) => {
  const { type, title, description, email, systemInfo } = req.body;

  if (!title || !description) {
    return res.status(400).json({ error: 'Title and description are required' });
  }

  const feedback = {
    id: Date.now().toString(36) + Math.random().toString(36).substr(2, 5),
    type: type || 'general',
    title,
    description,
    email: email || null,
    systemInfo: systemInfo || null,
    createdAt: new Date().toISOString()
  };

  try {
    let feedbackList = [];
    if (existsSync(FEEDBACK_FILE)) {
      const content = readFileSync(FEEDBACK_FILE, 'utf-8');
      feedbackList = JSON.parse(content);
    }
    feedbackList.push(feedback);
    writeFileSync(FEEDBACK_FILE, JSON.stringify(feedbackList, null, 2));

    console.log(`New feedback [${type}]: ${title}`);
    res.json({ success: true, id: feedback.id });
  } catch (err) {
    console.error('Failed to save feedback:', err);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

app.get('/api/feedback', (req, res) => {
  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${process.env.ADMIN_KEY}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    if (existsSync(FEEDBACK_FILE)) {
      const content = readFileSync(FEEDBACK_FILE, 'utf-8');
      const feedback = JSON.parse(content);
      res.json({ count: feedback.length, feedback });
    } else {
      res.json({ count: 0, feedback: [] });
    }
  } catch (err) {
    res.status(500).json({ error: 'Failed to read feedback' });
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
