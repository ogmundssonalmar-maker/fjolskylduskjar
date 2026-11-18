const google = 'https://www.googleapis.com/calendar/v3';

export async function readCalendar(env, now = new Date()) {
  const ids = [...new Set((env.GOOGLE_CALENDAR_IDS || '').split(',').map(id => id.trim()).filter(Boolean))];
  if (!ids.length) return { connected: false, events: [] };

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
    }),
  });
  if (!tokenResponse.ok) throw new Error('Google OAuth failed');
  const { access_token: token } = await tokenResponse.json();
  if (!token) throw new Error('Google OAuth returned no token');

  const today = now.toISOString().slice(0, 10);
  const timeMin = today + 'T00:00:00Z';
  const timeMax = new Date(Date.parse(timeMin) + 45 * 86400000).toISOString();
  const headers = { Authorization: 'Bearer ' + token };
  const events = new Map();

  for (const id of ids) {
    const url = new URL(google + '/calendars/' + encodeURIComponent(id) + '/events');
    url.search = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true',
      orderBy: 'startTime', maxResults: '250', timeZone: 'Atlantic/Reykjavik' });
    do {
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error('Google Calendar request failed');
      const page = await response.json();

      for (const item of page.items || []) {
        if (item.status === 'cancelled' || !item.start || !item.end) continue;
        const start = item.start.date || new Date(item.start.dateTime).toISOString().slice(0, 10);
        // Google end values are exclusive, including events that end at midnight.
        const end = new Date(Date.parse(item.end.date || item.end.dateTime) - 1).toISOString().slice(0, 10);
        const time = item.start.dateTime ? new Date(item.start.dateTime).toISOString().slice(11, 16) : undefined;
        const occurrence = item.originalStartTime || item.start;
        const key = item.iCalUID
          ? JSON.stringify([item.iCalUID, occurrence.date || new Date(occurrence.dateTime).toISOString()])
          : id + ':' + item.id;
        events.set(key, { start, end: end < start ? start : end, time,
          title: item.summary || 'Viðburður', type: 'dagatal', note: '' });
      }
      if (!page.nextPageToken) break;
      url.searchParams.set('pageToken', page.nextPageToken);
    } while (true);
  }
  return { connected: true, events: [...events.values()] };
}
