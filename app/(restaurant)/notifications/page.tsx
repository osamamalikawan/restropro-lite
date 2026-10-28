import NotificationsClient from './notifications-client'

export const metadata = { title: 'Notifications · Restro Pro' }
export const dynamic = 'force-dynamic'

export default function NotificationsPage() {
  return (
    <main className="p-6">
      <header className="mb-6">
        <h1 className="font-display text-2xl text-ink-strong">Notifications</h1>
        <p className="mt-1 text-sm text-ink-mid">
          Announcements sent to this restaurant by Restro Pro.
        </p>
      </header>
      <NotificationsClient />
    </main>
  )
}
