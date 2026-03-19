# 📊 Ollama Monitoring Dashboard

Dashboard en temps réel pour visualiser la consommation de tokens Ollama.

## 🚀 Démarrage

### Node.js

```bash
npm install
npm start
```

Accès: **http://localhost:3333**

### Docker

```bash
docker build -t ollama-monitoring .
docker run -p 3333:3333 -v $(pwd)/data:/data ollama-monitoring
```

## 📝 Variables d'Environnement

| Variable | Défaut | Description |
|----------|--------|-------------|
| `PORT` | 3333 | Port d'écoute |
| `DATA_DIR` | ./data | Répertoire de persistance |

## 🎨 Dashboard Features

### Statistiques en Temps Réel
- Total des tokens input
- Total des tokens output
- Nombre total de sessions
- Répartition par modèle

### Graphiques
- **Distribution:** Input vs Output (pie chart)
- **Top Models:** Modèles les plus utilisées (bar chart)
- **Historique:** Tokens par session (line chart)

### Table
- Last 10 sessions
- Modèle, tokens, timestamp
- Auto-refresh toutes les 10 secondes

## 🔌 API

### Enregistrer des tokens

```bash
curl -X POST http://localhost:3333/api/record \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-oss",
    "inputTokens": 100,
    "outputTokens": 150
  }'
```

### Récupérer les stats

```bash
curl http://localhost:3333/api/stats
```

### Stats par modèle

```bash
curl http://localhost:3333/api/stats/model/gpt-oss
```

### Historique

```bash
curl 'http://localhost:3333/api/history?limit=50'
```

### Reset

```bash
curl -X POST http://localhost:3333/api/reset
```

### Health Check

```bash
curl http://localhost:3333/health
```

## 💾 Persistence

Les données sont stockées dans `/data/token-stats.json`:

```json
{
  "totalInputTokens": 1000,
  "totalOutputTokens": 1500,
  "models": {
    "gpt-oss": {
      "inputTokens": 500,
      "outputTokens": 750,
      "count": 5
    }
  },
  "sessions": [...],
  "lastUpdated": "2026-03-18T13:00:00.000Z"
}
```

## 🔄 Auto-Refresh

Le dashboard se met à jour automatiquement toutes les 10 secondes.

Vous pouvez aussi cliquer sur "🔄 Refresh Now" pour mettre à jour manuellement.

## 🗑️ Reset

Cliquez sur "🗑️ Reset Stats" pour réinitialiser toutes les statistiques.
Attention: Cette action est irréversible !

## 📱 Responsive

Le dashboard fonctionne sur tous les appareils:
- Desktop
- Tablet
- Mobile

## 🔧 Intégration avec le Proxy

Le monitoring reçoit les tokes du proxy via POST `/api/record`.

Pour configurer:

```bash
export MONITOR_URL="http://localhost:3333"
```

## 🐛 Troubleshooting

### Dashboard ne charge pas
- Vérifiez que le serveur tourne: `curl http://localhost:3333/health`
- Vérifiez les erreurs de console dans le navigateur

### Stats non mises à jour
- Recharchez la page
- Vérifiez que le proxy envoie les données

### Erreur "Cannot GET /"
- Assurez-vous que le fichier `public/index.html` existe
- Redémarrez le serveur

---

*Pour plus d'infos: Voir le README principal*
