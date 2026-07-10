// app/page.tsx — Redirect a /admin
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/admin')
}
