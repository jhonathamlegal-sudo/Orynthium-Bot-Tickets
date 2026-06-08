const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const path = require('path');
const { DEFAULTS } = require('../config/constants');

class CyberDB {
  constructor(filePath) {
    const resolved = filePath || path.join(__dirname, '..', 'database', 'cyber_tickets.db');
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    this.db = new DatabaseSync(resolved);
    this.init();
    this.migrate();
  }

  _addColumnIfMissing(table, column, def) {
    try {
      this.db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${def}`);
    } catch (_) { /* coluna já existe */ }
  }

  init() {
    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS guild_settings (
        guild_id TEXT PRIMARY KEY,
        panel_channel_id TEXT,
        ticket_category_id TEXT,
        staff_role_id TEXT,
        log_channel_id TEXT,
        auto_close_minutes INTEGER DEFAULT 35,
        transcripts_enabled INTEGER DEFAULT 1,
        panel_message_id TEXT,
        banner_message_id TEXT,
        dashboard_name TEXT DEFAULT 'Orynthium Atrium: Tickets',
        updated_at INTEGER DEFAULT (strftime('%s','now'))
      );

      CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ticket_number INTEGER,
        guild_id TEXT NOT NULL,
        channel_id TEXT NOT NULL UNIQUE,
        channel_name TEXT,
        opener_id TEXT NOT NULL,
        claimed_by TEXT,
        category_key TEXT NOT NULL,
        priority TEXT DEFAULT 'medium',
        status TEXT NOT NULL DEFAULT 'open',
        created_at INTEGER NOT NULL,
        claimed_at INTEGER,
        closed_at INTEGER,
        last_activity_at INTEGER,
        rating INTEGER,
        transcript_path TEXT,
        close_reason TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_tickets_guild_status ON tickets(guild_id, status);
      CREATE INDEX IF NOT EXISTS idx_tickets_opener ON tickets(opener_id);

      CREATE TABLE IF NOT EXISTS audit_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        guild_id TEXT NOT NULL,
        user_id TEXT,
        action TEXT NOT NULL,
        details TEXT,
        created_at INTEGER NOT NULL
      );
    `);
  }

  migrate() {
    this._addColumnIfMissing('tickets', 'ticket_number', 'INTEGER');
    this._addColumnIfMissing('tickets', 'priority', "TEXT DEFAULT 'medium'");
    this._addColumnIfMissing('tickets', 'last_activity_at', 'INTEGER');
    this._addColumnIfMissing('guild_settings', 'banner_message_id', 'TEXT');
  }

  getNextTicketNumber(guildId) {
    const row = this.db.prepare(`SELECT MAX(ticket_number) AS m FROM tickets WHERE guild_id = ?`).get(guildId);
    return (row?.m || 0) + 1;
  }

  normalizeSettings(row) {
    if (!row) {
      return {
        guild_id: null,
        panel_channel_id: null,
        ticket_category_id: null,
        staff_role_id: null,
        log_channel_id: null,
        auto_close_minutes: DEFAULTS.AUTO_CLOSE_MINUTES,
        transcripts_enabled: DEFAULTS.TRANSCRIPTS_ENABLED,
        panel_message_id: null,
        banner_message_id: null,
        dashboard_name: 'Orynthium Atrium: Tickets',
        updated_at: null,
      };
    }
    return {
      guild_id: row.guild_id,
      panel_channel_id: row.panel_channel_id || null,
      ticket_category_id: row.ticket_category_id || null,
      staff_role_id: row.staff_role_id || null,
      log_channel_id: row.log_channel_id || null,
      auto_close_minutes: Number(row.auto_close_minutes ?? DEFAULTS.AUTO_CLOSE_MINUTES),
      transcripts_enabled: Number(row.transcripts_enabled ?? DEFAULTS.TRANSCRIPTS_ENABLED),
      panel_message_id: row.panel_message_id || null,
      banner_message_id: row.banner_message_id || null,
      dashboard_name: row.dashboard_name || 'Orynthium Atrium: Tickets',
      updated_at: row.updated_at || null,
    };
  }

  ensureGuild(guildId) {
    const existing = this.db.prepare(`SELECT * FROM guild_settings WHERE guild_id = ?`).get(guildId);
    if (existing) return this.normalizeSettings(existing);
    this.db.prepare(`
      INSERT INTO guild_settings (guild_id, auto_close_minutes, transcripts_enabled)
      VALUES (?, ?, ?)
    `).run(guildId, DEFAULTS.AUTO_CLOSE_MINUTES, DEFAULTS.TRANSCRIPTS_ENABLED);
    return this.getSettings(guildId);
  }

  getSettings(guildId) {
    const row = this.db.prepare(`SELECT * FROM guild_settings WHERE guild_id = ?`).get(guildId);
    return this.normalizeSettings(row || null);
  }

  upsertSettings(guildId, patch) {
    const current = this.ensureGuild(guildId);
    const next = { ...current, ...patch };
    this.db.prepare(`
      UPDATE guild_settings SET
        panel_channel_id = ?,
        ticket_category_id = ?,
        staff_role_id = ?,
        log_channel_id = ?,
        auto_close_minutes = ?,
        transcripts_enabled = ?,
        panel_message_id = ?,
        banner_message_id = ?,
        dashboard_name = ?,
        updated_at = strftime('%s','now')
      WHERE guild_id = ?
    `).run(
      next.panel_channel_id,
      next.ticket_category_id,
      next.staff_role_id,
      next.log_channel_id,
      Number(next.auto_close_minutes),
      Number(next.transcripts_enabled),
      next.panel_message_id,
      next.banner_message_id,
      next.dashboard_name,
      guildId
    );
    return this.getSettings(guildId);
  }

