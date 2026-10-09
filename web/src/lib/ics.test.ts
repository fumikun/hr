import { describe, expect, it } from 'vitest';
import { buildIcs } from './ics';

describe('buildIcs', () => {
  it('writes one UTC event per shift with CRLF line endings', () => {
    const ics = buildIcs([
      {
        slotId: 7,
        startsAt: '2026-11-01T00:00:00.000Z',
        endsAt: '2026-11-01T01:30:00.000Z',
        department: '模擬店部',
        post: '調理',
      },
    ]);
    expect(ics).toContain('DTSTART:20261101T000000Z');
    expect(ics).toContain('DTEND:20261101T013000Z');
    expect(ics).toContain('SUMMARY:高専祭シフト（模擬店部 調理）');
    expect(ics.split('\r\n').filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
