export const MOTION_WIDGET_SELECTOR = '[data-motion-widget]'

export interface MotionVisibilityEnv {
  root: HTMLElement
  body: Element
  doc: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>
  IO: typeof IntersectionObserver
  MO: typeof MutationObserver
}

const isElement = (node: Node): node is Element => node.nodeType === 1

/**
 * Marks every [data-motion-widget] with data-motion-visible so CSS can pause its animations offscreen.
 * Widgets mounted later are picked up by a childList observer; removed ones are unobserved.
 * Widgets must carry the attribute at mount time (attribute changes on existing nodes are not watched).
 */
export function startMotionVisibility({ root, body, doc, IO, MO }: MotionVisibilityEnv): () => void {
  const watched = new Set<Element>()
  const observer = new IO(entries => {
    for (const entry of entries) entry.target.setAttribute('data-motion-visible', String(entry.isIntersecting))
  })
  const watch = (el: Element) => {
    if (watched.has(el)) return
    watched.add(el)
    observer.observe(el)
  }
  const add = (node: Element) => {
    if (node.matches(MOTION_WIDGET_SELECTOR)) watch(node)
    for (const child of node.querySelectorAll(MOTION_WIDGET_SELECTOR)) watch(child)
  }
  add(body)

  const mutations = new MO(records => {
    let removed = false
    for (const record of records) {
      for (const node of record.addedNodes) if (isElement(node)) add(node)
      if (!removed) for (const node of record.removedNodes) if (isElement(node)) { removed = true; break }
    }
    if (!removed) return
    for (const el of watched) {
      if (el.isConnected) continue
      observer.unobserve(el)
      watched.delete(el)
    }
  })
  mutations.observe(body, { childList: true, subtree: true })

  const visibility = () => { root.dataset.pageHidden = String(doc.hidden) }
  visibility()
  doc.addEventListener('visibilitychange', visibility)

  return () => {
    mutations.disconnect()
    observer.disconnect()
    doc.removeEventListener('visibilitychange', visibility)
    delete root.dataset.pageHidden
    for (const el of watched) el.removeAttribute('data-motion-visible')
    watched.clear()
  }
}
