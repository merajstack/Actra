/**
 * Actra AI — Google Workspace Engine
 *
 * Executes authorized read AND write actions against Google Workspace APIs:
 * Gmail, Google Calendar, Google Sheets, Google Docs, Google Drive.
 *
 * READ operations are auto-approved (risk 0).
 * WRITE / SEND / DELETE operations require human approval (risk 2).
 */

const { google } = require('googleapis');
const googleAuth = require('../google-auth');

class GoogleWorkspaceEngine {
  constructor() {
    this.gmail    = google.gmail({ version: 'v1' });
    this.sheets   = google.sheets({ version: 'v4' });
    this.drive    = google.drive({ version: 'v3' });
    this.calendar = google.calendar({ version: 'v3' });
  }

  _requireAuth() {
    const auth = googleAuth.getClient();
    if (!googleAuth.isAuthenticated()) {
      throw new Error('Google Workspace authentication required. Please sign in via the AI Side Panel.');
    }
    return auth;
  }

  // ─── GMAIL ────────────────────────────────────────────────────────────────

  /**
   * Search Gmail for messages matching a query.
   * @param {string} query - Gmail search query (e.g. "from:alice subject:proposal")
   * @param {number} maxResults
   */
  async searchGmail(query, maxResults = 10) {
    const auth = this._requireAuth();
    const res = await this.gmail.users.messages.list({
      auth,
      userId: 'me',
      q: query,
      maxResults,
    });

    const messages = res.data.messages || [];
    if (messages.length === 0) return 'No emails found matching that query.';

    // Fetch snippet + metadata for each
    const details = await Promise.all(
      messages.slice(0, maxResults).map(m =>
        this.gmail.users.messages.get({
          auth,
          userId: 'me',
          id: m.id,
          format: 'metadata',
          metadataHeaders: ['Subject', 'From', 'Date'],
        })
      )
    );

    return details.map(d => {
      const headers = d.data.payload?.headers || [];
      const get = name => headers.find(h => h.name === name)?.value || '';
      return {
        id: d.data.id,
        threadId: d.data.threadId,
        subject: get('Subject'),
        from: get('From'),
        date: get('Date'),
        snippet: d.data.snippet,
      };
    });
  }

  /**
   * Read a full Gmail thread.
   * @param {string} threadId
   */
  async readGmailThread(threadId) {
    const auth = this._requireAuth();
    const res = await this.gmail.users.threads.get({
      auth,
      userId: 'me',
      id: threadId,
      format: 'full',
    });

    const messages = res.data.messages || [];
    return messages.map(msg => {
      const headers = msg.payload?.headers || [];
      const get = name => headers.find(h => h.name === name)?.value || '';

      // Extract plain text body
      let body = '';
      const extractBody = parts => {
        if (!parts) return;
        for (const part of parts) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            body += Buffer.from(part.body.data, 'base64').toString('utf8');
          }
          if (part.parts) extractBody(part.parts);
        }
      };

      if (msg.payload?.body?.data) {
        body = Buffer.from(msg.payload.body.data, 'base64').toString('utf8');
      } else {
        extractBody(msg.payload?.parts);
      }

      return {
        id: msg.id,
        from: get('From'),
        to: get('To'),
        subject: get('Subject'),
        date: get('Date'),
        body: body.slice(0, 2000), // cap for AI context window
      };
    });
  }

  /**
   * Send an email via Gmail API.
   */
  async sendEmail(to, subject, body) {
    const auth = this._requireAuth();

    const message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      body,
    ].join('\n');

    const encodedMessage = Buffer.from(message)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const res = await this.gmail.users.messages.send({
      auth,
      userId: 'me',
      requestBody: { raw: encodedMessage },
    });

    return `Email sent successfully (ID: ${res.data.id})`;
  }

  // ─── GOOGLE CALENDAR ──────────────────────────────────────────────────────

  /**
   * Fetch calendar events in a time range.
   * @param {string} timeMin - ISO 8601 date string
   * @param {string} timeMax - ISO 8601 date string
   * @param {number} maxResults
   */
  async getCalendarEvents(timeMin, timeMax, maxResults = 20) {
    const auth = this._requireAuth();
    const res = await this.calendar.events.list({
      auth,
      calendarId: 'primary',
      timeMin: timeMin || new Date().toISOString(),
      timeMax: timeMax || new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      maxResults,
      singleEvents: true,
      orderBy: 'startTime',
    });

    return (res.data.items || []).map(e => ({
      id: e.id,
      title: e.summary,
      description: e.description,
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
      attendees: (e.attendees || []).map(a => a.email),
      location: e.location,
    }));
  }

  /**
   * Create a calendar event.
   */
  async createCalendarEvent(title, startDateTime, endDateTime, attendeeEmails = [], description = '') {
    const auth = this._requireAuth();
    const res = await this.calendar.events.insert({
      auth,
      calendarId: 'primary',
      requestBody: {
        summary: title,
        description,
        start: { dateTime: startDateTime, timeZone: 'UTC' },
        end: { dateTime: endDateTime, timeZone: 'UTC' },
        attendees: attendeeEmails.map(email => ({ email })),
      },
    });
    return `Calendar event created: ${res.data.htmlLink}`;
  }

  // ─── GOOGLE SHEETS ────────────────────────────────────────────────────────

  /**
   * Read rows from a Google Sheet.
   */
  async readSheet(spreadsheetId, range) {
    const auth = this._requireAuth();
    const res = await this.sheets.spreadsheets.values.get({
      auth,
      spreadsheetId,
      range,
    });
    return res.data.values || [];
  }

  /**
   * Append rows to a Google Sheet.
   */
  async writeSheet(spreadsheetId, range, values) {
    const auth = this._requireAuth();
    const res = await this.sheets.spreadsheets.values.append({
      auth,
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [values] },
    });
    return `Appended to sheet. Updated cells: ${res.data.updates.updatedCells}`;
  }

  /**
   * Update a specific range in a Google Sheet.
   */
  async updateSheet(spreadsheetId, range, values) {
    const auth = this._requireAuth();
    const res = await this.sheets.spreadsheets.values.update({
      auth,
      spreadsheetId,
      range,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values },
    });
    return `Updated sheet range ${range}. Updated cells: ${res.data.updatedCells}`;
  }

  // ─── GOOGLE DRIVE / DOCS ─────────────────────────────────────────────────

  /**
   * Search Drive for files matching a query.
   */
  async searchDrive(query, maxResults = 10, mimeType = null) {
    const auth = this._requireAuth();
    let q = "trashed = false";
    if (query) {
      q += ` and fullText contains '${query.replace(/'/g, "\\'")}'`;
    }
    if (mimeType) {
      q += ` and mimeType = '${mimeType}'`;
    }
    const res = await this.drive.files.list({
      auth,
      q,
      pageSize: maxResults,
      fields: 'files(id, name, mimeType, webViewLink, modifiedTime)',
    });
    return (res.data.files || []).map(f => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      link: f.webViewLink,
      modified: f.modifiedTime,
    }));
  }

  /**
   * Create a new Google Doc.
   */
  async createDoc(title, content) {
    const auth = this._requireAuth();
    const docs = google.docs({ version: 'v1', auth });

    const createRes = await docs.documents.create({
      requestBody: { title },
    });

    const documentId = createRes.data.documentId;

    if (content) {
      await docs.documents.batchUpdate({
        documentId,
        requestBody: {
          requests: [{ insertText: { location: { index: 1 }, text: content } }],
        },
      });
    }

    return `Created document: https://docs.google.com/document/d/${documentId}/edit`;
  }
}

module.exports = new GoogleWorkspaceEngine();
