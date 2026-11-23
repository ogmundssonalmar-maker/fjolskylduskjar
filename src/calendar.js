const google = 'https://www.googleapis.com/calendar/v3';

export class CalendarError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const owners = { almar: '9', oddny: '3', family: '2', children: '6' };
const calendarIds = env => [...new Set((env.GOOGLE_CALENDAR_IDS || '').split(',').map(id => id.trim()).filter(Boolean))];
const eventUrl = calendarId => new URL(google + '/calendars/' + encodeURIComponent(calendarId) + '/events');

function writeCalendarId(env) {
  if (env.GOOGLE_CALENDAR_WRITES_ENABLED !== 'true') return '';
  const ids = calendarIds(env);
  const selected = env.GOOGLE_CALENDAR_WRITE_ID?.trim() || (ids.length === 1 ? ids[0] : '');
  return ids.includes(selected) ? selected : '';
}

async function calendarToken(env) {
  if (![env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REFRESH_TOKEN]
    .every(value => typeof value === 'string' && value.trim())) {
    throw new CalendarError('missing_google_credentials');
  }

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.GOOGLE_CLIENT_ID.trim(),
      client_secret: env.GOOGLE_CLIENT_SECRET.trim(),
      refresh_token: env.GOOGLE_REFRESH_TOKEN.trim(),
    }),
  });
  if (!tokenResponse.ok) {
    const { error } = await tokenResponse.json().catch(() => ({}));
    if (error === 'invalid_grant') throw new CalendarError('google_refresh_token_rejected');
    if (error === 'invalid_client') throw new CalendarError('google_client_rejected');
    throw new CalendarError('google_oauth_failed');
  }
  const { access_token: token } = await tokenResponse.json();
  if (!token) throw new CalendarError('google_oauth_failed');
  return token;
}

function eventOwner(item) {
  const owner = item.extendedProperties?.private?.dashboardOwner;
  if (Object.hasOwn(owners, owner)) return owner;
  const name = (item.summary || '').toLocaleLowerCase('is').split(/[^\p{L}]+/u);
  if (name.includes('almar') !== name.includes('oddný')) return name.includes('almar') ? 'almar' : 'oddny';
  return 'family';
}

function googleEventLink(value) {
  if (typeof value !== 'string' || !URL.canParse(value)) return '';
  const url = new URL(value);
  return url.origin === 'https://calendar.google.com' ||
    (url.origin === 'https://www.google.com' && url.pathname.startsWith('/calendar/')) ? url.href : '';
}

export async function readCalendar(env, now = new Date(), month = null) {
  const ids = calendarIds(env);
  if (!ids.length) return { connected: false, events: [] };
  const token = await calendarToken(env);

  const today = now.toISOString().slice(0, 10);
  const firstDay = month ? new Date(month + '-01T00:00:00Z') : new Date(today + 'T00:00:00Z');
  const nextMonth = new Date(firstDay);
  nextMonth.setUTCMonth(firstDay.getUTCMonth() + 1);
  const timeMin = firstDay.toISOString();
  const timeMax = month ? nextMonth.toISOString() : new Date(firstDay.getTime() + 45 * 86400000).toISOString();
  const headers = { Authorization: 'Bearer ' + token };
  const events = new Map();

  for (const id of ids) {
    const url = eventUrl(id);
    url.search = new URLSearchParams({ timeMin, timeMax, singleEvents: 'true',
      orderBy: 'startTime', maxResults: '250', timeZone: 'Atlantic/Reykjavik' });
    do {
      const response = await fetch(url, { headers });
      if (!response.ok) throw new CalendarError('google_calendar_http_' + response.status);
      const page = await response.json();

      for (const item of page.items || []) {
        if (item.status === 'cancelled' || !item.start || !item.end) continue;
        const start = item.start.date || new Date(item.start.dateTime).toISOString().slice(0, 10);
        // Google end values are exclusive, including events that end at midnight.
        const end = new Date(Date.parse(item.end.date || item.end.dateTime) - 1).toISOString().slice(0, 10);
        const time = item.start.dateTime ? new Date(item.start.dateTime).toISOString().slice(11, 16) : undefined;
        const endTime = item.end.dateTime ? new Date(item.end.dateTime).toISOString().slice(11, 16) : undefined;
        const occurrence = item.originalStartTime || item.start;
        const key = item.iCalUID
          ? JSON.stringify([item.iCalUID, occurrence.date || new Date(occurrence.dateTime).toISOString()])
          : id + ':' + item.id;
        events.set(key, { start, end: end < start ? start : end, time, endTime,
          title: item.summary || 'Viðburður', type: item.extendedProperties?.private?.dashboardEventType === 'trip' ? 'ferd' : 'dagatal', note: '',
          owner: eventOwner(item), htmlLink: googleEventLink(item.htmlLink) });
      }
      if (!page.nextPageToken) break;
      url.searchParams.set('pageToken', page.nextPageToken);
    } while (true);
  }
  return { connected: true, events: [...events.values()],
    ...(writeCalendarId(env) ? { canCreateEvents: true } : {}) };
}

