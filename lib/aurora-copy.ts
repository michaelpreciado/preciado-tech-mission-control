/** Natural-language copy for the AURORA Home hero. Pure: counts in, sentence out. */

const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve']

export function countWord(n: number): string {
  return Number.isInteger(n) && n >= 0 && n < WORDS.length ? WORDS[n] : String(n)
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export type HeroInput = {
  /** Cards in blocked/failed/review. null until the task board has been read. */
  waiting: number | null
  /** Short clauses for each broken thing, e.g. "the Agent gateway is down". */
  broken: string[]
  boardError?: boolean
}

export function heroHeadline({ waiting, broken, boardError }: HeroInput): string {
  if (waiting === null) return boardError ? 'The task board is unavailable right now.' : 'Checking the task board…'
  const wait = waiting === 0
    ? 'nothing is waiting on you'
    : waiting === 1 ? 'one card is waiting on you' : `${countWord(waiting)} cards are waiting on you`
  const bad = broken.length === 0
    ? 'nothing is broken'
    : broken.length === 1 ? broken[0] : `${countWord(broken.length)} things are broken`
  return `${cap(wait)}, and ${bad}.`
}
