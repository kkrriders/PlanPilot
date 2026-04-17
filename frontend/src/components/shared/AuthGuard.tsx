'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/store/authStore'
import Layout from './Layout'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isRehydrated, rehydrate } = useAuthStore()
  const router = useRouter()

  useEffect(() => {
    rehydrate()
  }, [])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (isRehydrated && !isAuthenticated) {
      router.replace('/login')
    }
  }, [isAuthenticated, isRehydrated, router])

  if (!isRehydrated || !isAuthenticated) return null

  return <Layout>{children}</Layout>
}
