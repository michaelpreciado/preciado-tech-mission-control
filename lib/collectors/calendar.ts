import fs from 'node:fs/promises'
import { google } from 'googleapis'
import type { CalendarEvent } from '../types'
import { logger } from '../logger'
import { getConfig } from '../config'
import { exists, rel } from './shared'

export type CalendarResult = {
  events: CalendarEvent[]
  status: { configured: boolean; ok: boolean; syncedAt: string | null; detail: string }
}

export async function getCalendarEvents(): Promise<CalendarResult> {
  const credsPath = getConfig().paths.googleCalendarCredsFile
  const credsExists = credsPath ? await exists(credsPath) : false

  if (!credsExists) {
    return { events: [], status: { configured: false, ok: false, syncedAt: null, detail: `No service-account credentials at ${rel(credsPath)} — calendar is not bound to a live source` } }
  }

  try {
    const creds = JSON.parse(await fs.readFile(credsPath, 'utf-8'))
    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ['https://www.googleapis.com/auth/calendar'],
    })
    
    const calendar = google.calendar({ version: 'v3', auth })
    
    const now = new Date()
    const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      timeMax: nextWeek.toISOString(),
      maxResults: 20,
      singleEvents: true,
      orderBy: 'startTime',
    })
    
    const events = (response.data.items || []).map(event => ({
      id: event.id || '',
      summary: event.summary || '(no title)',
      start: event.start?.dateTime || event.start?.date || '',
      end: event.end?.dateTime || event.end?.date || '',
      htmlLink: event.htmlLink || '',
    }))
    return { events, status: { configured: true, ok: true, syncedAt: new Date().toISOString(), detail: `Synced ${events.length} event(s) from Google Calendar (service account, next 7 days)` } }
  } catch (err) {
    logger.error('calendar', err)
    return { events: [], status: { configured: true, ok: false, syncedAt: new Date().toISOString(), detail: 'Google Calendar sync failed — credentials exist but the API call errored' } }
  }
}