  setPanelMessageId(guildId, panelMessageId) {
    this.db.prepare(`UPDATE guild_settings SET panel_message_id = ?, updated_at = strftime('%s','now') WHERE guild_id = ?`)
      .run(panelMessageId, guildId);
  }

  setBannerMessageId(guildId, bannerMessageId) {
    this.db.prepare(`UPDATE guild_settings SET banner_message_id = ?, updated_at = strftime('%s','now') WHERE guild_id = ?`)
      .run(bannerMessageId, guildId);
  }

  createTicket(data) {
    const ticketNumber = this.getNextTicketNumber(data.guild_id);
    const now = Date.now();
    this.db.prepare(`
      INSERT INTO tickets (ticket_number, guild_id, channel_id, channel_name, opener_id, claimed_by, category_key, priority, status, created_at, last_activity_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?)
    `).run(
      ticketNumber,
      data.guild_id,
      data.channel_id,
      data.channel_name || null,
      data.opener_id,
      data.claimed_by || null,
      data.category_key,
      data.priority || 'medium',
      data.created_at || now,
      data.created_at || now,
    );
    return ticketNumber;
  }

  getTicketByChannel(channelId) {
    return this.db.prepare(`SELECT * FROM tickets WHERE channel_id = ?`).get(channelId) || null;
  }

  getOpenTicketByOpener(guildId, openerId) {
    return this.db.prepare(
      `SELECT * FROM tickets WHERE guild_id = ? AND opener_id = ? AND status = 'open' ORDER BY id DESC LIMIT 1`
    ).get(guildId, openerId) || null;
  }

  updateTicket(channelId, patch) {
    const current = this.getTicketByChannel(channelId);
    if (!current) return null;
    const next = { ...current, ...patch };
    this.db.prepare(`
      UPDATE tickets SET
        channel_name = ?,
        claimed_by = ?,
        status = ?,
        priority = ?,
        claimed_at = ?,
        closed_at = ?,
        last_activity_at = ?,
        rating = ?,
        transcript_path = ?,
        close_reason = ?
      WHERE channel_id = ?
    `).run(
      next.channel_name || null,
      next.claimed_by || null,
      next.status || current.status,
      next.priority || 'medium',
      next.claimed_at || null,
      next.closed_at || null,
      next.last_activity_at || null,
      next.rating ?? null,
      next.transcript_path || null,
      next.close_reason || null,
      channelId
    );
    return this.getTicketByChannel(channelId);
  }

  closeTicket(channelId, patch) {
    return this.updateTicket(channelId, { ...patch, status: 'closed' });
  }

  listTickets(guildId, status = null, limit = 100) {
    if (status) {
      return this.db.prepare(
        `SELECT * FROM tickets WHERE guild_id = ? AND status = ? ORDER BY id DESC LIMIT ?`
      ).all(guildId, status, limit);
    }
    return this.db.prepare(
      `SELECT * FROM tickets WHERE guild_id = ? ORDER BY id DESC LIMIT ?`
    ).all(guildId, limit);
  }

  stats(guildId) {
    const total = this.db.prepare(`SELECT COUNT(*) AS c FROM tickets WHERE guild_id = ?`).get(guildId).c || 0;
    const open = this.db.prepare(`SELECT COUNT(*) AS c FROM tickets WHERE guild_id = ? AND status = 'open'`).get(guildId).c || 0;
    const closed = this.db.prepare(`SELECT COUNT(*) AS c FROM tickets WHERE guild_id = ? AND status = 'closed'`).get(guildId).c || 0;
    const avg = this.db.prepare(`SELECT AVG(rating) AS a FROM tickets WHERE guild_id = ? AND rating IS NOT NULL`).get(guildId).a;
    const byCategory = this.db.prepare(
      `SELECT category_key, COUNT(*) AS count FROM tickets WHERE guild_id = ? GROUP BY category_key ORDER BY count DESC`
    ).all(guildId);
    const topStaff = this.db.prepare(
      `SELECT claimed_by, COUNT(*) AS count FROM tickets WHERE guild_id = ? AND claimed_by IS NOT NULL AND status = 'closed' GROUP BY claimed_by ORDER BY count DESC LIMIT 5`
    ).all(guildId);
    return {
      total, open, closed,
      avg_rating: avg == null ? null : Number(Number(avg).toFixed(2)),
      by_category: byCategory,
      top_staff: topStaff,
    };
  }

  logAction(guildId, userId, action, details) {
    this.db.prepare(`
      INSERT INTO audit_logs (guild_id, user_id, action, details, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(guildId, userId || null, action, details || null, Date.now());
  }

  listAudit(guildId, limit = 50) {
    return this.db.prepare(
      `SELECT * FROM audit_logs WHERE guild_id = ? ORDER BY id DESC LIMIT ?`
    ).all(guildId, limit);
  }
}

module.exports = { CyberDB };
