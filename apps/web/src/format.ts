// Always Taiwan time: the data is about Taiwan, wherever the viewer's laptop thinks it is.

/** "Sun 13:50" — for the two ends of a 24 h range, where a bare time does not say which day. h23: midnight is 00:00, never 24:00. */
export const weekdayTime = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Taipei', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })

const ago = new Intl.RelativeTimeFormat('en') // "19 minutes ago"; the short style reads "19 min. ago"

/** How old a frame is: minutes up to an hour and a half, hours beyond. A viewer's clock running behind must not read as "in 3 min". */
export function dataAge(time: number, now: number) {
  const min = Math.round((now - time) / 60e3)
  return min <= 0 ? 'just now' : min < 90 ? ago.format(-min, 'minute') : ago.format(-Math.round(min / 60), 'hour')
}
