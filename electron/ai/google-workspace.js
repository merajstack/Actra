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

  async _requireAuth() {
    const auth = await googleAuth.getClient();
    if (!(await googleAuth.isAuthenticated())) {
      throw new Error('Google Workspace authentication required. Please sign in via the AI Side Panel.');
    }
    return auth;
  }

  // ─── GMAIL ────────────────────────────────────────────────────────────────

  /**
   * Search Gmail for messages matching a query using multi-query parallel search.
   * @param {string} query - Gmail search query
   * @param {number} maxResults
   */
  async searchGmail(query, maxResults = 25) {
    const auth = await this._requireAuth();

    // 1. Normalize and extract keywords
    const rawQuery = (query || '').trim();
    const cleanQuery = rawQuery.replace(/['"“”‘’]/g, ' ').replace(/\s+/g, ' ').trim();
    
    const stopwords = /^(is|there|any|mail|email|emails|mails|regarding|check|about|tell|me|did|i|clear|round|for|the|of|to|and|or|in|my|inbox|folder|label|labeled|show|get|all|related)$/i;
    const keywords = cleanQuery.split(/\s+/).filter(w => w.length > 1 && !stopwords.test(w));

    // 2. Build multi-query search matrix for robust discovery
    const searchQueries = new Set();
    if (cleanQuery) {
      searchQueries.add(cleanQuery);
      if (cleanQuery.includes(' ')) {
        searchQueries.add(`"${cleanQuery}"`);
      }
      if (keywords.length > 0) {
        searchQueries.add(keywords.join(' '));
        for (const kw of keywords) {
          if (kw.length >= 3) {
            searchQueries.add(kw);
            searchQueries.add(`subject:${kw}`);
          }
        }
      }
    } else {
      searchQueries.add('in:inbox');
    }

    console.log(`[GoogleWorkspace] Multi-query search running ${searchQueries.size} variations:`, Array.from(searchQueries));

    // 3. Execute all search queries concurrently in parallel
    const searchPromises = Array.from(searchQueries).map(async q => {
      try {
        const res = await this.gmail.users.messages.list({
          auth,
          userId: 'me',
          q,
          maxResults: Math.max(maxResults, 20),
        });
        return res.data.messages || [];
      } catch (err) {
        console.warn(`[GoogleWorkspace] Gmail search failed for query "${q}":`, err.message);
        return [];
      }
    });

    const searchResults = await Promise.all(searchPromises);

    // 4. Deduplicate message IDs
    const seenIds = new Set();
    const uniqueMessages = [];
    for (const msgList of searchResults) {
      for (const m of msgList) {
        if (m.id && !seenIds.has(m.id)) {
          seenIds.add(m.id);
          uniqueMessages.push(m);
        }
      }
    }

    if (uniqueMessages.length === 0) {
      return {
        status: 'no_emails_found',
        query_searched: cleanQuery,
        queries_attempted: Array.from(searchQueries),
        message: `No emails found in your inbox matching "${cleanQuery}".`
      };
    }

    console.log(`[GoogleWorkspace] Found ${uniqueMessages.length} unique messages across queries.`);

    // 5. Fetch full message details with complete bodies for top messages
    const details = await Promise.all(
      uniqueMessages.slice(0, Math.min(maxResults, 15)).map(async m => {
        try {
          const d = await this.gmail.users.messages.get({
            auth,
            userId: 'me',
            id: m.id,
            format: 'full',
          });

          const headers = d.data.payload?.headers || [];
          const get = name => headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

          // Extract plain text body and HTML fallback
          let body = '';
          const extractBody = parts => {
            if (!parts) return;
            for (const part of parts) {
              if (part.mimeType === 'text/plain' && part.body?.data && !body) {
                body = Buffer.from(part.body.data, 'base64').toString('utf8');
              } else if (part.mimeType === 'text/html' && part.body?.data && !body) {
                const htmlText = Buffer.from(part.body.data, 'base64').toString('utf8');
                body = htmlText.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
                               .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                               .replace(/<[^>]*>/g, ' ')
                               .replace(/&nbsp;/g, ' ')
                               .replace(/&amp;/g, '&')
                               .replace(/&lt;/g, '<')
                               .replace(/&gt;/g, '>')
                               .replace(/&quot;/g, '"')
                               .replace(/\s+/g, ' ')
                               .trim();
              }
              if (part.parts) extractBody(part.parts);
            }
          };

          if (d.data.payload?.body?.data) {
            body = Buffer.from(d.data.payload.body.data, 'base64').toString('utf8');
          } else {
            extractBody(d.data.payload?.parts);
          }

          const rawDate = get('Date');
          const timestamp = d.data.internalDate ? parseInt(d.data.internalDate, 10) : (rawDate ? new Date(rawDate).getTime() : 0);

          return {
            id: d.data.id,
            threadId: d.data.threadId,
            subject: get('Subject') || '(No Subject)',
            from: get('From'),
            to: get('To'),
            date: rawDate,
            timestamp,
            snippet: d.data.snippet,
            body: (body || d.data.snippet || '').trim(),
          };
        } catch (fetchErr) {
          console.warn(`[GoogleWorkspace] Failed to fetch message ${m.id}:`, fetchErr.message);
          return null;
        }
      })
    );

    const validDetails = details.filter(Boolean);

    // 6. Sort chronologically from newest to oldest
    validDetails.sort((a, b) => b.timestamp - a.timestamp);

    return validDetails;
  }

  /**
   * Read a full Gmail thread.
   * @param {string} threadId
   */
  async readGmailThread(threadId) {
    const auth = await this._requireAuth();
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
  async sendEmail(to, subject, body, html) {
    const auth = await this._requireAuth();

    const escapeHtml = value => String(value || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const sanitizeHtml = value => String(value || '')
      .replace(/<\/?(script|style|iframe|object|embed|form)[^>]*>/gi, '')
      .replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
      .replace(/javascript\s*:/gi, '')
      .replace(/<meta[^>]*>/gi, '')
      .replace(/<link[^>]*>/gi, '');
    const plainText = String(body || '');
    const htmlBody = sanitizeHtml(html || `<p>${escapeHtml(plainText).replace(/\n/g, '<br>')}</p>`);
    const boundary = `ActraBoundary${Date.now()}`;

    const message = [
      `To: ${to}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      plainText,
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      '',
      htmlBody,
      `--${boundary}--`,
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
    const auth = await this._requireAuth();
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
    const auth = await this._requireAuth();
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
    const auth = await this._requireAuth();
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
    const auth = await this._requireAuth();
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
    const auth = await this._requireAuth();
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
    const auth = await this._requireAuth();
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
    const auth = await this._requireAuth();
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
