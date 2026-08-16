import { redirect } from 'next/navigation'

/** ML Content was renamed to Content Creation — redirect so old links/bookmarks don't 404. */
export default function MLContentPage() {
  redirect('/content-creation')
}
