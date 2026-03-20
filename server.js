const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3333;

// PostgreSQL connection pool
const pool = new Pool({
  user: process.env.DB_USER || 'ollama_user',
  password: process.env.DB_PASSWORD || 'ollama_password',
  host: process.env.DB_HOST || 'postgres',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'ollama_monitoring'
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, './public')));

class PostgresTracker {
  constructor() {
    this.pool = pool;
  }

  async initDatabase() {
    try {
      // Create tables if they don't exist
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS sessions (
          id SERIAL PRIMARY KEY,
          model VARCHAR(255) NOT NULL,
          input_tokens INTEGER NOT NULL,
          output_tokens INTEGER NOT NULL,
          duration INTEGER DEFAULT 0,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
        
        CREATE INDEX IF NOT EXISTS idx_sessions_model ON sessions(model);
        CREATE INDEX IF NOT EXISTS idx_sessions_timestamp ON sessions(timestamp);
      `);
      
      console.log('✅ Database initialized - PostgreSQL only');
    } catch (error) {
      console.error('❌ Database initialization error:', error);
      throw error;
    }
  }

  async recordSession(model, inputTokens, outputTokens, duration = 0) {
    try {
      await this.pool.query(
        'INSERT INTO sessions (model, input_tokens, output_tokens, duration) VALUES ($1, $2, $3, $4)',
        [model, inputTokens, outputTokens, duration]
      );
    } catch (error) {
      console.error('❌ Error recording session:', error);
      throw error;
    }
  }

  async getStats() {
    try {
      // Get all sessions
      const sessionsResult = await this.pool.query('SELECT * FROM sessions ORDER BY timestamp DESC LIMIT 1000');
      const sessions = sessionsResult.rows.map(row => ({
        model: row.model,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        duration: row.duration,
        timestamp: row.timestamp.toISOString()
      }));

      // Calculate aggregates
      const aggregatesResult = await this.pool.query(`
        SELECT 
          model,
          SUM(input_tokens) as total_input,
          SUM(output_tokens) as total_output,
          COUNT(*) as count,
          SUM(duration) as total_duration,
          ROUND(AVG(duration)) as avg_duration
        FROM sessions
        GROUP BY model
      `);

      const models = {};
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalDuration = 0;

      for (const row of aggregatesResult.rows) {
        models[row.model] = {
          inputTokens: parseInt(row.total_input) || 0,
          outputTokens: parseInt(row.total_output) || 0,
          count: parseInt(row.count) || 0,
          totalDuration: parseInt(row.total_duration) || 0,
          avgDuration: parseInt(row.avg_duration) || 0
        };
        totalInputTokens += parseInt(row.total_input) || 0;
        totalOutputTokens += parseInt(row.total_output) || 0;
        totalDuration += parseInt(row.total_duration) || 0;
      }

      // Calculate global average
      const totalSessions = sessions.length;
      const avgDuration = totalSessions > 0 ? Math.round(totalDuration / totalSessions) : 0;

      return {
        totalInputTokens,
        totalOutputTokens,
        totalDuration,
        avgDuration,
        sessions: sessions.reverse(),  // Return in chronological order
        lastUpdated: new Date().toISOString(),
        models
      };
    } catch (error) {
      console.error('❌ Error fetching stats:', error);
      throw error;
    }
  }

  async getModelStats(model) {
    try {
      const result = await this.pool.query(
        `SELECT 
          SUM(input_tokens) as total_input,
          SUM(output_tokens) as total_output,
          COUNT(*) as count,
          SUM(duration) as total_duration,
          ROUND(AVG(duration)) as avg_duration
        FROM sessions
        WHERE model = $1`,
        [model]
      );

      const row = result.rows[0];
      return {
        model,
        inputTokens: parseInt(row.total_input) || 0,
        outputTokens: parseInt(row.total_output) || 0,
        count: parseInt(row.count) || 0,
        totalDuration: parseInt(row.total_duration) || 0,
        avgDuration: parseInt(row.avg_duration) || 0
      };
    } catch (error) {
      console.error('❌ Error fetching model stats:', error);
      throw error;
    }
  }

  async getHistory(limit = 100) {
    try {
      const result = await this.pool.query(
        'SELECT * FROM sessions ORDER BY timestamp DESC LIMIT $1',
        [Math.min(limit, 1000)]
      );

      return result.rows.map(row => ({
        model: row.model,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        duration: row.duration,
        timestamp: row.timestamp.toISOString()
      })).reverse();
    } catch (error) {
      console.error('❌ Error fetching history:', error);
      throw error;
    }
  }

  async reset() {
    try {
      await this.pool.query('TRUNCATE TABLE sessions');
      console.log('✅ Stats reset');
    } catch (error) {
      console.error('❌ Error resetting stats:', error);
      throw error;
    }
  }

  async health() {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch (error) {
      return false;
    }
  }
}

const tracker = new PostgresTracker();

// Initialize database on startup
tracker.initDatabase().catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

app.get('/health', async (req, res) => {
  const isHealthy = await tracker.health();
  res.status(isHealthy ? 200 : 503).json({ 
    status: isHealthy ? 'healthy' : 'unhealthy',
    service: 'ollama-monitoring'
  });
});

app.get('/api/models', async (req, res) => {
  try {
    const response = await axios.get(`http://127.0.0.1:11434/api/tags`, { timeout: 5000 });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

app.post('/api/record', async (req, res) => {
  const { model, inputTokens, outputTokens, duration } = req.body;

  if (!model || typeof inputTokens !== 'number' || typeof outputTokens !== 'number') {
    return res.status(400).json({ error: 'Invalid request' });
  }

  try {
    await tracker.recordSession(model, inputTokens, outputTokens, duration);
    const stats = await tracker.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ error: 'Failed to record session' });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const stats = await tracker.getStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

app.get('/api/stats/model/:model', async (req, res) => {
  const { model } = req.params;
  try {
    const stats = await tracker.getModelStats(model);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch model stats' });
  }
});

app.get('/api/history', async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
  try {
    const history = await tracker.getHistory(limit);
    res.json({ history, count: history.length });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

app.post('/api/reset', async (req, res) => {
  try {
    await tracker.reset();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Failed to reset stats' });
  }
});

app.listen(PORT, () => {
  console.log(`📊 Token Monitor Dashboard running on http://localhost:${PORT}`);
});
