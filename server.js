const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3333;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, './data');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, './public')));

class TokenTracker {
  constructor() {
    this.stats = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      sessions: [],
      lastUpdated: null,
      models: {}
    };
    this.loadStats();
  }

  loadStats() {
    const statsFile = path.join(DATA_DIR, 'token-stats.json');
    if (fs.existsSync(statsFile)) {
      try {
        this.stats = JSON.parse(fs.readFileSync(statsFile, 'utf8'));
      } catch (e) {
        console.log('Creating new stats file');
      }
    }
  }

  saveStats() {
    const statsFile = path.join(DATA_DIR, 'token-stats.json');
    fs.writeFileSync(statsFile, JSON.stringify(this.stats, null, 2));
  }

  recordSession(model, inputTokens, outputTokens) {
    this.stats.totalInputTokens += inputTokens;
    this.stats.totalOutputTokens += outputTokens;
    this.stats.lastUpdated = new Date().toISOString();

    if (!this.stats.models[model]) {
      this.stats.models[model] = {
        inputTokens: 0,
        outputTokens: 0,
        count: 0
      };
    }

    this.stats.models[model].inputTokens += inputTokens;
    this.stats.models[model].outputTokens += outputTokens;
    this.stats.models[model].count += 1;

    this.stats.sessions.push({
      model,
      inputTokens,
      outputTokens,
      timestamp: new Date().toISOString()
    });

    if (this.stats.sessions.length > 1000) {
      this.stats.sessions = this.stats.sessions.slice(-1000);
    }

    this.saveStats();
  }

  getStats() {
    return this.stats;
  }

  reset() {
    this.stats = {
      totalInputTokens: 0,
      totalOutputTokens: 0,
      sessions: [],
      lastUpdated: null,
      models: {}
    };
    this.saveStats();
  }
}

const tracker = new TokenTracker();

app.get('/api/models', async (req, res) => {
  try {
    const response = await axios.get(`http://127.0.0.1:11434/api/tags`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

app.post('/api/record', (req, res) => {
  const { model, inputTokens, outputTokens } = req.body;

  if (!model || typeof inputTokens !== 'number' || typeof outputTokens !== 'number') {
    return res.status(400).json({ error: 'Invalid request' });
  }

  tracker.recordSession(model, inputTokens, outputTokens);
  res.json({ success: true, stats: tracker.getStats() });
});

app.get('/api/stats', (req, res) => {
  res.json(tracker.getStats());
});

app.get('/api/stats/model/:model', (req, res) => {
  const { model } = req.params;
  const stats = tracker.getStats();
  const modelStats = stats.models[model];

  if (!modelStats) {
    return res.status(404).json({ error: `No stats for model: ${model}` });
  }

  res.json({ model, ...modelStats });
});

app.get('/api/history', (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
  const stats = tracker.getStats();
  const history = stats.sessions.slice(-limit);

  res.json(history);
});

app.post('/api/reset', (req, res) => {
  tracker.reset();
  res.json({ success: true });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: PORT });
});

app.listen(PORT, () => {
  console.log(`📊 Token Monitor Dashboard running on http://localhost:${PORT}`);
});
