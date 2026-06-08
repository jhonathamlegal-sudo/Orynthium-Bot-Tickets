const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

function createDashboardServer(db, client) {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: '*' } });

  app.use(express.json());
  app.use(express.static(path.join(__dirname, '..', '..', 'dashboard', 'public')));

  function auth(req, res, next) {
    const key = req.headers['x-dashboard-key'] || req.query.key;
    const dashKey = process.env.DASHBOARD_KEY;
    if (!dashKey) {
      console.warn('[DASHBOARD] AVISO: DASHBOARD_KEY não definida — dashboard sem proteção!');
      return next();
    }
    if (key !== dashKey) {
      return res.status(401).json({ error: 'Chave incorreta. Defina DASHBOARD_KEY no .env.' });
    }
    next();
  }

  app.get('/bot-api/health', (req, res) => {
    res.json({ ok: true, guilds: client.guilds.cache.size, uptime: Math.floor(process.uptime()), tag: client.user?.tag });
  });

  app.get('/bot-api/guilds', auth, (req, res) => {
    const guilds = client.guilds.cache.map((g) => ({
      id: g.id,
      name: g.name,
      icon: g.iconURL({ size: 64 }),
      memberCount: g.memberCount,
    }));
    res.json(guilds);
  });

  app.get('/bot-api/overview/:guildId', auth, (req, res) => {
    const { guildId } = req.params;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(404).json({ error: 'Guild não encontrada.' });
    res.json({
      settings: db.getSettings(guildId),
      stats: db.stats(guildId),
      audit: db.listAudit(guildId, 30),
      guild: { id: guild.id, name: guild.name, icon: guild.iconURL({ size: 64 }), memberCount: guild.memberCount },
    });
  });

  app.get('/bot-api/tickets/:guildId', auth, (req, res) => {
    const { guildId } = req.params;
    const status = req.query.status || null;
    const limit = Math.min(200, Number(req.query.limit) || 50);
    res.json(db.listTickets(guildId, status, limit));
  });

  app.get('/bot-api/settings/:guildId', auth, (req, res) => {
    res.json(db.getSettings(req.params.guildId));
  });

  app.post('/bot-api/settings/:guildId', auth, (req, res) => {
    const { guildId } = req.params;
    const updated = db.upsertSettings(guildId, req.body || {});
    io.to(`guild:${guildId}`).emit('settingsUpdated', { guildId, settings: updated });
    res.json(updated);
  });

  app.get('*', (req, res) => {
    if (req.path.startsWith('/bot-api/')) return res.status(404).json({ error: 'Endpoint não encontrado.' });
    res.sendFile(path.join(__dirname, '..', '..', 'dashboard', 'public', 'index.html'));
  });

  io.on('connection', (socket) => {
    socket.on('joinGuild', (guildId) => {
      socket.join(`guild:${guildId}`);
    });
  });

  const port = Number(process.env.PORT || process.env.DASHBOARD_PORT || 3000);
  server.listen(port, '0.0.0.0', () =>
    console.log(`[DASHBOARD] Online em http://localhost:${port}`)
  );

  return { app, server, io };
}

module.exports = { createDashboardServer };