export function dateAtMidnight(date) {
  if (typeof date !== 'string' || !/^[2-9]\d{3}-\d{2}-\d{2}$/.test(date)) return NaN;
  const time = Date.parse(date + 'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === date ? time : NaN;
}

const repeatRules = { daily:'DAILY', weekly:'WEEKLY', biweekly:'WEEKLY;INTERVAL=2', monthly:'MONTHLY', yearly:'YEARLY' };

function eventRecurrence(settings, start) {
  if (settings === undefined) return undefined;
  if (typeof settings?.frequency !== 'string' || !Object.hasOwn(repeatRules, settings.frequency)) {
    throw new CalendarError('invalid_calendar_recurrence');
  }
  const { frequency, until, count } = settings;
  let rule = 'RRULE:FREQ=' + repeatRules[frequency];
  if (until !== undefined) {
    const endDay = dateAtMidnight(until);
    if (count !== undefined || !Number.isFinite(endDay) || until < (start.date || start.dateTime.slice(0, 10))) {
      throw new CalendarError('invalid_calendar_recurrence');
    }
    rule += ';UNTIL=' + until.replaceAll('-', '') + (start.dateTime ? 'T235959Z' : '');
  } else if (count !== undefined) {
    if (!Number.isSafeInteger(count) || count < 1) throw new CalendarError('invalid_calendar_recurrence');
    rule += ';COUNT=' + count;
  }
  return [rule];
}

function sameRecurrence(left = [], right = []) {
  const ordered = rules => rules.map(rule => rule.startsWith('RRULE:')
    ? rule.slice(6).split(';').filter(part => part !== 'INTERVAL=1' && !part.startsWith('WKST=')).sort().join(';') : rule).sort();
  return JSON.stringify(ordered(left)) === JSON.stringify(ordered(right));
}

function newCalendarEvent(input, trip) {
  if (!input || typeof input.title !== 'string' || !input.title.trim() || input.title.length > 160 ||
      typeof input.id !== 'string' || !/^[0-9a-f]{32}$/.test(input.id) ||
      typeof input.owner !== 'string' || !Object.hasOwn(owners, input.owner)) return null;

  const endDate = input.endDate || input.date;
  const startMidnight = dateAtMidnight(input.date);
  const endMidnight = dateAtMidnight(endDate);
  if (!Number.isFinite(startMidnight) || !Number.isFinite(endMidnight) || endMidnight < startMidnight) return null;

  const validTime = time => typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
  const localTime = (date, time) => ({ dateTime: date + 'T' + time + ':00Z', timeZone: 'Atlantic/Reykjavik' });
  let start = { date: input.date };
  // The form includes the last day. Google stores the first day after the event.
  let end = { date: new Date(endMidnight + 86400000).toISOString().slice(0, 10) };
  if (input.startTime || input.endTime) {
    if (!validTime(input.startTime) ||
        (input.endTime && !validTime(input.endTime)) ||
        (endDate !== input.date && !input.endTime)) return null;
    start = localTime(input.date, input.startTime);
    end = input.endTime ? localTime(endDate, input.endTime) : {
      dateTime: new Date(Date.parse(start.dateTime) + 3600000).toISOString(),
      timeZone: 'Atlantic/Reykjavik',
    };
    if (Date.parse(end.dateTime) <= Date.parse(start.dateTime)) return null;
  }
  const recurrence = eventRecurrence(input.recurrence, start);
  return {
    id: input.id, summary: input.title.trim(), start, end, colorId: owners[input.owner],
    ...(recurrence ? { recurrence } : {}),
    extendedProperties: { private: { dashboardOwner: input.owner, ...(trip ? { dashboardEventType: 'trip' } : {}) } },
  };
}

export async function addCalendarEvent(env, input, { trip = false } = {}) {
  const id = writeCalendarId(env);
  if (!id) throw new CalendarError('calendar_write_disabled');
  const event = newCalendarEvent(input, trip);
  if (!event) throw new CalendarError('invalid_calendar_event');
  const token = await calendarToken(env);
  const url = eventUrl(id);
  const headers = { Authorization: 'Bearer ' + token };
  const response = await fetch(url, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(event),
  });
  if (response.status === 409) {
    // A previous request may have succeeded even if the browser did not receive its reply.
    const previous = await fetch(url.href + '/' + event.id, { headers });
    if (previous.ok) {
      const existing = await previous.json();
      const sameTime = (left, right) => left?.date
        ? left.date === right.date
        : Date.parse(left?.dateTime) === Date.parse(right.dateTime);
      if (existing.summary === event.summary && sameTime(existing.start, event.start) &&
          sameTime(existing.end, event.end) && sameRecurrence(existing.recurrence, event.recurrence) &&
          existing.extendedProperties?.private?.dashboardOwner === input.owner &&
          (!trip || existing.extendedProperties?.private?.dashboardEventType === 'trip')) {
        return { htmlLink: googleEventLink(existing.htmlLink) };
      }
    }
  }
  if (!response.ok) throw new CalendarError('google_calendar_http_' + response.status);
  return { htmlLink: googleEventLink((await response.json()).htmlLink) };
}
